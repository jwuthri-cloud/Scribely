"""Meeting processing state (1:1 with meetings)."""

import sqlalchemy as sa

from alembic import op

revision = "004_meeting_processing"
down_revision = "003_meeting_calendar_event"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meeting_processing",
        sa.Column(
            "meeting_id",
            sa.String(),
            sa.ForeignKey("meetings.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "pipeline_eligibility",
            sa.String(32),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column(
            "processing_status", sa.String(32), nullable=False, server_default="none"
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("failed_at", sa.DateTime(), nullable=True),
        sa.Column("diarization_provider", sa.String(32), nullable=True),
        sa.Column("utterance_count", sa.Integer(), nullable=True),
        sa.Column("distinct_speaker_labels", sa.Integer(), nullable=True),
        sa.Column(
            "enriched_transcript_saved",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "has_nonempty_diarization",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("last_error_traceback", sa.Text(), nullable=True),
        sa.Column("failed_step", sa.String(64), nullable=True),
        sa.Column("result_summary", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_meeting_processing_status", "meeting_processing", ["processing_status"]
    )


def downgrade() -> None:
    op.drop_index("ix_meeting_processing_status", table_name="meeting_processing")
    op.drop_table("meeting_processing")
