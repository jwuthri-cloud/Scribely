"""
Middleware package for Scribely.
"""

import time
from uuid import uuid4

from app.config import get_settings
from app.utils.logging import get_logger
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.datastructures import MutableHeaders, URL
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

logger = get_logger("middleware")


class LoggingMiddleware:
    """
    Request/response logging + X-Request-ID.

    Implemented as pure ASGI middleware (not BaseHTTPMiddleware) so streaming
    responses and edge cases do not trigger Starlette's "No response returned."
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid4())
        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id

        start_time = time.time()
        url = URL(scope=scope)
        client = scope.get("client")
        client_ip = client[0] if client else None

        logger.info(
            "Request started",
            extra={
                "request_id": request_id,
                "method": scope.get("method", ""),
                "url": str(url),
                "client_ip": client_ip,
            },
        )

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                process_time = time.time() - start_time
                logger.info(
                    "Request completed",
                    extra={
                        "request_id": request_id,
                        "status_code": message["status"],
                        "process_time": f"{process_time:.4f}s",
                    },
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)

        if not response_started:
            logger.warning(
                "ASGI app finished without http.response.start",
                extra={"request_id": request_id, "path": scope.get("path")},
            )


class SecurityHeadersMiddleware:
    """Add security headers via pure ASGI (avoids BaseHTTPMiddleware pitfalls)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["X-XSS-Protection"] = "1; mode=block"
            await send(message)

        await self.app(scope, receive, send_wrapper)


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

    # Railway / reverse proxies terminate TLS and set X-Forwarded-Proto. Without this,
    # trailing-slash redirects use http:// in Location — browsers block that from https pages
    # (mixed content), surfacing as "Failed to fetch" for API calls.
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")


__all__ = [
    "LoggingMiddleware",
    "SecurityHeadersMiddleware",
    "setup_middleware",
]
