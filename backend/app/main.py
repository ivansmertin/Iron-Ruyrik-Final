from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from .api.router import router
from .config import Settings, get_settings
from .database import SQLiteDatabaseLock, create_database_engine, sqlite_database_path, verify_database_schema
from .services.errors import DomainError


def create_app(
    settings: Settings | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    logging.basicConfig(
        level=app_settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
        database_engine: Engine | None = None
        runtime_session_factory = session_factory
        if runtime_session_factory is None:
            database_engine = create_database_engine(app_settings.resolved_database_url)
            runtime_session_factory = sessionmaker(
                bind=database_engine,
                class_=Session,
                autoflush=False,
                expire_on_commit=False,
            )
        application.state.database_engine = database_engine
        application.state.session_factory = runtime_session_factory

        check_engine = database_engine or (runtime_session_factory.kw.get("bind") if runtime_session_factory else None)
        database_lock: SQLiteDatabaseLock | None = None
        try:
            if not isinstance(check_engine, Engine):
                raise RuntimeError("Application session factory is not bound to a database engine")
            database_path = sqlite_database_path(check_engine)
            if database_path is not None:
                database_lock = SQLiteDatabaseLock(database_path)
                database_lock.acquire()
            verify_database_schema(check_engine)
            yield
        finally:
            application.state.session_factory = None
            application.state.database_engine = None
            if database_engine is not None:
                database_engine.dispose()
            if database_lock is not None:
                database_lock.release()

    application = FastAPI(
        title="Железный Рюрик API",
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    application.state.settings = app_settings
    application.state.database_engine = None
    application.state.session_factory = None

    application.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    application.include_router(router)

    @application.exception_handler(DomainError)
    async def domain_error_handler(_request: Request, error: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": error.code, "message": error.message}},
        )

    return application


app = create_app()
