"""Recall.ai endpoints for Scribely.

- POST /upload-token: mint a per-recording Desktop SDK upload token for entitled users.
  The raw Recall API key never leaves the backend.
- PATCH /admin/users/{user_id}/recall-sdk: admin flips a user's entitlement.
"""

import base64
import hashlib
import hmac
import json
from pathlib import Path
from typing import Any, Optional

from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.user import User
from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.user import UserRepository
from app.database.session import get_async_db_session
from app.infrastructure.object_storage import is_object_storage_configured, upload_file_async
from app.infrastructure.recall.client import (
    build_recording_config,
    create_sdk_upload,
    download_to_file,
    extract_media_urls,
    get_recording_for_upload,
)
from app.security.clerk_auth import ClerkUser, require_admin
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("recall_api")

router = APIRouter()


class UploadTokenBody(BaseModel):
    # Mirrors the desktop's transcription.language setting: 'en' | 'multi'.
    language: Optional[str] = Field(default=None, description="'en' (default) or 'multi'")


class UploadTokenResponse(BaseModel):
    id: str = Field(..., description="Recall upload id (used later for retrieval)")
    upload_token: str = Field(..., description="Per-recording token handed to the desktop SDK")


@router.post("/upload-token", response_model=UploadTokenResponse)
async def mint_upload_token(
    body: Optional[UploadTokenBody] = None,
    user: User = Depends(get_current_user_with_db),
) -> UploadTokenResponse:
    """Mint a Desktop SDK upload token. Gated on the user's Recall entitlement.

    The transcription provider is chosen server-side from the requested language so
    cost/provider policy stays on the backend (en→recallai_streaming, multi→AssemblyAI).
    """
    if not user.use_recall_sdk:
        raise HTTPException(status_code=403, detail="Recall SDK not enabled for this user")

    language = body.language if body else None
    try:
        data: dict[str, Any] = await create_sdk_upload(
            recording_config=build_recording_config(language),
            metadata={"user_id": user.id},
        )
    except Exception as e:
        logger.error(f"Recall upload-token mint failed for user {user.id}: {e}")
        raise HTTPException(status_code=502, detail="Failed to mint Recall upload token")

    return UploadTokenResponse(id=data["id"], upload_token=data["upload_token"])


class RecallEntitlementBody(BaseModel):
    enabled: bool


@router.patch("/admin/users/{user_id}/recall-sdk")
async def set_recall_entitlement(
    user_id: str,
    body: RecallEntitlementBody,
    _admin: ClerkUser = Depends(require_admin),
    db: AsyncSession = Depends(get_async_db_session),
) -> dict[str, Any]:
    """Admin: enable/disable the Recall SDK for a user (by DB user id)."""
    user = await UserRepository.update(db, user_id, use_recall_sdk=body.enabled)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.commit()
    logger.info(f"Recall entitlement for user {user_id} set to {body.enabled}")
    return {"user_id": user_id, "use_recall_sdk": body.enabled}


def _verify_svix(headers: Any, body: bytes, secret: str) -> bool:
    """Verify a Svix-signed webhook (Recall uses Svix). Dependency-free implementation
    of the documented scheme: HMAC-SHA256 over `{id}.{timestamp}.{body}`."""
    svix_id = headers.get("svix-id")
    svix_ts = headers.get("svix-timestamp")
    svix_sig = headers.get("svix-signature")
    if not (svix_id and svix_ts and svix_sig):
        return False
    key = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key_bytes = base64.b64decode(key)
    except Exception:
        return False
    signed = f"{svix_id}.{svix_ts}.{body.decode('utf-8')}".encode("utf-8")
    expected = base64.b64encode(hmac.new(key_bytes, signed, hashlib.sha256).digest()).decode()
    # svix-signature is a space-separated list of "v1,<base64sig>" entries.
    for part in svix_sig.split(" "):
        _, _, sig = part.partition(",")
        if sig and hmac.compare_digest(sig, expected):
            return True
    return False


@router.post("/webhook")
async def recall_webhook(
    request: Request,
    db: AsyncSession = Depends(get_async_db_session),
) -> dict[str, Any]:
    """Recall sdk_upload.* webhooks. On sdk_upload.complete, retrieve the recording and
    download the mixed MP4 into the matching meeting's directory (correlated by the
    recall_upload_id the desktop tagged onto the transcript)."""
    body = await request.body()
    settings = get_settings()
    if settings.recall_webhook_secret:
        if not _verify_svix(request.headers, body, settings.recall_webhook_secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    else:
        logger.warning("RECALL_WEBHOOK_SECRET not set — skipping signature verification (dev only)")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    if event != "sdk_upload.complete":
        return {"ok": True, "ignored": event}

    data = payload.get("data", {}) or {}
    sdk_upload = data.get("sdk_upload", {}) or {}
    upload_id = sdk_upload.get("id")
    meta = sdk_upload.get("metadata", {}) or {}
    user_id = meta.get("user_id")
    if not upload_id:
        logger.warning("recall webhook: missing sdk_upload.id")
        return {"ok": True}

    meeting = await MeetingRepository.get_by_recall_upload_id(db, upload_id, user_id=user_id)
    if not meeting:
        # The transcript upload may not have landed yet — ask Svix to retry later.
        logger.info(f"recall webhook: no meeting for upload {upload_id} yet — requesting retry")
        raise HTTPException(status_code=503, detail="meeting not ready")

    try:
        recording = await get_recording_for_upload(upload_id)
    except Exception as e:
        logger.error(f"recall webhook: retrieve failed for {upload_id}: {e}")
        raise HTTPException(status_code=503, detail="retrieve failed")
    if not recording:
        logger.info(f"recall webhook: recording not available yet for {upload_id} — retry")
        raise HTTPException(status_code=503, detail="recording not ready")

    video_url = extract_media_urls(recording).get("video")
    if not video_url:
        logger.warning(
            f"recall webhook: no video URL for meeting {meeting.id}; recording keys={list(recording.keys())}"
        )
        return {"ok": True, "meeting_id": meeting.id, "video": False}

    meeting_dir = Path(settings.upload_dir) / str(meeting.user_id) / meeting.id
    meeting_dir.mkdir(parents=True, exist_ok=True)
    dest = meeting_dir / "recording.mp4"
    try:
        size = await download_to_file(video_url, dest)
        if is_object_storage_configured():
            await upload_file_async(dest, f"{meeting.user_id}/{meeting.id}", "recording.mp4")
        logger.info(f"recall webhook: saved recording.mp4 ({size} bytes) for meeting {meeting.id}")
    except Exception as e:
        logger.error(f"recall webhook: download failed for meeting {meeting.id}: {e}")
        raise HTTPException(status_code=503, detail="download failed")

    return {"ok": True, "meeting_id": meeting.id, "video": True}
