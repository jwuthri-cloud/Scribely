"""Pydantic models for Web Push API."""

from pydantic import BaseModel, Field


class PushKeyIn(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    """Shape of `PushSubscription.toJSON()` from the browser."""

    endpoint: str
    keys: PushKeyIn


class PushStatusOut(BaseModel):
    subscribed: bool
    vapid_public_key_configured: bool = Field(
        default=False,
        description="Server has VAPID public key (needed for subscribe).",
    )
