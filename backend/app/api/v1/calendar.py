"""
Google Calendar integration API.
"""

import math
from datetime import datetime, timezone
from typing import Optional

from app.api.deps import get_current_user_with_db
from app.database.models.calendar import CalendarConnectionStatus
from app.database.models.user import User
from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.user import UserRepository
from app.middleware.rate_limit import get_rate_limiter
from app.models.calendar import (
    CalendarConnectResponse,
    CalendarConnectionStatusOut,
    CalendarEventDetailOut,
    CalendarEventListOut,
    CalendarEventSummaryOut,
    CalendarParticipantOut,
    CalendarSyncResponse,
)
from app.services.calendar_sync import CalendarSyncService, PROVIDER_GOOGLE
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_async_db_session

logger = get_logger("calendar_api")

router = APIRouter()
limiter = get_rate_limiter()


def _event_summary_row(ev) -> CalendarEventSummaryOut:
    return CalendarEventSummaryOut(
        id=ev.id,
        title=ev.title,
        start_time=ev.start_time,
        end_time=ev.end_time,
        timezone=ev.timezone,
        location=ev.location,
        meeting_url=ev.meeting_url,
        meeting_platform=ev.meeting_platform.value,
        organizer_email=ev.organizer_email,
        organizer_name=ev.organizer_name,
        status=ev.status.value,
        is_recurring=ev.is_recurring,
    )


def _event_detail(ev) -> CalendarEventDetailOut:
    parts = [
        CalendarParticipantOut(
            email=p.email,
            display_name=p.display_name,
            is_organizer=p.is_organizer,
            response_status=p.response_status.value,
            is_self=p.is_self,
        )
        for p in (ev.participants or [])
    ]
    return CalendarEventDetailOut(
        id=ev.id,
        title=ev.title,
        start_time=ev.start_time,
        end_time=ev.end_time,
        timezone=ev.timezone,
        location=ev.location,
        meeting_url=ev.meeting_url,
        meeting_platform=ev.meeting_platform.value,
        organizer_email=ev.organizer_email,
        organizer_name=ev.organizer_name,
        status=ev.status.value,
        is_recurring=ev.is_recurring,
        description=ev.description,
        participants=parts,
    )


@router.post("/connect", response_model=CalendarConnectResponse)
async def connect_google_calendar(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    """Connect Google Calendar: register push channel and run initial sync."""
    svc = CalendarSyncService()
    try:
        result = await svc.connect_google(
            db,
            user.id,
            user.clerk_id,
            user.email,
        )
        await db.commit()
        return CalendarConnectResponse(
            connection_id=result["connection_id"],
            webhook_expiration=result["webhook_expiration"],
        )
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        await db.rollback()
        logger.exception("connect calendar failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to connect Google Calendar",
        ) from e


@router.delete("/connect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_google_calendar(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    svc = CalendarSyncService()
    await svc.disconnect_google(db, user.id, user.clerk_id)
    await db.commit()


@router.get("/status", response_model=CalendarConnectionStatusOut)
async def calendar_status(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    conn = await CalendarRepository.get_connection_by_user_provider(db, user.id, PROVIDER_GOOGLE)
    if not conn:
        return CalendarConnectionStatusOut(connected=False)
    return CalendarConnectionStatusOut(
        connected=conn.status == CalendarConnectionStatus.ACTIVE,
        provider=conn.provider,
        status=conn.status.value,
        last_synced_at=conn.last_synced_at,
        webhook_expires_at=conn.webhook_expiration,
        last_error=conn.last_error,
    )


@router.get("/events", response_model=CalendarEventListOut)
async def list_calendar_events(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    date_from: Optional[str] = Query(None, description="ISO date/datetime lower bound (start_time)"),
    date_to: Optional[str] = Query(None, description="ISO date/datetime upper bound (start_time)"),
    search: Optional[str] = None,
):
    start_from: Optional[datetime] = None
    end_before: Optional[datetime] = None
    if date_from:
        try:
            start_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            if start_from.tzinfo is not None:
                start_from = start_from.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid date_from: {e}") from e
    if date_to:
        try:
            end_before = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            if end_before.tzinfo is not None:
                end_before = end_before.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid date_to: {e}") from e

    rows, total = await CalendarRepository.list_events_for_user(
        db,
        user.id,
        start_from=start_from,
        end_before=end_before,
        search=search,
        page=page,
        limit=limit,
    )
    pages = max(1, math.ceil(total / limit)) if total else 1
    return CalendarEventListOut(
        events=[_event_summary_row(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/events/upcoming", response_model=list[CalendarEventSummaryOut])
async def upcoming_calendar_events(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
    limit: int = Query(20, ge=1, le=50),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = await CalendarRepository.list_upcoming_for_user(db, user.id, now=now, limit=limit)
    return [_event_summary_row(r) for r in rows]


@router.get("/events/{event_id}", response_model=CalendarEventDetailOut)
async def get_calendar_event(
    event_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    ev = await CalendarRepository.get_event_by_id(db, event_id, user.id, with_participants=True)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return _event_detail(ev)


@router.post("/sync", response_model=CalendarSyncResponse)
async def manual_sync_calendar(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    conn = await CalendarRepository.get_connection_by_user_provider(db, user.id, PROVIDER_GOOGLE)
    if not conn or conn.status != CalendarConnectionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Google Calendar is not connected")

    svc = CalendarSyncService()
    try:
        await svc.sync_incremental(db, conn, user.clerk_id, user.email)
        await db.commit()
        return CalendarSyncResponse(ok=True, message="synced")
    except Exception as e:
        await db.rollback()
        logger.exception("manual sync failed: %s", e)
        raise HTTPException(status_code=502, detail="Sync failed") from e


@limiter.exempt
@router.post("/webhook/google")
async def google_calendar_webhook(
    db: AsyncSession = Depends(get_async_db_session),
    x_goog_channel_id: Optional[str] = Header(None, alias="X-Goog-Channel-ID"),
    x_goog_resource_id: Optional[str] = Header(None, alias="X-Goog-Resource-ID"),
    x_goog_channel_token: Optional[str] = Header(None, alias="X-Goog-Channel-Token"),
    x_goog_resource_state: Optional[str] = Header(None, alias="X-Goog-Resource-State"),
):
    """
    Google Calendar push notification endpoint.
    Identifies the watch channel via X-Goog-Channel-ID and runs incremental sync.
    """
    from app.config import get_settings

    settings = get_settings()
    if settings.google_calendar_webhook_token:
        if x_goog_channel_token != settings.google_calendar_webhook_token:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid channel token")

    if not x_goog_channel_id:
        raise HTTPException(status_code=400, detail="Missing X-Goog-Channel-ID")

    conn = await CalendarRepository.get_connection_by_webhook_channel(db, x_goog_channel_id)
    if not conn:
        logger.warning("webhook: unknown channel id %s", x_goog_channel_id)
        return {"ok": True}

    if conn.status != CalendarConnectionStatus.ACTIVE:
        return {"ok": True}

    if x_goog_resource_state == "not_exists":
        logger.info("webhook: resource not_exists for channel %s", x_goog_channel_id)
        return {"ok": True}

    user = await UserRepository.get_by_id(db, conn.user_id)
    if not user:
        return {"ok": True}

    svc = CalendarSyncService()
    try:
        await svc.sync_incremental(db, conn, user.clerk_id, user.email)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.exception("webhook sync failed: %s", e)
        try:
            c2 = await CalendarRepository.get_connection_by_webhook_channel(db, x_goog_channel_id)
            if c2:
                c2.last_error = str(e)[:2000]
                c2.status = CalendarConnectionStatus.ERROR
                await db.commit()
        except Exception:
            logger.exception("failed to persist webhook sync error")

    return {"ok": True}
