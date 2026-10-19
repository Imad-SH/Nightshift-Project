"""Connectors: record where each alert came from and a generic SOAR case reference

Add-only: new nullable columns, a backfill of the new case columns from the
legacy thehive_id / flowintel_id (which are kept as they are), and the
timestamp index the model always declared but older databases never got.

Revision ID: 0002_connectors
Revises: 0001_baseline
Create Date: 2026-10-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_connectors"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Which SIEM connector ingested the alert. Everything before connectors came from Wazuh.
    op.add_column("alerts_v2", sa.Column("source_system", sa.String(32), nullable=True, server_default="wazuh"))
    # Case created in the SOAR: which system, its id there, and a browser link
    op.add_column("alerts_v2", sa.Column("case_system", sa.String(32), nullable=True))
    op.add_column("alerts_v2", sa.Column("case_id", sa.String(), nullable=True))
    op.add_column("alerts_v2", sa.Column("case_url", sa.String(), nullable=True))

    # Existing escalations. When an alert went to both, TheHive wins, as it did in the UI.
    # Flowintel ids were stored as "FI-<id>"; the case id is the number.
    op.execute(
        "UPDATE alerts_v2 SET case_system = 'thehive', case_id = thehive_id "
        "WHERE thehive_id IS NOT NULL"
    )
    op.execute(
        "UPDATE alerts_v2 SET case_system = 'flowintel', case_id = regexp_replace(flowintel_id, '^FI-', '') "
        "WHERE flowintel_id IS NOT NULL AND case_id IS NULL"
    )

    # Time-range queries (history, statistics) scan the whole table without it
    op.execute("CREATE INDEX IF NOT EXISTS ix_alerts_v2_timestamp ON alerts_v2 (timestamp)")


def downgrade() -> None:
    op.drop_column("alerts_v2", "case_url")
    op.drop_column("alerts_v2", "case_id")
    op.drop_column("alerts_v2", "case_system")
    op.drop_column("alerts_v2", "source_system")
