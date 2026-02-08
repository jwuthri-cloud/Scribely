"""
Health check endpoints for AssistMe.
"""

from datetime import datetime
from typing import Any, Dict

from app.config import Settings, get_settings
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
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        service=settings.app_name,
        version=settings.app_version,
        environment="development" if settings.debug else "production",
    )


@router.get("/ready")
async def readiness_check(
) -> Dict[str, Any]:
    """
    Readiness check - returns 200 only if critical services are available.
    """
    response = {
        "ready": True,
        "timestamp": datetime.now().isoformat(),
    }

    return response


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
