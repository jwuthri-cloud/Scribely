"""Background loop: send Web Push reminders N minutes before synced meetings."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import delete

from app.config import get_settings
from app.database.models.calendar import CalendarEventStatus
from app.database.models.push import UserPushSubscription
from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.push import PushRepository
from app.database.session import get_async_session
from app.services.webpush_sender import _send_one_sync
from app.utils.logging import get_logger

logger = get_logger("calendar_reminder_loop")

REMINDER_KIND_LEAD = "lead"

_PLATFORM_LABEL: dict[str, str] = {
    "google_meet": "Google Meet",
    "zoom": "Zoom",
    "teams": "Microsoft Teams",
    "other": "Video call",
    "none": "Calendar",
}


def _naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _run_reminder_tick() -> None:
    settings = get_settings()
    if not settings.calendar_reminder_enabled:
        return
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.debug("calendar reminder: VAPID keys not configured, skipping tick")
        return

    lead = settings.calendar_reminder_lead_minutes
    window = float(settings.calendar_reminder_window_seconds)
    base = settings.app_public_base_url.rstrip("/")

    async with get_async_session() as db:
        user_ids = await PushRepository.list_distinct_user_ids_with_subscriptions(db)
        if not user_ids:
            return

        now = _naive_utc_now()

        for user_id in user_ids:
            subs = await PushRepository.list_subscriptions_for_user(db, user_id)
            if not subs:
                continue

            events = await CalendarRepository.list_upcoming_for_user(
                db, user_id, now=now, limit=50
            )

            for ev in events:
                if ev.status == CalendarEventStatus.CANCELLED:
                    continue

                fire_at = ev.start_time - timedelta(minutes=lead)
                delta_sec = (now - fire_at).total_seconds()
                if abs(delta_sec) > window:
                    continue

                inserted = await PushRepository.try_insert_reminder_delivery(
                    db, user_id, ev.id, REMINDER_KIND_LEAD
                )
                if not inserted:
                    continue

                await db.commit()

                title = (ev.title or "Meeting").strip() or "Meeting"
                meeting_url = ev.meeting_url or ""
                detail_url = f"{base}/calendar/{ev.id}"
                plat = _PLATFORM_LABEL.get(str(ev.meeting_platform), "Meeting")
                start_iso = ev.start_time.isoformat() + "Z"
                payload = {
                    "type": "calendar_reminder",
                    "title": title,
                    "body": "",
                    "meetingUrl": meeting_url,
                    "calendarEventId": ev.id,
                    "detailUrl": detail_url,
                    "leadMinutes": lead,
                    "startTimeIso": start_iso,
                    "platformLabel": plat,
                    "tag": f"scribely-cal-{ev.id}",
                    "scribelyUrl": (
                        f"scribely://meeting?url={quote(meeting_url, safe='')}"
                        if meeting_url
                        else ""
                    ),
                }

                for sub in subs:
                    status = await asyncio.to_thread(_send_one_sync, sub, payload)
                    if status == 410:
                        async with get_async_session() as db_del:
                            await db_del.execute(
                                delete(UserPushSubscription).where(UserPushSubscription.id == sub.id)
                            )
                            await db_del.commit()
                        logger.info("Removed expired push subscription %s", sub.id[:8])


async def calendar_reminder_loop(stop_event: asyncio.Event) -> None:
    """Wake periodically and send due calendar reminders."""
    delay_sec = 5.0
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=delay_sec)
            return
        except asyncio.TimeoutError:
            pass
        delay_sec = 60.0
        try:
            await _run_reminder_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("calendar_reminder_loop tick failed")
