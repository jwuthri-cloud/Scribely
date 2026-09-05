"""
Orchestrate Google Calendar sync, webhooks, and event normalization.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database.models.calendar import (
    CalendarConnection,
    CalendarConnectionStatus,
    CalendarEventStatus,
    MeetingPlatform,
    ParticipantResponseStatus,
)
from app.database.models.meeting import Meeting
from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.contact import ContactRepository
from app.database.repositories.deal import DealRepository
from app.infrastructure.clerk_oauth import (
    ClerkOAuthTokenError,
    get_google_oauth_access_token,
)
from app.infrastructure.google_calendar import GoogleCalendarClient
from app.services.deal_detection import (
    detect_deal_domain,
    domain_to_deal_name,
    normalize_email,
)
from app.utils.logging import get_logger

logger = get_logger("calendar_sync")

PROVIDER_GOOGLE = "google"

# URL patterns for conferencing
_RE_MEET = re.compile(r"https://meet\.google\.com/[a-z0-9\-]+", re.I)
_RE_ZOOM = re.compile(r"https://[a-z0-9.\-]*zoom\.us/[a-z0-9/\-?=&]+", re.I)
_RE_TEAMS = re.compile(r"https://teams\.microsoft\.com/[^\s]+", re.I)


def extract_meeting_url_and_platform(
    event: dict,
) -> tuple[Optional[str], MeetingPlatform]:
    """Resolve meeting URL and platform from a Google Calendar event resource."""
    hang = event.get("hangoutLink")
    if isinstance(hang, str) and hang.startswith("http"):
        return hang, MeetingPlatform.GOOGLE_MEET

    conf = event.get("conferenceData") or {}
    eps = conf.get("entryPoints") or []
    for ep in eps:
        if not isinstance(ep, dict):
            continue
        uri = ep.get("uri")
        if isinstance(uri, str) and uri.startswith("http"):
            et = (ep.get("entryPointType") or "").lower()
            if et == "video" or "meet.google.com" in uri:
                return uri, MeetingPlatform.GOOGLE_MEET
            if "zoom.us" in uri:
                return uri.split("?")[0], MeetingPlatform.ZOOM
            if "teams.microsoft.com" in uri:
                return uri, MeetingPlatform.TEAMS
            return uri, MeetingPlatform.OTHER

    for field in ("location", "description"):
        val = event.get(field)
        if isinstance(val, str):
            for pattern, plat in (
                (_RE_MEET, MeetingPlatform.GOOGLE_MEET),
                (_RE_ZOOM, MeetingPlatform.ZOOM),
                (_RE_TEAMS, MeetingPlatform.TEAMS),
            ):
                m = pattern.search(val)
                if m:
                    return m.group(0), plat

    return None, MeetingPlatform.NONE


def _map_google_status(status: Optional[str]) -> CalendarEventStatus:
    if status == "cancelled":
        return CalendarEventStatus.CANCELLED
    if status == "tentative":
        return CalendarEventStatus.TENTATIVE
    return CalendarEventStatus.CONFIRMED


def _map_attendee_status(s: Optional[str]) -> ParticipantResponseStatus:
    mapping = {
        "accepted": ParticipantResponseStatus.ACCEPTED,
        "declined": ParticipantResponseStatus.DECLINED,
        "tentative": ParticipantResponseStatus.TENTATIVE,
        "needsAction": ParticipantResponseStatus.NEEDS_ACTION,
    }
    if not s:
        return ParticipantResponseStatus.NEEDS_ACTION
    return mapping.get(s, ParticipantResponseStatus.NEEDS_ACTION)


def _parse_event_times(event: dict) -> tuple[datetime, datetime, str]:
    """Return (start, end, tz) as naive UTC for storage."""
    start = event.get("start") or {}
    end = event.get("end") or {}

    if "dateTime" in start:
        st = _parse_rfc3339(start["dateTime"])
        en = _parse_rfc3339(end.get("dateTime", start["dateTime"]))
        tz = start.get("timeZone") or end.get("timeZone") or "UTC"
        return _to_naive_utc(st), _to_naive_utc(en), tz

    # All-day (end date is exclusive)
    if "date" in start:
        d0 = date.fromisoformat(start["date"])
        d1_str = end.get("date", start["date"])
        d1 = date.fromisoformat(d1_str)
        last_day = d1 - timedelta(days=1) if d1 > d0 else d0
        start_dt = datetime.combine(d0, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(
            last_day, datetime.max.time().replace(microsecond=0), tzinfo=timezone.utc
        )
        return _to_naive_utc(start_dt), _to_naive_utc(end_dt), "UTC"

    now = datetime.now(timezone.utc)
    return _to_naive_utc(now), _to_naive_utc(now + timedelta(hours=1)), "UTC"


def _parse_rfc3339(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _participants_from_event(
    event: dict, self_email_lower: Optional[str]
) -> list[dict]:
    out: list[dict[str, Any]] = []
    org = event.get("organizer") or {}
    org_email = (org.get("email") or "").lower()

    for att in event.get("attendees") or []:
        if not isinstance(att, dict):
            continue
        email = att.get("email")
        if not email:
            continue
        el = email.lower()
        out.append(
            {
                "email": email,
                "display_name": att.get("displayName"),
                "is_organizer": bool(att.get("organizer")) or el == org_email,
                "response_status": _map_attendee_status(att.get("responseStatus")),
                "is_self": self_email_lower is not None and el == self_email_lower,
            }
        )

    if not out and org_email:
        out.append(
            {
                "email": org.get("email"),
                "display_name": org.get("displayName"),
                "is_organizer": True,
                "response_status": ParticipantResponseStatus.ACCEPTED,
                "is_self": self_email_lower is not None
                and org_email == self_email_lower,
            }
        )
    return out


async def _sync_deal_and_contacts(
    db: AsyncSession,
    *,
    user_id: str,
    calendar_event_id: str,
    owner_email: Optional[str],
    participants: list[dict],
) -> None:
    """Upsert Contact rows for participants and attach/create a tentative Deal.

    Also backfills ``Meeting.deal_id`` for any meeting already linked to this
    calendar event (tentative deal at calendar-sync time).
    """
    owner_lower = normalize_email(owner_email)
    external: list[dict] = []
    for p in participants:
        if not p.get("email"):
            continue
        if p.get("is_self"):
            continue
        el = p["email"].strip().lower()
        if owner_lower and el == owner_lower:
            continue
        external.append(p)
    if not external:
        return

    emails = [p["email"] for p in external]
    deal = None
    domain = detect_deal_domain(owner_email, emails)
    if domain:
        deal = await DealRepository.get_or_create(
            db,
            user_id,
            domain,
            default_name=domain_to_deal_name(domain),
        )

    for p in external:
        email = p["email"]
        await ContactRepository.upsert(
            db,
            user_id,
            email,
            full_name=p.get("display_name"),
            deal_id=deal.id if deal else None,
            touch_last_seen=False,
        )

    if deal is not None:
        stmt = select(Meeting).where(
            Meeting.user_id == user_id,
            Meeting.calendar_event_id == calendar_event_id,
            Meeting.deal_id.is_(None),
        )
        result = await db.execute(stmt)
        for meeting in result.scalars().all():
            meeting.deal_id = deal.id
        await db.flush()


class CalendarSyncService:
    """Full and incremental sync + webhook registration."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    async def get_client_for_user(self, clerk_user_id: str) -> GoogleCalendarClient:
        token = await get_google_oauth_access_token(
            clerk_user_id,
            self.settings,
            provider=self.settings.clerk_google_oauth_provider,
        )
        return GoogleCalendarClient(token)

    async def connect_google(
        self,
        db: AsyncSession,
        user_id: str,
        clerk_user_id: str,
        user_email: Optional[str],
    ) -> dict[str, Any]:
        """Validate token, run initial sync, and optionally register a push channel.

        Webhook registration is skipped when GOOGLE_CALENDAR_WEBHOOK_URL is not set
        (e.g. local dev). Sync still works; users can trigger it manually.
        """
        try:
            client = await self.get_client_for_user(clerk_user_id)
        except ClerkOAuthTokenError as e:
            raise ValueError(str(e)) from e

        # Validate the token has Calendar access
        await client.get_calendar("primary")

        webhook_channel_id: Optional[str] = None
        webhook_resource_id: Optional[str] = None
        exp_dt: Optional[datetime] = None

        if self.settings.google_calendar_webhook_url:
            channel_id = f"scribely-{user_id}-{uuid.uuid4().hex[:12]}"
            watch = await client.watch_events(
                "primary",
                channel_id=channel_id,
                webhook_address=self.settings.google_calendar_webhook_url,
                token=self.settings.google_calendar_webhook_token,
            )
            webhook_channel_id = watch.channel_id
            webhook_resource_id = watch.resource_id
            exp_dt = datetime.utcfromtimestamp(watch.expiration_ms / 1000.0)
        else:
            logger.warning(
                "GOOGLE_CALENDAR_WEBHOOK_URL not set — skipping push channel registration. "
                "Calendar sync will work but won't receive real-time updates."
            )

        conn = await CalendarRepository.create_or_update_connection(
            db,
            user_id,
            PROVIDER_GOOGLE,
            sync_token=None,
            webhook_channel_id=webhook_channel_id,
            webhook_resource_id=webhook_resource_id,
            webhook_expiration=exp_dt,
            status=CalendarConnectionStatus.ACTIVE,
            last_error=None,
        )

        self_email = (user_email or "").lower() or None
        await self._full_sync(db, conn, clerk_user_id, self_email)

        return {
            "connection_id": conn.id,
            "webhook_expiration": exp_dt.isoformat() if exp_dt else None,
        }

    async def disconnect_google(
        self,
        db: AsyncSession,
        user_id: str,
        clerk_user_id: str,
    ) -> None:
        conn = await CalendarRepository.get_connection_by_user_provider(
            db, user_id, PROVIDER_GOOGLE
        )
        if not conn:
            return

        if conn.webhook_channel_id and conn.webhook_resource_id:
            try:
                client = await self.get_client_for_user(clerk_user_id)
                await client.stop_channel(
                    conn.webhook_channel_id, conn.webhook_resource_id
                )
            except Exception as e:
                logger.warning("stop channel failed: %s", e)

        conn.status = CalendarConnectionStatus.DISCONNECTED
        conn.webhook_channel_id = None
        conn.webhook_resource_id = None
        conn.webhook_expiration = None
        conn.sync_token = None
        await db.commit()

    async def sync_incremental(
        self,
        db: AsyncSession,
        connection: CalendarConnection,
        clerk_user_id: str,
        user_email: Optional[str],
    ) -> None:
        """Incremental sync using stored sync_token; on 410, full resync."""
        client = await self.get_client_for_user(clerk_user_id)
        self_email = (user_email or "").lower() or None

        if not connection.sync_token:
            await self._full_sync(db, connection, clerk_user_id, self_email)
            return

        try:
            items, next_sync = await client.list_all_events_paginated(
                "primary",
                sync_token=connection.sync_token,
            )
        except httpx.HTTPStatusError as e:
            if e.response is not None and e.response.status_code == 410:
                logger.info(
                    "Sync token invalid (410), running full sync for user %s",
                    connection.user_id,
                )
                await self._full_sync(db, connection, clerk_user_id, self_email)
                return
            raise

        await self._apply_event_items(
            db, connection.user_id, connection.id, items, self_email
        )
        if next_sync:
            connection.sync_token = next_sync
        connection.last_synced_at = datetime.utcnow()
        connection.last_error = None
        connection.status = CalendarConnectionStatus.ACTIVE

    async def _full_sync(
        self,
        db: AsyncSession,
        conn: CalendarConnection,
        clerk_user_id: str,
        self_email: Optional[str],
    ) -> None:
        client = await self.get_client_for_user(clerk_user_id)
        now = datetime.now(timezone.utc)
        time_min = (now - timedelta(days=90)).isoformat().replace("+00:00", "Z")
        time_max = (now + timedelta(days=365)).isoformat().replace("+00:00", "Z")

        items, next_sync = await client.list_all_events_paginated(
            "primary",
            sync_token=None,
            time_min=time_min,
            time_max=time_max,
        )

        await self._apply_event_items(db, conn.user_id, conn.id, items, self_email)

        if next_sync:
            conn.sync_token = next_sync
        conn.last_synced_at = datetime.utcnow()
        conn.last_error = None
        conn.status = CalendarConnectionStatus.ACTIVE

    async def _apply_event_items(
        self,
        db: AsyncSession,
        user_id: str,
        connection_id: str,
        items: list[dict],
        self_email: Optional[str],
    ) -> None:
        for ev in items:
            await self._upsert_google_event(db, user_id, connection_id, ev, self_email)

    async def _upsert_google_event(
        self,
        db: AsyncSession,
        user_id: str,
        connection_id: str,
        event: dict,
        self_email: Optional[str],
    ) -> None:
        gid = event.get("id")
        if not gid:
            return

        status = _map_google_status(event.get("status"))

        start_time, end_time, tz = _parse_event_times(event)
        url, platform = extract_meeting_url_and_platform(event)

        org = event.get("organizer") or {}
        org_email = org.get("email")
        org_name = org.get("displayName")

        title = event.get("summary")
        desc = event.get("description")
        loc = event.get("location")
        recur = event.get("recurringEventId")
        is_rec = bool(recur or event.get("recurrence"))

        row = await CalendarRepository.upsert_event(
            db,
            user_id,
            connection_id,
            gid,
            title=title,
            description=desc,
            start_time=start_time,
            end_time=end_time,
            timezone=tz,
            location=loc,
            meeting_url=url,
            meeting_platform=platform,
            organizer_email=org_email,
            organizer_name=org_name,
            status=status,
            is_recurring=is_rec,
            recurring_event_id=recur,
            raw_data=event,
        )

        parts = _participants_from_event(event, self_email)
        await CalendarRepository.replace_participants(db, row.id, parts)

        await _sync_deal_and_contacts(
            db,
            user_id=user_id,
            calendar_event_id=row.id,
            owner_email=self_email,
            participants=parts,
        )

    async def renew_webhook_if_needed(
        self,
        db: AsyncSession,
        user_id: str,
        clerk_user_id: str,
    ) -> bool:
        """Re-register watch if expiring within 24h. Returns True if renewed."""
        conn = await CalendarRepository.get_connection_by_user_provider(
            db, user_id, PROVIDER_GOOGLE
        )
        if not conn or conn.status != CalendarConnectionStatus.ACTIVE:
            return False
        if not conn.webhook_expiration:
            return False

        if conn.webhook_expiration > datetime.utcnow() + timedelta(hours=24):
            return False

        if conn.webhook_channel_id and conn.webhook_resource_id:
            try:
                c = await self.get_client_for_user(clerk_user_id)
                await c.stop_channel(conn.webhook_channel_id, conn.webhook_resource_id)
            except Exception as e:
                logger.warning("renew: stop old channel: %s", e)

        if not self.settings.google_calendar_webhook_url:
            return False

        client = await self.get_client_for_user(clerk_user_id)
        channel_id = f"scribely-{user_id}-{uuid.uuid4().hex[:12]}"
        watch = await client.watch_events(
            "primary",
            channel_id=channel_id,
            webhook_address=self.settings.google_calendar_webhook_url,
            token=self.settings.google_calendar_webhook_token,
        )
        exp_dt = datetime.utcfromtimestamp(watch.expiration_ms / 1000.0)
        conn.webhook_channel_id = watch.channel_id
        conn.webhook_resource_id = watch.resource_id
        conn.webhook_expiration = exp_dt
        await db.commit()
        return True
