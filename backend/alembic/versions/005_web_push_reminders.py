"""Web push subscriptions and calendar reminder deliveries."""

from alembic import op
import sqlalchemy as sa

revision = "005_web_push_reminders"
down_revision = "004_meeting_processing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_push_subscriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index(
        "ix_user_push_subscriptions_user_id",
        "user_push_subscriptions",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "calendar_reminder_deliveries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "calendar_event_id",
            sa.String(),
            sa.ForeignKey("calendar_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reminder_kind", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "calendar_event_id",
            "reminder_kind",
            name="uq_calendar_reminder_delivery",
        ),
    )
    op.create_index(
        "ix_calendar_reminder_deliveries_user_id",
        "calendar_reminder_deliveries",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_calendar_reminder_deliveries_calendar_event_id",
        "calendar_reminder_deliveries",
        ["calendar_event_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_reminder_deliveries_calendar_event_id", table_name="calendar_reminder_deliveries")
    op.drop_index("ix_calendar_reminder_deliveries_user_id", table_name="calendar_reminder_deliveries")
    op.drop_table("calendar_reminder_deliveries")
    op.drop_index("ix_user_push_subscriptions_user_id", table_name="user_push_subscriptions")
    op.drop_table("user_push_subscriptions")
