from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Enum, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from ..db_types import UTCDateTime
from ..enums import (
    HealthImportMethod,
    HealthMetricType,
    HealthSourceProvider,
    HealthSyncStatus,
    HealthUnit,
)


def enum_values(enum_class: type) -> list[str]:
    return [member.value for member in enum_class]


def uuid_str() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


class HealthMeasurement(Base):
    __tablename__ = "health_measurements"
    __table_args__ = (
        Index("ix_health_measurements_user_metric_time", "user_id", "metric_type", "measured_at"),
        Index("ix_health_measurements_dedup", "user_id", "source_provider", "source_record_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metric_type: Mapped[HealthMetricType] = mapped_column(
        Enum(HealthMetricType, native_enum=False, values_callable=enum_values), nullable=False
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[HealthUnit] = mapped_column(
        Enum(HealthUnit, native_enum=False, values_callable=enum_values), nullable=False
    )
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    source_provider: Mapped[HealthSourceProvider] = mapped_column(
        Enum(HealthSourceProvider, native_enum=False, values_callable=enum_values), nullable=False
    )
    source_device: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_app: Mapped[str | None] = mapped_column(String(120), nullable=True)
    import_method: Mapped[HealthImportMethod] = mapped_column(
        Enum(HealthImportMethod, native_enum=False, values_callable=enum_values), nullable=False
    )
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now, nullable=False)


class HealthSyncConnection(Base):
    __tablename__ = "health_sync_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_health_sync_connection_user_provider"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[HealthSourceProvider] = mapped_column(
        Enum(HealthSourceProvider, native_enum=False, values_callable=enum_values), nullable=False
    )
    status: Mapped[HealthSyncStatus] = mapped_column(
        Enum(HealthSyncStatus, native_enum=False, values_callable=enum_values),
        default=HealthSyncStatus.DISCONNECTED,
        nullable=False,
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    sync_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now, nullable=False)
