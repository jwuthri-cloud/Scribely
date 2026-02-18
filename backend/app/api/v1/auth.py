"""
Authentication endpoints with Clerk integration for Scribely.
"""

from typing import Any, Dict, Optional

from app.api.response_wrapper import APIResponseWrapper
from app.config import Settings, get_settings
from app.security.clerk_auth import (
    ClerkAuthProvider,
    ClerkUser,
    get_clerk_provider,
    get_current_user,
    require_current_user,
)
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

logger = get_logger("auth_api")

router = APIRouter()


class UserProfileResponse(BaseModel):
    """User profile response model."""
    id: str = Field(..., description="User ID")
    email: str = Field(..., description="User email address")
    username: str = Field("", description="Username")
    first_name: str = Field("", description="First name")
    last_name: str = Field("", description="Last name")
    full_name: str = Field("", description="Full name")
    image_url: str = Field("", description="Profile image URL")
    created_at: Optional[str] = Field(None, description="Account creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="User metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "user_2abc123xyz",
                "email": "john.doe@example.com",
                "username": "johndoe",
                "first_name": "John",
                "last_name": "Doe",
                "full_name": "John Doe",
                "image_url": "https://images.clerk.dev/uploaded/img_...",
                "created_at": "2023-12-01T10:00:00Z",
                "updated_at": "2023-12-15T14:30:00Z",
                "metadata": {"preferences": {"theme": "dark"}}
            }
        }


class AuthStatusResponse(BaseModel):
    """Authentication status response."""
    authenticated: bool = Field(..., description="Whether user is authenticated")
    user: Optional[UserProfileResponse] = Field(None, description="User profile if authenticated")

    class Config:
        json_schema_extra = {
            "example": {
                "authenticated": True,
                "user": {
                    "id": "user_2abc123xyz",
                    "email": "john.doe@example.com",
                    "username": "johndoe",
                    "full_name": "John Doe",
                    "image_url": "https://images.clerk.dev/uploaded/img_..."
                }
            }
        }


class ClerkConfigResponse(BaseModel):
    """Clerk configuration response for frontend."""
    publishable_key: str = Field(..., description="Clerk publishable key")
    sign_in_url: str = Field(..., description="Sign in URL")
    sign_up_url: str = Field(..., description="Sign up URL")
    after_sign_in_url: str = Field(..., description="Redirect URL after sign in")
    after_sign_up_url: str = Field(..., description="Redirect URL after sign up")

    class Config:
        json_schema_extra = {
            "example": {
                "publishable_key": "pk_test_...",
                "sign_in_url": "/sign-in",
                "sign_up_url": "/sign-up",
                "after_sign_in_url": "/chat",
                "after_sign_up_url": "/chat"
            }
        }


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: ClerkUser = Depends(require_current_user),
    request: Request = None
) -> UserProfileResponse:
    """
    Get the current authenticated user's profile.

    Requires valid JWT token in Authorization header.
    """
    try:
        user_data = current_user.to_dict()

        return UserProfileResponse(
            id=user_data["id"],
            email=user_data["email"],
            username=user_data["username"],
            first_name=user_data["first_name"],
            last_name=user_data["last_name"],
            full_name=user_data["full_name"],
            image_url=user_data["image_url"],
            created_at=user_data["created_at"],
            updated_at=user_data["updated_at"],
            metadata=user_data["metadata"]
        )

    except Exception as e:
        logger.error(f"Error getting user profile: {e}")
        return APIResponseWrapper.server_error(
            message="Failed to retrieve user profile",
            request=request
        )


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status(
    current_user: Optional[ClerkUser] = Depends(get_current_user)
) -> AuthStatusResponse:
    """
    Get the current authentication status.

    This endpoint doesn't require authentication and will return
    user information if a valid token is provided.
    """
    if current_user:
        user_data = current_user.to_dict()
        user_profile = UserProfileResponse(
            id=user_data["id"],
            email=user_data["email"],
            username=user_data["username"],
            first_name=user_data["first_name"],
            last_name=user_data["last_name"],
            full_name=user_data["full_name"],
            image_url=user_data["image_url"],
            created_at=user_data["created_at"],
            updated_at=user_data["updated_at"],
            metadata=user_data["metadata"]
        )

        return AuthStatusResponse(
            authenticated=True,
            user=user_profile
        )

    return AuthStatusResponse(
        authenticated=False,
        user=None
    )


@router.get("/config", response_model=ClerkConfigResponse)
async def get_clerk_config(
    settings: Settings = Depends(get_settings)
) -> ClerkConfigResponse:
    """
    Get Clerk configuration for frontend integration.

    Returns the publishable key and URL configuration needed
    for Clerk components in the frontend.
    """
    return ClerkConfigResponse(
        publishable_key=settings.clerk_publishable_key,
        sign_in_url="/sign-in",
        sign_up_url="/sign-up",
        after_sign_in_url="/chat",
        after_sign_up_url="/chat"
    )


@router.get("/user/{user_id}", response_model=UserProfileResponse)
async def get_user_by_id(
    user_id: str,
    current_user: ClerkUser = Depends(require_current_user),
    clerk_provider: ClerkAuthProvider = Depends(get_clerk_provider),
    request: Request = None
) -> UserProfileResponse:
    """
    Get user profile by ID.

    Requires authentication. Users can only access their own profile
    unless they have admin privileges (role: admin or superadmin).

    Roles are stored in Clerk's public_metadata.role field.
    """
    # Check if user can access this profile (own profile or admin)
    if not current_user.can_access_user(user_id):
        logger.warning(
            f"Access denied: User {current_user.id} (role: {current_user.role}) "
            f"attempted to access user {user_id}"
        )
        return APIResponseWrapper.forbidden(
            message="Access denied: You can only access your own profile unless you have admin privileges",
            request=request
        )

    try:
        user = await clerk_provider.get_user_by_id(user_id)

        if not user:
            return APIResponseWrapper.not_found(
                resource="User",
                identifier=user_id,
                request=request
            )

        user_data = user.to_dict()

        return UserProfileResponse(
            id=user_data["id"],
            email=user_data["email"],
            username=user_data["username"],
            first_name=user_data["first_name"],
            last_name=user_data["last_name"],
            full_name=user_data["full_name"],
            image_url=user_data["image_url"],
            created_at=user_data["created_at"],
            updated_at=user_data["updated_at"],
            metadata=user_data["metadata"]
        )

    except Exception as e:
        logger.error(f"Error getting user by ID {user_id}: {e}")
        return APIResponseWrapper.server_error(
            message="Failed to retrieve user profile",
            request=request
        )


@router.post("/validate")
async def validate_token(
    current_user: ClerkUser = Depends(require_current_user),
    request: Request = None
) -> Dict[str, Any]:
    """
    Validate JWT token and return user information.

    This endpoint can be used to verify if a token is still valid
    and get basic user information.
    """
    return APIResponseWrapper.success(
        message="Token is valid",
        data={
            "user_id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "full_name": current_user.full_name
        },
        request=request
    )


@router.get("/check-config")
async def check_clerk_configuration(
    settings: Settings = Depends(get_settings),
    request: Request = None
) -> Dict[str, Any]:
    """
    Check Clerk configuration status.

    Used for debugging and ensuring Clerk is properly configured.
    """
    config_status = {
        "clerk_configured": bool(settings.clerk_publishable_key and settings.clerk_secret_key),
        "publishable_key_present": bool(settings.clerk_publishable_key),
        "secret_key_present": bool(settings.clerk_secret_key),
        "publishable_key_format": settings.clerk_publishable_key.startswith("pk_") if settings.clerk_publishable_key else False,
        "secret_key_format": settings.clerk_secret_key.startswith("sk_") if settings.clerk_secret_key else False
    }

    # Test JWKS endpoint connectivity
    try:
        from app.security.clerk_auth import validate_clerk_config
        jwks_accessible = await validate_clerk_config(settings)
        config_status["jwks_accessible"] = jwks_accessible
    except Exception as e:
        logger.error(f"JWKS check failed: {e}")
        config_status["jwks_accessible"] = False
        config_status["jwks_error"] = str(e)

    return APIResponseWrapper.success(
        message="Clerk configuration status",
        data=config_status,
        request=request
    )


# Protected route example
@router.get("/protected")
async def protected_route(
    current_user: ClerkUser = Depends(require_current_user),
    request: Request = None
) -> Dict[str, Any]:
    """
    Example protected route that requires authentication.
    """
    return APIResponseWrapper.success(
        message=f"Hello {current_user.full_name or current_user.email}! This is a protected route.",
        data={
            "user_id": current_user.id,
            "access_granted_at": "2023-12-15T10:30:00Z"
        },
        request=request
    )


# Health check for auth system
@router.get("/health")
async def auth_health_check(
    settings: Settings = Depends(get_settings),
    request: Request = None
) -> Dict[str, Any]:
    """
    Health check for authentication system.
    """
    try:
        from app.security.clerk_auth import validate_clerk_config
        clerk_healthy = await validate_clerk_config(settings)

        health_data = {
            "clerk_configured": bool(settings.clerk_publishable_key and settings.clerk_secret_key),
            "clerk_accessible": clerk_healthy,
            "status": "healthy" if clerk_healthy else "degraded"
        }

        return APIResponseWrapper.success(
            message="Authentication health check completed",
            data=health_data,
            request=request
        )

    except Exception as e:
        logger.error(f"Auth health check failed: {e}")
        return APIResponseWrapper.server_error(
            message="Authentication health check failed",
            request=request
        )
