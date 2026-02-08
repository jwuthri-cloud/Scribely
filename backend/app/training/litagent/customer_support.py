"""LitAgent wrapper for CustomerSupportAgent.

This module provides a trainable wrapper around the CustomerSupportAgent
that can be used with agent-lightning for prompt optimization and
reinforcement learning.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from langchain_core.messages import HumanMessage

from app.agents.agents.customer_support import CustomerSupportAgent
from app.agents.prompt.customer_support import SYSTEM_PROMPT
from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.training.litagent.base import LitLangChainAgent
from app.training.rewards.base import customer_support_reward
from app.utils.logging import get_logger

logger = get_logger("lit_customer_support")


class LitCustomerSupportAgent(LitLangChainAgent[CustomerSupportResponse]):
    """Trainable wrapper for CustomerSupportAgent.
    
    This class wraps the CustomerSupportAgent to make it compatible with
    agent-lightning training. It can be used with APO to optimize the
    system prompt, or with VERL/SFT for model fine-tuning.
    
    Example:
        ```python
        from app.training.litagent import LitCustomerSupportAgent
        from app.training.rewards import customer_support_reward
        import agentlightning as agl
        
        # Create trainable agent
        agent = LitCustomerSupportAgent(
            llm_provider=provider,
            reward_fn=customer_support_reward,
        )
        
        # Train with APO
        trainer = agl.Trainer(
            algorithm=agl.APO(...),
            initial_resources={
                "system_prompt": agl.PromptTemplate(
                    template=SYSTEM_PROMPT,
                    engine="f-string"
                )
            }
        )
        trainer.fit(agent, train_dataset=train_data, val_dataset=val_data)
        ```
    """

    def __init__(
        self,
        llm_provider: Optional[OpenRouterProvider] = None,
        model_name: str = "openai/gpt-5-mini",
        temperature: float = 0.7,
        reward_fn: Optional[Callable[[Dict[str, Any], CustomerSupportResponse], float]] = None,
        include_langfuse: bool = True,
        **kwargs: Any,
    ) -> None:
        """Initialize the LitCustomerSupportAgent.
        
        Args:
            llm_provider: OpenRouter provider instance. If None, will be
                          created with default settings.
            model_name: Model name to use for the agent.
            temperature: Temperature for model responses.
            reward_fn: Custom reward function. Defaults to customer_support_reward.
            include_langfuse: Whether to include Langfuse tracing alongside
                              agent-lightning tracing.
            **kwargs: Additional arguments passed to LitLangChainAgent.
        """
        # Use default reward function if not provided
        if reward_fn is None:
            reward_fn = customer_support_reward
        
        super().__init__(
            reward_fn=reward_fn,
            prompt_resource_name="system_prompt",
            **kwargs,
        )
        
        self._llm_provider = llm_provider
        self._model_name = model_name
        self._temperature = temperature
        self._include_langfuse = include_langfuse
        
        # Lazily initialized
        self._provider_instance: Optional[OpenRouterProvider] = None
    
    def _get_provider(self) -> OpenRouterProvider:
        """Get or create the LLM provider instance."""
        if self._provider_instance is not None:
            return self._provider_instance
        
        if self._llm_provider is not None:
            self._provider_instance = self._llm_provider
        else:
            # Create default provider
            self._provider_instance = OpenRouterProvider()
        
        return self._provider_instance
    
    def create_agent(
        self,
        system_prompt: str,
        **kwargs: Any,
    ) -> CustomerSupportAgent:
        """Create a CustomerSupportAgent with the given prompt.
        
        This method creates a new CustomerSupportAgent instance,
        replacing the system prompt with the provided one for training.
        
        Args:
            system_prompt: The system prompt to use.
            **kwargs: Additional configuration (unused).
        
        Returns:
            A CustomerSupportAgent instance.
        """
        provider = self._get_provider()
        
        # Get LLM with custom system prompt
        llm = provider.get_llm(
            model_name=self._model_name,
            temperature=self._temperature,
        )
        
        # Create agent with modified prompt
        # We need to create the agent directly to inject the prompt
        from langchain.agents import create_agent
        from app.agents.tool.customer_support import CUSTOMER_SUPPORT_TOOLS
        
        agent = create_agent(
            model=llm,
            system_prompt=system_prompt,
            tools=CUSTOMER_SUPPORT_TOOLS,
            response_format=CustomerSupportResponse,
        )
        
        # Wrap in a simple object that exposes ainvoke
        class AgentWrapper:
            def __init__(self, agent, system_prompt):
                self.agent = agent
                self.system_prompt = system_prompt
            
            async def ainvoke(self, input_data, config=None):
                return await self.agent.ainvoke(input_data, config=config)
            
            def invoke(self, input_data, config=None):
                return self.agent.invoke(input_data, config=config)
        
        return AgentWrapper(agent, system_prompt)
    
    async def invoke_agent(
        self,
        agent: Any,
        task: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> CustomerSupportResponse:
        """Invoke the agent with a customer inquiry task.
        
        Args:
            agent: The CustomerSupportAgent wrapper instance.
            task: Task dict with "message" key containing customer inquiry.
            config: Optional config including callbacks.
        
        Returns:
            CustomerSupportResponse from the agent.
        """
        # Extract message from task
        message = task.get("message", task.get("query", str(task)))
        
        # Build combined config with Langfuse if enabled
        final_config = config or {}
        
        if self._include_langfuse:
            langfuse_config = get_langfuse_config(
                tags=["training", "customer-support"],
                metadata={
                    "agent_type": "customer_support",
                    "model": self._model_name,
                    "training": True,
                },
                run_name="training-rollout",
            )
            if langfuse_config:
                # Merge callbacks
                existing_callbacks = final_config.get("callbacks", [])
                langfuse_callbacks = langfuse_config.get("callbacks", [])
                final_config["callbacks"] = existing_callbacks + langfuse_callbacks
        
        # Invoke agent
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=final_config if final_config else None,
        )
        
        # Extract structured response
        if isinstance(result, dict) and "structured_response" in result:
            response = result["structured_response"]
            if isinstance(response, CustomerSupportResponse):
                return response
            elif isinstance(response, dict):
                return CustomerSupportResponse(**response)
        
        # Fallback
        logger.warning(
            f"Unexpected response format: {type(result)}. Creating fallback response."
        )
        return CustomerSupportResponse(
            response=str(result),
            sentiment="neutral",
            requires_escalation=False,
            confidence=0.5,
        )
    
    def compute_reward(
        self,
        task: Dict[str, Any],
        result: CustomerSupportResponse,
    ) -> float:
        """Compute reward for customer support response.
        
        Uses the reward function provided in __init__, which defaults
        to customer_support_reward.
        
        Args:
            task: The original task/inquiry.
            result: The agent's response.
        
        Returns:
            Reward value between 0.0 and 1.0.
        """
        return super().compute_reward(task, result)


def create_lit_customer_support_agent(
    llm_provider: Optional[OpenRouterProvider] = None,
    model_name: str = "openai/gpt-5-mini",
    temperature: float = 0.7,
    custom_reward_fn: Optional[Callable[[Dict[str, Any], CustomerSupportResponse], float]] = None,
) -> LitCustomerSupportAgent:
    """Factory function to create a LitCustomerSupportAgent.
    
    Args:
        llm_provider: Optional LLM provider instance.
        model_name: Model name for the agent.
        temperature: Temperature for responses.
        custom_reward_fn: Optional custom reward function.
    
    Returns:
        Configured LitCustomerSupportAgent instance.
    """
    return LitCustomerSupportAgent(
        llm_provider=llm_provider,
        model_name=model_name,
        temperature=temperature,
        reward_fn=custom_reward_fn,
    )
