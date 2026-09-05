"""
Endpoints for managing user's external app integrations via Composio.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents.tool.composio_tools import (
    disconnect_app,
    get_composio_connect_url,
    get_connected_apps,
)
from app.config import get_settings
from app.infrastructure.clerk_oauth import (
    ClerkOAuthTokenError,
    get_google_oauth_access_token,
)
from app.security.clerk_auth import ClerkUser, require_current_user
from app.utils.logging import get_logger

logger = get_logger("integrations_api")

router = APIRouter()


class ConnectedApp(BaseModel):
    app: str
    status: str


class ConnectResponse(BaseModel):
    app: str
    redirect_url: str


class GoogleTokenResponse(BaseModel):
    access_token: str


@router.get("/google/token", response_model=GoogleTokenResponse)
async def google_access_token(
    current_user: ClerkUser = Depends(require_current_user),
) -> Any:
    """
    Short-lived Google OAuth access token for the desktop app (live Google Doc read/write).

    Comes from Clerk's stored Google connection, so the Google social connection in the
    Clerk dashboard must request the `https://www.googleapis.com/auth/documents` scope.
    """
    settings = get_settings()
    try:
        token = await get_google_oauth_access_token(
            current_user.id, settings, provider=settings.clerk_google_oauth_provider
        )
    except ClerkOAuthTokenError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"access_token": token}


@router.get("", response_model=list[ConnectedApp])
async def list_integrations(
    current_user: ClerkUser = Depends(require_current_user),
) -> Any:
    """List all apps the user has connected via Composio."""
    apps = get_connected_apps(user_id=current_user.id)
    return apps


@router.get("/connect/{app_name}", response_model=ConnectResponse)
async def connect_integration(
    app_name: str,
    current_user: ClerkUser = Depends(require_current_user),
) -> Any:
    """
    Get the OAuth URL to connect an external app.

    Redirect the user to the returned URL to complete the OAuth flow.
    Supported apps: GMAIL, GOOGLECALENDAR, SLACK, NOTION, HUBSPOT, LINEAR, GITHUB, JIRA, ZAPIER
    """
    try:
        url = get_composio_connect_url(user_id=current_user.id, app_name=app_name)
        return {"app": app_name.upper(), "redirect_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/{app_name}")
async def disconnect_integration(
    app_name: str,
    current_user: ClerkUser = Depends(require_current_user),
) -> Any:
    """Disconnect an external app integration."""
    success = disconnect_app(user_id=current_user.id, app_name=app_name)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"No active connection found for app '{app_name}'.",
        )
    return {"message": f"Disconnected {app_name.upper()} successfully."}
