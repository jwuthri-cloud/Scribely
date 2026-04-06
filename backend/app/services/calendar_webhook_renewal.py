"""Periodic renewal of Google Calendar push notification channels."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.user import UserRepository
from app.database.session import get_async_session
from app.services.calendar_sync import CalendarSyncService
from app.utils.logging import get_logger

logger = get_logger("calendar_webhook_renewal")


async def calendar_webhook_renewal_loop(stop_event: asyncio.Event) -> None:
    """Wake periodically and renew Google webhook channels expiring within 24 hours."""
    delay_sec = 60.0  # first tick soon after startup
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=delay_sec)
            return
        except asyncio.TimeoutError:
            pass
        delay_sec = 3600.0

        try:
            before = datetime.utcnow() + timedelta(hours=24)
            async with get_async_session() as db:
                conns = await CalendarRepository.list_connections_expiring_webhook_before(db, before)
                svc = CalendarSyncService()
                for c in conns:
                    user = await UserRepository.get_by_id(db, c.user_id)
                    if not user:
                        continue
                    try:
                        await svc.renew_webhook_if_needed(db, user.id, user.clerk_id)
                    except Exception as e:
                        logger.warning("renew webhook for user %s: %s", user.id, e)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("calendar_webhook_renewal_loop tick failed")
