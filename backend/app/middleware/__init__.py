"""
Middleware package for AssistMe.
"""

import time
from typing import Callable
from uuid import uuid4

from app.config import get_settings
from app.utils.logging import get_logger
from fastapi import Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

logger = get_logger("middleware")


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for request/response logging."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate request ID
        request_id = str(uuid4())
        request.state.request_id = request_id

        # Log request
        start_time = time.time()
        logger.info(
            "Request started",
            extra={
                "request_id": request_id,
                "method": request.method,
                "url": str(request.url),
                "client_ip": request.client.host if request.client else None,
            }
        )

        # Process request
        response = await call_next(request)

        # Log response
        process_time = time.time() - start_time
        logger.info(
            "Request completed",
            extra={
                "request_id": request_id,
                "status_code": response.status_code,
                "process_time": f"{process_time:.4f}s",
            }
        )

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware for adding security headers."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        return response


def setup_middleware(app):
    """Set up all middleware for the application."""
    settings = get_settings()

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )

    # Gzip compression
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Request logging (last, so it captures everything)
    app.add_middleware(LoggingMiddleware)

    # Rate limiting
    from .rate_limit import setup_rate_limiting
    setup_rate_limiting(app)


__all__ = [
    "LoggingMiddleware",
    "SecurityHeadersMiddleware",
    "setup_middleware",
]
