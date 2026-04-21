"""
Main API v1 router for Scribely.
"""

from app.api.v1 import (
    auth,
    calendar,
    chat,
    contacts,
    deals,
    health,
    integrations,
    meetings,
    metrics,
    push,
    rules,
)
from fastapi import APIRouter

api_router = APIRouter(prefix="/v1")

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_router.include_router(deals.router, prefix="/deals", tags=["deals"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(meetings.router, prefix="/meetings", tags=["meetings"])
api_router.include_router(metrics.router, prefix="/metrics", tags=["metrics", "monitoring"])
api_router.include_router(push.router, prefix="/push", tags=["push"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
api_router.include_router(rules.router, prefix="/rules", tags=["rules"])
