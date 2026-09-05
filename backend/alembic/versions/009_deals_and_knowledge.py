"""Add deals, contacts, contact_knowledge tables + meetings.deal_id.

Revision ID: 009_deals_and_knowledge
Revises: 008_rule_flow_layout

Uses IF NOT EXISTS on tables and indexes (same pattern as 007) so ``alembic upgrade``
succeeds when objects were already created by app startup (``Base.metadata.create_all``)
before this revision ran. ``create_all`` does not add new columns to existing tables,
so ``meetings.deal_id`` is applied only when missing.
"""

import sqlalchemy as sa

from alembic import op

revision = "009_deals_and_knowledge"
down_revision = "008_rule_flow_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deals",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("extra_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "domain", name="uq_deals_user_domain"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_deals_user_id", "deals", ["user_id"], unique=False, if_not_exists=True
    )

    op.create_table(
        "contacts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("deal_id", sa.String(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "email", name="uq_contacts_user_email"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_contacts_user_id", "contacts", ["user_id"], unique=False, if_not_exists=True
    )
    op.create_index(
        "ix_contacts_deal_id", "contacts", ["deal_id"], unique=False, if_not_exists=True
    )

    op.create_table(
        "contact_knowledge",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("contact_id", sa.String(), nullable=False),
        sa.Column("deal_id", sa.String(), nullable=True),
        sa.Column("meeting_id", sa.String(), nullable=False),
        sa.Column("fact", sa.Text(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False, server_default="other"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("source_snippet", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_contact_knowledge_user_id",
        "contact_knowledge",
        ["user_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_contact_knowledge_contact_id",
        "contact_knowledge",
        ["contact_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_contact_knowledge_deal_id",
        "contact_knowledge",
        ["deal_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_contact_knowledge_user_contact",
        "contact_knowledge",
        ["user_id", "contact_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_contact_knowledge_meeting",
        "contact_knowledge",
        ["meeting_id"],
        unique=False,
        if_not_exists=True,
    )

    bind = op.get_bind()
    insp = sa.inspect(bind)
    meeting_cols = {c["name"] for c in insp.get_columns("meetings")}
    if "deal_id" not in meeting_cols:
        op.add_column("meetings", sa.Column("deal_id", sa.String(), nullable=True))

    insp = sa.inspect(bind)
    fk_names = {
        fk["name"] for fk in insp.get_foreign_keys("meetings") if fk.get("name")
    }
    if "fk_meetings_deal_id" not in fk_names:
        op.create_foreign_key(
            "fk_meetings_deal_id",
            "meetings",
            "deals",
            ["deal_id"],
            ["id"],
            ondelete="SET NULL",
        )

    insp = sa.inspect(bind)
    index_names = {ix["name"] for ix in insp.get_indexes("meetings")}
    if "ix_meetings_deal_id" not in index_names:
        op.create_index(
            "ix_meetings_deal_id",
            "meetings",
            ["deal_id"],
            unique=False,
            if_not_exists=True,
        )


def downgrade() -> None:
    op.drop_index("ix_meetings_deal_id", table_name="meetings")
    op.drop_constraint("fk_meetings_deal_id", "meetings", type_="foreignkey")
    op.drop_column("meetings", "deal_id")

    op.drop_index("ix_contact_knowledge_meeting", table_name="contact_knowledge")
    op.drop_index("ix_contact_knowledge_user_contact", table_name="contact_knowledge")
    op.drop_index("ix_contact_knowledge_deal_id", table_name="contact_knowledge")
    op.drop_index("ix_contact_knowledge_contact_id", table_name="contact_knowledge")
    op.drop_index("ix_contact_knowledge_user_id", table_name="contact_knowledge")
    op.drop_table("contact_knowledge")

    op.drop_index("ix_contacts_deal_id", table_name="contacts")
    op.drop_index("ix_contacts_user_id", table_name="contacts")
    op.drop_table("contacts")

    op.drop_index("ix_deals_user_id", table_name="deals")
    op.drop_table("deals")
