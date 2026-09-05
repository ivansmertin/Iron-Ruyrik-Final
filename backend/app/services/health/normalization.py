from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ...enums import HealthMetricType, HealthUnit


METRIC_TYPE_ALIASES: dict[str, HealthMetricType] = {
    # Weight
    "weight": HealthMetricType.WEIGHT,
    "body_mass": HealthMetricType.WEIGHT,
    "bodymass": HealthMetricType.WEIGHT,
    "hkquantitytypeidentifierbodymass": HealthMetricType.WEIGHT,
    "weightrecord": HealthMetricType.WEIGHT,
    "weight_kg": HealthMetricType.WEIGHT,
    # Body Fat
    "body_fat": HealthMetricType.BODY_FAT_PERCENTAGE,
    "body_fat_percentage": HealthMetricType.BODY_FAT_PERCENTAGE,
    "bodyfatpercentage": HealthMetricType.BODY_FAT_PERCENTAGE,
    "hkquantitytypeidentifierbodyfatpercentage": HealthMetricType.BODY_FAT_PERCENTAGE,
    "bodyfatrecord": HealthMetricType.BODY_FAT_PERCENTAGE,
    "fat_percentage": HealthMetricType.BODY_FAT_PERCENTAGE,
    # Lean Body Mass
    "lean_body_mass": HealthMetricType.LEAN_BODY_MASS,
    "leanbodymass": HealthMetricType.LEAN_BODY_MASS,
    "hkquantitytypeidentifierleanbodymass": HealthMetricType.LEAN_BODY_MASS,
    "leanbodymassrecord": HealthMetricType.LEAN_BODY_MASS,
    # Muscle Mass
    "muscle_mass": HealthMetricType.MUSCLE_MASS,
    "musclemass": HealthMetricType.MUSCLE_MASS,
    # Steps
    "steps": HealthMetricType.STEPS,
    "step_count": HealthMetricType.STEPS,
    "hkquantitytypeidentifierstepcount": HealthMetricType.STEPS,
    "stepsrecord": HealthMetricType.STEPS,
    # Heart Rate & Resting Heart Rate
    "heart_rate": HealthMetricType.HEART_RATE,
    "hkquantitytypeidentifierheartrate": HealthMetricType.HEART_RATE,
    "heartraterecord": HealthMetricType.HEART_RATE,
    "resting_heart_rate": HealthMetricType.RESTING_HEART_RATE,
    "hkquantitytypeidentifierrestingheartrate": HealthMetricType.RESTING_HEART_RATE,
    "restingheartraterecord": HealthMetricType.RESTING_HEART_RATE,
    # HRV
    "hrv": HealthMetricType.HRV,
    "hkquantitytypeidentifierheartratevariabilitysdnn": HealthMetricType.HRV,
    "heartratevariabilityrmssdrecord": HealthMetricType.HRV,
    # Sleep
    "sleep_duration": HealthMetricType.SLEEP_DURATION,
    "sleepsessionrecord": HealthMetricType.SLEEP_DURATION,
    "sleep_score": HealthMetricType.SLEEP_SCORE,
    # VO2 Max
    "vo2_max": HealthMetricType.VO2_MAX,
    "hkquantitytypeidentifiervo2max": HealthMetricType.VO2_MAX,
    "vo2maxrecord": HealthMetricType.VO2_MAX,
    # Workout
    "workout": HealthMetricType.WORKOUT,
    "hkworkouttypeidentifier": HealthMetricType.WORKOUT,
}


def normalize_metric_type(raw_name: str) -> HealthMetricType:
    normalized_key = raw_name.strip().lower().replace(" ", "_")
    if normalized_key in METRIC_TYPE_ALIASES:
        return METRIC_TYPE_ALIASES[normalized_key]
    try:
        return HealthMetricType(normalized_key)
    except ValueError:
        raise ValueError(f"Неизвестный тип метрики: {raw_name}")


def normalize_datetime(val: datetime | str | float | int) -> datetime:
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=UTC)
        return val.astimezone(UTC)

    if isinstance(val, (int, float)):
        # If timestamp is in milliseconds (e.g. > 1e11)
        if val > 1e11:
            val = val / 1000.0
        return datetime.fromtimestamp(val, tz=UTC)

    if isinstance(val, str):
        cleaned = val.strip()
        # Support trailing Z
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)

    raise ValueError(f"Некорректный формат даты/времени: {val}")


def normalize_metric_value_and_unit(
    metric_type: HealthMetricType,
    raw_value: float,
    raw_unit: str | None = None,
) -> tuple[float, HealthUnit]:
    unit_str = (raw_unit or "").strip().lower()

    if metric_type in (HealthMetricType.WEIGHT, HealthMetricType.LEAN_BODY_MASS, HealthMetricType.MUSCLE_MASS):
        target_unit = HealthUnit.KG
        if unit_str in ("lb", "lbs", "pound", "pounds"):
            val_kg = raw_value * 0.45359237
        elif unit_str in ("st", "stone", "stones"):
            val_kg = raw_value * 6.35029318
        else:
            val_kg = raw_value
        return round(val_kg, 2), target_unit

    if metric_type == HealthMetricType.BODY_FAT_PERCENTAGE:
        target_unit = HealthUnit.PERCENT
        # If passed as a 0..1 ratio, e.g. 0.148 for 14.8%
        if 0 < raw_value <= 1.0 and unit_str in ("ratio", "fraction", ""):
            return round(raw_value * 100, 2), target_unit
        return round(raw_value, 2), target_unit

    if metric_type == HealthMetricType.STEPS:
        return float(int(round(raw_value))), HealthUnit.COUNT

    if metric_type in (HealthMetricType.HEART_RATE, HealthMetricType.RESTING_HEART_RATE):
        return float(int(round(raw_value))), HealthUnit.BPM

    if metric_type == HealthMetricType.HRV:
        # If HRV passed in seconds (e.g. 0.045s -> 45ms)
        if raw_value < 1.0 and unit_str in ("s", "sec", "seconds"):
            return round(raw_value * 1000, 1), HealthUnit.MS
        return round(raw_value, 1), HealthUnit.MS

    if metric_type == HealthMetricType.SLEEP_DURATION:
        # Normalize to minutes
        if unit_str in ("s", "sec", "seconds"):
            return round(raw_value / 60.0, 1), HealthUnit.MINUTES
        if unit_str in ("h", "hr", "hours"):
            return round(raw_value * 60.0, 1), HealthUnit.MINUTES
        return round(raw_value, 1), HealthUnit.MINUTES

    if metric_type == HealthMetricType.SLEEP_SCORE:
        return round(raw_value, 1), HealthUnit.SCORE

    if metric_type == HealthMetricType.VO2_MAX:
        return round(raw_value, 1), HealthUnit.ML_KG_MIN

    # Fallback default
    return round(raw_value, 2), HealthUnit.COUNT
