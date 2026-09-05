from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..enums import BookingBlockType, BookingStatus, MembershipKind, MembershipStatus, UserRole


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(word.capitalize() for word in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class ErrorDetail(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorDetail


class TrainerOut(ApiModel):
    id: str
    slug: str
    name: str
    bio: str | None = None
    specialties: list[str]
    is_active: bool


class TimeSlotOut(ApiModel):
    id: str
    start_at: datetime
    end_at: datetime
    booked: int
    capacity: int
    available: int
    is_blocked: bool


class ScheduleDayOut(ApiModel):
    date: str
    slots: list[TimeSlotOut]


class ScheduleOut(ApiModel):
    timezone: str
    capacity: int
    days: list[ScheduleDayOut]


class BookingCreate(ApiModel):
    slot_id: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    trainer_slug: str | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("start_at", "end_at")
    @classmethod
    def require_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("datetime must include timezone")
        return value


class AdminBookingCreate(BookingCreate):
    client_name: str = Field(min_length=1, max_length=120)


class BookingOut(ApiModel):
    id: str
    user_id: str
    client_name: str
    trainer_slug: str | None = None
    trainer_name: str | None = None
    slot_id: str | None = None
    start_at: datetime
    end_at: datetime
    status: BookingStatus
    notes: str | None = None
    created_at: datetime
    cancelled_at: datetime | None = None


class UserOut(ApiModel):
    id: str
    name: str
    role: UserRole
    is_active: bool
    city: str = "Великий Новгород"


class MembershipOut(ApiModel):
    id: str
    name: str
    type: MembershipKind
    starts_at: datetime
    expires_at: datetime | None
    visits_total: int | None
    visits_remaining: int | None
    status: MembershipStatus


class ProfileOut(ApiModel):
    user: UserOut
    membership: MembershipOut | None
    history: list[BookingOut]


class MeasurementCreate(ApiModel):
    measured_at: datetime
    weight: float | None = Field(default=None, gt=0)
    body_fat: float | None = Field(default=None, ge=0, le=100)
    muscle_mass: float | None = Field(default=None, gt=0)

    @field_validator("measured_at")
    @classmethod
    def require_aware_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone")
        return value


class MeasurementOut(MeasurementCreate):
    id: str
    created_at: datetime


class BookingBlockCreate(ApiModel):
    start_at: datetime
    end_at: datetime
    type: BookingBlockType
    reason: str | None = Field(default=None, max_length=255)


class BookingBlockOut(BookingBlockCreate):
    id: str
    created_at: datetime


class SettingsOut(ApiModel):
    gym_capacity: int
    default_booking_duration_minutes: int
    booking_step_minutes: int
    cancel_before_minutes: int
    timezone: str


class SettingsPatch(ApiModel):
    gym_capacity: int | None = Field(default=None, ge=1, le=100)
    default_booking_duration_minutes: int | None = Field(default=None, ge=15, le=480)
    booking_step_minutes: int | None = Field(default=None, ge=5, le=240)
    cancel_before_minutes: int | None = Field(default=None, ge=0, le=10080)
    timezone: str | None = Field(default=None, min_length=1, max_length=80)


class HomeOut(ApiModel):
    user: UserOut
    membership: MembershipOut | None
    next_booking: BookingOut | None
    current_occupancy: int
    capacity: int


class HealthOut(ApiModel):
    status: str
    database: str


class NewsPostOut(ApiModel):
    id: str
    post_number: int
    url: str
    text: str
    date: datetime | None = None
    image_url: str | None = None
    views: str | None = None


class NewsResponseOut(ApiModel):
    channel_title: str
    channel_handle: str
    channel_url: str
    author_name: str
    author_role: str
    posts: list[NewsPostOut]


