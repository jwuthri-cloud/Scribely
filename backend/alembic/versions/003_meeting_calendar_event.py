"""Link meetings to calendar events for participant-based transcription hints."""

from alembic import op
import sqlalchemy as sa

revision = "003_meeting_calendar_event"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column(
            "calendar_event_id",
            sa.String(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_meetings_calendar_event_id",
        "meetings",
        "calendar_events",
        ["calendar_event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_meetings_calendar_event_id",
        "meetings",
        ["calendar_event_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_meetings_calendar_event_id", table_name="meetings")
    op.drop_constraint("fk_meetings_calendar_event_id", "meetings", type_="foreignkey")
    op.drop_column("meetings", "calendar_event_id")
