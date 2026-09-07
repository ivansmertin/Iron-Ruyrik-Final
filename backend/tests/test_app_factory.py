from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from app import database
from app.config import BACKEND_DIR, Settings
from app.main import create_app


def test_app_factory_binds_settings_database_and_auth(tmp_path):
    database_path = tmp_path / "factory.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = f"sqlite:///{database_path.as_posix()}"
    command.upgrade(config, "head")
    application = create_app(
        settings=Settings(
            app_env="production",
            database_url=f"sqlite:///{database_path.as_posix()}",
            dev_auth_enabled=False,
        )
    )
    assert application.dependency_overrides == {}

    with TestClient(application) as client:
        assert database._engine is None
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "ok"}
        auth_response = client.get("/api/v1/health/sources")
        assert auth_response.status_code == 401
        assert auth_response.json()["error"]["code"] == "AUTH_REQUIRED"

    assert application.state.database_engine is None
    assert application.state.session_factory is None


def test_app_factory_refuses_unmigrated_database(tmp_path):
    database_path = tmp_path / "unmigrated.db"
    application = create_app(settings=Settings(database_url=f"sqlite:///{database_path.as_posix()}"))

    with pytest.raises(RuntimeError, match="schema is not initialized"):
        with TestClient(application):
            pass

    assert application.state.database_engine is None
    assert application.state.session_factory is None


def test_request_without_lifespan_cannot_fall_back_to_global_database(tmp_path):
    database.reset_database_state()
    database_path = tmp_path / "must_not_be_used.db"
    application = create_app(settings=Settings(database_url=f"sqlite:///{database_path.as_posix()}"))
    client = TestClient(application)
    try:
        with pytest.raises(RuntimeError, match="lifespan has not started"):
            client.get("/api/v1/health")
        assert database._engine is None
        assert not database_path.exists()
    finally:
        client.close()
        database.reset_database_state()
