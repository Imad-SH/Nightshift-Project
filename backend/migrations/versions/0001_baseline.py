"""Baseline: the schema as it existed before migrations were introduced

Fresh installs create it here. Existing databases (created by the app's former
create_all at startup) already have it and are stamped at this revision without
running it.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alerts_v2",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("wazuh_id", sa.String()),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("title", sa.String()),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("level", sa.String()),
        sa.Column("rule_level", sa.Integer()),
        sa.Column("source", sa.String()),
        sa.Column("status", sa.String()),
        sa.Column("verdict", sa.String(), nullable=True),
        sa.Column("raw_data", sa.JSON()),
        sa.Column("flowintel_id", sa.String(), nullable=True),
        sa.Column("thehive_id", sa.String(), nullable=True),
    )
    op.create_index("ix_alerts_v2_id", "alerts_v2", ["id"])
    op.create_index("ix_alerts_v2_wazuh_id", "alerts_v2", ["wazuh_id"], unique=True)
    op.create_index("ix_alerts_v2_timestamp", "alerts_v2", ["timestamp"])
    op.create_index("ix_alerts_v2_flowintel_id", "alerts_v2", ["flowintel_id"])
    op.create_index("ix_alerts_v2_thehive_id", "alerts_v2", ["thehive_id"])

    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.JSON()),
    )
    op.create_index("ix_system_settings_key", "system_settings", ["key"])


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("alerts_v2")
