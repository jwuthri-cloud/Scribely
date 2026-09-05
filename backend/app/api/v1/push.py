"""
Web Push: subscribe / unsubscribe for calendar meeting reminders.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.user import User
from app.database.repositories.push import PushRepository
from app.database.session import get_async_db_session
from app.models.push import PushStatusOut, PushSubscribeIn

router = APIRouter()


@router.get("/status", response_model=PushStatusOut)
async def push_status(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    settings = get_settings()
    n = await PushRepository.count_for_user(db, user.id)
    return PushStatusOut(
        subscribed=n > 0,
        vapid_public_key_configured=bool(settings.vapid_public_key),
    )


@router.get("/vapid-public-key")
async def vapid_public_key():
    """Public key for PushManager.subscribe (avoids duplicating env on the client)."""
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push is not configured",
        )
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def push_subscribe(
    body: PushSubscribeIn,
    request: Request,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push is not configured on the server",
        )
    ua = request.headers.get("user-agent", "")[:500]
    await PushRepository.upsert_subscription(
        db,
        user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
        user_agent=ua or None,
    )
    await db.commit()


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def push_unsubscribe(
    endpoint: str = Query(..., description="PushSubscription.endpoint URL"),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
):
    deleted = await PushRepository.delete_by_endpoint(db, user.id, endpoint)
    await db.commit()
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
        )
