from __future__ import annotations

import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.config import BACKEND_DIR, Settings
from app.database import create_database_engine
from app.enums import HealthImportMethod, HealthMetricType, HealthSourceProvider, HealthUnit, UserRole
from app.main import create_app
from app.models.entities import AppSetting, User
from app.models.health import HealthMeasurement
from app.scripts.backup import create_backup, verify_backup_integrity
from app.scripts.restore import restore_database


def test_sqlite_pragmas_on_new_connections(tmp_path):
    db_path = tmp_path / "pragma_test.db"
    url = f"sqlite:///{db_path.as_posix()}"
    engine = create_database_engine(url)

    try:
        # Hold them simultaneously so QueuePool must create distinct DBAPI connections.
        connections = [engine.connect() for _ in range(3)]
        try:
            assert len({id(conn.connection.driver_connection) for conn in connections}) == 3
            for conn in connections:
                fk = conn.execute(text("PRAGMA foreign_keys")).scalar_one()
                journal = conn.execute(text("PRAGMA journal_mode")).scalar_one()
                timeout = conn.execute(text("PRAGMA busy_timeout")).scalar_one()
                sync = conn.execute(text("PRAGMA synchronous")).scalar_one()

                assert fk == 1, "PRAGMA foreign_keys must be ON"
                assert journal.lower() == "wal", "PRAGMA journal_mode must be WAL"
                assert timeout == 5000, "PRAGMA busy_timeout must be 5000"
                assert sync == 2, "PRAGMA synchronous must be FULL (2)"
        finally:
            for conn in connections:
                conn.close()
    finally:
        engine.dispose()


def test_foreign_key_enforcement_raises_integrity_error(session_factory):
    with session_factory() as session:
        # Attempt to insert HealthMeasurement for non-existent user_id
        fake_user_id = str(uuid.uuid4())
        bad_measurement = HealthMeasurement(
            id=str(uuid.uuid4()),
            user_id=fake_user_id,
            metric_type=HealthMetricType.WEIGHT,
            value=75.0,
            unit=HealthUnit.KG,
            measured_at=datetime_now(),
            source_provider=HealthSourceProvider.MANUAL,
            import_method=HealthImportMethod.MANUAL,
        )
        session.add(bad_measurement)
        with pytest.raises(IntegrityError):
            session.commit()


def datetime_now():
    from datetime import UTC, datetime
    return datetime.now(UTC)


def test_clean_migration_from_empty_database(tmp_path):
    db_path = tmp_path / "clean_empty.db"
    url = f"sqlite:///{db_path.as_posix()}"

    # Verify file does not exist initially
    assert not db_path.exists()

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    command.current(config)
    command.heads(config)
    command.check(config)

    # Verify file now exists and contains tables
    assert db_path.exists()
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        assert "users" in tables
        assert "app_settings" in tables
        assert "health_measurements" in tables
        assert "health_sync_connections" in tables
        assert "bookings" in tables

        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert version == "c2d3e4f5a6b7"
    finally:
        conn.close()


def test_upgrade_already_current_database_is_noop(tmp_path):
    db_path = tmp_path / "upgrade_noop.db"
    url = f"sqlite:///{db_path.as_posix()}"

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url

    # First upgrade
    command.upgrade(config, "head")

    # Insert a record to ensure data is preserved
    engine = create_database_engine(url)
    try:
        with sessionmaker(bind=engine)() as session:
            session.add(User(id="user-noop-1", name="Тест Noop", role=UserRole.CLIENT, is_active=True))
            session.commit()
    finally:
        engine.dispose()

    # Second upgrade on already-current database
    command.upgrade(config, "head")

    # Verify data remains intact
    engine2 = create_database_engine(url)
    try:
        with sessionmaker(bind=engine2)() as session:
            user = session.get(User, "user-noop-1")
            assert user is not None
            assert user.name == "Тест Noop"
    finally:
        engine2.dispose()


def test_demo_seed_refuses_production_database(tmp_path):
    db_path = tmp_path / "production_seed.db"
    url = f"sqlite:///{db_path.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    environment = os.environ.copy()
    environment.update({"DATABASE_URL": url, "APP_ENV": "production", "DEV_AUTH_ENABLED": "false"})
    result = subprocess.run(
        [sys.executable, "-m", "app.scripts.seed"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "disabled outside the development environment" in result.stderr

    connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        assert connection.execute("SELECT count(*) FROM users").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM bookings").fetchone()[0] == 0
    finally:
        connection.close()


def test_persistence_across_app_restarts(tmp_path):
    db_path = tmp_path / "persistent_gym.db"
    url = f"sqlite:///{db_path.as_posix()}"

    # 1. Run migrations
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    settings = Settings(
        database_url=url,
        app_env="development",
        dev_auth_enabled=True,
    )

    # Seed the dev client user so dev auth passes foreign key checks
    engine = create_database_engine(url)
    try:
        with sessionmaker(bind=engine)() as s:
            s.add(User(id=settings.dev_user_id, name="Тестовый Клиент", role=UserRole.CLIENT, is_active=True))
            s.commit()
    finally:
        engine.dispose()

    # === LIFECYCLE 1: Start app 1, create initial data ===
    app1 = create_app(settings=settings)
    with TestClient(app1) as client1:
        # Check health
        resp_health = client1.get("/api/v1/health")
        assert resp_health.status_code == 200

        # Create manual health measurement via API
        resp_add = client1.post(
            "/api/v1/health/measurements/manual",
            json={
                "measuredAt": "2026-09-01T08:00:00Z",
                "weight": 82.5,
                "bodyFat": 16.2,
                "notes": "Restart Test 1",
            },
        )
        assert resp_add.status_code == 201

    # App 1 is now fully stopped, engine disposed

    # === LIFECYCLE 2: Restart backend app with same DB ===
    app2 = create_app(settings=settings)
    with TestClient(app2) as client2:
        # Read back data
        resp_prog = client2.get("/api/v1/health/progress")
        assert resp_prog.status_code == 200
        prog = resp_prog.json()
        assert prog["latestWeight"] is not None
        assert prog["latestWeight"]["currentValue"] == 82.5

        # Add second measurement
        resp_add2 = client2.post(
            "/api/v1/health/measurements/manual",
            json={
                "measuredAt": "2026-09-02T08:00:00Z",
                "weight": 82.0,
            },
        )
        assert resp_add2.status_code == 201

    # App 2 is now fully stopped, engine disposed

    # === LIFECYCLE 3: Third start, verify cumulative data ===
    app3 = create_app(settings=settings)
    with TestClient(app3) as client3:
        resp_meas = client3.get("/api/v1/health/measurements?metricType=weight")
        assert resp_meas.status_code == 200
        weights = resp_meas.json()
        assert len(weights) == 2
        values = {w["value"] for w in weights}
        assert values == {82.5, 82.0}


def test_persistence_across_independent_processes(tmp_path):
    db_path = tmp_path / "process_persistence.db"
    url = f"sqlite:///{db_path.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    settings = Settings(database_url=url, app_env="development", dev_auth_enabled=True)
    engine = create_database_engine(url)
    try:
        with sessionmaker(bind=engine)() as session:
            session.add(User(id=settings.dev_user_id, name="Process User", role=UserRole.CLIENT, is_active=True))
            session.commit()
    finally:
        engine.dispose()

    environment = os.environ.copy()
    environment.update({"DATABASE_URL": url, "APP_ENV": "development", "DEV_AUTH_ENABLED": "true"})
    writer = subprocess.run(
        [
            sys.executable,
            "-c",
            "from fastapi.testclient import TestClient; from app.main import app; "
            "client=TestClient(app); client.__enter__(); "
            "response=client.post('/api/v1/health/measurements/manual', "
            "json={'measuredAt':'2026-09-07T12:00:00Z','weight':76.4}); "
            "print(response.status_code); client.__exit__(None,None,None)",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "201" in writer.stdout

    reader = subprocess.run(
        [
            sys.executable,
            "-c",
            "from fastapi.testclient import TestClient; from app.main import app; "
            "client=TestClient(app); client.__enter__(); "
            "response=client.get('/api/v1/health/measurements?metricType=weight'); "
            "print(response.status_code, [item['value'] for item in response.json()]); "
            "client.__exit__(None,None,None)",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "200 [76.4]" in reader.stdout


def test_backup_creation_and_integrity(tmp_path):
    db_path = tmp_path / "source_for_backup.db"
    url = f"sqlite:///{db_path.as_posix()}"

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    engine = create_database_engine(url)
    try:
        with sessionmaker(bind=engine)() as session:
            session.add(AppSetting(id=1, gym_capacity=10))
            session.add(User(id="user-b-1", name="Бэкап Юзер", role=UserRole.CLIENT, is_active=True))
            session.commit()
    finally:
        engine.dispose()

    backup_dir = tmp_path / "backups_dest"
    backup_file = create_backup(source_database=db_path, destination_dir=backup_dir, verify=True)

    assert backup_file.exists()
    assert backup_file.stat().st_size > 0
    assert backup_file.name.startswith("zhelezny_ryurik_")

    # Independent integrity check
    counts = verify_backup_integrity(db_path, backup_file)
    assert counts["users"] == 1
    assert counts["app_settings"] == 1


def test_verified_backup_succeeds_while_wal_writer_is_active(tmp_path):
    db_path = tmp_path / "live_source.db"
    url = f"sqlite:///{db_path.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE audit_payload (id INTEGER PRIMARY KEY, payload BLOB)")
        connection.execute("INSERT INTO audit_payload(payload) VALUES(randomblob(5000000))")
        connection.commit()

    stop = threading.Event()
    started = threading.Event()

    def writer() -> None:
        connection = sqlite3.connect(db_path, timeout=5)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")
        try:
            writes = 0
            while not stop.is_set():
                connection.execute(
                    "INSERT INTO users(id,name,role,is_active,created_at,updated_at) "
                    "VALUES(?,?,'client',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                    (str(uuid.uuid4()), "Live writer"),
                )
                connection.commit()
                writes += 1
                if writes >= 3:
                    started.set()
                time.sleep(0.001)
        finally:
            connection.close()

    thread = threading.Thread(target=writer)
    thread.start()
    assert started.wait(timeout=5)
    try:
        backup_file = create_backup(source_database=db_path, destination_dir=tmp_path / "live_backups")
    finally:
        stop.set()
        thread.join(timeout=10)

    assert not thread.is_alive()
    backup_connection = sqlite3.connect(f"file:{backup_file.as_posix()}?mode=ro", uri=True)
    source_connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        assert backup_connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert backup_connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "c2d3e4f5a6b7"
        backup_users = backup_connection.execute("SELECT count(*) FROM users").fetchone()[0]
        source_users = source_connection.execute("SELECT count(*) FROM users").fetchone()[0]
        assert backup_users <= source_users
    finally:
        backup_connection.close()
        source_connection.close()


def test_restore_requires_confirmation(tmp_path):
    source_db = tmp_path / "source.db"
    target_db = tmp_path / "target.db"

    # Create dummy source
    with sqlite3.connect(source_db) as conn:
        conn.execute("CREATE TABLE test (x int)")
        conn.execute("CREATE TABLE alembic_version (version_num varchar(32))")
        conn.execute("INSERT INTO alembic_version VALUES ('head')")

    with pytest.raises(RuntimeError, match="RESTORE ABORTED"):
        restore_database(source_db, target_path=target_db, confirm=False)


def test_restore_refuses_database_owned_by_running_app(tmp_path):
    db_path = tmp_path / "running.db"
    url = f"sqlite:///{db_path.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    backup_file = create_backup(source_database=db_path, destination_dir=tmp_path / "running_backups")

    application = create_app(settings=Settings(database_url=url))
    with TestClient(application):
        with pytest.raises(RuntimeError, match="database is in use"):
            restore_database(backup_file, target_path=db_path, confirm=True)


def test_restore_recovers_data_and_cleans_stale_wal(tmp_path):
    prod_db = tmp_path / "prod.db"
    url = f"sqlite:///{prod_db.as_posix()}"

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    # Seed initial production state
    engine = create_database_engine(url)
    try:
        with sessionmaker(bind=engine)() as session:
            session.add(User(id="u-original", name="Оригинальный Клиент", role=UserRole.CLIENT, is_active=True))
            session.commit()
    finally:
        engine.dispose()

    # Take backup of state 1
    backup_dir = tmp_path / "backups"
    backup_file = create_backup(source_database=prod_db, destination_dir=backup_dir)

    # Simulate database corruption and presence of stale WAL file
    wal_file = Path(f"{prod_db.as_posix()}-wal")
    wal_file.write_text("corrupted stale wal content")

    # Restore from backup with confirmation
    restored_path = restore_database(backup_file, target_path=prod_db, confirm=True)
    assert restored_path == prod_db

    # Stale WAL must have been cleared
    assert not wal_file.exists() or wal_file.stat().st_size == 0

    # Verify restored database content
    engine_restored = create_database_engine(url)
    try:
        with sessionmaker(bind=engine_restored)() as session:
            user = session.get(User, "u-original")
            assert user is not None
            assert user.name == "Оригинальный Клиент"
    finally:
        engine_restored.dispose()


def test_restore_safety_snapshot_includes_committed_wal(tmp_path):
    source_db = tmp_path / "source_with_wal.db"
    url = f"sqlite:///{source_db.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    connection = sqlite3.connect(source_db)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        "INSERT INTO users(id,name,role,is_active,created_at,updated_at) "
        "VALUES('base-user','Base','client',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
    )
    connection.commit()
    connection.close()
    backup_file = create_backup(source_database=source_db, destination_dir=tmp_path / "restore_backups")

    crash_db = tmp_path / "crash_state.db"
    connection = sqlite3.connect(source_db)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA wal_autocheckpoint=0")
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    connection.execute(
        "INSERT INTO users(id,name,role,is_active,created_at,updated_at) "
        "VALUES('latest-user','Latest committed','client',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
    )
    connection.commit()
    shutil.copy2(source_db, crash_db)
    shutil.copy2(Path(f"{source_db}-wal"), Path(f"{crash_db}-wal"))
    if Path(f"{source_db}-shm").exists():
        shutil.copy2(Path(f"{source_db}-shm"), Path(f"{crash_db}-shm"))
    connection.close()

    read_connection = sqlite3.connect(f"file:{crash_db.as_posix()}?mode=ro", uri=True)
    try:
        assert read_connection.execute("SELECT count(*) FROM users WHERE id='latest-user'").fetchone()[0] == 1
    finally:
        read_connection.close()

    restore_database(backup_file, target_path=crash_db, confirm=True)
    safety_copy = next(tmp_path.glob("crash_state.pre_restore_*.db"))
    safety_connection = sqlite3.connect(f"file:{safety_copy.as_posix()}?mode=ro", uri=True)
    try:
        assert safety_connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert safety_connection.execute("SELECT count(*) FROM users WHERE id='latest-user'").fetchone()[0] == 1
    finally:
        safety_connection.close()


def test_database_url_resolution_and_directory_creation(tmp_path):
    sub_dir = tmp_path / "deep" / "nested" / "dir"
    target_file = sub_dir / "app.db"
    assert not sub_dir.exists()

    s = Settings(database_url=f"sqlite:///{target_file.as_posix()}")
    resolved = s.resolved_database_url

    # Directory must be automatically created
    assert sub_dir.exists()
    assert resolved.startswith("sqlite:///")

    # Memory URL untouched
    s_mem = Settings(database_url="sqlite:///:memory:")
    assert s_mem.resolved_database_url == "sqlite:///:memory:"
