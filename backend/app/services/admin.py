from __future__ import annotations

from sqlalchemy.orm import Session

from ..enums import BookingStatus
from ..models.entities import BookingBlock
from ..repositories.core import BookingBlockRepository, BookingRepository, SettingsRepository, UserRepository
from ..schemas.domain import BookingBlockCreate, SettingsOut, SettingsPatch
from .booking import _begin_serialized_write
from .errors import DomainError, not_found
from .presenters import block_out


class AdminService:
    def __init__(self, session: Session): self.session = session

    def _require_admin(self, admin_id: str) -> None:
        user = UserRepository(self.session).get(admin_id)
        if user is None or user.role.value != "admin": raise DomainError("FORBIDDEN", "Доступ запрещён.", 403)

    def list_blocks(self, admin_id: str):
        self._require_admin(admin_id)
        return [block_out(item) for item in BookingBlockRepository(self.session).list_all()]

    def create_block(self, admin_id: str, data: BookingBlockCreate):
        _begin_serialized_write(self.session)
        try:
            self._require_admin(admin_id)
            if data.end_at <= data.start_at: raise DomainError("INVALID_INTERVAL", "Некорректный интервал.")
            block = BookingBlock(**data.model_dump())
            self.session.add(block); self.session.flush(); result = block_out(block); self.session.commit(); return result
        except DomainError:
            self.session.rollback(); raise

    def delete_block(self, admin_id: str, block_id: str) -> None:
        _begin_serialized_write(self.session)
        try:
            self._require_admin(admin_id)
            block = self.session.get(BookingBlock, block_id)
            if block is None: raise not_found("Блокировка не найдена.")
            self.session.delete(block); self.session.commit()
        except DomainError:
            self.session.rollback(); raise

    def get_settings(self, admin_id: str) -> SettingsOut:
        self._require_admin(admin_id)
        return SettingsOut.model_validate(SettingsRepository(self.session).get())

    def patch_settings(self, admin_id: str, data: SettingsPatch) -> SettingsOut:
        _begin_serialized_write(self.session)
        try:
            self._require_admin(admin_id)
            settings = SettingsRepository(self.session).get()
            if data.gym_capacity is not None:
                events = []
                for booking in BookingRepository(self.session).list_all():
                    if booking.status == BookingStatus.CONFIRMED:
                        events.extend(((booking.start_at, 1), (booking.end_at, -1)))
                active = peak = 0
                for _, delta in sorted(events, key=lambda item: (item[0], item[1])):
                    active += delta; peak = max(peak, active)
                if data.gym_capacity < peak:
                    raise DomainError("CAPACITY_BELOW_BOOKINGS", "Вместимость меньше числа уже записанных клиентов.", 409)
            for key, value in data.model_dump(exclude_none=True).items(): setattr(settings, key, value)
            result = SettingsOut.model_validate(settings); self.session.commit(); return result
        except DomainError:
            self.session.rollback(); raise
