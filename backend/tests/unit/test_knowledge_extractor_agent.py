"""Tests for the KnowledgeExtractorAgent."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents.agents.knowledge_extractor import (
    KnowledgeExtractorAgent,
    _transcript_to_text,
)
from app.agents.structured_output.knowledge_extractor import (
    ContactFact,
    KnowledgeExtractionResponse,
)


@pytest.mark.unit
class TestTranscriptNormalization:
    def test_list_of_dicts(self):
        entries = [
            {"speaker": "Alice", "text": "Hello"},
            {"speaker_name": "Bob", "text": "Hi there"},
        ]
        out = _transcript_to_text(entries)
        assert "Alice: Hello" in out
        assert "Bob: Hi there" in out

    def test_empty(self):
        assert _transcript_to_text([]) == ""

    def test_string_passthrough(self):
        assert _transcript_to_text("raw text") == "raw text"


@pytest.mark.asyncio
@pytest.mark.unit
class TestKnowledgeExtractorAgent:
    async def _make_agent(self, response: KnowledgeExtractionResponse) -> KnowledgeExtractorAgent:
        provider = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(return_value=response)
        llm = MagicMock()
        llm.with_structured_output = MagicMock(return_value=structured)
        provider.get_llm = MagicMock(return_value=llm)
        return KnowledgeExtractorAgent(llm_provider=provider, model_name="x")

    async def test_filters_unknown_emails(self):
        fake = KnowledgeExtractionResponse(
            facts=[
                ContactFact(email="jade@acme.com", fact="Runs platform", category="role", confidence=0.9),
                ContactFact(email="ghost@other.com", fact="Invented", category="other", confidence=0.1),
            ]
        )
        agent = await self._make_agent(fake)
        result = await agent.extract(
            transcript=[{"speaker": "Jade", "text": "I run platform"}],
            owner_email="julien@scribely.com",
            participants=[{"email": "jade@acme.com", "full_name": "Jade"}],
        )
        assert len(result.facts) == 1
        assert result.facts[0].email == "jade@acme.com"

    async def test_empty_when_no_external(self):
        agent = await self._make_agent(KnowledgeExtractionResponse(facts=[]))
        result = await agent.extract(
            transcript=[{"speaker": "me", "text": "solo"}],
            owner_email="julien@scribely.com",
            participants=[{"email": "julien@scribely.com", "full_name": "Me"}],
        )
        assert result.facts == []

    async def test_returns_empty_on_llm_failure(self):
        provider = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))
        llm = MagicMock()
        llm.with_structured_output = MagicMock(return_value=structured)
        provider.get_llm = MagicMock(return_value=llm)
        agent = KnowledgeExtractorAgent(llm_provider=provider, model_name="x")

        result = await agent.extract(
            transcript=[{"speaker": "Jade", "text": "hi"}],
            owner_email="julien@scribely.com",
            participants=[{"email": "jade@acme.com"}],
        )
        assert result.facts == []
