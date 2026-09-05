from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...enums import (
    HealthImportMethod,
    HealthMetricType,
    HealthSourceProvider,
    HealthSyncStatus,
    HealthUnit,
)
from ...models.health import HealthMeasurement, HealthSyncConnection
from .normalization import (
    normalize_datetime,
    normalize_metric_type,
    normalize_metric_value_and_unit,
)


@dataclass
class NormalizedHealthRecord:
    metric_type: HealthMetricType
    value: float
    unit: HealthUnit
    measured_at: datetime
    source_provider: HealthSourceProvider
    source_device: str | None
    source_record_id: str | None
    source_app: str | None
    import_method: HealthImportMethod
    metadata_json: str | None


class HealthProviderAdapter(ABC):
    provider_id: HealthSourceProvider
    display_name: str
    category: str  # "device" | "service"
    requires_native_bridge: bool
    description: str

    def get_connection(self, user_id: str, session: Session) -> HealthSyncConnection | None:
        return session.scalar(
            select(HealthSyncConnection).where(
                HealthSyncConnection.user_id == user_id,
                HealthSyncConnection.provider == self.provider_id,
            )
        )

    def connect(self, user_id: str, session: Session) -> HealthSyncConnection:
        conn = self.get_connection(user_id, session)
        if conn is None:
            conn = HealthSyncConnection(
                user_id=user_id,
                provider=self.provider_id,
                status=HealthSyncStatus.CONNECTED,
                last_synced_at=datetime.now(UTC),
            )
            session.add(conn)
        else:
            conn.status = HealthSyncStatus.CONNECTED
            conn.error_code = None
            conn.error_message = None
            conn.updated_at = datetime.now(UTC)
        session.commit()
        return conn

    def disconnect(self, user_id: str, session: Session) -> HealthSyncConnection:
        conn = self.get_connection(user_id, session)
        if conn is None:
            conn = HealthSyncConnection(
                user_id=user_id,
                provider=self.provider_id,
                status=HealthSyncStatus.DISCONNECTED,
            )
            session.add(conn)
        else:
            conn.status = HealthSyncStatus.DISCONNECTED
            conn.updated_at = datetime.now(UTC)
        session.commit()
        return conn

    def update_sync_status(
        self,
        user_id: str,
        session: Session,
        status: HealthSyncStatus,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> HealthSyncConnection:
        conn = self.get_connection(user_id, session)
        now = datetime.now(UTC)
        if conn is None:
            conn = HealthSyncConnection(
                user_id=user_id,
                provider=self.provider_id,
                status=status,
                last_synced_at=now if status == HealthSyncStatus.CONNECTED else None,
                error_code=error_code,
                error_message=error_message,
            )
            session.add(conn)
        else:
            conn.status = status
            if status == HealthSyncStatus.CONNECTED:
                conn.last_synced_at = now
            conn.error_code = error_code
            conn.error_message = error_message
            conn.updated_at = now
        session.commit()
        return conn

    @abstractmethod
    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        pass


class ManualProviderAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.MANUAL
    display_name = "Внесено вручную"
    category = "device"
    requires_native_bridge = False
    description = "Ручной ввод замеров пользователем в приложении"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        val = float(raw["value"])
        unit_in = raw.get("unit")
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, val, unit_in)
        dt = normalize_datetime(raw["measured_at"])
        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.MANUAL,
            source_device=raw.get("source_device"),
            source_record_id=raw.get("source_record_id"),
            source_app=raw.get("source_app", "Железный Рюрик"),
            import_method=HealthImportMethod.MANUAL,
            metadata_json=json.dumps(raw["metadata"], ensure_ascii=False) if raw.get("metadata") else None,
        )


class AppleHealthAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.APPLE_HEALTH
    display_name = "Apple Health"
    category = "device"
    requires_native_bridge = True
    description = "Синхронизация с Apple HealthKit (весы, датчики состава тела, умные часы)"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        val = float(raw["value"])
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, val, raw.get("unit"))
        dt = normalize_datetime(raw["measured_at"])

        meta = raw.get("metadata") or {}
        source_device = raw.get("source_device") or meta.get("device_name")
        source_app = raw.get("source_app") or meta.get("source_bundle_id")

        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.APPLE_HEALTH,
            source_device=source_device,
            source_record_id=raw.get("source_record_id") or meta.get("uuid"),
            source_app=source_app,
            import_method=HealthImportMethod.APPLE_HEALTH,
            metadata_json=json.dumps(meta, ensure_ascii=False) if meta else None,
        )


class HealthConnectAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.HEALTH_CONNECT
    display_name = "Health Connect"
    category = "device"
    requires_native_bridge = True
    description = "Синхронизация с Android Health Connect (Samsung, Xiaomi, Withings, Pixel)"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        val = float(raw["value"])
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, val, raw.get("unit"))
        dt = normalize_datetime(raw["measured_at"])

        meta = raw.get("metadata") or {}
        source_device = raw.get("source_device") or meta.get("device")
        source_app = raw.get("source_app") or meta.get("package_name")

        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.HEALTH_CONNECT,
            source_device=source_device,
            source_record_id=raw.get("source_record_id") or meta.get("id"),
            source_app=source_app,
            import_method=HealthImportMethod.HEALTH_CONNECT,
            metadata_json=json.dumps(meta, ensure_ascii=False) if meta else None,
        )


class GarminCloudAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.GARMIN
    display_name = "Garmin"
    category = "service"
    requires_native_bridge = False
    description = "Прямая облачная синхронизация через Garmin Health API"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        val = float(raw["value"])
        # Garmin body compositions often give weight in grams
        raw_unit = raw.get("unit")
        if m_type == HealthMetricType.WEIGHT and (raw_unit == "g" or raw_unit == "grams" or val > 1000):
            val = val / 1000.0
            raw_unit = "kg"

        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, val, raw_unit)
        dt = normalize_datetime(raw["measured_at"])

        meta = raw.get("metadata") or {}
        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.GARMIN,
            source_device=raw.get("source_device", "Garmin Device"),
            source_record_id=raw.get("source_record_id") or meta.get("summaryId"),
            source_app="com.garmin.connect",
            import_method=HealthImportMethod.DIRECT_API,
            metadata_json=json.dumps(meta, ensure_ascii=False) if meta else None,
        )


class WithingsCloudAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.WITHINGS
    display_name = "Withings"
    category = "service"
    requires_native_bridge = False
    description = "Синхронизация с умными весами и тонометрами Withings"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, float(raw["value"]), raw.get("unit"))
        dt = normalize_datetime(raw["measured_at"])
        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.WITHINGS,
            source_device=raw.get("source_device", "Withings Scale"),
            source_record_id=raw.get("source_record_id"),
            source_app="com.withings.wiscale2",
            import_method=HealthImportMethod.DIRECT_API,
            metadata_json=json.dumps(raw.get("metadata"), ensure_ascii=False) if raw.get("metadata") else None,
        )


class WhoopCloudAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.WHOOP
    display_name = "WHOOP"
    category = "service"
    requires_native_bridge = False
    description = "Синхронизация восстановления, сна и нагрузки WHOOP"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, float(raw["value"]), raw.get("unit"))
        dt = normalize_datetime(raw["measured_at"])
        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.WHOOP,
            source_device=raw.get("source_device", "WHOOP 4.0"),
            source_record_id=raw.get("source_record_id"),
            source_app="com.whoop.client",
            import_method=HealthImportMethod.DIRECT_API,
            metadata_json=json.dumps(raw.get("metadata"), ensure_ascii=False) if raw.get("metadata") else None,
        )


class OuraCloudAdapter(HealthProviderAdapter):
    provider_id = HealthSourceProvider.OURA
    display_name = "Oura"
    category = "service"
    requires_native_bridge = False
    description = "Синхронизация кольца Oura (готовность, сон, ЧСС)"

    def normalize_record(self, raw: dict[str, Any]) -> NormalizedHealthRecord:
        m_type = normalize_metric_type(str(raw["metric_type"]))
        norm_val, norm_unit = normalize_metric_value_and_unit(m_type, float(raw["value"]), raw.get("unit"))
        dt = normalize_datetime(raw["measured_at"])
        return NormalizedHealthRecord(
            metric_type=m_type,
            value=norm_val,
            unit=norm_unit,
            measured_at=dt,
            source_provider=HealthSourceProvider.OURA,
            source_device=raw.get("source_device", "Oura Ring"),
            source_record_id=raw.get("source_record_id"),
            source_app="com.ouraring.oura",
            import_method=HealthImportMethod.DIRECT_API,
            metadata_json=json.dumps(raw.get("metadata"), ensure_ascii=False) if raw.get("metadata") else None,
        )


ADAPTER_REGISTRY: dict[HealthSourceProvider, HealthProviderAdapter] = {
    HealthSourceProvider.MANUAL: ManualProviderAdapter(),
    HealthSourceProvider.APPLE_HEALTH: AppleHealthAdapter(),
    HealthSourceProvider.HEALTH_CONNECT: HealthConnectAdapter(),
    HealthSourceProvider.GARMIN: GarminCloudAdapter(),
    HealthSourceProvider.WITHINGS: WithingsCloudAdapter(),
    HealthSourceProvider.WHOOP: WhoopCloudAdapter(),
    HealthSourceProvider.OURA: OuraCloudAdapter(),
}


def get_adapter(provider: HealthSourceProvider) -> HealthProviderAdapter:
    adapter = ADAPTER_REGISTRY.get(provider)
    if not adapter:
        raise ValueError(f"Провайдер {provider} не поддерживается")
    return adapter
