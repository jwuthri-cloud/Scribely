"""
Chat endpoints for LLM interactions with LangChain + OpenRouter.

Supports both synchronous and streaming responses.
Rate limited to prevent abuse.
Protected by circuit breaker to handle LLM API failures gracefully.
"""

import json
import uuid
from typing import AsyncGenerator, Optional

from app.infrastructure.circuit_breaker import (
    CircuitBreakerOpenError,
    get_llm_circuit_breaker,
)
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.middleware.rate_limit import RateLimits, limiter
from app.security.clerk_auth import ClerkUser, require_current_user
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

logger = get_logger("chat_api")

router = APIRouter()


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str = Field(..., min_length=1, description="User message")
    model: Optional[str] = Field("openai/gpt-4o-mini", description="OpenRouter model name")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="Model temperature")
    session_id: Optional[str] = Field(None, description="Session ID for grouping related traces in Langfuse")


class ChatResponse(BaseModel):
    """Chat response model."""
    response: str = Field(..., description="AI response")
    model_used: str = Field(..., description="Model that was used")


@router.post("/", response_model=ChatResponse)
@limiter.limit(RateLimits.CHAT)
async def chat(
    request: Request,
    request_body: ChatRequest,
    current_user: ClerkUser = Depends(require_current_user),
) -> ChatResponse:
    """
    Send a message to the LLM and get a response.
    
    Requires Clerk authentication. Uses LangChain with OpenRouter.
    No session storage - stateless conversation.
    """
    # Get circuit breaker for LLM calls
    circuit_breaker = get_llm_circuit_breaker()

    try:
        logger.info(f"Chat request from user {current_user.id}: {request_body.message[:50]}...")

        # Initialize OpenRouter provider
        provider = OpenRouterProvider()

        # Get LLM instance
        llm = provider.get_llm(
            model_name=request_body.model,
            temperature=request_body.temperature
        )

        # Create LangChain chain
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant. Provide clear, concise, and accurate responses."),
            ("user", "{input}")
        ])

        chain = prompt | llm | StrOutputParser()

        # Build Langfuse config with filtering attributes for easy filtering in Langfuse
        # session_id groups related traces, user_id enables user-level filtering
        langfuse_config = get_langfuse_config(
            session_id=request_body.session_id or str(uuid.uuid4()),
            user_id=current_user.id,
            tags=["chat", "api"],
            metadata={
                "model": request_body.model,
                "temperature": request_body.temperature,
            },
        )

        # Invoke chain with Langfuse config, protected by circuit breaker
        async def invoke_llm():
            return await chain.ainvoke(
                {"input": request_body.message},
                config=langfuse_config
            )

        response_text = await circuit_breaker.call(invoke_llm)

        logger.info(f"Chat response generated successfully for user {current_user.id}")

        return ChatResponse(
            response=response_text,
            model_used=request_body.model
        )

    except CircuitBreakerOpenError as e:
        logger.warning(f"Circuit breaker open for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Service temporarily unavailable. Please retry after {e.retry_after:.0f} seconds.",
            headers={"Retry-After": str(int(e.retry_after))}
        )
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process chat request")


class StreamingChatRequest(BaseModel):
    """Chat request model for streaming endpoint."""
    message: str = Field(..., min_length=1, description="User message")
    model: Optional[str] = Field("openai/gpt-4o-mini", description="OpenRouter model name")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="Model temperature")
    session_id: Optional[str] = Field(None, description="Session ID for grouping related traces")


@router.post("/stream")
@limiter.limit(RateLimits.STREAMING)
async def chat_stream(
    request: Request,
    request_body: StreamingChatRequest,
    current_user: ClerkUser = Depends(require_current_user),
) -> StreamingResponse:
    """
    Send a message to the LLM and stream the response using Server-Sent Events (SSE).

    Requires Clerk authentication. Uses LangChain with OpenRouter.

    The response is streamed as SSE events:
    - `data: {"content": "token", "done": false}` - Content chunk
    - `data: {"content": "", "done": true, "model": "model_name"}` - Stream complete
    - `data: {"error": "message"}` - Error occurred

    Example client code:
    ```javascript
    const eventSource = new EventSource('/api/v1/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' })
    });
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.done) {
        eventSource.close();
      } else {
        console.log(data.content);
      }
    };
    ```
    """
    # Get circuit breaker for LLM calls
    circuit_breaker = get_llm_circuit_breaker()

    # Check circuit breaker state before starting stream
    # (We check early to avoid starting a stream that will immediately fail)
    if circuit_breaker.state.value == "open":
        retry_after = circuit_breaker.config.timeout
        if circuit_breaker.stats.opened_at:
            import time
            elapsed = time.time() - circuit_breaker.stats.opened_at
            retry_after = max(0, circuit_breaker.config.timeout - elapsed)
        raise HTTPException(
            status_code=503,
            detail=f"Service temporarily unavailable. Please retry after {retry_after:.0f} seconds.",
            headers={"Retry-After": str(int(retry_after))}
        )

    async def generate_stream() -> AsyncGenerator[str, None]:
        """Generate SSE events from LLM stream."""
        try:
            logger.info(f"Streaming chat request from user {current_user.id}: {request_body.message[:50]}...")

            # Initialize OpenRouter provider
            provider = OpenRouterProvider()

            # Get LLM instance
            llm = provider.get_llm(
                model_name=request_body.model,
                temperature=request_body.temperature
            )

            # Create LangChain chain
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a helpful assistant. Provide clear, concise, and accurate responses."),
                ("user", "{input}")
            ])

            chain = prompt | llm | StrOutputParser()

            # Build Langfuse config
            langfuse_config = get_langfuse_config(
                session_id=request_body.session_id or str(uuid.uuid4()),
                user_id=current_user.id,
                tags=["chat", "api", "streaming"],
                metadata={
                    "model": request_body.model,
                    "temperature": request_body.temperature,
                    "streaming": True,
                },
            )

            # Stream the response with circuit breaker tracking
            # Note: For streaming, we track success/failure at the stream level
            full_response = ""
            chunk_count = 0

            try:
                async for chunk in chain.astream(
                    {"input": request_body.message},
                    config=langfuse_config
                ):
                    chunk_count += 1
                    full_response += chunk
                    # Yield SSE event with content chunk
                    event_data = json.dumps({"content": chunk, "done": False})
                    yield f"data: {event_data}\n\n"

                # Stream completed successfully - record success
                await circuit_breaker._record_success()

                # Send completion event
                completion_data = json.dumps({
                    "content": "",
                    "done": True,
                    "model": request_body.model,
                    "total_length": len(full_response)
                })
                yield f"data: {completion_data}\n\n"

                logger.info(f"Streaming chat completed for user {current_user.id}")

            except Exception as stream_error:
                # Record failure in circuit breaker
                await circuit_breaker._record_failure(stream_error)
                raise

        except CircuitBreakerOpenError as e:
            logger.warning(f"Circuit breaker open during stream for user {current_user.id}: {e}")
            error_data = json.dumps({
                "error": f"Service temporarily unavailable. Retry after {e.retry_after:.0f} seconds.",
                "retry_after": int(e.retry_after)
            })
            yield f"data: {error_data}\n\n"

        except ValueError as e:
            logger.error(f"Configuration error in stream: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

        except Exception as e:
            logger.error(f"Error in streaming chat: {e}", exc_info=True)
            error_data = json.dumps({"error": "Failed to process chat request"})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
