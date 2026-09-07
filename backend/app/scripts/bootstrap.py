from __future__ import annotations

import logging
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_session_factory
from app.models.entities import AppSetting

logger = logging.getLogger("app.scripts.bootstrap")


def system_bootstrap(session_factory: sessionmaker[Session] | None = None) -> AppSetting:
    """Production bootstrap: ensures required system singleton records (AppSetting) exist.
    
    Does NOT seed demo users, demo bookings, or sample measurements.
    Safe to run repeatedly on production databases (idempotent).
    """
    factory = session_factory or get_session_factory()
    with factory() as session:
        settings = session.get(AppSetting, 1)
        if settings is None:
            settings = AppSetting(
                id=1,
                gym_capacity=8,
                default_booking_duration_minutes=60,
                booking_step_minutes=30,
                cancel_before_minutes=240,
                timezone="Europe/Moscow",
            )
            session.add(settings)
            session.commit()
            session.refresh(settings)
            print("System bootstrap: AppSetting initialized.")
        else:
            print("System bootstrap: AppSetting already present.")
        return settings


if __name__ == "__main__":
    system_bootstrap()
