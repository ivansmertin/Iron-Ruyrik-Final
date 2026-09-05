from fastapi import Depends
from ..config import Settings, get_settings
from ..services.errors import DomainError


def current_user_id(settings: Settings = Depends(get_settings)) -> str:
    if settings.app_env == "development" and settings.dev_auth_enabled:
        return settings.dev_user_id
    raise DomainError("AUTH_REQUIRED", "Требуется вход.", 401)


def current_admin_id(settings: Settings = Depends(get_settings)) -> str:
    if settings.app_env == "development" and settings.dev_auth_enabled:
        return settings.dev_admin_user_id
    raise DomainError("AUTH_REQUIRED", "Требуется вход.", 401)
