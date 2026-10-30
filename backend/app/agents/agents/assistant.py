"""Webapp assistant agent using LangChain's create_agent."""

import json
from typing import AsyncGenerator, Callable, Optional

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.prompt.assistant import SYSTEM_PROMPT
from app.agents.structured_output.assistant import AssistantResponse
from app.agents.tool.tools import build_tools
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import ChatProvider
from app.model_name import DEFAULT_TRAINING
from app.utils.logging import get_logger
from app.utils.structured_streaming import (
    StructuredStreamingHandler,
    parse_response_model_str,
)

logger = get_logger("assistant_agent")


class AssistantAgent:
    """
    General-purpose webapp assistant that can answer questions about meetings,
    search the web, interact with connected external apps, and more.
    """

    def __init__(
        self,
        llm_provider: ChatProvider,
        model_name: str = DEFAULT_TRAINING,
        temperature: float = 0.1,
    ):
        self.llm_provider = llm_provider
        self.model_name = model_name
        self.temperature = temperature
        self.llm = llm_provider.get_llm(
            model_name=model_name,
            temperature=temperature,
        )
        self.agent = None  # set by create()
        self._mcp_client = None  # kept alive for Composio tool calls

    @classmethod
    async def create(
        cls,
        llm_provider: ChatProvider,
        db: AsyncSession,
        user_id: str,
        model_name: str = DEFAULT_TRAINING,
        temperature: float = 0.1,
    ) -> "AssistantAgent":
        """
        Async factory — use instead of direct instantiation.

        Args:
            llm_provider: Web chat provider instance
            db: Async database session (scopes DB tools to this session)
            user_id: Authenticated user ID (scopes all tools to this user)
            model_name: Model name for the agent
            temperature: Model temperature (default: 0.1)
        """
        instance = cls(
            llm_provider=llm_provider, model_name=model_name, temperature=temperature
        )

        tools, mcp_client = await build_tools(user_id=user_id, db=db)
        instance._mcp_client = mcp_client  # must stay open until close() is called
        instance.agent = create_agent(
            model=instance.llm,
            system_prompt=SYSTEM_PROMPT,
            tools=tools,
            response_format=AssistantResponse,
        )

        logger.info(
            f"[AssistantAgent] Initialized with model: {model_name}, tools: {len(tools)}"
        )
        return instance

    async def close(self) -> None:
        """No-op — MultiServerMCPClient 0.1.0+ manages its own sessions per call."""
        self._mcp_client = None

    async def handle_message(
        self,
        message: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> AssistantResponse:
        """Handle a user message and return a structured response."""
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=user_id,
            tags=tags or ["assistant"],
            metadata={
                "agent_type": "assistant",
                "model": self.model_name,
                **(metadata or {}),
            },
            run_name="assistant-message",
        )

        result = await self.agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=langfuse_config,
        )

        try:
            if isinstance(result, dict) and "structured_response" in result:
                response = result["structured_response"]
                if isinstance(response, AssistantResponse):
                    return response
                elif isinstance(response, dict):
                    return AssistantResponse(**response)
                raise ValueError(f"Unexpected response type: {type(response)}")
            raise ValueError("Structured response not found in result")
        except Exception as e:
            logger.warning(f"[AssistantAgent] Error processing response: {e}")
            return AssistantResponse(
                response=str(result), sentiment="neutral", confidence=0.5
            )

    async def handle_message_stream(
        self,
        message: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> AsyncGenerator[AssistantResponse, None]:
        """Handle a user message with streaming structured output."""
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=user_id,
            tags=tags or ["assistant", "streaming"],
            metadata={
                "agent_type": "assistant",
                "model": self.model_name,
                "streaming": True,
                **(metadata or {}),
            },
            run_name="assistant-message-stream",
        )

        handler = StructuredStreamingHandler(AssistantResponse)
        last_yielded: Optional[AssistantResponse] = None
        self._in_target_tool = False
        self._should_reset_handler = False

        try:
            async for token, metadata_info in self.agent.astream(
                {"messages": [HumanMessage(content=message)]},
                config=langfuse_config,
                stream_mode="messages",
            ):
                content = self._extract_text_from_message(token)

                if getattr(self, "_should_reset_handler", False):
                    handler.reset()
                    self._should_reset_handler = False

                if content:
                    incremental_update = handler.add_chunk(content)
                    if incremental_update is not None:
                        last_yielded = incremental_update
                        yield incremental_update

            final_response = handler.get_last_valid()
            if final_response is not None:
                if (
                    last_yielded is None
                    or final_response.model_dump() != last_yielded.model_dump()
                ):
                    yield final_response
            elif last_yielded is None:
                yield AssistantResponse(
                    response="", sentiment="neutral", confidence=0.5
                )
        except Exception as e:
            logger.error(f"[AssistantAgent] Error in streaming: {e}", exc_info=True)
            yield AssistantResponse(response="", sentiment="neutral", confidence=0.5)

    async def handle_message_stream_with_callback(
        self,
        message: str,
        callback: Callable[[AssistantResponse], None],
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> AssistantResponse:
        """Handle a message with streaming and a callback for each incremental update."""
        final_response: Optional[AssistantResponse] = None
        async for partial in self.handle_message_stream(
            message=message,
            user_id=user_id,
            session_id=session_id,
            tags=tags,
            metadata=metadata,
        ):
            callback(partial)
            final_response = partial
        return final_response or AssistantResponse(
            response="", sentiment="neutral", confidence=0.5
        )

    def _extract_text_from_message(
        self, message, target_tool: str = "AssistantResponse"
    ) -> Optional[str]:
        """Extract streaming text from a LangChain message chunk (Anthropic or OpenAI style)."""
        if message is None:
            return None

        if hasattr(message, "tool_call_chunks") and message.tool_call_chunks:
            args_parts = []
            for tc in message.tool_call_chunks:
                name = tc.get("name", "")
                args = tc.get("args", "")
                if name:
                    if name == target_tool:
                        self._in_target_tool = True
                        self._should_reset_handler = True
                    else:
                        self._in_target_tool = False
                if getattr(self, "_in_target_tool", False) and args:
                    args_parts.append(args)
            if args_parts:
                return "".join(args_parts)

        content = getattr(message, "content", None)
        if content and isinstance(content, str):
            stripped = content.strip()
            if stripped and not getattr(self, "_in_target_tool", False):
                if stripped.startswith("{") or stripped.startswith('"'):
                    self._in_target_tool = True
                    self._should_reset_handler = True
            if getattr(self, "_in_target_tool", False):
                return content
        return None

    def handle_message_sync(
        self,
        message: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> AssistantResponse:
        """Handle a message synchronously."""
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=user_id,
            tags=tags or ["assistant"],
            metadata={
                "agent_type": "assistant",
                "model": self.model_name,
                **(metadata or {}),
            },
            run_name="assistant-message",
        )
        result = self.agent.invoke(
            {"messages": [HumanMessage(content=message)]},
            config=langfuse_config,
        )
        try:
            if isinstance(result, dict) and "structured_response" in result:
                response = result["structured_response"]
                if isinstance(response, AssistantResponse):
                    return response
                elif isinstance(response, dict):
                    return AssistantResponse(**response)
                raise ValueError(f"Unexpected response type: {type(response)}")
            raise ValueError("Structured response not found")
        except Exception as e:
            logger.warning(f"[AssistantAgent] Sync error: {e}")
            return AssistantResponse(
                response=str(result), sentiment="neutral", confidence=0.5
            )
