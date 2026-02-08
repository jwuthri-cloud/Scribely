"""Base LitAgent wrapper for LangChain agents.

This module provides the base class for converting LangChain agents
into trainable LitAgents that work with agent-lightning.
"""

from __future__ import annotations

import logging
from abc import abstractmethod
from typing import Any, Callable, Dict, Generic, Optional, TypeVar

import agentlightning as agl
from agentlightning.types import NamedResources, PromptTemplate, Rollout, RolloutRawResult

from app.utils.logging import get_logger

logger = get_logger("litagent")

T = TypeVar("T")
AgentResult = TypeVar("AgentResult")


class LitLangChainAgent(agl.LitAgent[Dict[str, Any]], Generic[AgentResult]):
    """Base wrapper that converts LangChain agents to trainable LitAgents.
    
    This class provides the foundation for integrating existing LangChain agents
    with agent-lightning's training infrastructure. Subclasses should implement
    the abstract methods to define how agents are created and how results
    are evaluated.
    
    Type Parameters:
        AgentResult: The type of result returned by the wrapped agent.
    
    Example:
        ```python
        class MyLitAgent(LitLangChainAgent[MyResponse]):
            def create_agent(self, system_prompt: str, **kwargs):
                return MyLangChainAgent(system_prompt=system_prompt)
            
            async def invoke_agent(self, agent, task, config):
                return await agent.ainvoke(task, config=config)
            
            def compute_reward(self, task, result) -> float:
                return 1.0 if result.success else 0.0
        ```
    """

    def __init__(
        self,
        reward_fn: Optional[Callable[[Dict[str, Any], AgentResult], float]] = None,
        prompt_resource_name: str = "system_prompt",
        **kwargs: Any,
    ) -> None:
        """Initialize the LitAgent wrapper.
        
        Args:
            reward_fn: Optional custom reward function. If not provided,
                       the compute_reward method will be used.
            prompt_resource_name: Name of the prompt template resource in
                                  NamedResources. Defaults to "system_prompt".
            **kwargs: Additional arguments passed to LitAgent.
        """
        super().__init__(**kwargs)
        self._reward_fn = reward_fn
        self._prompt_resource_name = prompt_resource_name
        self._current_agent: Optional[Any] = None
    
    @abstractmethod
    def create_agent(
        self,
        system_prompt: str,
        **kwargs: Any,
    ) -> Any:
        """Create a LangChain agent instance with the given prompt.
        
        Subclasses must implement this method to instantiate their
        specific agent type.
        
        Args:
            system_prompt: The system prompt to use for the agent.
            **kwargs: Additional configuration for the agent.
        
        Returns:
            A LangChain agent instance.
        """
        raise NotImplementedError
    
    @abstractmethod
    async def invoke_agent(
        self,
        agent: Any,
        task: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> AgentResult:
        """Invoke the agent with the given task.
        
        Subclasses must implement this method to define how tasks
        are passed to and processed by the agent.
        
        Args:
            agent: The agent instance to invoke.
            task: The task/input to process.
            config: Optional configuration including callbacks.
        
        Returns:
            The agent's result.
        """
        raise NotImplementedError
    
    def compute_reward(
        self,
        task: Dict[str, Any],
        result: AgentResult,
    ) -> float:
        """Compute reward for the agent's response.
        
        Override this method to implement custom reward logic.
        If a reward_fn was provided in __init__, it will be used instead.
        
        Args:
            task: The original task/input.
            result: The agent's response.
        
        Returns:
            A float reward value.
        """
        if self._reward_fn is not None:
            return self._reward_fn(task, result)
        # Default: return 0.0, subclasses should override
        return 0.0
    
    def get_prompt_from_resources(
        self,
        resources: NamedResources,
    ) -> str:
        """Extract the prompt template from resources.
        
        Args:
            resources: Named resources containing the prompt.
        
        Returns:
            The prompt string.
        
        Raises:
            ValueError: If the prompt resource is not found.
        """
        resource = resources.get(self._prompt_resource_name)
        if resource is None:
            raise ValueError(
                f"Prompt resource '{self._prompt_resource_name}' not found in resources. "
                f"Available: {list(resources.keys())}"
            )
        
        if isinstance(resource, PromptTemplate):
            return resource.template
        elif isinstance(resource, str):
            return resource
        else:
            raise ValueError(
                f"Unexpected resource type for '{self._prompt_resource_name}': {type(resource)}"
            )
    
    def get_langchain_callbacks(self) -> list:
        """Get LangChain callbacks for tracing.
        
        Returns a list of callbacks including the agent-lightning tracer
        callback if available.
        
        Returns:
            List of LangChain callback handlers.
        """
        callbacks = []
        
        try:
            # Get tracer from runner/trainer
            tracer = self.get_tracer()
            
            # Try to get LangChain handler if available
            if hasattr(tracer, "get_langchain_handler"):
                handler = tracer.get_langchain_handler()
                if handler is not None:
                    callbacks.append(handler)
        except (ValueError, AttributeError) as e:
            logger.debug(f"Could not get tracer callbacks: {e}")
        
        return callbacks
    
    async def rollout_async(
        self,
        task: Dict[str, Any],
        resources: NamedResources,
        rollout: Rollout,
    ) -> RolloutRawResult:
        """Execute an asynchronous rollout.
        
        This method:
        1. Extracts the prompt from resources
        2. Creates an agent with the current prompt
        3. Invokes the agent with tracing
        4. Computes and returns the reward
        
        Args:
            task: The task input (typically a dict with user query).
            resources: Named resources including the prompt template.
            rollout: Rollout metadata.
        
        Returns:
            The computed reward as a float.
        """
        # Extract prompt from resources
        system_prompt = self.get_prompt_from_resources(resources)
        
        logger.debug(
            f"[Rollout {rollout.rollout_id}] Starting rollout with prompt: "
            f"{system_prompt[:50]}..."
        )
        
        # Create agent with current prompt
        self._current_agent = self.create_agent(system_prompt=system_prompt)
        
        # Build config with tracing callbacks
        callbacks = self.get_langchain_callbacks()
        config = {"callbacks": callbacks} if callbacks else None
        
        # Invoke agent
        try:
            result = await self.invoke_agent(
                self._current_agent,
                task,
                config=config,
            )
            
            # Compute reward
            reward = self.compute_reward(task, result)
            
            logger.info(
                f"[Rollout {rollout.rollout_id}] Completed with reward: {reward:.3f}"
            )
            
            return reward
            
        except Exception as e:
            logger.error(
                f"[Rollout {rollout.rollout_id}] Failed with error: {e}",
                exc_info=True,
            )
            # Return low reward on failure
            return 0.0
        finally:
            self._current_agent = None
    
    def rollout(
        self,
        task: Dict[str, Any],
        resources: NamedResources,
        rollout: Rollout,
    ) -> RolloutRawResult:
        """Execute a synchronous rollout.
        
        This method runs the async rollout in a sync context.
        Prefer using rollout_async when possible.
        
        Args:
            task: The task input.
            resources: Named resources including the prompt template.
            rollout: Rollout metadata.
        
        Returns:
            The computed reward as a float.
        """
        import asyncio
        
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        
        if loop is not None:
            # Running in async context, create new task
            import nest_asyncio
            nest_asyncio.apply()
            return asyncio.get_event_loop().run_until_complete(
                self.rollout_async(task, resources, rollout)
            )
        else:
            # Not in async context
            return asyncio.run(
                self.rollout_async(task, resources, rollout)
            )
    
    def is_async(self) -> bool:
        """Return True as this agent supports async rollouts."""
        return True
