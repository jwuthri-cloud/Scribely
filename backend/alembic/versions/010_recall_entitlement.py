"""Add users.use_recall_sdk entitlement flag.

When true, the desktop app uses the Recall.ai Desktop SDK capture/transcribe/diarize
stack instead of the base local-Whisper path. Backend-controlled, admin-flipped.

Revision ID: 010_recall_entitlement
Revises: 009_deals_and_knowledge
"""

import sqlalchemy as sa

from alembic import op

revision = "010_recall_entitlement"
down_revision = "009_deals_and_knowledge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "use_recall_sdk",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "use_recall_sdk")
