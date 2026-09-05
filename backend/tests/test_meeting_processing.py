"""Meeting processing model / enum smoke tests."""

from app.database.models.meeting_processing import (
    MeetingProcessingStatus,
    PipelineEligibility,
)


def test_meeting_processing_status_values() -> None:
    assert MeetingProcessingStatus.COMPLETED.value == "completed"
    assert PipelineEligibility.NOT_APPLICABLE.value == "not_applicable"
