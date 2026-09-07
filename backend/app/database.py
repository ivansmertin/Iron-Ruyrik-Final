from __future__ import annotations

from collections.abc import Generator
import os
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import Request
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import BACKEND_DIR, get_settings


class Base(DeclarativeBase):
    pass


class SQLiteDatabaseLock:
    """Cross-platform advisory lock preventing restore while the app owns a SQLite file."""

    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.lock_path = Path(f"{database_path}.runtime.lock")
        self._handle = None

    def acquire(self) -> None:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.lock_path.open("a+b")
        try:
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            handle.close()
            raise RuntimeError(f"SQLite database is in use: {self.database_path}") from exc
        self._handle = handle

    def release(self) -> None:
        if self._handle is None:
            return
        try:
            self._handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self._handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        finally:
            self._handle.close()
            self._handle = None

    def __enter__(self) -> SQLiteDatabaseLock:
        self.acquire()
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback) -> None:
        self.release()


def sqlite_database_path(engine: Engine) -> Path | None:
    if engine.dialect.name != "sqlite" or not engine.url.database or engine.url.database == ":memory:":
        return None
    return Path(engine.url.database).resolve()


def configure_sqlite(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        url_str = str(engine.url)
        if ":memory:" not in url_str and "mode=memory" not in url_str:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=FULL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


def create_database_engine(database_url: str | None = None) -> Engine:
    url = database_url or get_settings().resolved_database_url
    connect_args = {"check_same_thread": False, "timeout": 5} if url.startswith("sqlite") else {}
    database_engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    configure_sqlite(database_engine)
    return database_engine


def expected_schema_heads() -> set[str]:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    return set(ScriptDirectory.from_config(config).get_heads())


def verify_database_schema(engine: Engine) -> None:
    expected = expected_schema_heads()
    try:
        with engine.connect() as connection:
            actual = set(connection.execute(text("SELECT version_num FROM alembic_version")).scalars())
    except SQLAlchemyError as exc:
        raise RuntimeError("Database schema is not initialized; run 'alembic upgrade head'.") from exc
    if actual != expected:
        raise RuntimeError(
            f"Database schema revision mismatch: expected {sorted(expected)}, found {sorted(actual)}. "
            "Run 'alembic upgrade head'."
        )


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine(database_url: str | None = None) -> Engine:
    global _engine
    if database_url is not None:
        return create_database_engine(database_url)
    if _engine is None:
        _engine = create_database_engine()
    return _engine


def get_session_factory(database_url: str | None = None) -> sessionmaker[Session]:
    global _session_factory
    if database_url is not None:
        engine = get_engine(database_url)
        return sessionmaker(bind=engine, class_=Session, autoflush=False, expire_on_commit=False)
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), class_=Session, autoflush=False, expire_on_commit=False)
    return _session_factory


def reset_database_state() -> None:
    """Dispose current engine and reset cached session factory."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
    _session_factory = None


class _LazySessionMaker:
    """Callable proxy maintaining backwards-compatible SessionLocal() usage."""

    def __call__(self, *args, **kwargs) -> Session:
        return get_session_factory()(*args, **kwargs)


SessionLocal = _LazySessionMaker()


def __getattr__(name: str):
    if name == "engine":
        return get_engine()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_session(request: Request) -> Generator[Session, None, None]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        raise RuntimeError("Application lifespan has not started")
    with factory() as session:
        yield session
