"""Add meetings.recall_upload_id — correlates Recall async webhooks to a meeting.

The desktop tags the transcript with the Recall SDK upload id; the sdk_upload.complete
webhook carries the same id, letting us download the recording into the right meeting.

Revision ID: 011_recall_upload_id
Revises: 010_recall_entitlement
"""

from alembic import op
import sqlalchemy as sa

revision = "011_recall_upload_id"
down_revision = "010_recall_entitlement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("recall_upload_id", sa.String(length=255), nullable=True))
    op.create_index("ix_meetings_recall_upload_id", "meetings", ["recall_upload_id"])


def downgrade() -> None:
    op.drop_index("ix_meetings_recall_upload_id", table_name="meetings")
    op.drop_column("meetings", "recall_upload_id")
