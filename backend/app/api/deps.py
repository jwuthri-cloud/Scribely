"""
API-specific dependencies for Scribely.
"""

from typing import Optional

from app.config import Settings, get_settings
from app.database.models.user import User
from app.database.repositories.user import UserRepository
from app.database.session import get_async_db_session
from app.security.clerk_auth import ClerkUser, require_current_user
from app.utils.logging import get_logger
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("deps")


def get_user_id_from_header(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
) -> Optional[str]:
    """Extract user ID from headers."""
    return x_user_id


def get_client_ip(
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For"),
    x_real_ip: Optional[str] = Header(None, alias="X-Real-IP")
) -> str:
    """Get client IP address from headers."""
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if x_real_ip:
        return x_real_ip
    return "unknown"


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings)
) -> Optional[str]:
    """Verify API key if provided (optional authentication)."""
    if not x_api_key:
        return None

    valid_api_keys = getattr(settings, "api_keys", [])

    if valid_api_keys and x_api_key not in valid_api_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    return x_api_key


async def get_or_create_user(db: AsyncSession, clerk_user: ClerkUser) -> User:
    """Get-or-create the local DB user for a Clerk identity, syncing basic fields.

    Shared by ``get_current_user_with_db`` and the (optional-auth) ``/auth/status``
    endpoint so the user row exists as soon as the desktop signs in — required for the
    per-user Recall entitlement (use_recall_sdk) to be flippable.
    """
    user = await UserRepository.get_by_clerk_id(db, clerk_user.id)

    if user is None:
        user = await UserRepository.create(
            db,
            clerk_id=clerk_user.id,
            email=clerk_user.email or None,
            username=clerk_user.username or None,
            full_name=clerk_user.full_name or None,
            role=clerk_user.role,
        )
        await db.commit()
        logger.info(f"Created DB user for Clerk ID {clerk_user.id}")
    else:
        changed = False
        if clerk_user.email and clerk_user.email != user.email:
            user.email = clerk_user.email
            changed = True
        if clerk_user.full_name and clerk_user.full_name != user.full_name:
            user.full_name = clerk_user.full_name
            changed = True
        if clerk_user.role and clerk_user.role != user.role:
            user.role = clerk_user.role
            changed = True
        if changed:
            await db.commit()

        await UserRepository.update_last_login(db, user.id)
        await db.commit()

    return user


async def get_current_user_with_db(
    clerk_user: ClerkUser = Depends(require_current_user),
    db: AsyncSession = Depends(get_async_db_session),
) -> User:
    """
    Authenticate via Clerk JWT, then upsert the user into the local DB.
    Returns the SQLAlchemy User instance so downstream endpoints have both
    the DB record and the Clerk identity.
    """
    return await get_or_create_user(db, clerk_user)
