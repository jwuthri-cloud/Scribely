"""Recall.ai endpoints for Scribely.

- POST /upload-token: mint a per-recording Desktop SDK upload token for entitled users.
  The raw Recall API key never leaves the backend.
- PATCH /admin/users/{user_id}/recall-sdk: admin flips a user's entitlement.
"""

from typing import Any, Optional

from app.api.deps import get_current_user_with_db
from app.database.models.user import User
from app.database.repositories.user import UserRepository
from app.database.session import get_async_db_session
from app.infrastructure.recall.client import create_sdk_upload
from app.security.clerk_auth import ClerkUser, require_admin
from app.utils.logging import get_logger
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("recall_api")

router = APIRouter()


class UploadTokenResponse(BaseModel):
    id: str = Field(..., description="Recall upload id (used later for retrieval)")
    upload_token: str = Field(..., description="Per-recording token handed to the desktop SDK")


@router.post("/upload-token", response_model=UploadTokenResponse)
async def mint_upload_token(
    recording_config: Optional[dict] = Body(default=None, embed=True),
    user: User = Depends(get_current_user_with_db),
) -> UploadTokenResponse:
    """Mint a Desktop SDK upload token. Gated on the user's Recall entitlement."""
    if not user.use_recall_sdk:
        raise HTTPException(status_code=403, detail="Recall SDK not enabled for this user")

    try:
        data: dict[str, Any] = await create_sdk_upload(
            recording_config=recording_config,
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
