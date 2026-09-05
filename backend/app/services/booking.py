from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..enums import BookingStatus, UserRole
from ..models.entities import Booking
from ..repositories.core import (
    BookingBlockRepository, BookingRepository, ScheduleRepository, SettingsRepository,
    TrainerRepository, UserRepository,
)
from ..schemas.domain import AdminBookingCreate, BookingCreate, BookingOut
from .errors import DomainError, not_found
from .presenters import booking_out


def _begin_serialized_write(session: Session) -> None:
    if session.in_transaction():
        raise RuntimeError("Booking write session must not have an open transaction")
    if session.bind is not None and session.bind.dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))
    else:
        session.begin()


def _validate_interval(start_at: datetime, end_at: datetime) -> None:
    if start_at.tzinfo is None or end_at.tzinfo is None:
        raise DomainError("INVALID_TIMEZONE", "Укажите время с часовым поясом.")
    if end_at <= start_at:
        raise DomainError("INVALID_INTERVAL", "Время окончания должно быть позже начала.")


def _would_exceed_capacity(existing: list[Booking], start_at: datetime, end_at: datetime, capacity: int) -> bool:
    # Half-open intervals: an ending visit never collides with one starting at the same instant.
    events: list[tuple[datetime, int]] = [(start_at, 1), (end_at, -1)]
    for booking in existing:
        events.extend(((max(start_at, booking.start_at), 1), (min(end_at, booking.end_at), -1)))
    active = 0
    for _, delta in sorted(events, key=lambda item: (item[0], item[1])):
        active += delta
        if active > capacity: return True
    return False


class BookingService:
    def __init__(self, session: Session): self.session = session

    def create(self, user_id: str, data: BookingCreate) -> BookingOut:
        _begin_serialized_write(self.session)
        try:
            user = UserRepository(self.session).get(user_id)
            if user is None or not user.is_active: raise DomainError("USER_NOT_ACTIVE", "Пользователь недоступен.", 403)
            slot = ScheduleRepository(self.session).get(data.slot_id) if data.slot_id else None
            if data.slot_id and slot is None: raise not_found("Время не найдено.")
            start_at = slot.start_at if slot else data.start_at
            end_at = slot.end_at if slot else data.end_at
            if start_at is None or end_at is None: raise DomainError("INTERVAL_REQUIRED", "Выберите время тренировки.")
            _validate_interval(start_at, end_at)
            trainer = TrainerRepository(self.session).get_by_slug(data.trainer_slug) if data.trainer_slug else None
            if data.trainer_slug and (trainer is None or not trainer.is_active): raise not_found("Тренер не найден.")
            blocks = BookingBlockRepository(self.session).overlapping(start_at, end_at)
            if blocks: raise DomainError("BOOKING_BLOCKED", "В это время зал закрыт для записи.", 409)
            bookings = BookingRepository(self.session)
            if bookings.user_has_overlap(user_id, start_at, end_at):
                raise DomainError("USER_ALREADY_BOOKED", "У вас уже есть тренировка в это время.", 409)
            if trainer and bookings.trainer_has_overlap(trainer.id, start_at, end_at):
                raise DomainError("TRAINER_NOT_AVAILABLE", "Тренер уже занят в это время.", 409)
            capacity = SettingsRepository(self.session).get().gym_capacity
            if _would_exceed_capacity(bookings.active_overlaps(start_at, end_at), start_at, end_at, capacity):
                raise DomainError("GYM_CAPACITY_REACHED", "Это место только что заняли. Выберите другое время.", 409)
            booking = bookings.add(Booking(
                user_id=user_id, trainer_id=trainer.id if trainer else None,
                schedule_slot_id=slot.id if slot else None, start_at=start_at, end_at=end_at,
                status=BookingStatus.CONFIRMED, notes=data.notes,
            ))
            result = booking_out(bookings.get(booking.id))
            self.session.commit()
            return result
        except DomainError:
            self.session.rollback(); raise
        except IntegrityError as exc:
            self.session.rollback()
            raise DomainError("BOOKING_CONFLICT", "Не удалось записаться на это время.", 409) from exc

    def cancel(self, user_id: str, booking_id: str, *, is_admin: bool = False) -> BookingOut:
        _begin_serialized_write(self.session)
        try:
            repository = BookingRepository(self.session)
            booking = repository.get(booking_id)
            if booking is None: raise not_found("Запись не найдена.")
            if not is_admin and booking.user_id != user_id: raise DomainError("FORBIDDEN", "Эту запись нельзя отменить.", 403)
            if booking.status != BookingStatus.CONFIRMED: raise DomainError("BOOKING_NOT_ACTIVE", "Запись уже не активна.", 409)
            settings = SettingsRepository(self.session).get()
            minutes_left = (booking.start_at - datetime.now(UTC)).total_seconds() / 60
            if not is_admin and minutes_left < settings.cancel_before_minutes:
                raise DomainError("CANCELLATION_DEADLINE_PASSED", "Срок отмены этой тренировки уже прошёл.", 409)
            booking.status = BookingStatus.CANCELLED
            booking.cancelled_at = datetime.now(UTC)
            result = booking_out(booking)
            self.session.commit()
            return result
        except DomainError:
            self.session.rollback(); raise

    def create_for_admin(self, admin_id: str, data: AdminBookingCreate) -> BookingOut:
        # Client creation and booking share one serialized transaction.
        _begin_serialized_write(self.session)
        try:
            admin = UserRepository(self.session).get(admin_id)
            if admin is None or admin.role != UserRole.ADMIN: raise DomainError("FORBIDDEN", "Доступ запрещён.", 403)
            user = UserRepository(self.session).get_or_create_dev_client(data.client_name.strip())
            # Continue inline because create() must start its own transaction.
            slot = ScheduleRepository(self.session).get(data.slot_id) if data.slot_id else None
            if data.slot_id and slot is None: raise not_found("Время не найдено.")
            start_at = slot.start_at if slot else data.start_at; end_at = slot.end_at if slot else data.end_at
            if start_at is None or end_at is None: raise DomainError("INTERVAL_REQUIRED", "Выберите время тренировки.")
            _validate_interval(start_at, end_at)
            trainer = TrainerRepository(self.session).get_by_slug(data.trainer_slug) if data.trainer_slug else None
            if data.trainer_slug and trainer is None: raise not_found("Тренер не найден.")
            if BookingBlockRepository(self.session).overlapping(start_at, end_at):
                raise DomainError("BOOKING_BLOCKED", "В это время зал закрыт для записи.", 409)
            bookings = BookingRepository(self.session)
            if bookings.user_has_overlap(user.id, start_at, end_at):
                raise DomainError("USER_ALREADY_BOOKED", "У клиента уже есть тренировка в это время.", 409)
            if trainer and bookings.trainer_has_overlap(trainer.id, start_at, end_at):
                raise DomainError("TRAINER_NOT_AVAILABLE", "Тренер уже занят в это время.", 409)
            capacity = SettingsRepository(self.session).get().gym_capacity
            if _would_exceed_capacity(bookings.active_overlaps(start_at, end_at), start_at, end_at, capacity):
                raise DomainError("GYM_CAPACITY_REACHED", "Это место только что заняли. Выберите другое время.", 409)
            booking = bookings.add(Booking(user_id=user.id, trainer_id=trainer.id if trainer else None,
                schedule_slot_id=slot.id if slot else None, start_at=start_at, end_at=end_at,
                status=BookingStatus.CONFIRMED, notes=data.notes))
            result = booking_out(bookings.get(booking.id))
            self.session.commit(); return result
        except DomainError:
            self.session.rollback(); raise
