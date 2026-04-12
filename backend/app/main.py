"""
Scribely - FastAPI Backend
A FastAPI + Next.js AI agent application with OpenRouter
"""

import asyncio
from contextlib import asynccontextmanager

import uvicorn
from app.api.v1.router import api_router
from app.config import get_settings
from app.database.session import cleanup_database, initialize_database
from app.exceptions import setup_exception_handlers
from app.infrastructure.langfuse_handler import flush_langfuse, shutdown_langfuse
from app.middleware import setup_middleware
from app.models.base import APIInfo
from app.services.calendar_reminder_loop import calendar_reminder_loop
from app.services.calendar_webhook_renewal import calendar_webhook_renewal_loop
from app.services.task_runner import recover_interrupted_processing_tasks
from fastapi import FastAPI
from app.utils.logging import get_logger

logger = get_logger("main")

# Get settings
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    stop_renewal = asyncio.Event()
    renewal_task: asyncio.Task | None = None
    reminder_task: asyncio.Task | None = None
    try:
        await initialize_database()
        logger.info("Database initialized successfully")
        n_recovered = await recover_interrupted_processing_tasks()
        if n_recovered:
            logger.info("Re-queued %s meeting processing job(s) from persisted state", n_recovered)
        renewal_task = asyncio.create_task(calendar_webhook_renewal_loop(stop_renewal))
        reminder_task = asyncio.create_task(calendar_reminder_loop(stop_renewal))
        yield
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        raise
    finally:
        if renewal_task is not None or reminder_task is not None:
            stop_renewal.set()
            for t in (renewal_task, reminder_task):
                if t is not None:
                    t.cancel()
                    try:
                        await t
                    except asyncio.CancelledError:
                        pass
        try:
            flush_langfuse()
            shutdown_langfuse()
            await cleanup_database()
            logger.info("Database cleaned up successfully")
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title=f"{settings.app_name} API",
    description="A FastAPI + Next.js AI agent application with OpenRouter",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# Setup middleware
setup_middleware(app)

# Setup exception handlers
setup_exception_handlers(app)

# Include API routes
app.include_router(api_router, prefix="/api")

# Root endpoint
@app.get("/", response_model=APIInfo)
async def root() -> APIInfo:
    """Root endpoint with API information."""
    return APIInfo(
        name=f"{settings.app_name} API",
        version=settings.app_version,
        description="A FastAPI + Next.js AI agent application with OpenRouter",
        docs_url="/docs",
        health_url="/api/v1/health"
    )


# Legacy health endpoint (redirect to v1)
@app.get("/health")
async def health_redirect():
    """Legacy health endpoint - redirects to v1."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/api/v1/health")


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
