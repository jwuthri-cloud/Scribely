"""Add meetings table for tracking uploaded meetings.

Revision ID: 003_add_meetings
Revises: 002_drop_non_user
Create Date: 2026-03-19 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '003_add_meetings'
down_revision: Union[str, None] = '002_drop_non_user'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'meetings',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(length=255), nullable=True),
        sa.Column('title', sa.String(length=500), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('entry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.Enum('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', name='meetingstatusenum'), nullable=False, server_default='UPLOADED'),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meetings_user_id', 'meetings', ['user_id'])
    op.create_index('ix_meetings_user_recorded', 'meetings', ['user_id', 'recorded_at'])


def downgrade() -> None:
    op.drop_index('ix_meetings_user_recorded', table_name='meetings')
    op.drop_index('ix_meetings_user_id', table_name='meetings')
    op.drop_table('meetings')
    sa.Enum('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', name='meetingstatusenum').drop(op.get_bind(), checkfirst=True)
