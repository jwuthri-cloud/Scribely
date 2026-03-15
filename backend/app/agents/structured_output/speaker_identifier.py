"""Structured output models for speaker identification agent."""

from pydantic import BaseModel, Field


class SpeakerMapping(BaseModel):
    """A single speaker label → real name mapping."""

    label: str = Field(
        ...,
        description="The anonymous speaker label (e.g. 'Speaker 0')",
    )
    name: str = Field(
        ...,
        description="The identified real name, or the original label if unknown",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence in the identification (0.0 to 1.0)",
    )


class SpeakerIdentificationResponse(BaseModel):
    """Structured response from the speaker identification agent."""

    speakers: list[SpeakerMapping] = Field(
        default_factory=list,
        description="List of speaker label → name mappings",
    )
    reasoning: str = Field(
        default="",
        description="Brief explanation of how names were identified",
    )

    def to_map(self) -> dict[str, str]:
        """Convert to a flat ``{ label: name }`` dict."""
        return {s.label: s.name for s in self.speakers}
