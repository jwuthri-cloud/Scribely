"""Send Web Push payloads using pywebpush (blocking — run via asyncio.to_thread)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from app.config import get_settings
from app.utils.logging import get_logger

if TYPE_CHECKING:
    from app.database.models.push import UserPushSubscription

logger = get_logger("webpush_sender")


def _send_one_sync(sub: "UserPushSubscription", payload: dict) -> int | None:
    """Returns HTTP status, or None on unexpected error. 410 means delete subscription."""
    from pywebpush import WebPushException, webpush

    settings = get_settings()
    subscription_info = {
        "endpoint": sub.endpoint,
        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
    }
    data = json.dumps(payload)
    vapid_claims = {"sub": settings.vapid_subject}
    try:
        r = webpush(
            subscription_info=subscription_info,
            data=data,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=vapid_claims,
            timeout=15,
        )
        return getattr(r, "status_code", None) or 201
    except WebPushException as e:
        sc = getattr(e, "response", None)
        if sc is not None:
            code = getattr(sc, "status_code", None)
            if code == 410:
                return 410
        logger.warning("WebPush failed: %s", e)
        return getattr(sc, "status_code", None) if sc else None
    except Exception as e:
        logger.warning("WebPush error: %s", e)
        return None
