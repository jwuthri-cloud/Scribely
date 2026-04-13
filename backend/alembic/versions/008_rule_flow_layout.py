"""Add rules.flow_layout for React Flow graph persistence.

Revision ID: 008_rule_flow_layout
Revises: 007_meeting_rules
"""

from alembic import op
import sqlalchemy as sa

revision = "008_rule_flow_layout"
down_revision = "007_meeting_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rules",
        sa.Column("flow_layout", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rules", "flow_layout")
