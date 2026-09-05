from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.enums import BookingStatus, MembershipKind, MembershipStatus, UserRole
from app.models.entities import (
    AppSetting, Booking, Measurement, Membership, MembershipType, ScheduleSlot,
    TrainerProfile, TrainerSpecialty, User,
)

NAMESPACE = uuid.UUID("e5b31a44-8076-4e54-9d98-6885afd20a2f")
CLIENT_ID = "00000000-0000-0000-0000-000000000001"
ADMIN_ID = "00000000-0000-0000-0000-000000000002"


def stable_id(value: str) -> str: return str(uuid.uuid5(NAMESPACE, value))


def utc(local_date: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(local_date, time(hour, minute), ZoneInfo("Europe/Moscow")).astimezone(UTC)


def seed() -> None:
    with SessionLocal() as session:
        settings = session.get(AppSetting, 1)
        if settings is None:
            session.add(AppSetting(id=1, gym_capacity=8, default_booking_duration_minutes=60,
                booking_step_minutes=30, cancel_before_minutes=240, timezone="Europe/Moscow"))

        people = [
            (CLIENT_ID, "Алексей", UserRole.CLIENT),
            (ADMIN_ID, "Администратор", UserRole.ADMIN),
            (stable_id("user-dima"), "Дима", UserRole.TRAINER),
            (stable_id("user-vanya"), "Ваня", UserRole.TRAINER),
        ] + [(stable_id(f"demo-user-{index}"), f"Клиент {index:02d}", UserRole.CLIENT) for index in range(1, 10)]
        for user_id, name, role in people:
            if session.get(User, user_id) is None: session.add(User(id=user_id, name=name, role=role, is_active=True))
        session.flush()

        trainers = {
            "dima": (stable_id("trainer-dima"), stable_id("user-dima"), ["триатлон", "бег", "трейлы", "выносливость"]),
            "vanya": (stable_id("trainer-vanya"), stable_id("user-vanya"), ["похудение", "рекомпозиция", "силовые тренировки", "набор мышечной массы / ОФП"]),
        }
        for slug, (trainer_id, user_id, specialties) in trainers.items():
            if session.get(TrainerProfile, trainer_id) is None:
                profile = TrainerProfile(id=trainer_id, user_id=user_id, slug=slug, is_active=True)
                profile.specialties = [TrainerSpecialty(id=stable_id(f"{slug}-{name}"), name=name, position=index)
                                       for index, name in enumerate(specialties)]
                session.add(profile)

        membership_type_id = stable_id("membership-type-8")
        if session.get(MembershipType, membership_type_id) is None:
            session.add(MembershipType(id=membership_type_id, name="8 посещений", type=MembershipKind.VISITS_PACKAGE,
                visits_count=8, validity_days=30, is_active=True))
        membership_id = stable_id("membership-alexey")
        if session.get(Membership, membership_id) is None:
            session.add(Membership(id=membership_id, user_id=CLIENT_ID, membership_type_id=membership_type_id,
                starts_at=utc(date(2026, 8, 20), 0), expires_at=utc(date(2026, 9, 19), 23, 59),
                visits_total=8, visits_remaining=3, status=MembershipStatus.ACTIVE))

        first_day = date(2026, 9, 4)
        slot_times = [(7, 0), (8, 30), (11, 0), (17, 30), (19, 0), (20, 30)]
        for offset in range(7):
            day = first_day + timedelta(days=offset)
            for hour, minute in slot_times:
                slot_id = f"{day.isoformat()}-{hour:02d}{minute:02d}"
                if session.get(ScheduleSlot, slot_id) is None:
                    start_at = utc(day, hour, minute)
                    session.add(ScheduleSlot(id=slot_id, start_at=start_at, end_at=start_at + timedelta(hours=1)))
        session.flush()

        # First day mirrors the Phase 1 occupancy: 3, 7, 2, 6, 8, 1.
        occupancy = [3, 7, 2, 6, 8, 1]
        for slot_index, count in enumerate(occupancy):
            hour, minute = slot_times[slot_index]
            slot_id = f"{first_day.isoformat()}-{hour:02d}{minute:02d}"
            slot = session.get(ScheduleSlot, slot_id)
            for position in range(count):
                booking_id = stable_id(f"seed-booking-{slot_id}-{position}")
                if session.get(Booking, booking_id) is not None: continue
                is_alexey = slot_index == 4 and position == 0
                session.add(Booking(id=booking_id, user_id=CLIENT_ID if is_alexey else stable_id(f"demo-user-{position + 1}"),
                    trainer_id=trainers["vanya"][0] if is_alexey else None, schedule_slot_id=slot_id,
                    start_at=slot.start_at, end_at=slot.end_at, status=BookingStatus.CONFIRMED))

        history = [
            ("2026-05-20", 19, "vanya"), ("2026-05-18", 9, None), ("2026-05-15", 18, "dima")
        ]
        for value, hour, trainer_slug in history:
            measured_day = date.fromisoformat(value); booking_id = stable_id(f"history-{value}")
            if session.get(Booking, booking_id) is None:
                start_at = utc(measured_day, hour)
                session.add(Booking(id=booking_id, user_id=CLIENT_ID,
                    trainer_id=trainers[trainer_slug][0] if trainer_slug else None,
                    start_at=start_at, end_at=start_at + timedelta(hours=1), status=BookingStatus.COMPLETED))

        measurements = [
            (date(2026, 6, 1), 79.5, 16.9, 35.3),
            (date(2026, 7, 1), 79.0, 16.1, 35.7),
            (date(2026, 8, 1), 78.6, 15.4, 36.1),
            (date(2026, 9, 1), 78.2, 14.8, 36.5),
        ]
        for measured_at, weight, body_fat, muscle_mass in measurements:
            measurement_id = stable_id(f"measurement-{measured_at.isoformat()}")
            if session.get(Measurement, measurement_id) is None:
                session.add(Measurement(id=measurement_id, user_id=CLIENT_ID, measured_at=utc(measured_at, 8),
                    weight=weight, body_fat=body_fat, muscle_mass=muscle_mass))
        session.commit()
    print("Seed completed safely.")


if __name__ == "__main__": seed()
