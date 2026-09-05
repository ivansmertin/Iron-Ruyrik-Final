from __future__ import annotations

from ..models.entities import Booking, BookingBlock, Membership, TrainerProfile
from ..schemas.domain import BookingBlockOut, BookingOut, MembershipOut, TrainerOut


def trainer_out(trainer: TrainerProfile) -> TrainerOut:
    return TrainerOut(
        id=trainer.id, slug=trainer.slug, name=trainer.user.name, bio=trainer.bio,
        specialties=[item.name for item in trainer.specialties], is_active=trainer.is_active,
    )


def booking_out(booking: Booking) -> BookingOut:
    return BookingOut(
        id=booking.id, user_id=booking.user_id, client_name=booking.user.name,
        trainer_slug=booking.trainer.slug if booking.trainer else None,
        trainer_name=booking.trainer.user.name if booking.trainer else None,
        slot_id=booking.schedule_slot_id, start_at=booking.start_at, end_at=booking.end_at,
        status=booking.status, notes=booking.notes, created_at=booking.created_at,
        cancelled_at=booking.cancelled_at,
    )


def membership_out(membership: Membership | None) -> MembershipOut | None:
    if membership is None: return None
    return MembershipOut(
        id=membership.id, name=membership.membership_type.name, type=membership.membership_type.type,
        starts_at=membership.starts_at, expires_at=membership.expires_at,
        visits_total=membership.visits_total, visits_remaining=membership.visits_remaining,
        status=membership.status,
    )


def block_out(block: BookingBlock) -> BookingBlockOut:
    return BookingBlockOut.model_validate(block)

