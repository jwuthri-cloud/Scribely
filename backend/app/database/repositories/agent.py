"""
Agent repository for Scribely.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.agent import Agent

logger = get_logger("agent_repository")


class AgentRepository:
    """Repository for Agent model operations."""

    @staticmethod
    async def create(
        db: AsyncSession,
        name: str,
        agent_type: str,
        system_prompt: Optional[str] = None,
        model_name: str = "openai/gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        tools: Optional[List[str]] = None,
        tool_choice: str = "auto",
        response_schema: Optional[Dict[str, Any]] = None,
        response_schema_name: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
        description: Optional[str] = None,
        is_public: bool = False,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None
    ) -> Agent:
        """Create a new agent configuration."""
        slug = Agent.create_slug(name)

        agent = Agent(
            name=name,
            slug=slug,
            agent_type=agent_type,
            description=description,
            system_prompt=system_prompt,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools or [],
            tool_choice=tool_choice,
            response_schema=response_schema,
            response_schema_name=response_schema_name,
            fallback_models=fallback_models or [],
            is_public=is_public,
            tags=tags or [],
            metadata=metadata or {},
            created_by=created_by
        )
        db.add(agent)
        await db.flush()
        await db.refresh(agent)
        logger.info(f"Created agent: {agent.id} ({agent.name})")
        return agent

    @staticmethod
    async def get_by_id(db: AsyncSession, agent_id: str) -> Optional[Agent]:
        """Get agent by ID."""
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_name(db: AsyncSession, name: str) -> Optional[Agent]:
        """Get agent by name."""
        result = await db.execute(select(Agent).where(Agent.name == name))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_slug(db: AsyncSession, slug: str) -> Optional[Agent]:
        """Get agent by slug."""
        result = await db.execute(select(Agent).where(Agent.slug == slug))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_type(
        db: AsyncSession,
        agent_type: str,
        active_only: bool = True,
        skip: int = 0,
        limit: int = 50
    ) -> List[Agent]:
        """Get agents by type."""
        query = select(Agent).where(Agent.agent_type == agent_type)

        if active_only:
            query = query.where(Agent.is_active == True)

        query = query.order_by(desc(Agent.updated_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_all(
        db: AsyncSession,
        active_only: bool = True,
        public_only: bool = False,
        created_by: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Agent]:
        """Get all agents with filtering."""
        query = select(Agent)

        if active_only:
            query = query.where(Agent.is_active == True)

        if public_only:
            query = query.where(Agent.is_public == True)
        elif created_by:
            # Show public agents OR agents created by the user
            query = query.where(
                or_(Agent.is_public == True, Agent.created_by == created_by)
            )

        query = query.order_by(desc(Agent.updated_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_public_agents(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50
    ) -> List[Agent]:
        """Get all public agents."""
        return await AgentRepository.get_all(
            db, active_only=True, public_only=True, skip=skip, limit=limit
        )

    @staticmethod
    async def update(
        db: AsyncSession,
        agent_id: str,
        **kwargs
    ) -> Optional[Agent]:
        """Update an agent."""
        agent = await AgentRepository.get_by_id(db, agent_id)
        if not agent:
            return None

        # Handle slug update if name changes
        if "name" in kwargs and kwargs["name"] != agent.name:
            kwargs["slug"] = Agent.create_slug(kwargs["name"])

        for key, value in kwargs.items():
            if hasattr(agent, key):
                setattr(agent, key, value)

        agent.updated_at = datetime.utcnow()
        agent.version += 1  # Increment version on update

        await db.flush()
        await db.refresh(agent)
        logger.info(f"Updated agent: {agent_id} (v{agent.version})")
        return agent

    @staticmethod
    async def activate(db: AsyncSession, agent_id: str) -> Optional[Agent]:
        """Activate an agent."""
        return await AgentRepository.update(db, agent_id, is_active=True)

    @staticmethod
    async def deactivate(db: AsyncSession, agent_id: str) -> Optional[Agent]:
        """Deactivate an agent."""
        return await AgentRepository.update(db, agent_id, is_active=False)

    @staticmethod
    async def delete(db: AsyncSession, agent_id: str) -> bool:
        """Delete an agent (hard delete)."""
        agent = await AgentRepository.get_by_id(db, agent_id)
        if agent:
            await db.delete(agent)
            await db.flush()
            logger.info(f"Deleted agent: {agent_id}")
            return True
        return False

    @staticmethod
    async def search(
        db: AsyncSession,
        search_term: str,
        active_only: bool = True,
        skip: int = 0,
        limit: int = 50
    ) -> List[Agent]:
        """Search agents by name, description, or tags."""
        query = select(Agent).where(
            or_(
                Agent.name.ilike(f"%{search_term}%"),
                Agent.description.ilike(f"%{search_term}%"),
                Agent.agent_type.ilike(f"%{search_term}%")
            )
        )

        if active_only:
            query = query.where(Agent.is_active == True)

        query = query.order_by(desc(Agent.updated_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def count(
        db: AsyncSession,
        active_only: bool = True,
        agent_type: Optional[str] = None
    ) -> int:
        """Count agents."""
        from sqlalchemy import func

        query = select(func.count()).select_from(Agent)

        if active_only:
            query = query.where(Agent.is_active == True)
        if agent_type:
            query = query.where(Agent.agent_type == agent_type)

        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def get_or_create_default(
        db: AsyncSession,
        name: str,
        agent_type: str,
        **defaults
    ) -> tuple[Agent, bool]:
        """
        Get an agent by name or create it with defaults.

        Returns:
            Tuple of (agent, created) where created is True if a new agent was created.
        """
        existing = await AgentRepository.get_by_name(db, name)
        if existing:
            return existing, False

        agent = await AgentRepository.create(
            db, name=name, agent_type=agent_type, **defaults
        )
        return agent, True
