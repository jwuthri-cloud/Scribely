"""Tool factory for the webapp assistant agent."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.tool.composio_tools import build_composio_tools
from app.agents.tool.meeting import build_meeting_tools
from app.agents.tool.system_tools import build_system_tools
from app.agents.tool.vector_search import build_vector_search_tools
from app.agents.tool.web_search import build_web_search_tools
from app.utils.logging import get_logger

logger = get_logger("tool.factory")


async def build_tools(
    user_id: str,
    db: AsyncSession,
    *,
    include_system_tools: bool = True,
) -> tuple[list, object | None]:
    """
    Compose the full tool suite for the webapp assistant.

    Returns (tools, mcp_client). The caller must keep mcp_client alive for the
    entire agent session and close it via `await mcp_client.__aexit__(None, None, None)`
    when the agent is done. Pass None-safe — if Composio is not configured, mcp_client is None.

    Tools assembled from five sources:
    1. Meeting DB — list/search/summarize meetings (always on)
    2. Pinecone vector search — semantic search (requires VECTOR_DB_API_KEY)
    3. System shell — sandboxed read-only ops (optional, on by default)
    4. Web search — Tavily with Serper fallback (requires TAVILY_API_KEY or SERPER_API_KEY)
    5. Composio integrations — Gmail, Slack, Calendar, etc. (requires COMPOSIO_API_KEY)
    """
    tools: list = []

    tools.extend(build_meeting_tools(db=db, user_id=user_id))
    tools.extend(build_vector_search_tools(user_id=user_id))
    if include_system_tools:
        tools.extend(build_system_tools())
    tools.extend(build_web_search_tools())

    # composio_tools, mcp_client = await build_composio_tools(user_id=user_id)
    # tools.extend(composio_tools)
    mcp_client = None

    logger.info(f"Built {len(tools)} tools for user {user_id}")
    return tools, mcp_client


__all__ = ["build_tools"]
