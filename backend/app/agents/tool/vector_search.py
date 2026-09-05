"""LangChain tools for semantic search via Pinecone.

Architecture:
  - Single Pinecone index (VECTOR_DB_INDEX_NAME)
  - Namespaces separate entity types: "meeting_transcripts", "knowledge", "deals", etc.
  - user_id stored in metadata for per-user filtering within each namespace
"""

from langchain_core.tools import StructuredTool

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("tool.vector_search")

# Canonical namespace names — used both here and in embedding_service.py
NAMESPACE_MEETING_TRANSCRIPTS = "meeting_transcripts"
NAMESPACE_KNOWLEDGE = "knowledge"
NAMESPACE_DEALS = "deals"
NAMESPACE_CONTACTS = "contacts"
NAMESPACE_NOTES = "notes"


def build_vector_search_tools(user_id: str) -> list:
    """
    Build Pinecone semantic search tools.

    Each tool searches a specific namespace and filters by user_id in metadata,
    so a single index serves all users and all entity types.

    Args:
        user_id: The authenticated user's ID (used as metadata filter)

    Returns:
        List of LangChain tools, or empty list if Pinecone is not configured.
    """
    settings = get_settings()
    if not settings.vector_db_api_key:
        logger.info("Pinecone not configured — vector search tools disabled")
        return []

    try:
        from pinecone import Pinecone

        from app.infrastructure.llm_provider import OpenRouterEmbeddings

        pc = Pinecone(api_key=settings.vector_db_api_key)
        index = pc.Index(settings.vector_db_index_name)
        embeddings = OpenRouterEmbeddings()
    except Exception as e:
        logger.warning(f"Failed to initialize Pinecone: {e}")
        return []

    # Metadata filter to restrict results to this user
    user_filter = {"user_id": {"$eq": user_id}}

    async def _query(query: str, namespace: str, top_k: int) -> list[dict]:
        vector = await embeddings.aembed_query(query)
        results = index.query(
            vector=vector,
            top_k=top_k,
            namespace=namespace,
            filter=user_filter,
            include_metadata=True,
        )
        return results.get("matches", [])

    async def semantic_search_transcripts(query: str, top_k: int = 5) -> str:
        """
        Semantically search across the user's meeting transcripts using vector similarity.
        Better than keyword search for conceptual queries.

        Args:
            query: Natural language query (e.g. 'budget discussions', 'deployment blockers')
            top_k: Number of results to return (default 5, max 20)
        """
        top_k = min(top_k, 20)
        try:
            matches = await _query(query, NAMESPACE_MEETING_TRANSCRIPTS, top_k)
            if not matches:
                return f"No transcript results found for '{query}'."
            lines = [f"Top {len(matches)} transcript matches for '{query}':\n"]
            for m in matches:
                meta = m.get("metadata", {})
                score = m.get("score", 0)
                meeting_id = meta.get("meeting_id", "unknown")
                timestamp = meta.get("timestamp", "")
                speaker = meta.get("speaker", "Unknown")
                text = meta.get("text", "")
                lines.append(
                    f"[score={score:.2f}] Meeting {meeting_id} [{timestamp}] {speaker}: {text}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"Pinecone transcript search error: {e}")
            return f"Search failed: {e}"

    async def semantic_search_knowledge(query: str, top_k: int = 5) -> str:
        """
        Semantically search the user's uploaded knowledge base documents.

        Args:
            query: Natural language query
            top_k: Number of results to return (default 5, max 20)
        """
        top_k = min(top_k, 20)
        try:
            matches = await _query(query, NAMESPACE_KNOWLEDGE, top_k)
            if not matches:
                return f"No knowledge base results found for '{query}'."
            lines = [f"Top {len(matches)} knowledge base matches for '{query}':\n"]
            for m in matches:
                meta = m.get("metadata", {})
                score = m.get("score", 0)
                source = meta.get("source", "unknown")
                text = meta.get("text", "")
                lines.append(f"[score={score:.2f}] {source}: {text}")
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"Pinecone knowledge search error: {e}")
            return f"Search failed: {e}"

    async def semantic_search_deals(query: str, top_k: int = 5) -> str:
        """
        Semantically search CRM deals and opportunities.

        Args:
            query: Natural language query (e.g. 'deals closing this quarter', 'renewal risk')
            top_k: Number of results to return (default 5, max 20)
        """
        top_k = min(top_k, 20)
        try:
            matches = await _query(query, NAMESPACE_DEALS, top_k)
            if not matches:
                return f"No deal records found for '{query}'."
            lines = [f"Top {len(matches)} deal matches for '{query}':\n"]
            for m in matches:
                meta = m.get("metadata", {})
                score = m.get("score", 0)
                name = meta.get("name", "Unknown deal")
                text = meta.get("text", "")
                lines.append(f"[score={score:.2f}] {name}: {text}")
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"Pinecone deal search error: {e}")
            return f"Search failed: {e}"

    return [
        StructuredTool.from_function(
            coroutine=semantic_search_transcripts,
            name="semantic_search_transcripts",
            description=(
                "Semantically search meeting transcripts. Use for conceptual queries like "
                "'discussions about budget', 'moments the team disagreed', or 'action items about X'."
            ),
        ),
        StructuredTool.from_function(
            coroutine=semantic_search_knowledge,
            name="semantic_search_knowledge",
            description="Semantically search the user's uploaded knowledge base documents.",
        ),
        StructuredTool.from_function(
            coroutine=semantic_search_deals,
            name="semantic_search_deals",
            description="Semantically search CRM deals and opportunities indexed from connected integrations.",
        ),
    ]
