from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..database import get_session
from ..enums import HealthMetricType, HealthSourceProvider
from ..models.entities import Measurement
from ..schemas.domain import (
    AdminBookingCreate, BookingBlockCreate, BookingBlockOut, BookingCreate, BookingOut,
    HealthOut, HomeOut, MeasurementCreate, MeasurementOut, NewsResponseOut, ProfileOut,
    ScheduleOut, SettingsOut, SettingsPatch, TrainerOut,
)
from ..schemas.health import (
    BatchHealthImportIn,
    BatchHealthImportOut,
    HealthMeasurementOut,
    HealthProgressOut,
    HealthSyncConnectionOut,
    HealthSyncPayloadIn,
    ManualHealthMeasurementCreate,
)
from ..services.admin import AdminService
from ..services.booking import BookingService
from ..services.health import HealthService
from ..services.news import NewsService
from ..services.queries import QueryService
from .deps import current_admin_id, current_user_id

router = APIRouter(prefix="/api/v1")



@router.get("/health", response_model=HealthOut)
def health(session: Session = Depends(get_session)): return QueryService(session).health()


@router.get("/news", response_model=NewsResponseOut)
def news(limit: int = Query(default=6, ge=1, le=20)):
    return NewsService.get_news(limit=limit)


@router.get("/home", response_model=HomeOut)
def home(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).home(user_id)


@router.get("/trainers", response_model=list[TrainerOut])
def trainers(session: Session = Depends(get_session)): return QueryService(session).trainers()


@router.get("/trainers/{slug}", response_model=TrainerOut)
def trainer(slug: str, session: Session = Depends(get_session)): return QueryService(session).trainer(slug)


@router.get("/schedule", response_model=ScheduleOut)
@router.get("/availability", response_model=ScheduleOut)
def schedule(start_date: date | None = Query(default=None, alias="startDate"), days: int = Query(default=7, ge=1, le=31),
             session: Session = Depends(get_session)):
    return QueryService(session).schedule(start_date, days)


@router.get("/bookings", response_model=list[BookingOut])
def bookings(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).bookings(user_id)


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def booking(booking_id: str, user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).booking(user_id, booking_id)


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(data: BookingCreate, user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return BookingService(session).create(user_id, data)


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(booking_id: str, user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return BookingService(session).cancel(user_id, booking_id)


@router.get("/profile", response_model=ProfileOut)
def profile(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).profile(user_id)


@router.get("/memberships/current")
def membership(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).membership(user_id)


@router.get("/measurements", response_model=list[MeasurementOut])
def measurements(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return QueryService(session).measurements(user_id)


@router.post("/measurements", response_model=MeasurementOut, status_code=status.HTTP_201_CREATED)
def add_measurement(data: MeasurementCreate, user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    measurement = Measurement(user_id=user_id, **data.model_dump())
    session.add(measurement)
    # Also write to canonical health_measurements for backwards compatibility
    HealthService(session).add_manual_measurement(
        user_id,
        ManualHealthMeasurementCreate(
            measured_at=data.measured_at,
            weight=data.weight,
            body_fat=data.body_fat,
            muscle_mass=data.muscle_mass,
        ),
    )
    session.commit()
    return MeasurementOut.model_validate(measurement)


@router.get("/health/progress", response_model=HealthProgressOut)
def health_progress(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return HealthService(session).get_progress(user_id)


@router.get("/health/measurements", response_model=list[HealthMeasurementOut])
def health_measurements(
    metric_type: HealthMetricType | None = Query(default=None, alias="metricType"),
    from_date: datetime | None = Query(default=None, alias="fromDate"),
    to_date: datetime | None = Query(default=None, alias="toDate"),
    limit: int = Query(default=100, ge=1, le=500),
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    rows = HealthService(session).query_measurements(user_id, metric_type, from_date, to_date, limit)
    return [HealthMeasurementOut.model_validate(r) for r in rows]


@router.post("/health/measurements/manual", response_model=list[HealthMeasurementOut], status_code=status.HTTP_201_CREATED)
def add_manual_health_measurement(
    data: ManualHealthMeasurementCreate,
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    created = HealthService(session).add_manual_measurement(user_id, data)
    return [HealthMeasurementOut.model_validate(m) for m in created]


@router.get("/health/sources", response_model=list[HealthSyncConnectionOut])
def health_sources(user_id: str = Depends(current_user_id), session: Session = Depends(get_session)):
    return HealthService(session).list_sources(user_id)


@router.post("/health/sources/{provider}/connect", response_model=HealthSyncConnectionOut)
def connect_health_source(
    provider: HealthSourceProvider,
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    return HealthService(session).connect_source(user_id, provider)


@router.post("/health/sources/{provider}/disconnect", response_model=HealthSyncConnectionOut)
def disconnect_health_source(
    provider: HealthSourceProvider,
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    return HealthService(session).disconnect_source(user_id, provider)


@router.post("/health/sources/sync", response_model=list[HealthMeasurementOut])
def sync_health_source(
    payload: HealthSyncPayloadIn,
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    created = HealthService(session).ingest_records(user_id, payload)
    return [HealthMeasurementOut.model_validate(m) for m in created]


@router.post("/health/measurements/import", response_model=BatchHealthImportOut)
def import_health_measurements(
    payload: BatchHealthImportIn,
    user_id: str = Depends(current_user_id),
    session: Session = Depends(get_session),
):
    return HealthService(session).batch_import(user_id, payload)




@router.get("/admin/bookings", response_model=list[BookingOut])
def admin_bookings(start_at: datetime | None = Query(default=None, alias="startAt"),
                   end_at: datetime | None = Query(default=None, alias="endAt"),
                   admin_id: str = Depends(current_admin_id), session: Session = Depends(get_session)):
    return QueryService(session).admin_bookings(admin_id, start_at, end_at)


@router.post("/admin/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def admin_create_booking(data: AdminBookingCreate, admin_id: str = Depends(current_admin_id),
                         session: Session = Depends(get_session)):
    return BookingService(session).create_for_admin(admin_id, data)


@router.get("/admin/booking-blocks", response_model=list[BookingBlockOut])
def admin_blocks(admin_id: str = Depends(current_admin_id), session: Session = Depends(get_session)):
    return AdminService(session).list_blocks(admin_id)


@router.post("/admin/booking-blocks", response_model=BookingBlockOut, status_code=status.HTTP_201_CREATED)
def admin_create_block(data: BookingBlockCreate, admin_id: str = Depends(current_admin_id),
                       session: Session = Depends(get_session)):
    return AdminService(session).create_block(admin_id, data)


@router.delete("/admin/booking-blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_block(block_id: str, admin_id: str = Depends(current_admin_id),
                       session: Session = Depends(get_session)) -> Response:
    AdminService(session).delete_block(admin_id, block_id); return Response(status_code=204)


@router.get("/admin/settings", response_model=SettingsOut)
def admin_settings(admin_id: str = Depends(current_admin_id), session: Session = Depends(get_session)):
    return AdminService(session).get_settings(admin_id)


@router.patch("/admin/settings", response_model=SettingsOut)
def admin_patch_settings(data: SettingsPatch, admin_id: str = Depends(current_admin_id),
                         session: Session = Depends(get_session)):
    return AdminService(session).patch_settings(admin_id, data)
