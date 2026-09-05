from enum import StrEnum


class UserRole(StrEnum):
    CLIENT = "client"
    TRAINER = "trainer"
    ADMIN = "admin"


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class BookingBlockType(StrEnum):
    MAINTENANCE = "maintenance"
    PRIVATE_EVENT = "private_event"
    CLOSED = "closed"
    OTHER = "other"


class MembershipKind(StrEnum):
    VISITS_PACKAGE = "visits_package"
    UNLIMITED = "unlimited"


class MembershipStatus(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class HealthMetricType(StrEnum):
    WEIGHT = "weight"
    BODY_FAT_PERCENTAGE = "body_fat_percentage"
    LEAN_BODY_MASS = "lean_body_mass"
    MUSCLE_MASS = "muscle_mass"
    STEPS = "steps"
    RESTING_HEART_RATE = "resting_heart_rate"
    HEART_RATE = "heart_rate"
    HRV = "hrv"
    SLEEP_DURATION = "sleep_duration"
    SLEEP_SCORE = "sleep_score"
    VO2_MAX = "vo2_max"
    WORKOUT = "workout"


class HealthUnit(StrEnum):
    KG = "kg"
    PERCENT = "percent"
    BPM = "bpm"
    MS = "ms"
    COUNT = "count"
    MINUTES = "minutes"
    SECONDS = "seconds"
    ML_KG_MIN = "ml_kg_min"
    SCORE = "score"


class HealthSourceProvider(StrEnum):
    MANUAL = "manual"
    APPLE_HEALTH = "apple_health"
    HEALTH_CONNECT = "health_connect"
    GARMIN = "garmin"
    XIAOMI = "xiaomi"
    WITHINGS = "withings"
    WHOOP = "whoop"
    OURA = "oura"
    FITBIT = "fitbit"
    SAMSUNG_HEALTH = "samsung_health"


class HealthImportMethod(StrEnum):
    MANUAL = "manual"
    DIRECT_API = "direct_api"
    NATIVE_BRIDGE = "native_bridge"
    APPLE_HEALTH = "apple_health"
    HEALTH_CONNECT = "health_connect"


class HealthSyncStatus(StrEnum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    SYNCING = "syncing"
    ERROR = "error"
    PERMISSION_REQUIRED = "permission_required"
    UNSUPPORTED = "unsupported"


