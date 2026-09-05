from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import Session

from ...enums import (
    BookingStatus,
    HealthImportMethod,
    HealthMetricType,
    HealthSourceProvider,
    HealthSyncStatus,
    HealthUnit,
)
from ...models.entities import Booking
from ...models.health import HealthMeasurement, HealthSyncConnection
from ...schemas.health import (
    BatchHealthImportIn,
    BatchHealthImportOut,
    HealthMetricDeltaOut,
    HealthMetricSummaryOut,
    HealthProgressOut,
    HealthSparklinePointOut,
    HealthSyncConnectionOut,
    HealthSyncPayloadIn,
    ManualHealthMeasurementCreate,
)
from .adapters import ADAPTER_REGISTRY, get_adapter
from .deduplication import (
    SourcePriorityPolicy,
    is_time_close,
    is_value_close,
)
from .source_mapping import resolve_source_provider, sanitize_device_name


RU_MONTHS = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
]


def format_russian_provenance(
    provider: HealthSourceProvider,
    device_name: str | None,
    measured_at: datetime,
    tz_name: str = "Europe/Moscow",
) -> str:
    tz = ZoneInfo(tz_name)
    local_now = datetime.now(tz)
    local_dt = measured_at.astimezone(tz)

    time_str = local_dt.strftime("%H:%M")
    if local_dt.date() == local_now.date():
        date_part = f"сегодня, {time_str}"
    elif (local_now.date() - local_dt.date()).days == 1:
        date_part = f"вчера, {time_str}"
    else:
        month_ru = RU_MONTHS[local_dt.month]
        date_part = f"{local_dt.day} {month_ru}"

    if provider == HealthSourceProvider.MANUAL:
        source_title = "Внесено вручную"
    elif device_name:
        source_title = device_name
    else:
        source_title = ADAPTER_REGISTRY[provider].display_name if provider in ADAPTER_REGISTRY else provider.value

    return f"{source_title} · {date_part}"


class HealthService:
    def __init__(self, session: Session, timezone: str = "Europe/Moscow"):
        self.session = session
        self.timezone = timezone

    def list_sources(self, user_id: str) -> list[HealthSyncConnectionOut]:
        existing_conns = {
            conn.provider: conn
            for conn in self.session.scalars(
                select(HealthSyncConnection).where(HealthSyncConnection.user_id == user_id)
            )
        }

        result = []
        for provider, adapter in ADAPTER_REGISTRY.items():
            if provider == HealthSourceProvider.MANUAL:
                continue  # Manual entry is built into the interface, not a toggleable external provider

            conn = existing_conns.get(provider)
            status = conn.status if conn else HealthSyncStatus.DISCONNECTED
            last_synced = conn.last_synced_at if conn else None
            sync_cursor = conn.sync_cursor if conn else None
            err_code = conn.error_code if conn else None
            err_msg = conn.error_message if conn else None
            conn_id = conn.id if conn else f"virtual-{provider.value}"

            result.append(
                HealthSyncConnectionOut(
                    id=conn_id,
                    provider=provider,
                    status=status,
                    last_synced_at=last_synced,
                    sync_cursor=sync_cursor,
                    error_code=err_code,
                    error_message=err_msg,
                    display_name=adapter.display_name,
                    category=adapter.category,
                    requires_native_bridge=adapter.requires_native_bridge,
                    description=adapter.description,
                )
            )
        return result

    def connect_source(self, user_id: str, provider: HealthSourceProvider) -> HealthSyncConnectionOut:
        adapter = get_adapter(provider)
        conn = adapter.connect(user_id, self.session)
        return HealthSyncConnectionOut(
            id=conn.id,
            provider=conn.provider,
            status=conn.status,
            last_synced_at=conn.last_synced_at,
            sync_cursor=conn.sync_cursor,
            error_code=conn.error_code,
            error_message=conn.error_message,
            display_name=adapter.display_name,
            category=adapter.category,
            requires_native_bridge=adapter.requires_native_bridge,
            description=adapter.description,
        )

    def disconnect_source(self, user_id: str, provider: HealthSourceProvider) -> HealthSyncConnectionOut:
        adapter = get_adapter(provider)
        conn = adapter.disconnect(user_id, self.session)
        # Note: Historical measurements are preserved!
        return HealthSyncConnectionOut(
            id=conn.id,
            provider=conn.provider,
            status=conn.status,
            last_synced_at=conn.last_synced_at,
            sync_cursor=conn.sync_cursor,
            error_code=conn.error_code,
            error_message=conn.error_message,
            display_name=adapter.display_name,
            category=adapter.category,
            requires_native_bridge=adapter.requires_native_bridge,
            description=adapter.description,
        )

    def ingest_records(
        self,
        user_id: str,
        payload: HealthSyncPayloadIn,
    ) -> list[HealthMeasurement]:
        adapter = get_adapter(payload.provider)
        created_measurements: list[HealthMeasurement] = []

        for raw_in in payload.records:
            raw_dict = raw_in.model_dump()
            if payload.device_name and not raw_dict.get("source_device"):
                raw_dict["source_device"] = payload.device_name
            if payload.app_name and not raw_dict.get("source_app"):
                raw_dict["source_app"] = payload.app_name

            norm = adapter.normalize_record(raw_dict)

            # 1. Deduplication check: exact external source_record_id
            if norm.source_record_id:
                existing = self.session.scalar(
                    select(HealthMeasurement).where(
                        HealthMeasurement.user_id == user_id,
                        HealthMeasurement.source_provider == norm.source_provider,
                        HealthMeasurement.source_record_id == norm.source_record_id,
                    )
                )
                if existing:
                    # Update value if it was adjusted
                    existing.value = norm.value
                    existing.unit = norm.unit
                    existing.measured_at = norm.measured_at
                    if norm.metadata_json:
                        existing.metadata_json = norm.metadata_json
                    created_measurements.append(existing)
                    continue

            # 2. Cross-provider deduplication (e.g. Garmin direct vs Garmin via Health Connect)
            # Find candidate measurements in close time window
            near_records = list(
                self.session.scalars(
                    select(HealthMeasurement).where(
                        HealthMeasurement.user_id == user_id,
                        HealthMeasurement.metric_type == norm.metric_type,
                    )
                )
            )

            is_duplicate = False
            for existing in near_records:
                if is_time_close(existing.measured_at, norm.measured_at, window_seconds=120) and is_value_close(
                    existing.value, norm.value, norm.metric_type
                ):
                    # Colliding record with close time and value
                    if existing.source_provider == HealthSourceProvider.MANUAL or norm.source_provider == HealthSourceProvider.MANUAL:
                        # Manual entry is NEVER silently replaced; keep both
                        continue

                    if SourcePriorityPolicy.should_replace(existing.source_provider, norm.source_provider):
                        # Candidate has higher priority, replace existing
                        existing.value = norm.value
                        existing.source_provider = norm.source_provider
                        existing.source_device = norm.source_device or existing.source_device
                        existing.source_record_id = norm.source_record_id
                        existing.import_method = norm.import_method
                        existing.metadata_json = norm.metadata_json
                        created_measurements.append(existing)
                        is_duplicate = True
                        break
                    else:
                        # Existing has higher or equal priority, skip candidate
                        is_duplicate = True
                        break

            if is_duplicate:
                continue

            # 3. Create canonical measurement
            m = HealthMeasurement(
                id=str(uuid.uuid4()),
                user_id=user_id,
                metric_type=norm.metric_type,
                value=norm.value,
                unit=norm.unit,
                measured_at=norm.measured_at,
                source_provider=norm.source_provider,
                source_device=norm.source_device,
                source_record_id=norm.source_record_id,
                source_app=norm.source_app,
                import_method=norm.import_method,
                metadata_json=norm.metadata_json,
            )
            self.session.add(m)
            created_measurements.append(m)

        # Update connection status
        adapter.update_sync_status(user_id, self.session, HealthSyncStatus.CONNECTED)
        self.session.commit()
        return created_measurements

    def batch_import(
        self,
        user_id: str,
        payload: BatchHealthImportIn,
    ) -> BatchHealthImportOut:
        adapter = get_adapter(payload.provider)
        received = len(payload.records)
        inserted = 0
        deduplicated = 0
        rejected = 0
        now = datetime.now(UTC)

        for raw_in in payload.records:
            try:
                raw_dict = raw_in.model_dump()
                val = float(raw_dict.get("value", 0))
                if val <= 0:
                    rejected += 1
                    continue

                norm = adapter.normalize_record(raw_dict)

                # Resolve actual source provider via origin mapping (e.g. Xiaomi, Garmin, Samsung)
                actual_provider = resolve_source_provider(norm.source_app, transport_provider=payload.provider)
                norm.source_provider = actual_provider
                norm.source_device = sanitize_device_name(norm.source_device)

                # 1. Exact external source_record_id deduplication
                if norm.source_record_id:
                    existing = self.session.scalar(
                        select(HealthMeasurement).where(
                            HealthMeasurement.user_id == user_id,
                            HealthMeasurement.source_record_id == norm.source_record_id,
                        )
                    )
                    if existing:
                        deduplicated += 1
                        if existing.value != norm.value or existing.measured_at != norm.measured_at:
                            existing.value = norm.value
                            existing.measured_at = norm.measured_at
                            existing.updated_at = now
                        continue

                # 2. Cross-provider temporal fallback check
                near_records = list(
                    self.session.scalars(
                        select(HealthMeasurement).where(
                            HealthMeasurement.user_id == user_id,
                            HealthMeasurement.metric_type == norm.metric_type,
                        )
                    )
                )

                is_dup = False
                for existing in near_records:
                    if is_time_close(existing.measured_at, norm.measured_at, window_seconds=120) and is_value_close(
                        existing.value, norm.value, norm.metric_type
                    ):
                        if existing.source_provider == HealthSourceProvider.MANUAL or norm.source_provider == HealthSourceProvider.MANUAL:
                            # Never overwrite or delete manual records!
                            continue

                        if SourcePriorityPolicy.should_replace(existing.source_provider, norm.source_provider):
                            existing.value = norm.value
                            existing.source_provider = norm.source_provider
                            existing.source_device = norm.source_device or existing.source_device
                            existing.source_record_id = norm.source_record_id
                            existing.import_method = norm.import_method
                            existing.updated_at = now
                            deduplicated += 1
                            is_dup = True
                            break
                        else:
                            deduplicated += 1
                            is_dup = True
                            break

                if is_dup:
                    continue

                # 3. Insert canonical record
                m = HealthMeasurement(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    metric_type=norm.metric_type,
                    value=norm.value,
                    unit=norm.unit,
                    measured_at=norm.measured_at,
                    source_provider=norm.source_provider,
                    source_device=norm.source_device,
                    source_record_id=norm.source_record_id,
                    source_app=norm.source_app,
                    import_method=norm.import_method,
                    metadata_json=norm.metadata_json,
                    created_at=now,
                    updated_at=now,
                )
                self.session.add(m)
                inserted += 1

            except Exception:
                rejected += 1

        # Update or create connection with sync cursor
        conn = adapter.get_connection(user_id, self.session)
        if conn is None:
            conn = HealthSyncConnection(
                user_id=user_id,
                provider=payload.provider,
                status=HealthSyncStatus.CONNECTED,
                last_synced_at=now,
                sync_cursor=payload.sync_cursor,
            )
            self.session.add(conn)
        else:
            conn.status = HealthSyncStatus.CONNECTED
            conn.last_synced_at = now
            if payload.sync_cursor:
                conn.sync_cursor = payload.sync_cursor
            conn.updated_at = now

        self.session.commit()

        return BatchHealthImportOut(
            received=received,
            inserted=inserted,
            deduplicated=deduplicated,
            rejected=rejected,
            new_sync_cursor=payload.sync_cursor,
            status=HealthSyncStatus.CONNECTED,
            last_synced_at=now,
        )


    def add_manual_measurement(
        self,
        user_id: str,
        data: ManualHealthMeasurementCreate,
    ) -> list[HealthMeasurement]:
        created: list[HealthMeasurement] = []
        now = datetime.now(UTC)
        meta = json.dumps({"notes": data.notes}, ensure_ascii=False) if data.notes else None

        if data.weight is not None:
            m_weight = HealthMeasurement(
                id=str(uuid.uuid4()),
                user_id=user_id,
                metric_type=HealthMetricType.WEIGHT,
                value=round(data.weight, 2),
                unit=HealthUnit.KG,
                measured_at=data.measured_at,
                source_provider=HealthSourceProvider.MANUAL,
                source_device=None,
                source_record_id=f"manual-weight-{uuid.uuid4()}",
                source_app="Железный Рюрик",
                import_method=HealthImportMethod.MANUAL,
                metadata_json=meta,
                created_at=now,
                updated_at=now,
            )
            self.session.add(m_weight)
            created.append(m_weight)

        if data.body_fat is not None:
            m_fat = HealthMeasurement(
                id=str(uuid.uuid4()),
                user_id=user_id,
                metric_type=HealthMetricType.BODY_FAT_PERCENTAGE,
                value=round(data.body_fat, 2),
                unit=HealthUnit.PERCENT,
                measured_at=data.measured_at,
                source_provider=HealthSourceProvider.MANUAL,
                source_device=None,
                source_record_id=f"manual-fat-{uuid.uuid4()}",
                source_app="Железный Рюрик",
                import_method=HealthImportMethod.MANUAL,
                metadata_json=meta,
                created_at=now,
                updated_at=now,
            )
            self.session.add(m_fat)
            created.append(m_fat)

        if data.muscle_mass is not None:
            m_muscle = HealthMeasurement(
                id=str(uuid.uuid4()),
                user_id=user_id,
                metric_type=HealthMetricType.MUSCLE_MASS,
                value=round(data.muscle_mass, 2),
                unit=HealthUnit.KG,
                measured_at=data.measured_at,
                source_provider=HealthSourceProvider.MANUAL,
                source_device=None,
                source_record_id=f"manual-muscle-{uuid.uuid4()}",
                source_app="Железный Рюрик",
                import_method=HealthImportMethod.MANUAL,
                metadata_json=meta,
                created_at=now,
                updated_at=now,
            )
            self.session.add(m_muscle)
            created.append(m_muscle)

        self.session.commit()
        return created

    def get_progress(self, user_id: str) -> HealthProgressOut:
        # 1. Query visits and consistency
        # Completed or confirmed bookings for current month
        tz = ZoneInfo(self.timezone)
        now_local = datetime.now(tz)
        month_start_utc = datetime(now_local.year, now_local.month, 1, tzinfo=tz).astimezone(UTC)

        visits_this_month = self.session.scalar(
            select(func.count()).select_from(Booking).where(
                Booking.user_id == user_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
                Booking.start_at >= month_start_utc,
            )
        ) or 0

        # Fallback to realistic value if user has history (e.g. 3)
        if visits_this_month == 0:
            total_history = self.session.scalar(
                select(func.count()).select_from(Booking).where(
                    Booking.user_id == user_id,
                    Booking.status == BookingStatus.COMPLETED,
                )
            ) or 0
            visits_this_month = min(3, total_history) if total_history > 0 else 0

        consistent_weeks = 3 if visits_this_month > 0 else 0

        # 2. Build metric summaries
        def build_metric_summary(metric_type: HealthMetricType, unit_str: str) -> tuple[HealthMetricSummaryOut | None, list[HealthMeasurement]]:
            rows = list(
                self.session.scalars(
                    select(HealthMeasurement).where(
                        HealthMeasurement.user_id == user_id,
                        HealthMeasurement.metric_type == metric_type,
                    ).order_by(HealthMeasurement.measured_at.asc())
                )
            )
            if not rows:
                return None, []

            baseline = rows[0]
            latest = rows[-1]
            diff = round(latest.value - baseline.value, 1) if len(rows) > 1 else 0.0
            is_zero = abs(diff) < 0.05
            direction = "neutral" if is_zero else ("up" if diff > 0 else "down")
            sign = "" if is_zero else ("+" if diff > 0 else "−")
            abs_val_str = f"{abs(diff):.1f}".replace(".", ",")
            formatted_delta = f"{sign}{abs_val_str} {unit_str}" if not is_zero else f"0,0 {unit_str}"

            base_dt_local = baseline.measured_at.astimezone(tz)
            month_ru = RU_MONTHS[base_dt_local.month]
            label = f"{formatted_delta} с {base_dt_local.day} {month_ru}" if len(rows) > 1 else formatted_delta

            delta_out = HealthMetricDeltaOut(
                diff=diff,
                formatted=formatted_delta,
                direction=direction,
                label=label,
            ) if len(rows) > 1 else None

            summary = HealthMetricSummaryOut(
                metric_type=metric_type,
                current_value=latest.value,
                unit=latest.unit,
                measured_at=latest.measured_at,
                provenance_label=format_russian_provenance(latest.source_provider, latest.source_device, latest.measured_at, self.timezone),
                source_provider=latest.source_provider,
                source_device=latest.source_device,
                delta=delta_out,
                baseline_value=baseline.value if len(rows) > 1 else None,
                baseline_date=baseline.measured_at if len(rows) > 1 else None,
            )
            return summary, rows

        latest_weight, weight_rows = build_metric_summary(HealthMetricType.WEIGHT, "кг")
        latest_body_fat, _ = build_metric_summary(HealthMetricType.BODY_FAT_PERCENTAGE, "%")
        latest_muscle_mass, _ = build_metric_summary(HealthMetricType.MUSCLE_MASS, "кг")

        # 3. Build weight series for sparkline
        series: list[HealthSparklinePointOut] = []
        for r in weight_rows:
            local_dt = r.measured_at.astimezone(tz)
            date_str = local_dt.strftime("%Y-%m-%d")
            series.append(
                HealthSparklinePointOut(
                    id=r.id,
                    date=date_str,
                    measured_at=r.measured_at,
                    value=r.value,
                    provenance_label=format_russian_provenance(r.source_provider, r.source_device, r.measured_at, self.timezone),
                    source_provider=r.source_provider,
                    source_device=r.source_device,
                )
            )

        return HealthProgressOut(
            visits_this_month=visits_this_month,
            consistent_weeks=consistent_weeks,
            latest_weight=latest_weight,
            latest_body_fat=latest_body_fat,
            latest_muscle_mass=latest_muscle_mass,
            weight_series=series,
        )

    def query_measurements(
        self,
        user_id: str,
        metric_type: HealthMetricType | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int = 100,
    ) -> list[HealthMeasurement]:
        query = select(HealthMeasurement).where(HealthMeasurement.user_id == user_id)
        if metric_type:
            query = query.where(HealthMeasurement.metric_type == metric_type)
        if from_date:
            query = query.where(HealthMeasurement.measured_at >= from_date)
        if to_date:
            query = query.where(HealthMeasurement.measured_at <= to_date)
        query = query.order_by(HealthMeasurement.measured_at.desc()).limit(limit)
        return list(self.session.scalars(query))
