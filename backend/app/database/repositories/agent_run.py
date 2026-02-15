"""
AgentRun repository for Scribely.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.agent_run import AgentRun, AgentRunStatusEnum

logger = get_logger("agent_run_repository")


class AgentRunRepository:
    """Repository for AgentRun model operations."""

    @staticmethod
    async def create(
        db: AsyncSession,
        agent_id: str,
        user_id: str,
        input_data: Dict[str, Any],
        conversation_id: Optional[str] = None,
        parent_run_id: Optional[str] = None,
        session_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AgentRun:
        """Create a new agent run."""
        run = AgentRun(
            agent_id=agent_id,
            user_id=user_id,
            input_data=input_data,
            conversation_id=conversation_id,
            parent_run_id=parent_run_id,
            session_id=session_id,
            trace_id=trace_id,
            tags=tags or [],
            metadata=metadata or {},
            status=AgentRunStatusEnum.PENDING
        )
        db.add(run)
        await db.flush()
        await db.refresh(run)
        logger.debug(f"Created agent run: {run.id} for agent: {agent_id}")
        return run

    @staticmethod
    async def get_by_id(db: AsyncSession, run_id: str) -> Optional[AgentRun]:
        """Get run by ID."""
        result = await db.execute(select(AgentRun).where(AgentRun.id == run_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_agent(
        db: AsyncSession,
        agent_id: str,
        status: Optional[AgentRunStatusEnum] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[AgentRun]:
        """Get runs for an agent."""
        query = select(AgentRun).where(AgentRun.agent_id == agent_id)

        if status:
            query = query.where(AgentRun.status == status)

        query = query.order_by(desc(AgentRun.created_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_user(
        db: AsyncSession,
        user_id: str,
        agent_id: Optional[str] = None,
        status: Optional[AgentRunStatusEnum] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[AgentRun]:
        """Get runs for a user."""
        query = select(AgentRun).where(AgentRun.user_id == user_id)

        if agent_id:
            query = query.where(AgentRun.agent_id == agent_id)
        if status:
            query = query.where(AgentRun.status == status)

        query = query.order_by(desc(AgentRun.created_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_conversation(
        db: AsyncSession,
        conversation_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[AgentRun]:
        """Get runs for a conversation."""
        query = (
            select(AgentRun)
            .where(AgentRun.conversation_id == conversation_id)
            .order_by(desc(AgentRun.created_at))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_session(
        db: AsyncSession,
        session_id: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[AgentRun]:
        """Get runs for a session (for Langfuse session grouping)."""
        query = (
            select(AgentRun)
            .where(AgentRun.session_id == session_id)
            .order_by(AgentRun.created_at)
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_trace(db: AsyncSession, trace_id: str) -> List[AgentRun]:
        """Get runs by Langfuse trace ID."""
        query = (
            select(AgentRun)
            .where(AgentRun.trace_id == trace_id)
            .order_by(AgentRun.created_at)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def start(db: AsyncSession, run_id: str) -> Optional[AgentRun]:
        """Mark a run as started."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run:
            run.mark_started()
            await db.flush()
            await db.refresh(run)
            logger.debug(f"Started agent run: {run_id}")
        return run

    @staticmethod
    async def complete(
        db: AsyncSession,
        run_id: str,
        output_data: Dict[str, Any],
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        latency_ms: Optional[int] = None,
        tool_calls_count: int = 0,
        model_used: Optional[str] = None,
        cost_cents: Optional[int] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[AgentRun]:
        """Mark a run as completed with results."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run:
            run.mark_completed(
                output_data=output_data,
                tokens_input=tokens_input,
                tokens_output=tokens_output,
                latency_ms=latency_ms,
                tool_calls_count=tool_calls_count,
                model_used=model_used,
                cost_cents=cost_cents
            )
            if tool_calls:
                run.tool_calls = tool_calls
            await db.flush()
            await db.refresh(run)
            logger.debug(f"Completed agent run: {run_id}")
        return run

    @staticmethod
    async def fail(
        db: AsyncSession,
        run_id: str,
        error: str,
        error_type: Optional[str] = None
    ) -> Optional[AgentRun]:
        """Mark a run as failed."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run:
            run.mark_failed(error=error, error_type=error_type)
            await db.flush()
            await db.refresh(run)
            logger.warning(f"Failed agent run: {run_id} - {error}")
        return run

    @staticmethod
    async def cancel(db: AsyncSession, run_id: str) -> Optional[AgentRun]:
        """Cancel a run."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run and not run.is_finished:
            run.mark_cancelled()
            await db.flush()
            await db.refresh(run)
            logger.info(f"Cancelled agent run: {run_id}")
        return run

    @staticmethod
    async def timeout(db: AsyncSession, run_id: str) -> Optional[AgentRun]:
        """Mark a run as timed out."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run and not run.is_finished:
            run.mark_timeout()
            await db.flush()
            await db.refresh(run)
            logger.warning(f"Timed out agent run: {run_id}")
        return run

    @staticmethod
    async def increment_retry(db: AsyncSession, run_id: str) -> Optional[AgentRun]:
        """Increment retry count for a run."""
        run = await AgentRunRepository.get_by_id(db, run_id)
        if run:
            run.retry_count = (run.retry_count or 0) + 1
            await db.flush()
            await db.refresh(run)
        return run

    @staticmethod
    async def get_stats_by_agent(
        db: AsyncSession,
        agent_id: str,
        since: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get statistics for an agent's runs."""
        from sqlalchemy import func

        if since is None:
            since = datetime.utcnow() - timedelta(days=30)

        query = select(
            func.count().label('total'),
            func.sum(AgentRun.total_tokens).label('total_tokens'),
            func.sum(AgentRun.cost_cents).label('total_cost_cents'),
            func.avg(AgentRun.latency_ms).label('avg_latency_ms'),
            func.count().filter(AgentRun.status == AgentRunStatusEnum.COMPLETED).label('completed'),
            func.count().filter(AgentRun.status == AgentRunStatusEnum.FAILED).label('failed'),
        ).where(
            AgentRun.agent_id == agent_id,
            AgentRun.created_at >= since
        )

        result = await db.execute(query)
        row = result.one()

        return {
            "total_runs": row.total or 0,
            "completed": row.completed or 0,
            "failed": row.failed or 0,
            "success_rate": (row.completed / row.total * 100) if row.total else 0,
            "total_tokens": row.total_tokens or 0,
            "total_cost_cents": row.total_cost_cents or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
            "since": since.isoformat()
        }

    @staticmethod
    async def get_stats_by_user(
        db: AsyncSession,
        user_id: str,
        since: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get statistics for a user's runs."""
        from sqlalchemy import func

        if since is None:
            since = datetime.utcnow() - timedelta(days=30)

        query = select(
            func.count().label('total'),
            func.sum(AgentRun.total_tokens).label('total_tokens'),
            func.sum(AgentRun.cost_cents).label('total_cost_cents'),
            func.count().filter(AgentRun.status == AgentRunStatusEnum.COMPLETED).label('completed'),
            func.count().filter(AgentRun.status == AgentRunStatusEnum.FAILED).label('failed'),
        ).where(
            AgentRun.user_id == user_id,
            AgentRun.created_at >= since
        )

        result = await db.execute(query)
        row = result.one()

        return {
            "total_runs": row.total or 0,
            "completed": row.completed or 0,
            "failed": row.failed or 0,
            "total_tokens": row.total_tokens or 0,
            "total_cost_cents": row.total_cost_cents or 0,
            "since": since.isoformat()
        }

    @staticmethod
    async def cleanup_stale_runs(
        db: AsyncSession,
        timeout_minutes: int = 30
    ) -> int:
        """Mark stale running/pending runs as timed out."""
        from sqlalchemy import update

        cutoff = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        result = await db.execute(
            update(AgentRun)
            .where(
                AgentRun.status.in_([AgentRunStatusEnum.PENDING, AgentRunStatusEnum.RUNNING]),
                AgentRun.created_at < cutoff
            )
            .values(
                status=AgentRunStatusEnum.TIMEOUT,
                completed_at=datetime.utcnow(),
                error="Execution timed out (cleanup)",
                error_type="TimeoutError"
            )
        )
        await db.flush()
        count = result.rowcount
        if count > 0:
            logger.info(f"Cleaned up {count} stale agent runs")
        return count
