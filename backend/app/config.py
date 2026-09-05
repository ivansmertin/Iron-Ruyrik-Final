from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "sqlite:///../data/zhelezny_ryurik.db"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5174"
    app_timezone: str = "Europe/Moscow"
    dev_auth_enabled: bool = True
    dev_user_id: str = "00000000-0000-0000-0000-000000000001"
    dev_admin_user_id: str = "00000000-0000-0000-0000-000000000002"
    log_level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def resolved_database_url(self) -> str:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix) or self.database_url.startswith("sqlite:////"):
            return self.database_url
        relative_path = self.database_url.removeprefix(prefix)
        absolute_path = (BACKEND_DIR / relative_path).resolve()
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{absolute_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
