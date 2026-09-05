from __future__ import annotations

from datetime import datetime, timedelta
from typing import NamedTuple

from ...enums import HealthImportMethod, HealthMetricType, HealthSourceProvider


class SourcePriorityPolicy:
    """
    Приоритет источников при разрешении дублирующихся замеров одного показателя:
    Прямой облачный API устройства > Системный агрегатор (HealthKit / Health Connect) > Ручной ввод
    """
    PRIORITIES: dict[HealthSourceProvider, int] = {
        HealthSourceProvider.GARMIN: 40,
        HealthSourceProvider.WITHINGS: 40,
        HealthSourceProvider.WHOOP: 40,
        HealthSourceProvider.OURA: 40,
        HealthSourceProvider.FITBIT: 40,
        HealthSourceProvider.APPLE_HEALTH: 30,
        HealthSourceProvider.HEALTH_CONNECT: 30,
        HealthSourceProvider.SAMSUNG_HEALTH: 30,
        HealthSourceProvider.XIAOMI: 25,
        HealthSourceProvider.MANUAL: 10,
    }

    @classmethod
    def get_priority(cls, provider: HealthSourceProvider) -> int:
        return cls.PRIORITIES.get(provider, 10)

    @classmethod
    def should_replace(cls, existing_provider: HealthSourceProvider, candidate_provider: HealthSourceProvider) -> bool:
        # Ручной ввод никогда не заменяется автоматически
        if existing_provider == HealthSourceProvider.MANUAL or candidate_provider == HealthSourceProvider.MANUAL:
            return False
        return cls.get_priority(candidate_provider) > cls.get_priority(existing_provider)


class MeasurementCandidate(NamedTuple):
    metric_type: HealthMetricType
    value: float
    measured_at: datetime
    source_provider: HealthSourceProvider
    source_record_id: str | None
    source_device: str | None


def is_time_close(t1: datetime, t2: datetime, window_seconds: int = 120) -> bool:
    return abs((t1 - t2).total_seconds()) <= window_seconds


def is_value_close(v1: float, v2: float, metric_type: HealthMetricType) -> bool:
    if metric_type in (HealthMetricType.WEIGHT, HealthMetricType.LEAN_BODY_MASS, HealthMetricType.MUSCLE_MASS):
        return abs(v1 - v2) <= 0.05
    if metric_type == HealthMetricType.BODY_FAT_PERCENTAGE:
        return abs(v1 - v2) <= 0.1
    if metric_type in (HealthMetricType.STEPS, HealthMetricType.HEART_RATE, HealthMetricType.RESTING_HEART_RATE):
        return abs(v1 - v2) < 1.0
    return abs(v1 - v2) <= 0.05


def generate_fallback_fingerprint(
    user_id: str,
    metric_type: HealthMetricType,
    measured_at: datetime,
    value: float,
) -> str:
    """
    Генерирует стабильный fallback-отпечаток с округлением времени до 2-минутного квантования
    для обнаружения идентичных замеров от разных провайдеров.
    """
    bucket_ts = int(measured_at.timestamp() // 120) * 120
    rounded_val = round(value, 1)
    return f"{user_id}:{metric_type}:{bucket_ts}:{rounded_val}"
