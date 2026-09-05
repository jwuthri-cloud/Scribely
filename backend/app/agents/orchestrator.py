"""
Agent orchestrator for Scribely.

Provides multi-agent coordination, routing, and pipeline execution.
Protected by circuit breaker for resilient LLM calls.
"""

from typing import Any, Dict, List, Optional, Tuple

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.agents.base import AgentConfig, AgentContext
from app.agents.registry import AgentRegistry, create_agent
from app.infrastructure.circuit_breaker import (
    CircuitBreakerOpenError,
    get_llm_circuit_breaker,
)
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.model_name import DEFAULT_TRAINING
from app.utils.logging import get_logger

logger = get_logger("agent_orchestrator")


class RoutingDecision(BaseModel):
    """Result of routing a message to an agent."""

    agent_name: str = Field(..., description="Name of the agent to route to")
    reasoning: str = Field(..., description="Brief reason for the routing decision")


class HandoffContext(BaseModel):
    """Context passed during agent handoff."""

    from_agent: str
    to_agent: str
    conversation_summary: str
    handoff_reason: str
    metadata: Dict[str, Any] = {}


class PipelineResult(BaseModel):
    """Result from a pipeline execution."""

    stages: List[Dict[str, Any]]
    final_output: Any
    total_duration_ms: int
    success: bool
    error: Optional[str] = None


class AgentOrchestrator:
    """
    Orchestrates multiple agents for complex tasks.

    Features:
    - Intent-based routing to appropriate agents
    - Seamless handoff between agents with context preservation
    - Pipeline execution for multi-step workflows
    - Parallel agent execution for independent tasks

    Example:
    ```python
    orchestrator = AgentOrchestrator()

    # Route a message to the appropriate agent
    agent_name = await orchestrator.route("I need help with my order")
    response = await orchestrator.invoke(agent_name, message)

    # Execute a pipeline
    result = await orchestrator.run_pipeline(
        ["research", "summarize", "format"],
        input_data={"query": "latest AI trends"}
    )

    # Handoff between agents
    await orchestrator.handoff(
        from_agent="support",
        to_agent="billing",
        context=conversation_context
    )
    ```
    """

    ROUTING_PROMPT = """You are an intelligent router that determines which AI agent should handle a user's request.

Available agents:
{agent_descriptions}

Based on the user's message, determine which agent is best suited to handle their request.
Consider the agent's specialization and the nature of the user's request.

User message: {message}"""

    def __init__(
        self,
        llm_provider: Optional[OpenRouterProvider] = None,
        router_model: str = DEFAULT_TRAINING,
        default_agent: Optional[str] = None,
    ):
        """
        Initialize the orchestrator.

        Args:
            llm_provider: OpenRouter provider for the routing LLM
            router_model: Model to use for routing decisions
            default_agent: Default agent if routing fails
        """
        self.llm_provider = llm_provider or OpenRouterProvider()
        self.router_model = router_model
        self.default_agent = default_agent

        # Create routing LLM
        self.router_llm = self.llm_provider.get_llm(
            model_name=router_model, temperature=0.0  # Deterministic routing
        )

        logger.info(f"Orchestrator initialized with router model: {router_model}")

    def _get_agent_descriptions(self) -> str:
        """Build formatted agent descriptions for routing prompt."""
        agents = AgentRegistry.list_agents_with_metadata()
        if not agents:
            return "No agents registered."

        descriptions = []
        for agent in agents:
            desc = f"- {agent['name']}: {agent.get('description', 'No description')}"
            if agent.get("tags"):
                desc += f" (tags: {', '.join(agent['tags'])})"
            descriptions.append(desc)

        return "\n".join(descriptions)

    async def route(
        self,
        message: str,
        context: Optional[AgentContext] = None,
        allowed_agents: Optional[List[str]] = None,
    ) -> RoutingDecision:
        """
        Determine which agent should handle a message.

        Args:
            message: User message to route
            context: Optional context for routing
            allowed_agents: Optional list of agents to consider

        Returns:
            RoutingDecision with agent name and confidence
        """
        context = context or AgentContext()

        # Get available agents
        if allowed_agents:
            # Filter to allowed agents
            all_agents = AgentRegistry.list_agents_with_metadata()
            agent_descriptions = "\n".join(
                [
                    f"- {a['name']}: {a.get('description', 'No description')}"
                    for a in all_agents
                    if a["name"] in allowed_agents
                ]
            )
        else:
            agent_descriptions = self._get_agent_descriptions()

        if not agent_descriptions or agent_descriptions == "No agents registered.":
            logger.warning("No agents available for routing")
            if self.default_agent:
                return RoutingDecision(
                    agent_name=self.default_agent,
                    reasoning="No agents available, using default",
                )
            raise ValueError("No agents registered and no default agent specified")

        # Build routing chain with structured output
        prompt = ChatPromptTemplate.from_messages([("user", self.ROUTING_PROMPT)])
        structured_llm = self.router_llm.with_structured_output(RoutingDecision)
        chain = prompt | structured_llm

        langfuse_config = get_langfuse_config(
            session_id=context.session_id,
            user_id=context.user_id,
            tags=["routing", "orchestrator"],
            metadata={"message_preview": message[:100]},
            run_name="agent-routing",
        )

        try:
            circuit_breaker = get_llm_circuit_breaker()

            async def invoke_routing_llm():
                return await chain.ainvoke(
                    {"agent_descriptions": agent_descriptions, "message": message},
                    config=langfuse_config,
                )

            decision: RoutingDecision = await circuit_breaker.call(invoke_routing_llm)

            logger.info(f"Routed to '{decision.agent_name}': {decision.reasoning}")
            return decision

        except CircuitBreakerOpenError as e:
            logger.warning(f"Circuit breaker open during routing: {e}")
            if self.default_agent:
                return RoutingDecision(
                    agent_name=self.default_agent,
                    reasoning="Circuit breaker open, using default agent",
                )
            raise

        except Exception as e:
            logger.error(f"Routing failed: {e}")
            if self.default_agent:
                return RoutingDecision(
                    agent_name=self.default_agent,
                    reasoning=f"Routing failed ({str(e)}), using default",
                )
            raise

    async def invoke(
        self,
        agent_name: str,
        message: str,
        context: Optional[AgentContext] = None,
        config: Optional[AgentConfig] = None,
    ) -> Any:
        """
        Invoke a specific agent with a message.

        Args:
            agent_name: Name of the agent to invoke
            message: User message
            context: Optional context
            config: Optional agent configuration

        Returns:
            Agent response
        """
        agent = create_agent(agent_name, self.llm_provider, config)
        return await agent.invoke(message, context)

    async def route_and_invoke(
        self,
        message: str,
        context: Optional[AgentContext] = None,
        config: Optional[AgentConfig] = None,
    ) -> Tuple[RoutingDecision, Any]:
        """
        Route a message to an agent and invoke it.

        Args:
            message: User message
            context: Optional context
            config: Optional agent configuration

        Returns:
            Tuple of (routing decision, agent response)
        """
        decision = await self.route(message, context)
        response = await self.invoke(decision.agent_name, message, context, config)
        return decision, response

    async def handoff(
        self,
        from_agent: str,
        to_agent: str,
        conversation_summary: str,
        handoff_reason: str,
        context: Optional[AgentContext] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> HandoffContext:
        """
        Transfer conversation from one agent to another.

        Creates a handoff context that can be used to initialize
        the new agent with conversation history.

        Args:
            from_agent: Name of the source agent
            to_agent: Name of the target agent
            conversation_summary: Summary of the conversation so far
            handoff_reason: Why the handoff is happening
            context: Optional agent context
            metadata: Additional metadata to pass

        Returns:
            HandoffContext for the target agent
        """
        # Verify both agents exist
        if not AgentRegistry.exists(from_agent):
            raise ValueError(f"Source agent '{from_agent}' not found")
        if not AgentRegistry.exists(to_agent):
            raise ValueError(f"Target agent '{to_agent}' not found")

        handoff = HandoffContext(
            from_agent=from_agent,
            to_agent=to_agent,
            conversation_summary=conversation_summary,
            handoff_reason=handoff_reason,
            metadata=metadata or {},
        )

        logger.info(f"Handoff: {from_agent} -> {to_agent} (reason: {handoff_reason})")

        return handoff

    async def run_pipeline(
        self,
        agents: List[str],
        input_data: Dict[str, Any],
        context: Optional[AgentContext] = None,
        stop_on_error: bool = True,
    ) -> PipelineResult:
        """
        Run multiple agents in sequence (pipeline).

        Each agent's output is passed as input to the next agent.

        Args:
            agents: List of agent names to run in sequence
            input_data: Initial input for the first agent
            context: Optional context for all agents
            stop_on_error: Whether to stop on first error

        Returns:
            PipelineResult with all stage outputs
        """
        import time

        context = context or AgentContext()
        stages: List[Dict[str, Any]] = []
        current_input = input_data
        start_time = time.time()

        for i, agent_name in enumerate(agents):
            stage_start = time.time()

            try:
                # Convert input to message string
                if isinstance(current_input, dict):
                    message = str(current_input.get("message", str(current_input)))
                else:
                    message = str(current_input)

                # Invoke agent
                response = await self.invoke(agent_name, message, context)

                stage_result = {
                    "agent": agent_name,
                    "stage": i + 1,
                    "input": current_input,
                    "output": (
                        response.model_dump()
                        if hasattr(response, "model_dump")
                        else response
                    ),
                    "duration_ms": int((time.time() - stage_start) * 1000),
                    "success": True,
                }
                stages.append(stage_result)

                # Pass output to next stage
                current_input = {"message": str(response), "previous_output": response}

            except Exception as e:
                logger.error(f"Pipeline stage {i+1} ({agent_name}) failed: {e}")
                stage_result = {
                    "agent": agent_name,
                    "stage": i + 1,
                    "input": current_input,
                    "error": str(e),
                    "duration_ms": int((time.time() - stage_start) * 1000),
                    "success": False,
                }
                stages.append(stage_result)

                if stop_on_error:
                    return PipelineResult(
                        stages=stages,
                        final_output=None,
                        total_duration_ms=int((time.time() - start_time) * 1000),
                        success=False,
                        error=f"Stage {i+1} ({agent_name}) failed: {e}",
                    )

        total_duration = int((time.time() - start_time) * 1000)

        return PipelineResult(
            stages=stages,
            final_output=(
                stages[-1]["output"] if stages and stages[-1]["success"] else None
            ),
            total_duration_ms=total_duration,
            success=all(s["success"] for s in stages),
            error=None,
        )

    async def run_parallel(
        self, agents: List[str], message: str, context: Optional[AgentContext] = None
    ) -> Dict[str, Any]:
        """
        Run multiple agents in parallel with the same input.

        Useful for getting multiple perspectives or processing
        different aspects of a request simultaneously.

        Args:
            agents: List of agent names to run in parallel
            message: Message to send to all agents
            context: Optional context

        Returns:
            Dict mapping agent names to their responses
        """
        import asyncio

        async def invoke_agent(agent_name: str) -> Tuple[str, Any]:
            try:
                response = await self.invoke(agent_name, message, context)
                return agent_name, {"response": response, "success": True}
            except Exception as e:
                logger.error(f"Parallel invocation of {agent_name} failed: {e}")
                return agent_name, {"error": str(e), "success": False}

        # Run all agents in parallel
        tasks = [invoke_agent(name) for name in agents]
        results = await asyncio.gather(*tasks)

        return dict(results)


__all__ = [
    "AgentOrchestrator",
    "RoutingDecision",
    "HandoffContext",
    "PipelineResult",
]
