"""Replace PostgreSQL ENUM types with VARCHAR for users.status and meetings.status.

Avoids native enum label mismatches (e.g. ACTIVE vs active) across environments.

Revision ID: 006_varchar_status
Revises: 005_web_push_reminders
"""

import sqlalchemy as sa

from alembic import op

revision = "006_varchar_status"
down_revision = "005_web_push_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Drop defaults that still reference native ENUM types, then convert columns.
        op.execute(sa.text("ALTER TABLE users ALTER COLUMN status DROP DEFAULT"))
        op.execute(
            sa.text(
                "ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(32) USING status::text"
            )
        )
        op.execute(sa.text("DROP TYPE IF EXISTS userstatusenum"))

        op.execute(sa.text("ALTER TABLE meetings ALTER COLUMN status DROP DEFAULT"))
        op.execute(
            sa.text(
                "ALTER TABLE meetings ALTER COLUMN status TYPE VARCHAR(32) USING status::text"
            )
        )
        op.execute(
            sa.text("ALTER TABLE meetings ALTER COLUMN status SET DEFAULT 'uploaded'")
        )
        op.execute(sa.text("DROP TYPE IF EXISTS meetingstatusenum"))
        return

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column(
                "status",
                type_=sa.String(32),
                existing_type=sa.String(),
                nullable=True,
            )
        with op.batch_alter_table("meetings") as batch_op:
            batch_op.alter_column(
                "status",
                type_=sa.String(32),
                existing_type=sa.String(),
                nullable=False,
            )


def downgrade() -> None:
    # Recreating PostgreSQL ENUMs from VARCHAR is lossy; use a backup if you need rollback.
    raise NotImplementedError("Downgrade not supported for VARCHAR/ENUM migration")
