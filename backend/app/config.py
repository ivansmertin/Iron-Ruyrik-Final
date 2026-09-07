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
    backup_dir: str = "../backups"
    log_level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url.strip()
        if not url.startswith("sqlite:"):
            return url

        if url in ("sqlite://", "sqlite:///", "sqlite:///:memory:", "sqlite://?mode=memory"):
            return url

        prefix_four = "sqlite:////"
        prefix_three = "sqlite:///"
        if url.startswith(prefix_four):
            raw_path = "/" + url.removeprefix(prefix_four)
        elif url.startswith(prefix_three):
            raw_path = url.removeprefix(prefix_three)
        else:
            raw_path = url.removeprefix("sqlite:")

        path = Path(raw_path)
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        else:
            path = path.resolve()

        path.parent.mkdir(parents=True, exist_ok=True)
        posix = path.as_posix()
        if posix.startswith("/"):
            return f"sqlite:///{posix}"
        return f"sqlite:///{posix}"

    @property
    def resolved_backup_dir(self) -> Path:
        raw_path = Path(self.backup_dir)
        if not raw_path.is_absolute():
            resolved = (BACKEND_DIR / raw_path).resolve()
        else:
            resolved = raw_path.resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved


@lru_cache
def get_settings() -> Settings:
    return Settings()
