"""
Base agent class for Scribely.

All agents should inherit from BaseAgent and implement the required methods.
Protected by circuit breaker for resilient LLM calls.
"""

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, Generic, List, Optional, TypeVar

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app.infrastructure.circuit_breaker import (
    CircuitBreakerOpenError,
    get_llm_circuit_breaker,
)
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.model_name import DEFAULT_TRAINING
from app.utils.logging import get_logger

logger = get_logger("base_agent")

# Generic type for structured output
T = TypeVar("T", bound=BaseModel)


class AgentConfig(BaseModel):
    """Configuration for an agent."""

    model_name: str = DEFAULT_TRAINING
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    fallback_models: List[str] = []


class AgentContext(BaseModel):
    """Context passed to agent invocations."""

    user_id: Optional[str] = None
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


class BaseAgent(ABC, Generic[T]):
    """
    Abstract base class for all agents.

    All agents must implement:
    - `name`: The agent's unique name
    - `description`: A description of what the agent does
    - `system_prompt`: The system prompt for the agent
    - `response_model`: The Pydantic model for structured output
    - `tools`: List of tools available to the agent

    Example:
    ```python
    @AgentRegistry.register("customer_support")
    class CustomerSupportAgent(BaseAgent[CustomerSupportResponse]):
        name = "customer_support"
        description = "Handles customer inquiries and support tickets"
        system_prompt = "You are a helpful customer support agent..."
        response_model = CustomerSupportResponse
        tools = [search_kb, create_ticket]
    ```
    """

    # Class attributes to be defined by subclasses
    name: str
    description: str
    system_prompt: str
    response_model: type[T]
    tools: List[Any] = []

    def __init__(
        self,
        llm_provider: Optional[OpenRouterProvider] = None,
        config: Optional[AgentConfig] = None,
    ):
        """
        Initialize the agent.

        Args:
            llm_provider: OpenRouter provider instance. Creates one if not provided.
            config: Agent configuration. Uses defaults if not provided.
        """
        self.config = config or AgentConfig()
        self.llm_provider = llm_provider or OpenRouterProvider()

        # Get LLM instance
        self.llm = self.llm_provider.get_llm(
            model_name=self.config.model_name, temperature=self.config.temperature
        )

        # Create LangChain agent
        self._agent = create_agent(
            model=self.llm,
            system_prompt=self.system_prompt,
            tools=self.tools,
            response_format=self.response_model,
        )

        logger.info(f"[{self.name}] Initialized with model: {self.config.model_name}")

    def _get_langfuse_config(self, context: AgentContext) -> Dict[str, Any]:
        """Build Langfuse configuration from context."""
        return get_langfuse_config(
            session_id=context.session_id,
            user_id=context.user_id,
            tags=[self.name, *context.tags],
            metadata={
                "agent_name": self.name,
                "model": self.config.model_name,
                "conversation_id": context.conversation_id,
                **context.metadata,
            },
            run_name=f"{self.name}-invocation",
        )

    @abstractmethod
    def _process_response(self, result: Dict[str, Any]) -> T:
        """
        Process the raw response from the agent into the response model.

        Override this method if you need custom response processing.

        Args:
            result: Raw result from LangChain agent

        Returns:
            Structured response of type T
        """
        pass

    async def invoke(
        self,
        message: str,
        context: Optional[AgentContext] = None,
        use_circuit_breaker: bool = True,
    ) -> T:
        """
        Invoke the agent with a message.

        Args:
            message: User message
            context: Agent context with user/session info
            use_circuit_breaker: Whether to use circuit breaker protection

        Returns:
            Structured response of type T

        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        context = context or AgentContext()
        langfuse_config = self._get_langfuse_config(context)

        logger.debug(f"[{self.name}] Invoking with message: {message[:50]}...")

        async def invoke_llm():
            return await self._agent.ainvoke(
                {"messages": [HumanMessage(content=message)]}, config=langfuse_config
            )

        # Execute with or without circuit breaker
        if use_circuit_breaker:
            circuit_breaker = get_llm_circuit_breaker()
            result = await circuit_breaker.call(invoke_llm)
        else:
            result = await invoke_llm()

        response = self._process_response(result)
        logger.info(f"[{self.name}] Response generated successfully")

        return response

    async def invoke_stream(
        self,
        message: str,
        context: Optional[AgentContext] = None,
        use_circuit_breaker: bool = True,
    ) -> AsyncGenerator[T, None]:
        """
        Invoke the agent with streaming output.

        Yields incremental responses as they are generated.
        Protected by circuit breaker - tracks success/failure at stream completion.

        Args:
            message: User message
            context: Agent context
            use_circuit_breaker: Whether to use circuit breaker protection

        Yields:
            Partial structured responses of type T

        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        context = context or AgentContext()
        langfuse_config = self._get_langfuse_config(context)

        logger.debug(f"[{self.name}] Streaming invocation: {message[:50]}...")

        # Check circuit breaker before starting stream
        circuit_breaker = get_llm_circuit_breaker() if use_circuit_breaker else None
        if circuit_breaker and circuit_breaker.state.value == "open":
            import time

            retry_after = circuit_breaker.config.timeout
            if circuit_breaker.stats.opened_at:
                elapsed = time.time() - circuit_breaker.stats.opened_at
                retry_after = max(0, circuit_breaker.config.timeout - elapsed)
            raise CircuitBreakerOpenError(circuit_breaker.name, retry_after)

        # Import streaming handler
        from app.utils.structured_streaming import StructuredStreamingHandler

        handler = StructuredStreamingHandler(self.response_model)

        try:
            async for token, metadata in self._agent.astream(
                {"messages": [HumanMessage(content=message)]},
                config=langfuse_config,
                stream_mode="messages",
            ):
                content = self._extract_content_from_stream(token)
                if content:
                    partial = handler.add_chunk(content)
                    if partial is not None:
                        yield partial

            # Stream completed successfully
            if circuit_breaker:
                await circuit_breaker._record_success()

            # Yield final response
            final = handler.get_last_valid()
            if final is not None:
                yield final

        except Exception as e:
            # Record failure in circuit breaker
            if circuit_breaker:
                await circuit_breaker._record_failure(e)
            raise

    def _extract_content_from_stream(self, message: Any) -> Optional[str]:
        """Extract text content from streaming message."""
        if message is None:
            return None

        # Handle tool_call_chunks (Anthropic style)
        if hasattr(message, "tool_call_chunks") and message.tool_call_chunks:
            for tc in message.tool_call_chunks:
                args = tc.get("args", "")
                if args:
                    return args

        # Handle direct content (OpenAI style)
        content = getattr(message, "content", None)
        if content and isinstance(content, str):
            return content

        return None

    def invoke_sync(
        self,
        message: str,
        context: Optional[AgentContext] = None,
        use_circuit_breaker: bool = True,
    ) -> T:
        """
        Synchronous version of invoke.

        Args:
            message: User message
            context: Agent context
            use_circuit_breaker: Whether to use circuit breaker protection

        Returns:
            Structured response of type T

        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        import asyncio

        context = context or AgentContext()
        langfuse_config = self._get_langfuse_config(context)

        def invoke_llm():
            return self._agent.invoke(
                {"messages": [HumanMessage(content=message)]}, config=langfuse_config
            )

        # For sync version, we wrap in async and run
        if use_circuit_breaker:
            circuit_breaker = get_llm_circuit_breaker()

            async def async_invoke():
                return await circuit_breaker.call(invoke_llm)

            result = asyncio.get_event_loop().run_until_complete(async_invoke())
        else:
            result = invoke_llm()

        return self._process_response(result)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(name={self.name}, model={self.config.model_name})>"


class SimpleAgent(BaseAgent[T]):
    """
    A simple agent implementation with default response processing.

    Use this as a base when you don't need custom response processing.
    """

    def _process_response(self, result: Dict[str, Any]) -> T:
        """Default response processing."""
        if isinstance(result, dict) and "structured_response" in result:
            response = result["structured_response"]

            if isinstance(response, self.response_model):
                return response
            elif isinstance(response, dict):
                return self.response_model(**response)

        # Fallback - create minimal response
        logger.warning(f"[{self.name}] Unexpected response format, creating fallback")
        raise ValueError(f"Could not process response: {result}")


__all__ = [
    "BaseAgent",
    "SimpleAgent",
    "AgentConfig",
    "AgentContext",
    "CircuitBreakerOpenError",
]
