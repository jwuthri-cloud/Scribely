"""Structured output for the knowledge extraction agent."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ContactFact(BaseModel):
    """A single durable fact we learned about a meeting participant."""

    email: str = Field(
        ...,
        description=(
            "Lowercased email of the participant this fact is about. Must match "
            "one of the provided participant emails."
        ),
    )
    fact: str = Field(
        ...,
        description=(
            "A concise, durable fact about this person (role, preference, goal, "
            "pain point, personal detail). One idea per fact. Avoid generic or "
            "ephemeral statements."
        ),
    )
    category: Literal[
        "role", "preference", "pain_point", "goal", "personal", "other"
    ] = Field(
        default="other",
        description="Category of the fact.",
    )
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Confidence this fact is accurate and durable (0.0–1.0).",
    )
    source_snippet: Optional[str] = Field(
        default=None,
        description="Short verbatim transcript snippet that supports this fact.",
    )


class KnowledgeExtractionResponse(BaseModel):
    """Collection of facts extracted from a meeting transcript."""

    facts: list[ContactFact] = Field(
        default_factory=list,
        description="All extracted facts. Empty list if nothing durable was learned.",
    )
