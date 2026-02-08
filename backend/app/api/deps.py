"""
API-specific dependencies for AssistMe.
"""

from typing import Optional

from app.config import Settings, get_settings
from fastapi import Depends, Header, HTTPException, status


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

    # In production, verify against a database or service
    valid_api_keys = getattr(settings, "api_keys", [])

    if valid_api_keys and x_api_key not in valid_api_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    return x_api_key
