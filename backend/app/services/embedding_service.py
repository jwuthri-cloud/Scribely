"""Service for embedding and indexing entities into Pinecone.

Architecture:
  - Single Pinecone index (VECTOR_DB_INDEX_NAME)
  - Namespaces separate entity types (see NAMESPACE_* constants in vector_search.py)
  - user_id stored in metadata for per-user filtering within each namespace

Namespaces:
  meeting_transcripts  — chunked transcript segments from meetings
  knowledge            — user-uploaded documents / knowledge base
  deals                — CRM deal records (future)
  contacts             — CRM contacts (future)
  notes                — freeform notes (future)
"""
import json
from pathlib import Path
from typing import Optional

import aiofiles

from app.agents.tool.vector_search import NAMESPACE_KNOWLEDGE, NAMESPACE_MEETING_TRANSCRIPTS
from app.config import get_settings
from app.database.models.meeting import Meeting
from app.utils.logging import get_logger

logger = get_logger("embedding_service")

# Number of transcript entries per chunk (~200 tokens each)
CHUNK_SIZE = 5


class EmbeddingService:
    """
    Embeds and upserts entities into the single Pinecone index.

    All vectors share one index; namespace + metadata.user_id provide isolation.
    """

    def __init__(self) -> None:
        self._ready = False
        settings = get_settings()

        if not settings.vector_db_api_key:
            logger.info("Pinecone not configured — EmbeddingService disabled")
            return

        try:
            from pinecone import Pinecone, ServerlessSpec
            from app.infrastructure.llm_provider import OpenRouterEmbeddings

            pc = Pinecone(api_key=settings.vector_db_api_key)
            index_name = settings.vector_db_index_name

            existing = [i.name for i in pc.list_indexes()]
            if index_name not in existing:
                pc.create_index(
                    name=index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
                )
                logger.info(f"Created Pinecone index: {index_name}")

            self._index = pc.Index(index_name)
            self._embeddings = OpenRouterEmbeddings()
            self._ready = True
            logger.info(f"EmbeddingService ready (index={index_name})")
        except Exception as e:
            logger.warning(f"Failed to initialize EmbeddingService: {e}")

    # ------------------------------------------------------------------
    # Meeting transcripts
    # ------------------------------------------------------------------

    async def index_meeting(self, meeting: Meeting) -> int:
        """
        Embed and upsert all transcript chunks for a meeting into the
        'meeting_transcripts' namespace.

        Args:
            meeting: The Meeting ORM object (must have storage_path set)

        Returns:
            Number of vectors upserted
        """
        if not self._ready:
            return 0

        transcript_path = meeting.storage_path
        if not transcript_path.endswith(".json"):
            transcript_path = transcript_path.rsplit(".", 1)[0] + ".json"

        if not Path(transcript_path).exists():
            logger.warning(f"Transcript not found for indexing: {transcript_path}")
            return 0

        try:
            async with aiofiles.open(transcript_path, "r") as f:
                raw = await f.read()
            entries = json.loads(raw)
        except Exception as e:
            logger.error(f"Failed to read transcript {meeting.id}: {e}")
            return 0

        if not entries:
            return 0

        chunks = _chunk_entries(entries, CHUNK_SIZE)
        texts = [c["text"] for c in chunks]

        try:
            embedding_vectors = await self._embeddings.aembed_documents(texts)
        except Exception as e:
            logger.error(f"Embedding failed for meeting {meeting.id}: {e}")
            return 0

        vectors = []
        for i, (chunk, vector) in enumerate(zip(chunks, embedding_vectors)):
            vectors.append({
                "id": f"{meeting.id}-chunk-{i}",
                "values": vector,
                "metadata": {
                    "user_id": meeting.user_id,
                    "meeting_id": meeting.id,
                    "timestamp": chunk.get("timestamp", ""),
                    "speaker": chunk.get("speaker", ""),
                    "text": chunk["text"],
                    "entity_type": "meeting_transcript",
                },
            })

        self._upsert_batch(vectors, namespace=NAMESPACE_MEETING_TRANSCRIPTS)
        logger.info(f"Indexed {len(vectors)} transcript chunks for meeting {meeting.id}")
        return len(vectors)

    async def delete_meeting(self, meeting_id: str, user_id: str) -> None:
        """Remove all transcript vectors for a meeting."""
        if not self._ready:
            return
        try:
            prefix = f"{meeting_id}-chunk-"
            ids = list(self._index.list(prefix=prefix, namespace=NAMESPACE_MEETING_TRANSCRIPTS))
            if ids:
                self._index.delete(ids=ids, namespace=NAMESPACE_MEETING_TRANSCRIPTS)
                logger.info(f"Deleted {len(ids)} vectors for meeting {meeting_id}")
        except Exception as e:
            logger.warning(f"Failed to delete vectors for meeting {meeting_id}: {e}")

    # ------------------------------------------------------------------
    # Generic document indexing (knowledge base, deals, contacts, etc.)
    # ------------------------------------------------------------------

    async def index_document(
        self,
        doc_id: str,
        user_id: str,
        text: str,
        namespace: str,
        metadata: Optional[dict] = None,
    ) -> bool:
        """
        Embed and upsert a single document into the specified namespace.

        Args:
            doc_id: Unique identifier for the document
            user_id: Owner user ID (stored in metadata for filtering)
            text: Text content to embed
            namespace: Target namespace (e.g. NAMESPACE_KNOWLEDGE, NAMESPACE_DEALS)
            metadata: Additional metadata fields to store

        Returns:
            True if successful
        """
        if not self._ready:
            return False
        try:
            vector = await self._embeddings.aembed_query(text)
            self._index.upsert(
                vectors=[{
                    "id": doc_id,
                    "values": vector,
                    "metadata": {
                        "user_id": user_id,
                        "text": text[:1000],  # Pinecone metadata string limit
                        **(metadata or {}),
                    },
                }],
                namespace=namespace,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to index document {doc_id}: {e}")
            return False

    async def delete_document(self, doc_id: str, namespace: str) -> None:
        """Delete a single document from the index."""
        if not self._ready:
            return
        try:
            self._index.delete(ids=[doc_id], namespace=namespace)
        except Exception as e:
            logger.warning(f"Failed to delete document {doc_id}: {e}")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _upsert_batch(self, vectors: list, namespace: str, batch_size: int = 100) -> None:
        for i in range(0, len(vectors), batch_size):
            self._index.upsert(vectors=vectors[i:i + batch_size], namespace=namespace)


def _chunk_entries(entries: list, chunk_size: int) -> list[dict]:
    """Group transcript entries into merged text chunks."""
    chunks = []
    for i in range(0, len(entries), chunk_size):
        group = entries[i:i + chunk_size]
        text = " ".join(e.get("text", "") for e in group)
        first = group[0]
        chunks.append({
            "text": text,
            "timestamp": first.get("timestamp", ""),
            "speaker": first.get("speaker", ""),
        })
    return chunks


# Singleton
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
