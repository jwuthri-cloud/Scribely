"""
Async client for Google Calendar API v3 (REST via httpx).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.utils.logging import get_logger

logger = get_logger("google_calendar")

GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"


@dataclass
class WatchResponse:
    """Response from calendars.events.watch."""

    channel_id: str
    resource_id: str
    expiration_ms: int


class GoogleCalendarClient:
    """Minimal Google Calendar v3 client using a user's OAuth access token."""

    def __init__(self, access_token: str) -> None:
        self._token = access_token
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

    async def get_calendar(self, calendar_id: str = "primary") -> dict[str, Any]:
        url = f"{GOOGLE_CALENDAR_BASE}/calendars/{calendar_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self._headers)
        r.raise_for_status()
        return r.json()

    async def list_events(
        self,
        calendar_id: str = "primary",
        *,
        sync_token: Optional[str] = None,
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        page_token: Optional[str] = None,
        single_events: bool = True,
        max_results: int = 250,
    ) -> dict[str, Any]:
        """
        GET /calendars/{calendarId}/events

        Use either sync_token (incremental) or time_min/time_max (initial window).
        """
        params: dict[str, Any] = {
            "singleEvents": str(single_events).lower(),
            "maxResults": max_results,
        }
        if sync_token:
            params["syncToken"] = sync_token
        else:
            if time_min:
                params["timeMin"] = time_min
            if time_max:
                params["timeMax"] = time_max
        if page_token:
            params["pageToken"] = page_token

        url = f"{GOOGLE_CALENDAR_BASE}/calendars/{calendar_id}/events"
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url, headers=self._headers, params=params)
        r.raise_for_status()
        return r.json()

    async def list_all_events_paginated(
        self,
        calendar_id: str = "primary",
        *,
        sync_token: Optional[str] = None,
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        single_events: bool = True,
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        """
        Paginate events.list until no nextPageToken.

        Returns (all_items, next_sync_token).
        """
        items: list[dict[str, Any]] = []
        page_token: Optional[str] = None
        next_sync: Optional[str] = None

        while True:
            page = await self.list_events(
                calendar_id,
                sync_token=sync_token,
                time_min=time_min,
                time_max=time_max,
                page_token=page_token,
                single_events=single_events,
            )
            batch = page.get("items") or []
            items.extend(batch)
            next_sync = page.get("nextSyncToken") or next_sync
            page_token = page.get("nextPageToken")
            if not page_token:
                break

        return items, next_sync

    async def watch_events(
        self,
        calendar_id: str,
        *,
        channel_id: str,
        webhook_address: str,
        token: Optional[str] = None,
    ) -> WatchResponse:
        """
        POST /calendars/{calendarId}/events/watch

        ``webhook_address`` must be HTTPS (Google requirement).
        """
        body: dict[str, Any] = {
            "id": channel_id,
            "type": "web_hook",
            "address": webhook_address,
        }
        if token:
            body["token"] = token

        url = f"{GOOGLE_CALENDAR_BASE}/calendars/{calendar_id}/events/watch"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                url,
                headers={**self._headers, "Content-Type": "application/json"},
                json=body,
            )
        r.raise_for_status()
        data = r.json()
        return WatchResponse(
            channel_id=data.get("id", channel_id),
            resource_id=data.get("resourceId", ""),
            expiration_ms=int(data.get("expiration", 0)),
        )

    async def stop_channel(self, channel_id: str, resource_id: str) -> None:
        """POST /channels/stop"""
        body = {"id": channel_id, "resourceId": resource_id}
        url = f"https://www.googleapis.com/calendar/v3/channels/stop"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                url,
                headers={**self._headers, "Content-Type": "application/json"},
                json=body,
            )
        # 404 = channel already gone
        if r.status_code == 404:
            logger.warning("Google stop channel 404 (already stopped): %s", channel_id)
            return
        r.raise_for_status()
