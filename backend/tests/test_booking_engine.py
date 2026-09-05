from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from sqlalchemy import text

from app.enums import BookingBlockType, BookingStatus
from app.models.entities import AppSetting, Booking, BookingBlock
from app.schemas.domain import BookingCreate
from app.services.booking import BookingService
from app.services.errors import DomainError

START = datetime(2030, 1, 1, 15, 0, tzinfo=UTC)
END = START + timedelta(hours=1)


def create(session_factory, user_id, start=START, end=END, trainer_slug=None):
    with session_factory() as session:
        return BookingService(session).create(user_id, BookingCreate(start_at=start, end_at=end, trainer_slug=trainer_slug))


def test_regular_booking_and_cancel(session_factory, make_user):
    user_id = make_user()
    booking = create(session_factory, user_id)
    assert booking.status == BookingStatus.CONFIRMED
    with session_factory() as session:
        cancelled = BookingService(session).cancel(user_id, booking.id)
    assert cancelled.status == BookingStatus.CANCELLED


def test_cancelled_booking_frees_capacity(session_factory, make_user):
    with session_factory() as session:
        session.get(AppSetting, 1).gym_capacity = 1; session.commit()
    first = make_user("Первый"); second = make_user("Второй")
    booking = create(session_factory, first)
    with session_factory() as session: BookingService(session).cancel(first, booking.id)
    assert create(session_factory, second).status == BookingStatus.CONFIRMED


def test_eight_overlaps_allowed_ninth_rejected(session_factory, make_user):
    for index in range(8): create(session_factory, make_user(f"Клиент {index}"))
    with pytest.raises(DomainError, match="место") as error:
        create(session_factory, make_user("Девятый"))
    assert error.value.code == "GYM_CAPACITY_REACHED" and error.value.status_code == 409


def test_partial_overlap_counts_toward_capacity(session_factory, make_user):
    with session_factory() as session:
        session.get(AppSetting, 1).gym_capacity = 1; session.commit()
    create(session_factory, make_user("Первый"), START, START + timedelta(minutes=90))
    with pytest.raises(DomainError) as error:
        create(session_factory, make_user("Второй"), START + timedelta(minutes=30), END + timedelta(hours=1))
    assert error.value.code == "GYM_CAPACITY_REACHED"


def test_non_overlapping_bookings_do_not_collide(session_factory, make_user):
    with session_factory() as session:
        session.get(AppSetting, 1).gym_capacity = 1; session.commit()
    create(session_factory, make_user("Первый"))
    assert create(session_factory, make_user("Второй"), END, END + timedelta(hours=1)).status == BookingStatus.CONFIRMED


def test_trainer_collision(session_factory, make_user, trainer_id):
    create(session_factory, make_user("Первый"), trainer_slug="dima")
    with pytest.raises(DomainError) as error: create(session_factory, make_user("Второй"), trainer_slug="dima")
    assert error.value.code == "TRAINER_NOT_AVAILABLE"


def test_booking_block(session_factory, make_user):
    with session_factory() as session:
        session.add(BookingBlock(start_at=START + timedelta(minutes=15), end_at=END,
            type=BookingBlockType.MAINTENANCE, reason="Проверка")); session.commit()
    with pytest.raises(DomainError) as error: create(session_factory, make_user())
    assert error.value.code == "BOOKING_BLOCKED"


def test_concurrent_booking_last_place_has_one_winner(session_factory, make_user):
    with session_factory() as session:
        session.get(AppSetting, 1).gym_capacity = 1; session.commit()
    users = [make_user("Первый"), make_user("Второй")]; barrier = Barrier(2)

    def attempt(user_id):
        barrier.wait()
        try:
            create(session_factory, user_id); return "created"
        except DomainError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, users))
    assert sorted(results) == ["GYM_CAPACITY_REACHED", "created"]

    with session_factory() as session:
        count = session.query(Booking).filter(Booking.status == BookingStatus.CONFIRMED).count()
    assert count == 1


def test_sqlite_pragmas_are_enabled(session_factory):
    with session_factory() as session:
        assert session.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
        assert session.execute(text("PRAGMA journal_mode")).scalar_one().lower() == "wal"
        assert session.execute(text("PRAGMA busy_timeout")).scalar_one() == 5000

