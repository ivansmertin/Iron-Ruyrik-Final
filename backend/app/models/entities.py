from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from ..db_types import UTCDateTime
from ..enums import BookingBlockType, BookingStatus, MembershipKind, MembershipStatus, UserRole


def enum_values(enum_class: type) -> list[str]:
    return [member.value for member in enum_class]


def uuid_str() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40), unique=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, values_callable=enum_values), default=UserRole.CLIENT, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    trainer_profile: Mapped[TrainerProfile | None] = relationship(back_populates="user", uselist=False)


class TrainerProfile(Base):
    __tablename__ = "trainer_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship(back_populates="trainer_profile")
    specialties: Mapped[list[TrainerSpecialty]] = relationship(
        back_populates="trainer", cascade="all, delete-orphan", order_by="TrainerSpecialty.position"
    )


class TrainerSpecialty(Base):
    __tablename__ = "trainer_specialties"
    __table_args__ = (UniqueConstraint("trainer_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    trainer_id: Mapped[str] = mapped_column(ForeignKey("trainer_profiles.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    trainer: Mapped[TrainerProfile] = relationship(back_populates="specialties")


class ScheduleSlot(TimestampMixin, Base):
    __tablename__ = "schedule_slots"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_schedule_slot_valid_interval"),
        Index("ix_schedule_slots_interval", "start_at", "end_at"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_booking_valid_interval"),
        Index("ix_bookings_interval_status", "start_at", "end_at", "status"),
        Index("ix_bookings_trainer_interval", "trainer_id", "start_at", "end_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    trainer_id: Mapped[str | None] = mapped_column(ForeignKey("trainer_profiles.id", ondelete="RESTRICT"))
    schedule_slot_id: Mapped[str | None] = mapped_column(ForeignKey("schedule_slots.id", ondelete="SET NULL"))
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, native_enum=False, values_callable=enum_values),
        default=BookingStatus.CONFIRMED,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    user: Mapped[User] = relationship()
    trainer: Mapped[TrainerProfile | None] = relationship()


class BookingBlock(Base):
    __tablename__ = "booking_blocks"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_booking_block_valid_interval"),
        Index("ix_booking_blocks_interval", "start_at", "end_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    type: Mapped[BookingBlockType] = mapped_column(
        Enum(BookingBlockType, native_enum=False, values_callable=enum_values), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, nullable=False)


class MembershipType(Base):
    __tablename__ = "membership_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[MembershipKind] = mapped_column(
        Enum(MembershipKind, native_enum=False, values_callable=enum_values), nullable=False
    )
    visits_count: Mapped[int | None] = mapped_column(Integer)
    validity_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (Index("ix_memberships_user_status", "user_id", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    membership_type_id: Mapped[str] = mapped_column(ForeignKey("membership_types.id", ondelete="RESTRICT"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    visits_total: Mapped[int | None] = mapped_column(Integer)
    visits_remaining: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus, native_enum=False, values_callable=enum_values),
        default=MembershipStatus.ACTIVE,
        nullable=False,
    )

    membership_type: Mapped[MembershipType] = relationship()


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (Index("ix_measurements_user_measured", "user_id", "measured_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    weight: Mapped[float | None] = mapped_column(Float)
    body_fat: Mapped[float | None] = mapped_column(Float)
    muscle_mass: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, nullable=False)


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    gym_capacity: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    default_booking_duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    booking_step_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    cancel_before_minutes: Mapped[int] = mapped_column(Integer, default=240, nullable=False)
    timezone: Mapped[str] = mapped_column(String(80), default="Europe/Moscow", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now, nullable=False)
