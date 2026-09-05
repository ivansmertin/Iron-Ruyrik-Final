from __future__ import annotations

import os
import uuid
from collections.abc import Generator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import BACKEND_DIR, get_settings
from app.database import configure_sqlite
from app.enums import UserRole
from app.models.entities import AppSetting, TrainerProfile, User


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker[Session], None, None]:
    database_path = tmp_path / "test.db"
    url = f"sqlite:///{database_path.as_posix()}"
    os.environ["DATABASE_URL"] = url; get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 5})
    configure_sqlite(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    with factory() as session:
        session.add(AppSetting(id=1, gym_capacity=8, default_booking_duration_minutes=60,
            booking_step_minutes=30, cancel_before_minutes=0, timezone="Europe/Moscow"))
        session.commit()
    yield factory
    engine.dispose()


@pytest.fixture()
def make_user(session_factory):
    def factory(name: str = "Клиент", role: UserRole = UserRole.CLIENT) -> str:
        user_id = str(uuid.uuid4())
        with session_factory() as session:
            session.add(User(id=user_id, name=name, role=role, is_active=True)); session.commit()
        return user_id
    return factory


@pytest.fixture()
def trainer_id(session_factory, make_user):
    user_id = make_user("Дима", UserRole.TRAINER); profile_id = str(uuid.uuid4())
    with session_factory() as session:
        session.add(TrainerProfile(id=profile_id, user_id=user_id, slug="dima", is_active=True)); session.commit()
    return profile_id

