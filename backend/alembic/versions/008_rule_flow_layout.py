"""Add rules.flow_layout for React Flow graph persistence.

Revision ID: 008_rule_flow_layout
Revises: 007_meeting_rules

Idempotent: ``flow_layout`` may already exist if the ORM ran ``create_all`` before
this revision was applied (``alembic_version`` can lag the real schema).
"""

from alembic import op
import sqlalchemy as sa

revision = "008_rule_flow_layout"
down_revision = "007_meeting_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("rules")}
    if "flow_layout" in cols:
        return
    op.add_column(
        "rules",
        sa.Column("flow_layout", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("rules")}
    if "flow_layout" not in cols:
        return
    op.drop_column("rules", "flow_layout")
