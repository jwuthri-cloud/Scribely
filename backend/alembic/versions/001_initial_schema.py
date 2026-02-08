"""Initial schema with users, conversations, messages, agents, and agent_runs.

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Users table ###
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('clerk_id', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('username', sa.String(length=100), nullable=True),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', 'SUSPENDED', name='userstatusenum'), nullable=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.Column('preferences', sa.JSON(), nullable=True),
        sa.Column('extra_metadata', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_clerk_id'), 'users', ['clerk_id'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # ### Conversations table ###
    op.create_table(
        'conversations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('agent_type', sa.String(length=100), nullable=True),
        sa.Column('model_name', sa.String(length=100), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'ARCHIVED', 'DELETED', name='conversationstatusenum'), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('last_message_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conversations_user_id'), 'conversations', ['user_id'], unique=False)
    op.create_index(op.f('ix_conversations_status'), 'conversations', ['status'], unique=False)

    # ### Messages table ###
    op.create_table(
        'messages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.String(), nullable=False),
        sa.Column('role', sa.Enum('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', name='messageroleenum'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('tool_calls', sa.JSON(), nullable=True),
        sa.Column('tool_call_id', sa.String(length=100), nullable=True),
        sa.Column('tool_name', sa.String(length=100), nullable=True),
        sa.Column('tokens_input', sa.Integer(), nullable=True),
        sa.Column('tokens_output', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('structured_output', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_messages_conversation_id'), 'messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_messages_role'), 'messages', ['role'], unique=False)
    op.create_index(op.f('ix_messages_created_at'), 'messages', ['created_at'], unique=False)

    # ### Agents table ###
    op.create_table(
        'agents',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('agent_type', sa.String(length=50), nullable=False),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('model_name', sa.String(length=100), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('max_tokens', sa.Integer(), nullable=True),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('tool_choice', sa.String(length=50), nullable=True),
        sa.Column('response_schema', sa.JSON(), nullable=True),
        sa.Column('response_schema_name', sa.String(length=100), nullable=True),
        sa.Column('fallback_models', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agents_name'), 'agents', ['name'], unique=True)
    op.create_index(op.f('ix_agents_slug'), 'agents', ['slug'], unique=True)
    op.create_index(op.f('ix_agents_agent_type'), 'agents', ['agent_type'], unique=False)
    op.create_index(op.f('ix_agents_is_active'), 'agents', ['is_active'], unique=False)
    op.create_index(op.f('ix_agents_created_by'), 'agents', ['created_by'], unique=False)

    # ### Agent Runs table ###
    op.create_table(
        'agent_runs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('agent_id', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('parent_run_id', sa.String(), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', name='agentrunstatusenum'), nullable=True),
        sa.Column('input_data', sa.JSON(), nullable=False),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('error_type', sa.String(length=100), nullable=True),
        sa.Column('model_used', sa.String(length=100), nullable=True),
        sa.Column('tokens_input', sa.Integer(), nullable=True),
        sa.Column('tokens_output', sa.Integer(), nullable=True),
        sa.Column('total_tokens', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('tool_calls_count', sa.Integer(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=True),
        sa.Column('cost_cents', sa.Integer(), nullable=True),
        sa.Column('trace_id', sa.String(length=100), nullable=True),
        sa.Column('span_id', sa.String(length=100), nullable=True),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('tool_calls', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ),
        sa.ForeignKeyConstraint(['parent_run_id'], ['agent_runs.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agent_runs_agent_id'), 'agent_runs', ['agent_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_conversation_id'), 'agent_runs', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_user_id'), 'agent_runs', ['user_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_parent_run_id'), 'agent_runs', ['parent_run_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_status'), 'agent_runs', ['status'], unique=False)
    op.create_index(op.f('ix_agent_runs_trace_id'), 'agent_runs', ['trace_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_session_id'), 'agent_runs', ['session_id'], unique=False)
    op.create_index(op.f('ix_agent_runs_created_at'), 'agent_runs', ['created_at'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_index(op.f('ix_agent_runs_created_at'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_session_id'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_trace_id'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_status'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_parent_run_id'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_user_id'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_conversation_id'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_agent_id'), table_name='agent_runs')
    op.drop_table('agent_runs')

    op.drop_index(op.f('ix_agents_created_by'), table_name='agents')
    op.drop_index(op.f('ix_agents_is_active'), table_name='agents')
    op.drop_index(op.f('ix_agents_agent_type'), table_name='agents')
    op.drop_index(op.f('ix_agents_slug'), table_name='agents')
    op.drop_index(op.f('ix_agents_name'), table_name='agents')
    op.drop_table('agents')

    op.drop_index(op.f('ix_messages_created_at'), table_name='messages')
    op.drop_index(op.f('ix_messages_role'), table_name='messages')
    op.drop_index(op.f('ix_messages_conversation_id'), table_name='messages')
    op.drop_table('messages')

    op.drop_index(op.f('ix_conversations_status'), table_name='conversations')
    op.drop_index(op.f('ix_conversations_user_id'), table_name='conversations')
    op.drop_table('conversations')

    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_clerk_id'), table_name='users')
    op.drop_table('users')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS agentrunstatusenum')
    op.execute('DROP TYPE IF EXISTS messageroleenum')
    op.execute('DROP TYPE IF EXISTS conversationstatusenum')
    op.execute('DROP TYPE IF EXISTS userstatusenum')
