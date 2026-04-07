"""Errors from the meeting post-processing pipeline with a stable ``step`` label."""

from __future__ import annotations

from typing import Optional


class PipelineStepError(Exception):
    """Raised when a named pipeline step fails; ``step`` is stored on the meeting_processing row."""

    def __init__(
        self,
        step: str,
        message: str,
        cause: Optional[BaseException] = None,
    ) -> None:
        self.step = step
        self.cause = cause
        text = message or (str(cause) if cause else "pipeline error")
        super().__init__(text)
