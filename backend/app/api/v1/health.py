"""
Health check endpoints for Scribely.
"""

from datetime import datetime
from typing import Any, Dict

from app.config import Settings, get_settings
from app.database.session import get_database_manager
from app.infrastructure.circuit_breaker import get_circuit_breaker_stats
from app.models.base import HealthResponse
from fastapi import APIRouter, Depends

router = APIRouter()


@router.get("/", response_model=HealthResponse)
async def health_check(
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """
    Health check for the application.
    """
    db_manager = get_database_manager()
    db_healthy = await db_manager.health_check()
    services = {"database": "healthy" if db_healthy else "unhealthy"}

    return HealthResponse(
        status="healthy" if db_healthy else "unhealthy",
        timestamp=datetime.now().isoformat(),
        service=settings.app_name,
        version=settings.app_version,
        environment="development" if settings.debug else "production",
        services=services,
    )


@router.get("/database")
async def database_health_check() -> Dict[str, Any]:
    """
    Database-specific health check.
    """
    db_manager = get_database_manager()
    healthy = await db_manager.health_check()
    return {
        "service": "database",
        "status": "healthy" if healthy else "unhealthy",
        "timestamp": datetime.now().isoformat(),
    }


async def _redis_ready(settings: Settings) -> bool:
    """Ping Redis when rate limiting / production expects it."""
    if not (settings.redis_enabled and settings.redis_url):
        return True
    try:
        import redis.asyncio as redis_async

        client = redis_async.from_url(settings.redis_url, decode_responses=True)
        try:
            await client.ping()
            return True
        finally:
            await client.aclose()
    except Exception:
        return False


@router.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check - returns 200 only if critical services are available.
    """
    from fastapi.responses import JSONResponse

    settings = get_settings()
    db_manager = get_database_manager()
    db_ready = await db_manager.health_check()
    redis_ready = await _redis_ready(settings)
    redis_required = bool(settings.redis_enabled and settings.redis_url)
    overall_ready = db_ready and (redis_ready if redis_required else True)

    services: Dict[str, Any] = {"database": db_ready}
    if redis_required:
        services["redis"] = redis_ready

    payload = {
        "ready": overall_ready,
        "timestamp": datetime.now().isoformat(),
        "services": services,
    }
    return JSONResponse(
        content=payload,
        status_code=200 if overall_ready else 503,
    )


@router.get("/live")
async def liveness_check() -> Dict[str, Any]:
    """
    Liveness check - basic health check that always returns 200 if the app is running.
    """
    return {
        "alive": True,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/circuits")
async def circuit_breaker_status() -> Dict[str, Any]:
    """
    Get status of all circuit breakers.

    Returns the state and statistics for each registered circuit breaker.
    Useful for monitoring and debugging service health.

    States:
    - closed: Normal operation, requests pass through
    - open: Too many failures, requests are blocked
    - half_open: Testing recovery, limited requests allowed
    """
    stats = get_circuit_breaker_stats()

    # Calculate overall health
    open_circuits = [
        name for name, s in stats.items()
        if s.get("state") == "open"
    ]

    return {
        "timestamp": datetime.now().isoformat(),
        "healthy": len(open_circuits) == 0,
        "open_circuits": open_circuits,
        "circuit_breakers": stats
    }
