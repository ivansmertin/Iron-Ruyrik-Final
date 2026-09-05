from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from ..enums import (
    HealthImportMethod,
    HealthMetricType,
    HealthSourceProvider,
    HealthSyncStatus,
    HealthUnit,
)
from .domain import ApiModel


class HealthMeasurementOut(ApiModel):
    id: str
    user_id: str
    metric_type: HealthMetricType
    value: float
    unit: HealthUnit
    measured_at: datetime
    source_provider: HealthSourceProvider
    source_device: str | None = None
    source_record_id: str | None = None
    source_app: str | None = None
    import_method: HealthImportMethod
    metadata_json: str | None = None
    created_at: datetime


class ManualHealthMeasurementCreate(ApiModel):
    measured_at: datetime
    weight: float | None = Field(default=None, gt=0, le=500)
    body_fat: float | None = Field(default=None, ge=0, le=100)
    muscle_mass: float | None = Field(default=None, gt=0, le=300)
    notes: str | None = Field(default=None, max_length=255)

    @field_validator("measured_at")
    @classmethod
    def require_aware_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone")
        return value

    @field_validator("muscle_mass")
    @classmethod
    def validate_has_at_least_one_metric(cls, value: float | None, info: Any) -> float | None:
        weight = info.data.get("weight")
        body_fat = info.data.get("body_fat")
        if weight is None and body_fat is None and value is None:
            raise ValueError("Необходимо указать хотя бы один показатель (вес, жир или мышцы)")
        return value


class RawHealthRecordIn(ApiModel):
    metric_type: str
    value: float
    unit: str | None = None
    measured_at: datetime | str | float | int
    source_record_id: str | None = None
    source_device: str | None = None
    source_app: str | None = None
    metadata: dict[str, Any] | str | None = None


class HealthSyncPayloadIn(ApiModel):
    provider: HealthSourceProvider
    device_name: str | None = None
    app_name: str | None = None
    records: list[RawHealthRecordIn] = Field(default_factory=list)


class BatchHealthImportIn(ApiModel):
    provider: HealthSourceProvider
    sync_cursor: str | None = None
    records: list[RawHealthRecordIn] = Field(default_factory=list, max_length=500)


class BatchHealthImportOut(ApiModel):
    received: int
    inserted: int
    deduplicated: int
    rejected: int
    new_sync_cursor: str | None = None
    status: HealthSyncStatus
    last_synced_at: datetime | None = None


class HealthSyncConnectionOut(ApiModel):
    id: str
    provider: HealthSourceProvider
    status: HealthSyncStatus
    last_synced_at: datetime | None = None
    sync_cursor: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    display_name: str
    category: str
    is_supported_on_client: bool = True

    requires_native_bridge: bool = False
    description: str | None = None


class HealthMetricDeltaOut(ApiModel):
    diff: float
    formatted: str
    direction: str
    label: str


class HealthMetricSummaryOut(ApiModel):
    metric_type: HealthMetricType
    current_value: float
    unit: HealthUnit
    measured_at: datetime
    provenance_label: str
    source_provider: HealthSourceProvider
    source_device: str | None = None
    delta: HealthMetricDeltaOut | None = None
    baseline_value: float | None = None
    baseline_date: datetime | None = None


class HealthSparklinePointOut(ApiModel):
    id: str
    date: str
    measured_at: datetime
    value: float
    provenance_label: str
    source_provider: HealthSourceProvider
    source_device: str | None = None


class HealthProgressOut(ApiModel):
    visits_this_month: int
    consistent_weeks: int
    latest_weight: HealthMetricSummaryOut | None = None
    latest_body_fat: HealthMetricSummaryOut | None = None
    latest_muscle_mass: HealthMetricSummaryOut | None = None
    weight_series: list[HealthSparklinePointOut] = Field(default_factory=list)
