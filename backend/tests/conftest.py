from __future__ import annotations

import uuid
from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session, sessionmaker

from app.config import BACKEND_DIR, Settings
from app.database import create_database_engine
from app.enums import UserRole
from app.main import create_app
from app.models.entities import AppSetting, TrainerProfile, User


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker[Session], None, None]:
    database_path = tmp_path / "test.db"
    url = f"sqlite:///{database_path.as_posix()}"

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    engine = create_database_engine(url)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)

    settings = Settings(database_url=url)
    with factory() as session:
        session.add(
            AppSetting(
                id=1,
                gym_capacity=8,
                default_booking_duration_minutes=60,
                booking_step_minutes=30,
                cancel_before_minutes=0,
                timezone="Europe/Moscow",
            )
        )
        # Seed default dev users so dev auth passes foreign key checks
        session.add(User(id=settings.dev_user_id, name="Тестовый Клиент", role=UserRole.CLIENT, is_active=True))
        session.add(User(id=settings.dev_admin_user_id, name="Тестовый Администратор", role=UserRole.ADMIN, is_active=True))
        session.commit()

    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture()
def app_instance(session_factory) -> Generator[FastAPI, None, None]:
    database_url = str(session_factory.kw["bind"].url)
    application = create_app(settings=Settings(database_url=database_url), session_factory=session_factory)
    yield application


@pytest.fixture()
def client(app_instance) -> Generator[TestClient, None, None]:
    with TestClient(app_instance) as test_client:
        yield test_client


@pytest.fixture()
def make_user(session_factory):
    def factory(name: str = "Клиент", role: UserRole = UserRole.CLIENT) -> str:
        user_id = str(uuid.uuid4())
        with session_factory() as session:
            session.add(User(id=user_id, name=name, role=role, is_active=True))
            session.commit()
        return user_id
    return factory


@pytest.fixture()
def trainer_id(session_factory, make_user):
    user_id = make_user("Дима", UserRole.TRAINER)
    profile_id = str(uuid.uuid4())
    with session_factory() as session:
        session.add(TrainerProfile(id=profile_id, user_id=user_id, slug="dima", is_active=True))
        session.commit()
    return profile_id
