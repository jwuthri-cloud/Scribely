"""
Chat endpoints powered by AssistantAgent (tools + Composio integrations).

Supports both synchronous and streaming responses.
Rate limited to prevent abuse. Protected by circuit breaker.
"""

import json
import uuid
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.agents.assistant import AssistantAgent
from app.database.session import get_async_db_session
from app.infrastructure.circuit_breaker import (
    CircuitBreakerOpenError,
    get_llm_circuit_breaker,
)
from app.infrastructure.llm_provider import get_chat_provider
from app.middleware.rate_limit import RateLimits, limiter
from app.model_name import get_chat_model_catalog
from app.security.clerk_auth import ClerkUser, require_current_user
from app.utils.logging import get_logger

logger = get_logger("chat_api")

router = APIRouter()


# ---------------------------------------------------------------------------
# Models catalog
# ---------------------------------------------------------------------------


class ChatModelItem(BaseModel):
    id: str
    label: str
    description: str
    provider: str


class ChatModelsResponse(BaseModel):
    models: list[ChatModelItem]
    default_model: str


@router.get("/models", response_model=ChatModelsResponse)
async def list_chat_models() -> ChatModelsResponse:
    """Return allowed chat models. No auth — IDs are public."""
    catalog, default_model = get_chat_model_catalog()
    return ChatModelsResponse(
        models=[ChatModelItem(**entry) for entry in catalog],
        default_model=default_model,
    )


# ---------------------------------------------------------------------------
# Shared request/response models
# ---------------------------------------------------------------------------


def _validate_model(v: Optional[str]) -> str:
    catalog, default_model = get_chat_model_catalog()
    m = v if v is not None else default_model
    if m not in {entry["id"] for entry in catalog}:
        raise ValueError(f"Unsupported model {m!r}.")
    return m


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    model: Optional[str] = Field(None, validate_default=True)
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    session_id: Optional[str] = Field(None)

    @field_validator("model")
    @classmethod
    def validate_model_id(cls, v):
        return _validate_model(v)


class ChatResponse(BaseModel):
    response: str
    model_used: str


class StreamingChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    model: Optional[str] = Field(None, validate_default=True)
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    session_id: Optional[str] = Field(None)

    @field_validator("model")
    @classmethod
    def validate_model_id(cls, v):
        return _validate_model(v)


# ---------------------------------------------------------------------------
# POST /chat — standard response
# ---------------------------------------------------------------------------


@router.post("/", response_model=ChatResponse)
@limiter.limit(RateLimits.CHAT)
async def chat(
    request: Request,
    request_body: ChatRequest,
    current_user: ClerkUser = Depends(require_current_user),
    db: AsyncSession = Depends(get_async_db_session),
) -> ChatResponse:
    """Send a message to the AssistantAgent and get a structured response."""
    circuit_breaker = get_llm_circuit_breaker()

    try:
        logger.info(
            f"Chat request from user {current_user.id}: {request_body.message[:50]}..."
        )

        provider = get_chat_provider()
        agent = await AssistantAgent.create(
            llm_provider=provider,
            db=db,
            user_id=current_user.id,
            model_name=request_body.model,
            temperature=request_body.temperature,
        )

        try:

            async def invoke():
                return await agent.handle_message(
                    message=request_body.message,
                    user_id=current_user.id,
                    session_id=request_body.session_id or str(uuid.uuid4()),
                    tags=["chat", "api"],
                )

            result = await circuit_breaker.call(invoke)
        finally:
            await agent.close()

        return ChatResponse(response=result.response, model_used=request_body.model)

    except CircuitBreakerOpenError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Service temporarily unavailable. Retry after {e.retry_after:.0f}s.",
            headers={"Retry-After": str(int(e.retry_after))},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process chat request")


# ---------------------------------------------------------------------------
# POST /chat/stream — SSE streaming
# ---------------------------------------------------------------------------


@router.post("/stream")
@limiter.limit(RateLimits.STREAMING)
async def chat_stream(
    request: Request,
    request_body: StreamingChatRequest,
    current_user: ClerkUser = Depends(require_current_user),
    db: AsyncSession = Depends(get_async_db_session),
) -> StreamingResponse:
    """
    Stream AssistantAgent response as SSE.

    Events:
    - `data: {"content": "token", "done": false}` — partial content
    - `data: {"content": "", "done": true, "model": "..."}` — stream complete
    - `data: {"error": "..."}` — error
    """
    circuit_breaker = get_llm_circuit_breaker()

    if circuit_breaker.state.value == "open":
        import time

        elapsed = time.time() - (circuit_breaker.stats.opened_at or 0)
        retry_after = max(0, circuit_breaker.config.timeout - elapsed)
        raise HTTPException(
            status_code=503,
            detail=f"Service temporarily unavailable. Retry after {retry_after:.0f}s.",
            headers={"Retry-After": str(int(retry_after))},
        )

    async def generate_stream() -> AsyncGenerator[str, None]:
        try:
            logger.info(
                f"Streaming chat from user {current_user.id}: {request_body.message[:50]}..."
            )

            provider = get_chat_provider()
            agent = await AssistantAgent.create(
                llm_provider=provider,
                db=db,
                user_id=current_user.id,
                model_name=request_body.model,
                temperature=request_body.temperature,
            )

            full_response = ""
            try:
                async for partial in agent.handle_message_stream(
                    message=request_body.message,
                    user_id=current_user.id,
                    session_id=request_body.session_id or str(uuid.uuid4()),
                    tags=["chat", "api", "streaming"],
                ):
                    chunk = partial.response[len(full_response) :]
                    full_response = partial.response
                    if chunk:
                        yield f"data: {json.dumps({'content': chunk, 'done': False})}\n\n"

                await circuit_breaker._record_success()
                yield f"data: {json.dumps({'content': '', 'done': True, 'model': request_body.model})}\n\n"
                logger.info(f"Streaming complete for user {current_user.id}")

            except Exception as stream_error:
                await circuit_breaker._record_failure(stream_error)
                raise
            finally:
                await agent.close()

        except CircuitBreakerOpenError as e:
            yield f"data: {json.dumps({'error': f'Service unavailable. Retry after {e.retry_after:.0f}s.'})}\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': 'Failed to process chat request'})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
