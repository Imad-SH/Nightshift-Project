"""Give the TheHive reference index its standard name on older databases

Databases created before migrations existed may have the index under a hand-made
name (idx_thehive_id). Rename it so the schema matches the models exactly; nothing
changes on databases that already use the standard name.

Revision ID: 0004_thehive_index_name
Revises: 0003_legacy_wazuh_intake
Create Date: 2026-10-19
"""
from alembic import op

revision = "0004_thehive_index_name"
down_revision = "0003_legacy_wazuh_intake"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_thehive_id')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_alerts_v2_thehive_id') THEN
                ALTER INDEX idx_thehive_id RENAME TO ix_alerts_v2_thehive_id;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
