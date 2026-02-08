"""Structured output models for customer support agent."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class CustomerSupportResponse(BaseModel):
    """Structured response from customer support agent.
    
    All fields have defaults to enable incremental streaming parsing.
    The LLM will fill in the actual values as it generates.
    """

    response: str = Field(
        default="",
        description="The main response to the customer"
    )
    sentiment: Literal["positive", "neutral", "negative"] = Field(
        default="neutral",
        description="Detected sentiment of the customer inquiry"
    )
    requires_escalation: bool = Field(
        default=False,
        description="Whether this issue requires escalation to human support"
    )
    escalation_reason: Optional[str] = Field(
        default=None,
        description="Reason for escalation if requires_escalation is true"
    )
    suggested_actions: list[str] = Field(
        default_factory=list,
        description="List of suggested actions or next steps"
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence level in the response (0.0 to 1.0)"
    )
