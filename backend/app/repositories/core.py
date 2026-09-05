from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..enums import BookingStatus, MembershipStatus, UserRole
from ..models.entities import (
    AppSetting,
    Booking,
    BookingBlock,
    Measurement,
    Membership,
    ScheduleSlot,
    TrainerProfile,
    User,
)


def overlaps(model, start_at: datetime, end_at: datetime):
    return model.start_at < end_at, model.end_at > start_at


class UserRepository:
    def __init__(self, session: Session): self.session = session

    def get(self, user_id: str) -> User | None:
        return self.session.get(User, user_id)

    def get_or_create_dev_client(self, name: str) -> User:
        user = self.session.scalar(select(User).where(User.name == name, User.role == UserRole.CLIENT))
        if user is None:
            user = User(name=name, role=UserRole.CLIENT)
            self.session.add(user)
            self.session.flush()
        return user


class TrainerRepository:
    def __init__(self, session: Session): self.session = session

    @staticmethod
    def eager() -> Select:
        return select(TrainerProfile).options(joinedload(TrainerProfile.user), selectinload(TrainerProfile.specialties))

    def list_active(self) -> list[TrainerProfile]:
        return list(self.session.scalars(self.eager().where(TrainerProfile.is_active.is_(True))).unique())

    def get_by_slug(self, slug: str) -> TrainerProfile | None:
        return self.session.scalar(self.eager().where(TrainerProfile.slug == slug))


class SettingsRepository:
    def __init__(self, session: Session): self.session = session

    def get(self) -> AppSetting:
        settings = self.session.get(AppSetting, 1)
        if settings is None:
            settings = AppSetting(id=1)
            self.session.add(settings)
            self.session.flush()
        return settings


class ScheduleRepository:
    def __init__(self, session: Session): self.session = session

    def list(self, start_at: datetime, end_at: datetime) -> list[ScheduleSlot]:
        return list(self.session.scalars(select(ScheduleSlot).where(
            ScheduleSlot.is_active.is_(True), ScheduleSlot.start_at >= start_at, ScheduleSlot.start_at < end_at
        ).order_by(ScheduleSlot.start_at)))

    def get(self, slot_id: str) -> ScheduleSlot | None:
        return self.session.get(ScheduleSlot, slot_id)


class BookingRepository:
    def __init__(self, session: Session): self.session = session

    @staticmethod
    def eager() -> Select:
        return select(Booking).options(joinedload(Booking.user), joinedload(Booking.trainer).joinedload(TrainerProfile.user))

    def get(self, booking_id: str) -> Booking | None:
        return self.session.scalar(self.eager().where(Booking.id == booking_id))

    def list_for_user(self, user_id: str) -> list[Booking]:
        return list(self.session.scalars(self.eager().where(Booking.user_id == user_id).order_by(Booking.start_at.desc())).unique())

    def list_all(self, start_at: datetime | None = None, end_at: datetime | None = None) -> list[Booking]:
        query = self.eager()
        if start_at is not None: query = query.where(Booking.end_at > start_at)
        if end_at is not None: query = query.where(Booking.start_at < end_at)
        return list(self.session.scalars(query.order_by(Booking.start_at)).unique())

    def active_overlaps(self, start_at: datetime, end_at: datetime) -> list[Booking]:
        return list(self.session.scalars(select(Booking).where(
            Booking.status == BookingStatus.CONFIRMED, *overlaps(Booking, start_at, end_at)
        )))

    def trainer_has_overlap(self, trainer_id: str, start_at: datetime, end_at: datetime) -> bool:
        return self.session.scalar(select(func.count()).select_from(Booking).where(
            Booking.trainer_id == trainer_id, Booking.status == BookingStatus.CONFIRMED,
            *overlaps(Booking, start_at, end_at)
        )) > 0

    def user_has_overlap(self, user_id: str, start_at: datetime, end_at: datetime) -> bool:
        return self.session.scalar(select(func.count()).select_from(Booking).where(
            Booking.user_id == user_id, Booking.status == BookingStatus.CONFIRMED,
            *overlaps(Booking, start_at, end_at)
        )) > 0

    def add(self, booking: Booking) -> Booking:
        self.session.add(booking); self.session.flush(); return booking


class BookingBlockRepository:
    def __init__(self, session: Session): self.session = session

    def overlapping(self, start_at: datetime, end_at: datetime) -> list[BookingBlock]:
        return list(self.session.scalars(select(BookingBlock).where(*overlaps(BookingBlock, start_at, end_at))))

    def list_all(self) -> list[BookingBlock]:
        return list(self.session.scalars(select(BookingBlock).order_by(BookingBlock.start_at)))


class MembershipRepository:
    def __init__(self, session: Session): self.session = session

    def current(self, user_id: str) -> Membership | None:
        return self.session.scalar(select(Membership).options(joinedload(Membership.membership_type)).where(
            Membership.user_id == user_id, Membership.status == MembershipStatus.ACTIVE
        ).order_by(Membership.starts_at.desc()))


class MeasurementRepository:
    def __init__(self, session: Session): self.session = session

    def list_for_user(self, user_id: str) -> list[Measurement]:
        return list(self.session.scalars(select(Measurement).where(Measurement.user_id == user_id).order_by(Measurement.measured_at)))

