"""Calendar integration: connections, events, participants.

Revision ID: 002
Revises: 001
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_connections",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("sync_token", sa.Text(), nullable=True),
        sa.Column("webhook_channel_id", sa.String(255), nullable=True),
        sa.Column("webhook_resource_id", sa.String(255), nullable=True),
        sa.Column("webhook_expiration", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_calendar_connections_user_provider"),
    )
    op.create_index("ix_calendar_connections_user_id", "calendar_connections", ["user_id"])

    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("calendar_connection_id", sa.String(), nullable=False),
        sa.Column("google_event_id", sa.String(255), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False, server_default="UTC"),
        sa.Column("location", sa.String(500), nullable=True),
        sa.Column("meeting_url", sa.String(1000), nullable=True),
        sa.Column(
            "meeting_platform",
            sa.String(32),
            nullable=False,
            server_default="none",
        ),
        sa.Column("organizer_email", sa.String(255), nullable=True),
        sa.Column("organizer_name", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="confirmed",
        ),
        sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("recurring_event_id", sa.String(255), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["calendar_connection_id"], ["calendar_connections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "google_event_id", name="uq_calendar_events_user_google_event"),
    )
    op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
    op.create_index("ix_calendar_events_calendar_connection_id", "calendar_events", ["calendar_connection_id"])
    op.create_index("ix_calendar_events_user_start", "calendar_events", ["user_id", "start_time"])

    op.create_table(
        "calendar_event_participants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("calendar_event_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("is_organizer", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "response_status",
            sa.String(32),
            nullable=False,
            server_default="needs_action",
        ),
        sa.Column("is_self", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["calendar_event_id"], ["calendar_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calendar_event_participants_calendar_event_id", "calendar_event_participants", ["calendar_event_id"])


def downgrade() -> None:
    op.drop_index("ix_calendar_event_participants_calendar_event_id", table_name="calendar_event_participants")
    op.drop_table("calendar_event_participants")

    op.drop_index("ix_calendar_events_user_start", table_name="calendar_events")
    op.drop_index("ix_calendar_events_calendar_connection_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
    op.drop_table("calendar_events")

    op.drop_index("ix_calendar_connections_user_id", table_name="calendar_connections")
    op.drop_table("calendar_connections")
