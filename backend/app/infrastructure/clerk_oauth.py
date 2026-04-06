"""
Fetch OAuth access tokens for social providers from Clerk Backend API.
"""

from typing import Any, Optional

import httpx
from app.config import Settings
from app.utils.logging import get_logger

logger = get_logger("clerk_oauth")

# Match ClerkAuthProvider in security/clerk_auth.py
CLERK_API_BASE = "https://api.clerk.dev/v1"


async def get_google_oauth_access_token(
    clerk_user_id: str,
    settings: Settings,
    *,
    provider: str = "oauth_google",
) -> str:
    """
    Return a Google OAuth access token for the Clerk user.

    Clerk stores tokens for users who signed in with Google (with Calendar scope
    configured on the Google social connection in the Clerk dashboard).
    """
    if not settings.clerk_secret_key:
        raise ValueError("Clerk secret key not configured")

    url = f"{CLERK_API_BASE}/users/{clerk_user_id}/oauth_access_tokens/{provider}"
    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)

    if response.status_code == 404:
        raise ClerkOAuthTokenError(
            "No Google OAuth token for this user. Sign in with Google or reconnect."
        )

    response.raise_for_status()
    payload: dict[str, Any] = response.json()

    token = _extract_token_from_payload(payload)
    if not token:
        raise ClerkOAuthTokenError("Clerk returned no Google OAuth access token")

    return token


def _extract_token_from_payload(payload: dict[str, Any]) -> Optional[str]:
    """Parse Clerk list response for oauth_access_tokens."""
    data = payload.get("data")
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            t = first.get("token")
            if isinstance(t, str) and t:
                return t
    # Alternate shape
    if "token" in payload and isinstance(payload["token"], str):
        return payload["token"]
    return None


class ClerkOAuthTokenError(Exception):
    """Raised when Clerk cannot provide a valid OAuth token."""
