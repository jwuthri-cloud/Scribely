"""Structured output model for the AssistantAgent."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class AssistantResponse(BaseModel):
    """
    Structured response from the webapp assistant agent.

    All fields have defaults to enable incremental streaming parsing.
    """

    response: str = Field(
        default="",
        description="The main response to the user",
    )
    sentiment: Literal["positive", "neutral", "negative"] = Field(
        default="neutral",
        description="Detected sentiment of the user's message",
    )
    requires_escalation: bool = Field(
        default=False,
        description="Whether this requires human follow-up",
    )
    escalation_reason: Optional[str] = Field(
        default=None,
        description="Reason for escalation if requires_escalation is true",
    )
    suggested_actions: list[str] = Field(
        default_factory=list,
        description="Suggested next steps or follow-up actions",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence level in the response (0.0 to 1.0)",
    )
