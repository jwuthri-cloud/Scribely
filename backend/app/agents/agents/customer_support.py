"""Customer support agent using LangChain's create_agent."""
import json
from typing import AsyncGenerator, Callable, Optional

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.prompt.customer_support import SYSTEM_PROMPT
from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.agents.tool.customer_support import CUSTOMER_SUPPORT_TOOLS
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger
from app.utils.structured_streaming import (
    StructuredStreamingHandler,
    parse_response_model_str,
)

logger = get_logger("customer_support_agent")


class CustomerSupportAgent:
    """
    Customer support agent using LangChain's create_agent.
    
    This agent handles customer inquiries, provides helpful responses,
    and can escalate issues when necessary.
    """

    def __init__(
        self,
        llm_provider: OpenRouterProvider,
        model_name: str = "openai/gpt-4o-mini",
        temperature: float = 0.7,
    ):
        """
        Initialize customer support agent.

        Args:
            llm_provider: OpenRouter provider instance
            model_name: Model name for the agent
            temperature: Model temperature (default: 0.7)
        """
        self.llm_provider = llm_provider
        self.model_name = model_name
        self.temperature = temperature

        # Get LLM instance (Langfuse automatically enabled if configured)
        self.llm = llm_provider.get_llm(
            model_name=model_name,
            temperature=temperature
        )

        # Create agent with structured output and tools
        self.agent = create_agent(
            model=self.llm,
            system_prompt=SYSTEM_PROMPT,
            tools=CUSTOMER_SUPPORT_TOOLS,
            response_format=CustomerSupportResponse,
        )

        logger.info(f"[CustomerSupportAgent] Initialized with model: {model_name}")

    async def handle_inquiry(
        self,
        customer_message: str,
        customer_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> CustomerSupportResponse:
        """
        Handle a customer inquiry.

        Args:
            customer_message: The customer's message or question
            customer_id: Optional customer ID for tracking
            session_id: Optional session ID for grouping related conversations
            tags: Optional tags for filtering in Langfuse
            metadata: Optional metadata for additional context

        Returns:
            CustomerSupportResponse with structured response
        """
        # Build Langfuse config with filtering attributes
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=customer_id,
            tags=tags or ["customer-support"],
            metadata={
                "agent_type": "customer_support",
                "model": self.model_name,
                **(metadata or {})
            },
            run_name="customer-support-inquiry"
        )

        # Invoke agent with Langfuse config
        result = await self.agent.ainvoke(
            {"messages": [HumanMessage(content=customer_message)]},
            config=langfuse_config
        )

        # Extract structured response with error handling
        try:
            if isinstance(result, dict) and "structured_response" in result:
                response = result["structured_response"]
                
                # If it's already a CustomerSupportResponse instance, return as is
                if isinstance(response, CustomerSupportResponse):
                    support_response = response
                elif isinstance(response, dict):
                    # Convert dict to Pydantic model
                    support_response = CustomerSupportResponse(**response)
                else:
                    # Fallback for unexpected types
                    logger.warning(f"[CustomerSupportAgent] Unexpected response type: {type(response)}")
                    raise ValueError(f"Unexpected response type: {type(response)}")
                
                logger.info(
                    f"[CustomerSupportAgent] Response generated - "
                    f"Escalation: {support_response.requires_escalation}, "
                    f"Confidence: {support_response.confidence:.2f}"
                )
                
                return support_response
            else:
                # Fallback if structured response not available
                raise ValueError("Structured response not found in result")
        except Exception as e:
            # Fallback on any error
            logger.warning(f"[CustomerSupportAgent] Error processing response: {e}")
            return CustomerSupportResponse(
                response=str(result),
                sentiment="neutral",
                requires_escalation=False,
                confidence=0.5
            )

    async def handle_inquiry_stream(
        self,
        customer_message: str,
        customer_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> AsyncGenerator[CustomerSupportResponse, None]:
        """
        Handle a customer inquiry with streaming structured output.
        
        Uses stream_mode="messages" to get incremental LLM tokens and parses
        them into structured output incrementally.
        
        Yields incremental CustomerSupportResponse updates as fields arrive.
        
        Args:
            customer_message: The customer's message or question
            customer_id: Optional customer ID for tracking
            session_id: Optional session ID for grouping related conversations
            tags: Optional tags for filtering in Langfuse
            metadata: Optional metadata for additional context
            
        Yields:
            CustomerSupportResponse instances with incremental updates
        """
        # Build Langfuse config
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=customer_id,
            tags=tags or ["customer-support", "streaming"],
            metadata={
                "agent_type": "customer_support",
                "model": self.model_name,
                "streaming": True,
                **(metadata or {})
            },
            run_name="customer-support-inquiry-stream"
        )
        
        # Initialize streaming handler for incremental JSON parsing
        handler = StructuredStreamingHandler(CustomerSupportResponse)
        last_yielded: Optional[CustomerSupportResponse] = None
        
        # Reset tool tracking state
        self._in_target_tool = False
        self._should_reset_handler = False
        
        try:
            # Use stream_mode="messages" to get LLM tokens as they stream
            # This is the proper LangChain way per docs
            async for token, metadata_info in self.agent.astream(
                {"messages": [HumanMessage(content=customer_message)]},
                config=langfuse_config,
                stream_mode="messages"
            ):
                # Extract content from token - for structured output it's in tool_call_chunks
                content = self._extract_text_from_message(token)
                
                # Reset handler if we just started the target tool
                if getattr(self, "_should_reset_handler", False):
                    handler.reset()
                    self._should_reset_handler = False
                
                if content:
                    # Add to handler and try to parse incrementally
                    incremental_update = handler.add_chunk(content)
                    
                    if incremental_update is not None:
                        last_yielded = incremental_update
                        yield incremental_update
            
            # Yield final response if we have one and haven't yielded it yet
            final_response = handler.get_last_valid()
            if final_response is not None:
                if (
                    last_yielded is None
                    or final_response.model_dump() != last_yielded.model_dump()
                ):
                    yield final_response
            elif last_yielded is None:
                # Fallback: yield empty response
                logger.warning(
                    "[CustomerSupportAgent] No valid structured response parsed from stream"
                )
                yield CustomerSupportResponse(
                    response="",
                    sentiment="neutral",
                    requires_escalation=False,
                    confidence=0.5
                )
        except Exception as e:
            logger.error(f"[CustomerSupportAgent] Error in streaming: {e}", exc_info=True)
            # Yield fallback response
            yield CustomerSupportResponse(
                response="",
                sentiment="neutral",
                requires_escalation=False,
                confidence=0.5
            )

    async def handle_inquiry_stream_with_callback(
        self,
        customer_message: str,
        callback: Callable[[CustomerSupportResponse], None],
        customer_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> CustomerSupportResponse:
        """
        Handle a customer inquiry with streaming structured output using callback.
        
        Calls the callback function with incremental CustomerSupportResponse updates
        as fields arrive. Returns the final complete response.
        
        Args:
            customer_message: The customer's message or question
            callback: Function to call with each incremental update
            customer_id: Optional customer ID for tracking
            session_id: Optional session ID for grouping related conversations
            tags: Optional tags for filtering in Langfuse
            metadata: Optional metadata for additional context
            
        Returns:
            Final complete CustomerSupportResponse
        """
        final_response: Optional[CustomerSupportResponse] = None
        
        async for partial_response in self.handle_inquiry_stream(
            customer_message=customer_message,
            customer_id=customer_id,
            session_id=session_id,
            tags=tags,
            metadata=metadata,
        ):
            callback(partial_response)
            final_response = partial_response
        
        # Return final response or fallback
        if final_response is None:
            logger.warning(
                "[CustomerSupportAgent] No response received from stream"
            )
            final_response = CustomerSupportResponse(
                response="",
                sentiment="neutral",
                requires_escalation=False,
                confidence=0.5
            )
        
        return final_response

    def _extract_text_from_message(self, message, target_tool: str = "CustomerSupportResponse") -> Optional[str]:
        """
        Extract text content from a LangChain message chunk.
        
        Handles different provider formats:
        - Anthropic: Structured output comes through tool_call_chunks
        - OpenAI: Structured output comes through content directly
        
        IMPORTANT: For Anthropic, only extracts from the target tool (CustomerSupportResponse)
        to avoid mixing with other tool calls.
        
        Args:
            message: LangChain message object
            target_tool: Name of the tool to extract from
            
        Returns:
            Text content string or None
        """
        if message is None:
            return None
        
        # CASE 1: Anthropic-style - structured output in tool_call_chunks
        if hasattr(message, "tool_call_chunks") and message.tool_call_chunks:
            args_parts = []
            for tc in message.tool_call_chunks:
                name = tc.get("name", "")
                args = tc.get("args", "")
                
                # If this chunk has a name, check if it's our target tool
                if name:
                    if name == target_tool:
                        # Mark that we're now in the right tool call
                        self._in_target_tool = True
                        # Signal to reset the handler
                        self._should_reset_handler = True
                    else:
                        # Different tool, skip
                        self._in_target_tool = False
                
                # Only capture args if we're in the target tool
                if getattr(self, "_in_target_tool", False) and args:
                    args_parts.append(args)
            
            if args_parts:
                return "".join(args_parts)
        
        # CASE 2: OpenAI-style - structured output comes directly in content
        # OpenAI streams JSON directly without tool_call_chunks
        content = getattr(message, "content", None)
        if content and isinstance(content, str):
            # Check if this looks like JSON (structured output)
            # OpenAI streams JSON tokens directly
            stripped = content.strip()
            if stripped:
                # If we haven't seen tool_call_chunks, assume OpenAI-style
                # and the content IS the structured output
                if not getattr(self, "_in_target_tool", False):
                    # First content chunk - mark as in structured output mode
                    if stripped.startswith("{") or stripped.startswith('"'):
                        self._in_target_tool = True
                        self._should_reset_handler = True
                
                # If we're in OpenAI mode (no tool_call_chunks seen), return content
                if getattr(self, "_in_target_tool", False):
                    return content
        
        return None

    def _extract_content_from_chunk(self, chunk) -> any:
        """
        Extract content from LangChain streaming chunk.
        
        Smart extraction that handles:
        1. BaseModel instances (from structured output)
        2. Dicts (can be converted to BaseModel)
        3. Raw JSON strings (for incremental parsing)
        
        Args:
            chunk: Streaming chunk from LangChain agent
            
        Returns:
            BaseModel instance, dict, or string - whatever the handler can process
        """
        # Case 1: Already a BaseModel instance (best case - direct structured output)
        if isinstance(chunk, CustomerSupportResponse):
            return chunk
        
        # Case 2: Dict with structured_response key
        if isinstance(chunk, dict):
            if "structured_response" in chunk:
                structured = chunk["structured_response"]
                # Return as-is (handler will detect BaseModel or dict)
                if isinstance(structured, CustomerSupportResponse):
                    return structured
                elif isinstance(structured, dict):
                    return structured
                elif isinstance(structured, str):
                    return structured
            
            # Case 3: Dict with messages (raw content)
            if "messages" in chunk:
                messages = chunk["messages"]
                if isinstance(messages, list) and len(messages) > 0:
                    last_message = messages[-1]
                    if isinstance(last_message, AIMessage):
                        content = last_message.content
                        if isinstance(content, str):
                            return content
                        elif isinstance(content, list):
                            # Handle content blocks (e.g., from OpenAI)
                            text_parts = []
                            for block in content:
                                if isinstance(block, dict) and "text" in block:
                                    text_parts.append(block["text"])
                                elif isinstance(block, str):
                                    text_parts.append(block)
                            return "".join(text_parts)
            
            # Case 4: Direct content keys
            for key in ["content", "text", "response"]:
                if key in chunk:
                    value = chunk[key]
                    # Return dicts as-is, strings as strings
                    return value
        
        # Case 5: String (raw JSON)
        if isinstance(chunk, str):
            return chunk
        
        # Case 6: AIMessage directly
        if isinstance(chunk, AIMessage):
            content = chunk.content
            if isinstance(content, str):
                return content
            elif isinstance(content, list):
                text_parts = []
                for block in content:
                    if isinstance(block, dict) and "text" in block:
                        text_parts.append(block["text"])
                    elif isinstance(block, str):
                        text_parts.append(block)
                return "".join(text_parts)
        
        return None

    def handle_inquiry_sync(
        self,
        customer_message: str,
        customer_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> CustomerSupportResponse:
        """
        Handle a customer inquiry synchronously.

        Args:
            customer_message: The customer's message or question
            customer_id: Optional customer ID for tracking
            session_id: Optional session ID for grouping related conversations
            tags: Optional tags for filtering in Langfuse
            metadata: Optional metadata for additional context

        Returns:
            CustomerSupportResponse with structured response
        """
        # Build Langfuse config
        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=customer_id,
            tags=tags or ["customer-support"],
            metadata={
                "agent_type": "customer_support",
                "model": self.model_name,
                **(metadata or {})
            },
            run_name="customer-support-inquiry"
        )

        # Invoke agent synchronously
        result = self.agent.invoke(
            {"messages": [HumanMessage(content=customer_message)]},
            config=langfuse_config
        )

        # Extract structured response with error handling
        try:
            if isinstance(result, dict) and "structured_response" in result:
                response = result["structured_response"]
                
                # If it's already a CustomerSupportResponse instance, return as is
                if isinstance(response, CustomerSupportResponse):
                    return response
                elif isinstance(response, dict):
                    # Convert dict to Pydantic model
                    return CustomerSupportResponse(**response)
                else:
                    # Fallback for unexpected types
                    raise ValueError(f"Unexpected response type: {type(response)}")
            else:
                # Fallback if structured response not available
                raise ValueError("Structured response not found in result")
        except Exception as e:
            # Fallback on any error
            logger.warning(f"[CustomerSupportAgent] Error processing response: {e}")
            return CustomerSupportResponse(
                response=str(result),
                sentiment="neutral",
                requires_escalation=False,
                confidence=0.5
            )
