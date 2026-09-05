from __future__ import annotations

from datetime import UTC, datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from app.enums import (
    HealthImportMethod,
    HealthMetricType,
    HealthSourceProvider,
    HealthSyncStatus,
    HealthUnit,
    UserRole,
)
from app.main import app
from app.models.health import HealthMeasurement
from app.schemas.health import (
    BatchHealthImportIn,
    BatchHealthImportOut,
    HealthSyncPayloadIn,
    ManualHealthMeasurementCreate,
    RawHealthRecordIn,
)
from app.services.health.adapters import ADAPTER_REGISTRY, get_adapter
from app.services.health.deduplication import (
    SourcePriorityPolicy,
    generate_fallback_fingerprint,
    is_time_close,
    is_value_close,
)
from app.services.health.normalization import (
    normalize_datetime,
    normalize_metric_type,
    normalize_metric_value_and_unit,
)
from app.services.health.service import HealthService


def test_normalization_units_and_types():
    # Weight: lbs -> kg
    val, unit = normalize_metric_value_and_unit(HealthMetricType.WEIGHT, 172.4, "lbs")
    assert unit == HealthUnit.KG
    assert round(val, 1) == 78.2

    # Weight: stone -> kg
    val_st, unit_st = normalize_metric_value_and_unit(HealthMetricType.WEIGHT, 12.3, "st")
    assert unit_st == HealthUnit.KG
    assert round(val_st, 1) == 78.1

    # Body fat: ratio 0.148 -> 14.8 %
    val_fat, unit_fat = normalize_metric_value_and_unit(HealthMetricType.BODY_FAT_PERCENTAGE, 0.148, "ratio")
    assert unit_fat == HealthUnit.PERCENT
    assert val_fat == 14.8

    # Body fat: direct percent
    val_fat2, unit_fat2 = normalize_metric_value_and_unit(HealthMetricType.BODY_FAT_PERCENTAGE, 15.2, "%")
    assert unit_fat2 == HealthUnit.PERCENT
    assert val_fat2 == 15.2

    # HRV: seconds -> ms
    val_hrv, unit_hrv = normalize_metric_value_and_unit(HealthMetricType.HRV, 0.045, "s")
    assert unit_hrv == HealthUnit.MS
    assert val_hrv == 45.0

    # Metric type aliases
    assert normalize_metric_type("HKQuantityTypeIdentifierBodyMass") == HealthMetricType.WEIGHT
    assert normalize_metric_type("BodyFatRecord") == HealthMetricType.BODY_FAT_PERCENTAGE
    assert normalize_metric_type("muscle_mass") == HealthMetricType.MUSCLE_MASS


def test_normalization_datetime():
    dt1 = normalize_datetime("2026-09-01T08:30:00Z")
    assert dt1.tzinfo == UTC
    assert dt1.hour == 8

    dt2 = normalize_datetime("2026-09-01T11:30:00+03:00")
    assert dt2.tzinfo == UTC
    assert dt2.hour == 8

    # Unix timestamp in ms
    dt3 = normalize_datetime(1788251400000)
    assert dt3.tzinfo == UTC


def test_source_priority_policy():
    # Direct Garmin should replace Health Connect for same automated measurement
    assert SourcePriorityPolicy.should_replace(
        existing_provider=HealthSourceProvider.HEALTH_CONNECT,
        candidate_provider=HealthSourceProvider.GARMIN,
    ) is True

    # Health Connect should NOT replace Garmin
    assert SourcePriorityPolicy.should_replace(
        existing_provider=HealthSourceProvider.GARMIN,
        candidate_provider=HealthSourceProvider.HEALTH_CONNECT,
    ) is False

    # Manual is NEVER replaced automatically
    assert SourcePriorityPolicy.should_replace(
        existing_provider=HealthSourceProvider.MANUAL,
        candidate_provider=HealthSourceProvider.GARMIN,
    ) is False


def test_fallback_fingerprint():
    t1 = datetime(2026, 9, 1, 8, 30, 10, tzinfo=UTC)
    t2 = datetime(2026, 9, 1, 8, 30, 45, tzinfo=UTC)
    fp1 = generate_fallback_fingerprint("user-1", HealthMetricType.WEIGHT, t1, 78.24)
    fp2 = generate_fallback_fingerprint("user-1", HealthMetricType.WEIGHT, t2, 78.21)
    assert fp1 == fp2


def test_health_service_manual_and_progress(session_factory, make_user):
    user_id = make_user("Алексей Тест")
    with session_factory() as session:
        svc = HealthService(session)

        # 1. Add manual baseline measurement
        t_base = datetime(2026, 6, 1, 8, 0, 0, tzinfo=UTC)
        created_base = svc.add_manual_measurement(
            user_id,
            ManualHealthMeasurementCreate(
                measured_at=t_base,
                weight=79.5,
                body_fat=16.9,
                muscle_mass=35.3,
            ),
        )
        assert len(created_base) == 3
        assert created_base[0].source_provider == HealthSourceProvider.MANUAL
        assert created_base[0].import_method == HealthImportMethod.MANUAL

        # 2. Add latest measurement with Xiaomi scale via Apple Health
        t_latest = datetime(2026, 9, 1, 8, 42, 0, tzinfo=UTC)
        payload = HealthSyncPayloadIn(
            provider=HealthSourceProvider.APPLE_HEALTH,
            device_name="Xiaomi Body Composition Scale S400",
            records=[
                RawHealthRecordIn(
                    metric_type="HKQuantityTypeIdentifierBodyMass",
                    value=78.2,
                    unit="kg",
                    measured_at=t_latest,
                    source_record_id="apple-health-uuid-1234",
                ),
                RawHealthRecordIn(
                    metric_type="HKQuantityTypeIdentifierBodyFatPercentage",
                    value=0.148,
                    unit="ratio",
                    measured_at=t_latest,
                    source_record_id="apple-health-uuid-1235",
                ),
                RawHealthRecordIn(
                    metric_type="muscle_mass",
                    value=36.5,
                    unit="kg",
                    measured_at=t_latest,
                    source_record_id="apple-health-uuid-1236",
                ),
            ],
        )
        ingested = svc.ingest_records(user_id, payload)
        assert len(ingested) == 3
        assert ingested[0].source_device == "Xiaomi Body Composition Scale S400"
        assert ingested[0].source_provider == HealthSourceProvider.APPLE_HEALTH

        # 3. Calculate progress
        progress = svc.get_progress(user_id)
        assert progress.latest_weight is not None
        assert progress.latest_weight.current_value == 78.2
        assert progress.latest_weight.baseline_value == 79.5
        assert progress.latest_weight.delta is not None
        assert progress.latest_weight.delta.direction == "down"
        assert "−1,3" in progress.latest_weight.delta.formatted
        # Check provenance label
        assert "Xiaomi Body Composition Scale S400" in progress.latest_weight.provenance_label

        # 4. Check series points
        assert len(progress.weight_series) == 2
        assert progress.weight_series[0].value == 79.5
        assert "Внесено вручную" in progress.weight_series[0].provenance_label
        assert progress.weight_series[1].value == 78.2
        assert "Xiaomi Body Composition Scale S400" in progress.weight_series[1].provenance_label


def test_deduplication_exact_and_cross_source(session_factory, make_user):
    user_id = make_user("Сергей Дедуп")
    with session_factory() as session:
        svc = HealthService(session)
        t = datetime(2026, 9, 1, 9, 0, 0, tzinfo=UTC)

        # Step A: Ingest via Health Connect (aggregator)
        payload1 = HealthSyncPayloadIn(
            provider=HealthSourceProvider.HEALTH_CONNECT,
            records=[
                RawHealthRecordIn(
                    metric_type="weight",
                    value=80.0,
                    unit="kg",
                    measured_at=t,
                    source_record_id="hc-weight-101",
                    source_device="Garmin Forerunner 965",
                )
            ],
        )
        res1 = svc.ingest_records(user_id, payload1)
        assert len(res1) == 1
        assert res1[0].source_provider == HealthSourceProvider.HEALTH_CONNECT

        # Step B: Re-ingest exact same record (should not duplicate)
        res2 = svc.ingest_records(user_id, payload1)
        assert len(res2) == 1
        all_m = svc.query_measurements(user_id, metric_type=HealthMetricType.WEIGHT)
        assert len(all_m) == 1

        # Step C: Direct Garmin API sync for same measurement (higher priority)
        payload_garmin = HealthSyncPayloadIn(
            provider=HealthSourceProvider.GARMIN,
            records=[
                RawHealthRecordIn(
                    metric_type="weight",
                    value=80.0,
                    unit="kg",
                    measured_at=t + timedelta(seconds=15),
                    source_record_id="garmin-summary-777",
                    source_device="Garmin Forerunner 965",
                )
            ],
        )
        res3 = svc.ingest_records(user_id, payload_garmin)
        assert len(res3) == 1

        # Check that existing record was upgraded to Garmin Direct according to SourcePriorityPolicy
        all_m_after = svc.query_measurements(user_id, metric_type=HealthMetricType.WEIGHT)
        assert len(all_m_after) == 1
        assert all_m_after[0].source_provider == HealthSourceProvider.GARMIN


def test_disconnect_preserves_history(session_factory, make_user):
    user_id = make_user("Иван Отключение")
    with session_factory() as session:
        svc = HealthService(session)

        # Connect Apple Health and ingest data
        svc.connect_source(user_id, HealthSourceProvider.APPLE_HEALTH)
        t = datetime(2026, 8, 15, 10, 0, 0, tzinfo=UTC)
        svc.ingest_records(
            user_id,
            HealthSyncPayloadIn(
                provider=HealthSourceProvider.APPLE_HEALTH,
                records=[RawHealthRecordIn(metric_type="weight", value=75.5, measured_at=t)],
            ),
        )

        # Disconnect provider
        disconn = svc.disconnect_source(user_id, HealthSourceProvider.APPLE_HEALTH)
        assert disconn.status == HealthSyncStatus.DISCONNECTED

        # Verify historical measurements remain intact
        measurements = svc.query_measurements(user_id)
        assert len(measurements) == 1
        assert measurements[0].value == 75.5
        assert measurements[0].source_provider == HealthSourceProvider.APPLE_HEALTH


def test_health_api_endpoints(session_factory, make_user):
    client = TestClient(app)

    # 1. Test GET /api/v1/health/sources
    resp = client.get("/api/v1/health/sources")
    assert resp.status_code == 200
    sources = resp.json()
    assert isinstance(sources, list)
    providers = [s["provider"] for s in sources]
    assert "apple_health" in providers
    assert "health_connect" in providers
    assert "garmin" in providers

    # 2. Test POST /api/v1/health/measurements/manual
    now_iso = datetime.now(UTC).isoformat()
    resp_add = client.post(
        "/api/v1/health/measurements/manual",
        json={
            "measuredAt": now_iso,
            "weight": 81.2,
            "bodyFat": 15.6,
            "muscleMass": 37.0,
            "notes": "Утренний замер натощак",
        },
    )
    assert resp_add.status_code == 201
    data = resp_add.json()
    assert len(data) == 3
    assert data[0]["sourceProvider"] == "manual"

    # 3. Test GET /api/v1/health/progress
    resp_prog = client.get("/api/v1/health/progress")
    assert resp_prog.status_code == 200
    prog = resp_prog.json()
    assert prog["latestWeight"] is not None
    assert prog["latestWeight"]["currentValue"] == 81.2
    assert "Внесено вручную" in prog["latestWeight"]["provenanceLabel"]

    # 4. Test POST /api/v1/health/sources/{provider}/disconnect
    resp_disc = client.post("/api/v1/health/sources/apple_health/disconnect")
    assert resp_disc.status_code == 200
    assert resp_disc.json()["status"] == "disconnected"


def test_batch_import_idempotency_5_times(session_factory, make_user):
    user_id = make_user("Тест Идемпотентности")
    with session_factory() as session:
        svc = HealthService(session)

        # Create batch of 5 records
        base_time = datetime(2026, 9, 1, 8, 0, 0, tzinfo=UTC)
        records = [
            RawHealthRecordIn(
                metric_type="weight",
                value=78.0 + i * 0.2,
                unit="kg",
                measured_at=base_time + timedelta(days=i),
                source_record_id=f"ext-sample-{i}",
                source_device="Xiaomi Body Composition Scale S400",
                source_app="com.xiaomi.wearable",
            )
            for i in range(5)
        ]
        payload = BatchHealthImportIn(
            provider=HealthSourceProvider.APPLE_HEALTH,
            sync_cursor="anchor-token-v1",
            records=records,
        )

        # Run 1: All 5 should be inserted
        res1 = svc.batch_import(user_id, payload)
        assert res1.received == 5
        assert res1.inserted == 5
        assert res1.deduplicated == 0
        assert res1.rejected == 0

        # Runs 2 through 5: Exactly 0 inserted, 5 deduplicated
        for run_idx in range(2, 6):
            res = svc.batch_import(user_id, payload)
            assert res.received == 5
            assert res.inserted == 0, f"Run {run_idx} inserted new records instead of deduplicating!"
            assert res.deduplicated == 5
            assert res.rejected == 0

        # Verify total measurements in database is exactly 5
        db_records = svc.query_measurements(user_id, metric_type=HealthMetricType.WEIGHT)
        assert len(db_records) == 5
        # Verify source provider was mapped to XIAOMI because of bundle ID com.xiaomi.wearable
        assert db_records[0].source_provider == HealthSourceProvider.XIAOMI
        assert db_records[0].import_method == HealthImportMethod.APPLE_HEALTH


def test_source_identity_mapping():
    from app.services.health.source_mapping import resolve_source_provider, sanitize_device_name

    # Xiaomi apps
    assert resolve_source_provider("com.xiaomi.wearable", HealthSourceProvider.APPLE_HEALTH) == HealthSourceProvider.XIAOMI
    assert resolve_source_provider("com.mi.health", HealthSourceProvider.HEALTH_CONNECT) == HealthSourceProvider.XIAOMI

    # Garmin apps
    assert resolve_source_provider("com.garmin.connect", HealthSourceProvider.APPLE_HEALTH) == HealthSourceProvider.GARMIN
    assert resolve_source_provider("com.garmin.android.apps.connectmobile", HealthSourceProvider.HEALTH_CONNECT) == HealthSourceProvider.GARMIN

    # Samsung Health
    assert resolve_source_provider("com.sec.android.app.shealth", HealthSourceProvider.HEALTH_CONNECT) == HealthSourceProvider.SAMSUNG_HEALTH

    # Apple Health
    assert resolve_source_provider("com.apple.health", HealthSourceProvider.APPLE_HEALTH) == HealthSourceProvider.APPLE_HEALTH

    # Unknown bundle ID falls back to transport provider without guessing
    assert resolve_source_provider("com.random.app", HealthSourceProvider.APPLE_HEALTH) == HealthSourceProvider.APPLE_HEALTH
    assert resolve_source_provider(None, HealthSourceProvider.HEALTH_CONNECT) == HealthSourceProvider.HEALTH_CONNECT

    # Sanitize device name
    assert sanitize_device_name("Xiaomi Body Composition Scale S400") == "Xiaomi Body Composition Scale S400"
    assert sanitize_device_name("unknown") is None
    assert sanitize_device_name("null") is None


def test_manual_never_overwritten_by_batch_import(session_factory, make_user):
    user_id = make_user("Тест Защиты Ручных Данных")
    with session_factory() as session:
        svc = HealthService(session)
        t = datetime(2026, 9, 1, 8, 0, 0, tzinfo=UTC)

        # 1. User enters manual measurement at 08:00
        svc.add_manual_measurement(
            user_id,
            ManualHealthMeasurementCreate(measured_at=t, weight=78.2),
        )

        # 2. Later, Apple Health sync imports a sample for the exact same timestamp 08:00
        batch = BatchHealthImportIn(
            provider=HealthSourceProvider.APPLE_HEALTH,
            records=[
                RawHealthRecordIn(
                    metric_type="weight",
                    value=78.2,
                    unit="kg",
                    measured_at=t,
                    source_record_id="apple-health-auto-999",
                    source_app="com.apple.health",
                )
            ],
        )
        res = svc.batch_import(user_id, batch)
        assert res.inserted == 1

        # 3. Verify BOTH records are preserved in database with distinct provenance
        all_weights = svc.query_measurements(user_id, metric_type=HealthMetricType.WEIGHT)
        assert len(all_weights) == 2
        providers = {m.source_provider for m in all_weights}
        assert HealthSourceProvider.MANUAL in providers
        assert HealthSourceProvider.APPLE_HEALTH in providers


def test_partial_failure_in_batch(session_factory, make_user):
    user_id = make_user("Тест Частичных Ошибок")
    with session_factory() as session:
        svc = HealthService(session)
        t = datetime(2026, 9, 1, 8, 0, 0, tzinfo=UTC)

        # Batch with 2 valid records and 1 invalid (negative value)
        batch = BatchHealthImportIn(
            provider=HealthSourceProvider.HEALTH_CONNECT,
            records=[
                RawHealthRecordIn(metric_type="weight", value=80.0, measured_at=t, source_record_id="rec-1"),
                RawHealthRecordIn(metric_type="weight", value=-15.0, measured_at=t, source_record_id="rec-bad"),
                RawHealthRecordIn(metric_type="weight", value=80.2, measured_at=t + timedelta(hours=1), source_record_id="rec-2"),
            ],
        )
        res = svc.batch_import(user_id, batch)
        assert res.received == 3
        assert res.inserted == 2
        assert res.rejected == 1
        assert res.deduplicated == 0

