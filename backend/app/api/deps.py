from fastapi import Request
from ..services.errors import DomainError


def current_user_id(request: Request) -> str:
    settings = request.app.state.settings
    if settings.app_env == "development" and settings.dev_auth_enabled:
        return settings.dev_user_id
    raise DomainError("AUTH_REQUIRED", "Требуется вход.", 401)


def current_admin_id(request: Request) -> str:
    settings = request.app.state.settings
    if settings.app_env == "development" and settings.dev_auth_enabled:
        return settings.dev_admin_user_id
    raise DomainError("AUTH_REQUIRED", "Требуется вход.", 401)
