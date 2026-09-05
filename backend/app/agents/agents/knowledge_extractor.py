"""Knowledge extraction agent — distills per-contact facts from a transcript."""

from __future__ import annotations

import json
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.prompt.knowledge_extractor import SYSTEM_PROMPT
from app.agents.structured_output.knowledge_extractor import (
    ContactFact,
    KnowledgeExtractionResponse,
)
from app.config import get_settings
from app.infrastructure.circuit_breaker import get_llm_circuit_breaker
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("knowledge_extractor_agent")

MAX_TRANSCRIPT_CHARS = 60_000


class KnowledgeExtractorAgent:
    """Extract durable, per-contact facts from a meeting transcript via LLM."""

    def __init__(
        self,
        llm_provider: Optional[OpenRouterProvider] = None,
        model_name: Optional[str] = None,
        temperature: float = 0.2,
    ) -> None:
        settings = get_settings()
        self.llm_provider = llm_provider or OpenRouterProvider()
        self.model_name = (
            model_name
            or getattr(settings, "knowledge_extractor_model", None)
            or getattr(settings, "default_model", None)
            or "openai/gpt-4o-mini"
        )
        self.temperature = temperature
        self.llm = self.llm_provider.get_llm(
            model_name=self.model_name,
            temperature=self.temperature,
        )
        logger.info(
            f"[KnowledgeExtractorAgent] Initialized with model: {self.model_name}"
        )

    async def extract(
        self,
        *,
        transcript: list[dict] | str,
        owner_email: Optional[str],
        participants: list[dict],
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> KnowledgeExtractionResponse:
        """Extract per-contact knowledge from a transcript.

        ``participants`` is a list of ``{"email": str, "full_name": str | None}``.
        Non-owner participants are the extraction targets.
        """
        external = [
            p
            for p in participants
            if p.get("email") and p["email"].lower() != (owner_email or "").lower()
        ]
        if not external:
            return KnowledgeExtractionResponse(facts=[])

        transcript_text = _transcript_to_text(transcript)
        if not transcript_text.strip():
            return KnowledgeExtractionResponse(facts=[])

        if len(transcript_text) > MAX_TRANSCRIPT_CHARS:
            transcript_text = (
                transcript_text[:MAX_TRANSCRIPT_CHARS] + "\n[...truncated]"
            )

        participant_block = "\n".join(
            f"- {p['email'].lower()}"
            + (f" ({p['full_name']})" if p.get("full_name") else "")
            for p in external
        )
        owner_line = (
            f"Owner email (do NOT extract facts about them): {owner_email}\n"
            if owner_email
            else ""
        )

        user_content = (
            f"{owner_line}"
            f"External participants:\n{participant_block}\n\n"
            f"Transcript:\n{transcript_text}"
        )

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]

        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=user_id,
            tags=["knowledge-extraction"],
            metadata={
                "agent_type": "knowledge_extractor",
                "model": self.model_name,
                "participant_count": str(len(external)),
            },
            run_name="knowledge-extraction",
        )

        circuit_breaker = get_llm_circuit_breaker()

        async def invoke_llm() -> KnowledgeExtractionResponse:
            structured_llm = self.llm.with_structured_output(
                KnowledgeExtractionResponse
            )
            return await structured_llm.ainvoke(messages, config=langfuse_config)

        try:
            response: KnowledgeExtractionResponse = await circuit_breaker.call(
                invoke_llm
            )
        except Exception as e:
            logger.error(f"[KnowledgeExtractorAgent] LLM call failed: {e}")
            return KnowledgeExtractionResponse(facts=[])

        allowed = {p["email"].lower() for p in external}
        filtered = [f for f in response.facts if f.email.lower() in allowed]
        if len(filtered) != len(response.facts):
            logger.info(
                f"[KnowledgeExtractorAgent] Dropped "
                f"{len(response.facts) - len(filtered)} facts with unknown emails"
            )

        return KnowledgeExtractionResponse(facts=filtered)


def _transcript_to_text(transcript: list[dict] | str) -> str:
    """Normalize a transcript (list of dicts or string) into speaker-labeled text."""
    if isinstance(transcript, str):
        return transcript
    if not transcript:
        return ""

    lines: list[str] = []
    for entry in transcript:
        if not isinstance(entry, dict):
            continue
        speaker = (
            entry.get("speaker_name")
            or entry.get("speaker")
            or entry.get("name")
            or "Unknown"
        )
        text = entry.get("text") or entry.get("content") or ""
        if not text:
            continue
        lines.append(f"{speaker}: {text}")

    if not lines:
        try:
            return json.dumps(transcript)[:MAX_TRANSCRIPT_CHARS]
        except (TypeError, ValueError):
            return ""
    return "\n".join(lines)


__all__ = ["KnowledgeExtractorAgent", "ContactFact", "KnowledgeExtractionResponse"]
