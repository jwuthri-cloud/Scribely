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
    provider: str | None = None,
) -> str:
    """
    Return a Google OAuth access token for the Clerk user.

    Clerk stores tokens for users who signed in with Google (with Calendar scope
    configured on the Google social connection in the Clerk dashboard).

    The Backend API path is GET /users/{id}/oauth_access_tokens/{provider}. Clerk's
    JS SDK uses provider ``google`` (not ``oauth_google``); a wrong provider string
    returns 404 even when the user has Google connected.
    """
    if not settings.clerk_secret_key:
        raise ValueError("Clerk secret key not configured")

    preferred = provider or settings.clerk_google_oauth_provider
    # Try preferred first, then the alternate slug for older deployments.
    candidates = [preferred]
    if preferred == "google":
        candidates.append("oauth_google")
    elif preferred == "oauth_google":
        candidates.append("google")

    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for prov in candidates:
            url = f"{CLERK_API_BASE}/users/{clerk_user_id}/oauth_access_tokens/{prov}"
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                logger.debug("Clerk OAuth token resolved with provider slug %r", prov)
                break
            if response.status_code != 404:
                response.raise_for_status()
        else:
            raise ClerkOAuthTokenError(
                "No Google OAuth token for this user. Sign in with Google or reconnect."
            )

    raw = response.json()

    token = _extract_token_from_payload(raw)
    if not token:
        raise ClerkOAuthTokenError("Clerk returned no Google OAuth access token")

    return token


def _extract_token_from_payload(raw: Any) -> Optional[str]:
    """Parse Clerk oauth_access_tokens response.

    Clerk returns a bare list: [{"token": "...", ...}]
    Older SDK versions wrapped it: {"data": [...]}
    """
    # Bare list (current Clerk API)
    if isinstance(raw, list):
        if raw and isinstance(raw[0], dict):
            t = raw[0].get("token")
            if isinstance(t, str) and t:
                return t
        return None

    # Wrapped {"data": [...]}
    if isinstance(raw, dict):
        data = raw.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            t = data[0].get("token")
            if isinstance(t, str) and t:
                return t
        # Direct {"token": "..."}
        t = raw.get("token")
        if isinstance(t, str) and t:
            return t

    return None


class ClerkOAuthTokenError(Exception):
    """Raised when Clerk cannot provide a valid OAuth token."""
