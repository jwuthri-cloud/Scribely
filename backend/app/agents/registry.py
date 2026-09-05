"""
Agent registry for Scribely.

Provides dynamic agent registration, discovery, and instantiation.
"""

from typing import Any, Callable, Dict, List, Optional, Type, TypeVar

from app.agents.base import AgentConfig, BaseAgent
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("agent_registry")

T = TypeVar("T", bound=BaseAgent)


class AgentNotFoundError(Exception):
    """Raised when an agent is not found in the registry."""

    pass


class AgentRegistry:
    """
    Central registry for all available agents.

    Supports:
    - Registration via decorator or direct method call
    - Agent discovery by name or type
    - Dynamic instantiation with configuration
    - Agent metadata lookup

    Example:
    ```python
    # Register via decorator
    @AgentRegistry.register("customer_support")
    class CustomerSupportAgent(BaseAgent):
        ...

    # Register directly
    AgentRegistry.register_class("data_analyst", DataAnalystAgent)

    # Get and instantiate
    agent = AgentRegistry.create("customer_support", config=AgentConfig(...))

    # List all agents
    agents = AgentRegistry.list_agents()
    ```
    """

    _agents: Dict[str, Type[BaseAgent]] = {}
    _metadata: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register(
        cls,
        name: str,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Callable[[Type[T]], Type[T]]:
        """
        Decorator to register an agent class.

        Args:
            name: Unique name for the agent
            description: Optional description (uses class description if not provided)
            tags: Optional tags for categorization

        Returns:
            Decorator function

        Example:
            @AgentRegistry.register("customer_support", tags=["support", "customer"])
            class CustomerSupportAgent(BaseAgent):
                ...
        """

        def decorator(agent_class: Type[T]) -> Type[T]:
            cls._agents[name] = agent_class
            cls._metadata[name] = {
                "description": description or getattr(agent_class, "description", ""),
                "tags": tags or [],
                "class_name": agent_class.__name__,
            }
            logger.info(f"Registered agent: {name} ({agent_class.__name__})")
            return agent_class

        return decorator

    @classmethod
    def register_class(
        cls,
        name: str,
        agent_class: Type[BaseAgent],
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> None:
        """
        Register an agent class directly.

        Args:
            name: Unique name for the agent
            agent_class: The agent class to register
            description: Optional description
            tags: Optional tags
        """
        cls._agents[name] = agent_class
        cls._metadata[name] = {
            "description": description or getattr(agent_class, "description", ""),
            "tags": tags or [],
            "class_name": agent_class.__name__,
        }
        logger.info(f"Registered agent: {name} ({agent_class.__name__})")

    @classmethod
    def unregister(cls, name: str) -> bool:
        """
        Unregister an agent.

        Args:
            name: Agent name to unregister

        Returns:
            True if agent was removed, False if it wasn't registered
        """
        if name in cls._agents:
            del cls._agents[name]
            del cls._metadata[name]
            logger.info(f"Unregistered agent: {name}")
            return True
        return False

    @classmethod
    def get(cls, name: str) -> Type[BaseAgent]:
        """
        Get an agent class by name.

        Args:
            name: Agent name

        Returns:
            Agent class

        Raises:
            AgentNotFoundError: If agent is not registered
        """
        if name not in cls._agents:
            raise AgentNotFoundError(
                f"Agent '{name}' not found. Available: {list(cls._agents.keys())}"
            )
        return cls._agents[name]

    @classmethod
    def create(
        cls,
        name: str,
        llm_provider: Optional[OpenRouterProvider] = None,
        config: Optional[AgentConfig] = None,
    ) -> BaseAgent:
        """
        Create an instance of a registered agent.

        Args:
            name: Agent name
            llm_provider: Optional LLM provider
            config: Optional agent configuration

        Returns:
            Agent instance

        Raises:
            AgentNotFoundError: If agent is not registered
        """
        agent_class = cls.get(name)
        return agent_class(llm_provider=llm_provider, config=config)

    @classmethod
    def exists(cls, name: str) -> bool:
        """Check if an agent is registered."""
        return name in cls._agents

    @classmethod
    def list_agents(cls) -> List[str]:
        """Get list of all registered agent names."""
        return list(cls._agents.keys())

    @classmethod
    def list_agents_with_metadata(cls) -> List[Dict[str, Any]]:
        """Get list of all agents with their metadata."""
        return [
            {"name": name, **cls._metadata.get(name, {})} for name in cls._agents.keys()
        ]

    @classmethod
    def get_by_tag(cls, tag: str) -> List[str]:
        """
        Get agents by tag.

        Args:
            tag: Tag to filter by

        Returns:
            List of agent names with the specified tag
        """
        return [
            name for name, meta in cls._metadata.items() if tag in meta.get("tags", [])
        ]

    @classmethod
    def get_metadata(cls, name: str) -> Optional[Dict[str, Any]]:
        """Get metadata for an agent."""
        return cls._metadata.get(name)

    @classmethod
    def clear(cls) -> None:
        """Clear all registered agents. Useful for testing."""
        cls._agents.clear()
        cls._metadata.clear()
        logger.info("Cleared all registered agents")


# Convenience functions
def get_agent(name: str) -> Type[BaseAgent]:
    """Get an agent class by name."""
    return AgentRegistry.get(name)


def create_agent(
    name: str,
    llm_provider: Optional[OpenRouterProvider] = None,
    config: Optional[AgentConfig] = None,
) -> BaseAgent:
    """Create an agent instance by name."""
    return AgentRegistry.create(name, llm_provider, config)


def list_agents() -> List[str]:
    """List all registered agents."""
    return AgentRegistry.list_agents()


__all__ = [
    "AgentRegistry",
    "AgentNotFoundError",
    "get_agent",
    "create_agent",
    "list_agents",
]
