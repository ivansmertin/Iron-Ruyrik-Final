from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..enums import BookingStatus
from ..models.entities import Booking, Measurement, User
from ..repositories.core import (
    BookingBlockRepository, BookingRepository, MembershipRepository, ScheduleRepository,
    SettingsRepository, TrainerRepository, UserRepository,
)
from ..schemas.domain import (
    HealthOut, HomeOut, MeasurementOut, ProfileOut, ScheduleDayOut, ScheduleOut,
    TimeSlotOut, UserOut,
)
from .errors import DomainError, not_found
from .presenters import booking_out, membership_out, trainer_out


def _utc_bounds(local_date: date, days: int, timezone: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone)
    start = datetime.combine(local_date, time.min, zone).astimezone(UTC)
    return start, (datetime.combine(local_date + timedelta(days=days), time.min, zone)).astimezone(UTC)


def _peak_occupancy(bookings: list[Booking], start_at: datetime, end_at: datetime) -> int:
    events: list[tuple[datetime, int]] = []
    for booking in bookings:
        events.extend(((max(start_at, booking.start_at), 1), (min(end_at, booking.end_at), -1)))
    active = peak = 0
    for _, delta in sorted(events, key=lambda item: (item[0], item[1])):
        active += delta; peak = max(peak, active)
    return peak


class QueryService:
    def __init__(self, session: Session): self.session = session

    def health(self) -> HealthOut:
        self.session.scalar(select(1))
        return HealthOut(status="ok", database="ok")

    def trainers(self):
        return [trainer_out(item) for item in TrainerRepository(self.session).list_active()]

    def trainer(self, slug: str):
        item = TrainerRepository(self.session).get_by_slug(slug)
        if item is None: raise not_found("Тренер не найден.")
        return trainer_out(item)

    def schedule(self, start_date: date | None = None, days: int = 7) -> ScheduleOut:
        settings = SettingsRepository(self.session).get()
        local_date = start_date or datetime.now(ZoneInfo(settings.timezone)).date()
        start_at, end_at = _utc_bounds(local_date, days, settings.timezone)
        slots = ScheduleRepository(self.session).list(start_at, end_at)
        bookings = BookingRepository(self.session).active_overlaps(start_at, end_at)
        blocks = BookingBlockRepository(self.session).list_all()
        grouped: dict[str, list[TimeSlotOut]] = defaultdict(list)
        for slot in slots:
            occupancy = _peak_occupancy(
                [item for item in bookings if item.start_at < slot.end_at and item.end_at > slot.start_at],
                slot.start_at, slot.end_at,
            )
            blocked = any(item.start_at < slot.end_at and item.end_at > slot.start_at for item in blocks)
            local_day = slot.start_at.astimezone(ZoneInfo(settings.timezone)).date().isoformat()
            grouped[local_day].append(TimeSlotOut(
                id=slot.id, start_at=slot.start_at, end_at=slot.end_at, booked=occupancy,
                capacity=settings.gym_capacity, available=0 if blocked else max(0, settings.gym_capacity - occupancy),
                is_blocked=blocked,
            ))
        return ScheduleOut(timezone=settings.timezone, capacity=settings.gym_capacity,
            days=[ScheduleDayOut(date=key, slots=value) for key, value in sorted(grouped.items())])

    def bookings(self, user_id: str):
        return [booking_out(item) for item in BookingRepository(self.session).list_for_user(user_id)]

    def booking(self, user_id: str, booking_id: str):
        item = BookingRepository(self.session).get(booking_id)
        if item is None: raise not_found("Запись не найдена.")
        if item.user_id != user_id: raise DomainError("FORBIDDEN", "Доступ запрещён.", 403)
        return booking_out(item)

    def membership(self, user_id: str):
        return membership_out(MembershipRepository(self.session).current(user_id))

    def profile(self, user_id: str) -> ProfileOut:
        user = UserRepository(self.session).get(user_id)
        if user is None: raise not_found("Профиль не найден.")
        history = [item for item in BookingRepository(self.session).list_for_user(user_id)
                   if item.status in (BookingStatus.COMPLETED, BookingStatus.NO_SHOW)]
        return ProfileOut(user=UserOut.model_validate(user), membership=self.membership(user_id),
            history=[booking_out(item) for item in history])

    def measurements(self, user_id: str):
        rows = self.session.scalars(select(Measurement).where(Measurement.user_id == user_id).order_by(Measurement.measured_at))
        return [MeasurementOut.model_validate(row) for row in rows]

    def home(self, user_id: str) -> HomeOut:
        user = UserRepository(self.session).get(user_id)
        if user is None: raise not_found("Профиль не найден.")
        settings = SettingsRepository(self.session).get(); now = datetime.now(UTC)
        bookings = BookingRepository(self.session)
        next_booking = self.session.scalar(bookings.eager().where(
            Booking.user_id == user_id, Booking.status == BookingStatus.CONFIRMED, Booking.end_at > now
        ).order_by(Booking.start_at))
        current = self.session.scalar(select(func.count()).select_from(Booking).where(
            Booking.status == BookingStatus.CONFIRMED, Booking.start_at <= now, Booking.end_at > now
        ))
        return HomeOut(user=UserOut.model_validate(user), membership=self.membership(user_id),
            next_booking=booking_out(next_booking) if next_booking else None,
            current_occupancy=current, capacity=settings.gym_capacity)

    def admin_bookings(self, admin_id: str, start_at: datetime | None = None, end_at: datetime | None = None):
        self.require_admin(admin_id)
        return [booking_out(item) for item in BookingRepository(self.session).list_all(start_at, end_at)]

    def require_admin(self, admin_id: str) -> User:
        user = UserRepository(self.session).get(admin_id)
        if user is None or user.role.value != "admin": raise DomainError("FORBIDDEN", "Доступ запрещён.", 403)
        return user

