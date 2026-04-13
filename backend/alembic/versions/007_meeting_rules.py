"""Meeting automation rules (rules, rule_steps, rule_executions).

Revision ID: 007_meeting_rules
Revises: 006_varchar_status

Uses IF NOT EXISTS so ``alembic upgrade`` succeeds when tables were already created
by app startup (``Base.metadata.create_all``) before the version table advanced.
"""

from alembic import op
import sqlalchemy as sa

revision = "007_meeting_rules"
down_revision = "006_varchar_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rules",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("trigger", sa.String(32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_rules_user_id", "rules", ["user_id"], unique=False, if_not_exists=True
    )
    op.create_index(
        "ix_rules_user_trigger",
        "rules",
        ["user_id", "trigger"],
        unique=False,
        if_not_exists=True,
    )

    op.create_table(
        "rule_steps",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("rule_id", sa.String(), sa.ForeignKey("rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("step_type", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_rule_steps_rule_id", "rule_steps", ["rule_id"], unique=False, if_not_exists=True
    )
    op.create_index(
        "ix_rule_steps_rule_order",
        "rule_steps",
        ["rule_id", "order_index"],
        unique=False,
        if_not_exists=True,
    )

    op.create_table(
        "rule_executions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("rule_id", sa.String(), sa.ForeignKey("rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("meeting_id", sa.String(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("step_results", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_rule_executions_rule_id",
        "rule_executions",
        ["rule_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_rule_executions_meeting_id",
        "rule_executions",
        ["meeting_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_rule_executions_meeting",
        "rule_executions",
        ["meeting_id", "started_at"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rule_executions_meeting", table_name="rule_executions", if_exists=True
    )
    op.drop_index(
        "ix_rule_executions_meeting_id", table_name="rule_executions", if_exists=True
    )
    op.drop_index(
        "ix_rule_executions_rule_id", table_name="rule_executions", if_exists=True
    )
    op.drop_table("rule_executions", if_exists=True)
    op.drop_index("ix_rule_steps_rule_order", table_name="rule_steps", if_exists=True)
    op.drop_index("ix_rule_steps_rule_id", table_name="rule_steps", if_exists=True)
    op.drop_table("rule_steps", if_exists=True)
    op.drop_index("ix_rules_user_trigger", table_name="rules", if_exists=True)
    op.drop_index("ix_rules_user_id", table_name="rules", if_exists=True)
    op.drop_table("rules", if_exists=True)
