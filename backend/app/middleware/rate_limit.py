"""
Rate limiting middleware for Scribely.

Uses slowapi to provide per-IP and per-user rate limiting.
"""

from typing import Callable

from app.config import get_settings
from app.utils.logging import get_logger
from fastapi import Request, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = get_logger("rate_limit")


def get_user_or_ip(request: Request) -> str:
    """
    Get user ID from request state or fall back to IP address.

    This allows for per-user rate limiting for authenticated requests
    and per-IP rate limiting for anonymous requests.
    """
    # Try to get user ID from request state (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"

    # Fall back to IP address
    return get_remote_address(request)


def _create_limiter() -> Limiter:
    """Use Redis when enabled so limits are shared across multiple workers/instances."""
    settings = get_settings()
    if settings.redis_enabled and settings.redis_url:
        logger.info("Rate limiting storage: Redis")
        return Limiter(key_func=get_user_or_ip, storage_uri=settings.redis_url)
    logger.info("Rate limiting storage: memory")
    return Limiter(key_func=get_user_or_ip)


limiter = _create_limiter()


# Define rate limit presets for different use cases
class RateLimits:
    """Rate limit presets for different endpoints."""

    # General API limits
    DEFAULT = "100/minute"  # 100 requests per minute
    STRICT = "30/minute"    # 30 requests per minute

    # LLM endpoints (expensive operations)
    CHAT = "30/minute"      # 30 chat requests per minute
    STREAMING = "20/minute" # 20 streaming requests per minute

    # Authentication endpoints
    AUTH = "20/minute"      # 20 auth requests per minute
    LOGIN = "5/minute"      # 5 login attempts per minute (brute force protection)

    # High-frequency endpoints
    HEALTH = "1000/minute"  # Health checks are cheap


def setup_rate_limiting(app):
    """
    Set up rate limiting for the FastAPI application.

    Call this in your main.py after creating the app:

    ```python
    from app.middleware.rate_limit import setup_rate_limiting, limiter

    app = FastAPI()
    setup_rate_limiting(app)

    # Then use the limiter decorator on endpoints:
    @app.get("/api/endpoint")
    @limiter.limit("10/minute")
    async def my_endpoint(request: Request):
        ...
    ```
    """
    # Add limiter to app state
    app.state.limiter = limiter

    # Add exception handler for rate limit exceeded
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    s = get_settings()
    backend = "redis" if s.redis_enabled and s.redis_url else "memory"
    logger.info("Rate limiting middleware configured", extra={"storage": backend})


def get_rate_limiter() -> Limiter:
    """Get the global rate limiter instance."""
    return limiter


# Decorator helpers for common rate limits
def rate_limit_chat(func: Callable) -> Callable:
    """Apply chat rate limit to an endpoint."""
    return limiter.limit(RateLimits.CHAT)(func)


def rate_limit_streaming(func: Callable) -> Callable:
    """Apply streaming rate limit to an endpoint."""
    return limiter.limit(RateLimits.STREAMING)(func)


def rate_limit_auth(func: Callable) -> Callable:
    """Apply auth rate limit to an endpoint."""
    return limiter.limit(RateLimits.AUTH)(func)


def rate_limit_strict(func: Callable) -> Callable:
    """Apply strict rate limit to an endpoint."""
    return limiter.limit(RateLimits.STRICT)(func)


__all__ = [
    "limiter",
    "RateLimits",
    "setup_rate_limiting",
    "get_rate_limiter",
    "get_user_or_ip",
    "rate_limit_chat",
    "rate_limit_streaming",
    "rate_limit_auth",
    "rate_limit_strict",
]
