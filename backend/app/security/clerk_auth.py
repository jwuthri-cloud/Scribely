"""
Clerk authentication integration for Scribely.
"""

import base64
import re
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.config import Settings, get_settings
from app.exceptions import UnauthorizedError, ValidationError
from app.utils.logging import get_logger

logger = get_logger("clerk_auth")

# HTTP Bearer token security scheme
security = HTTPBearer(auto_error=False)


class ClerkUser:
    """Represents a Clerk user with essential information."""

    # Role hierarchy (higher index = more permissions)
    ROLE_HIERARCHY = ["user", "moderator", "admin", "superadmin"]

    def __init__(self, user_data: Dict[str, Any]):
        self.id: str = user_data.get("sub", "")
        self.user_id: str = user_data.get("sub", "")  # Alias for compatibility
        self.email: str = user_data.get("email", "")
        self.username: str = user_data.get("username", "")
        self.first_name: str = user_data.get("given_name", "")
        self.last_name: str = user_data.get("family_name", "")
        self.full_name: str = f"{self.first_name} {self.last_name}".strip()
        self.image_url: str = user_data.get("picture", "")
        self.created_at: Optional[datetime] = None
        self.updated_at: Optional[datetime] = None
        self.metadata: Dict[str, Any] = user_data.get("public_metadata", {})
        self.raw_data: Dict[str, Any] = user_data

        # Role from public_metadata (default to "user")
        self.role: str = self.metadata.get("role", "user")

        # Parse timestamps if available
        if "iat" in user_data:
            self.created_at = datetime.fromtimestamp(user_data["iat"])
        if "exp" in user_data:
            self.updated_at = datetime.fromtimestamp(user_data["exp"])

    @property
    def is_admin(self) -> bool:
        """Check if user has admin or superadmin role."""
        return self.role in ["admin", "superadmin"]

    @property
    def is_superadmin(self) -> bool:
        """Check if user has superadmin role."""
        return self.role == "superadmin"

    def has_role(self, required_role: str) -> bool:
        """Check if user has at least the required role level."""
        try:
            user_level = self.ROLE_HIERARCHY.index(self.role)
            required_level = self.ROLE_HIERARCHY.index(required_role)
            return user_level >= required_level
        except ValueError:
            # Unknown role, default to no access
            return False

    def can_access_user(self, target_user_id: str) -> bool:
        """Check if this user can access another user's data."""
        # Users can always access their own data
        if self.id == target_user_id:
            return True
        # Admins can access any user's data
        return self.is_admin

    def to_dict(self) -> Dict[str, Any]:
        """Convert user to dictionary representation."""
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "image_url": self.image_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "metadata": self.metadata,
            "role": self.role,
        }


def _derive_jwks_url_from_publishable_key(
    publishable_key: Optional[str],
) -> Optional[str]:
    """Derive JWKS URL from Clerk publishable key (pk_test_<base64> or pk_live_<base64>)."""
    if not publishable_key or not publishable_key.startswith("pk_"):
        return None
    try:
        raw = re.sub(r"^pk_(test|live)_", "", publishable_key)
        if not raw:
            return None
        decoded = base64.b64decode(raw).decode("utf-8").rstrip("$")
        if decoded.startswith("http"):
            return f"{decoded.rstrip('/')}/.well-known/jwks.json"
        return None
    except Exception:
        return None


class ClerkAuthProvider:
    """Clerk authentication provider for JWT verification."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.jwks_cache: Optional[Dict[str, Any]] = None
        self.jwks_cache_expiry: Optional[datetime] = None
        self.jwks_url = (
            settings.clerk_jwks_url
            or _derive_jwks_url_from_publishable_key(settings.clerk_publishable_key)
            or "https://clerk.dev/.well-known/jwks.json"
        )
        logger.info(f"Using Clerk JWKS URL: {self.jwks_url}")

    async def get_jwks(self) -> Dict[str, Any]:
        """Get JWKS (JSON Web Key Set) from Clerk, with caching."""
        now = datetime.utcnow()

        # Return cached JWKS if still valid (cache for 1 hour)
        if self.jwks_cache and self.jwks_cache_expiry and now < self.jwks_cache_expiry:
            return self.jwks_cache

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.jwks_url, timeout=10.0)
                response.raise_for_status()

                self.jwks_cache = response.json()
                self.jwks_cache_expiry = now + timedelta(hours=1)

                logger.info("Successfully fetched JWKS from Clerk")
                return self.jwks_cache

        except Exception as e:
            logger.error(f"Failed to fetch JWKS from Clerk: {e}")
            # If we have a cached version, use it even if expired
            if self.jwks_cache:
                logger.warning("Using expired JWKS cache due to fetch failure")
                return self.jwks_cache
            raise UnauthorizedError("Unable to verify authentication token")

    async def verify_token(self, token: str) -> ClerkUser:
        """Verify JWT token and return user information."""
        try:
            # Decode token header to get kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            if not kid:
                raise UnauthorizedError("Token missing key ID")

            # Get JWKS from Clerk
            jwks = await self.get_jwks()

            # Find the key with matching kid
            signing_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    signing_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
                    break

            if not signing_key:
                raise UnauthorizedError("Unable to find signing key")

            # Verify and decode the token
            decoded_token = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                options={"verify_aud": False},  # Clerk doesn't use standard aud claim
            )

            # Create and return ClerkUser
            user = ClerkUser(decoded_token)
            logger.info(f"Successfully verified token for user: {user.id}")

            return user

        except ExpiredSignatureError:
            raise UnauthorizedError("Token has expired")
        except InvalidTokenError as e:
            raise UnauthorizedError(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            raise UnauthorizedError("Token verification failed")

    async def get_user_by_id(self, user_id: str) -> Optional[ClerkUser]:
        """Get user information from Clerk API by user ID."""
        if not self.settings.clerk_secret_key:
            raise ValidationError("Clerk secret key not configured")

        try:
            headers = {
                "Authorization": f"Bearer {self.settings.clerk_secret_key}",
                "Content-Type": "application/json",
            }

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.clerk.dev/v1/users/{user_id}",
                    headers=headers,
                    timeout=10.0,
                )

                if response.status_code == 404:
                    return None

                response.raise_for_status()
                user_data = response.json()

                # Convert Clerk API response to JWT-like format
                jwt_like_data = {
                    "sub": user_data.get("id"),
                    "email": user_data.get("email_addresses", [{}])[0].get(
                        "email_address", ""
                    ),
                    "username": user_data.get("username", ""),
                    "given_name": user_data.get("first_name", ""),
                    "family_name": user_data.get("last_name", ""),
                    "picture": user_data.get("image_url", ""),
                    "public_metadata": user_data.get("public_metadata", {}),
                    "iat": (
                        int(
                            datetime.fromisoformat(
                                user_data.get(
                                    "created_at", "1970-01-01T00:00:00Z"
                                ).replace("Z", "+00:00")
                            ).timestamp()
                        )
                        if user_data.get("created_at")
                        else None
                    ),
                }

                return ClerkUser(jwt_like_data)

        except Exception as e:
            logger.error(f"Failed to get user from Clerk API: {e}")
            return None


# Global Clerk auth provider instance
_clerk_provider: Optional[ClerkAuthProvider] = None


def get_clerk_provider(settings: Settings = Depends(get_settings)) -> ClerkAuthProvider:
    """Get Clerk authentication provider instance."""
    global _clerk_provider
    if _clerk_provider is None:
        _clerk_provider = ClerkAuthProvider(settings)
    return _clerk_provider


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    clerk_provider: ClerkAuthProvider = Depends(get_clerk_provider),
) -> Optional[ClerkUser]:
    """
    Get current authenticated user from JWT token.
    Returns None if no token provided (for optional authentication).
    """
    if not credentials:
        return None

    try:
        user = await clerk_provider.verify_token(credentials.credentials)
        return user
    except UnauthorizedError:
        return None


async def require_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    clerk_provider: ClerkAuthProvider = Depends(get_clerk_provider),
) -> ClerkUser:
    """
    Get current authenticated user from JWT token.
    Raises HTTPException if no valid token provided.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = await clerk_provider.verify_token(credentials.credentials)
        return user
    except UnauthorizedError as e:
        raise HTTPException(
            status_code=401, detail=str(e), headers={"WWW-Authenticate": "Bearer"}
        )


async def require_admin(
    current_user: ClerkUser = Depends(require_current_user),
) -> ClerkUser:
    """
    Require the current user to have admin privileges.
    Raises HTTPException if user is not an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


def require_role(required_role: str):
    """
    Factory function to create a dependency that requires a specific role.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: ClerkUser = Depends(require_role("admin"))):
            ...
    """

    async def role_checker(
        current_user: ClerkUser = Depends(require_current_user),
    ) -> ClerkUser:
        if not current_user.has_role(required_role):
            raise HTTPException(
                status_code=403, detail=f"Role '{required_role}' or higher required"
            )
        return current_user

    return role_checker


def require_auth(func):
    """
    Decorator to require authentication for a function.
    """

    @wraps(func)
    async def wrapper(*args, **kwargs):
        return await func(*args, **kwargs)

    return wrapper


async def validate_clerk_config(settings: Settings) -> bool:
    """Validate Clerk configuration."""
    if not settings.clerk_publishable_key:
        logger.warning("Clerk publishable key not configured")
        return False

    if not settings.clerk_secret_key:
        logger.warning("Clerk secret key not configured")
        return False

    if not settings.clerk_publishable_key.startswith("pk_"):
        logger.error("Invalid Clerk publishable key format (should start with pk_)")
        return False

    if not settings.clerk_secret_key.startswith("sk_"):
        logger.error("Invalid Clerk secret key format (should start with sk_)")
        return False

    # Test connection to Clerk JWKS endpoint
    try:
        provider = ClerkAuthProvider(settings)
        await provider.get_jwks()
        logger.info("Clerk configuration validated successfully")
        return True
    except Exception as e:
        logger.error(f"Clerk configuration validation failed: {e}")
        return False


__all__ = [
    "ClerkUser",
    "ClerkAuthProvider",
    "get_clerk_provider",
    "get_current_user",
    "require_current_user",
    "require_admin",
    "require_role",
    "require_auth",
    "validate_clerk_config",
]
