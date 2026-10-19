"""Keep the original Wazuh intake path open only on installations that already used it

Before ingest tokens existed, Wazuh posted to /api/webhook/wazuh without
authentication. Installations that already have Wazuh alerts keep that path
open (until a Wazuh token is generated) so their integration does not break;
new installations start with it closed.

Revision ID: 0003_legacy_wazuh_intake
Revises: 0002_connectors
Create Date: 2026-10-19
"""
from alembic import op

revision = "0003_legacy_wazuh_intake"
down_revision = "0002_connectors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO system_settings (key, value) "
        "SELECT 'wazuh_legacy_intake', 'true'::json "
        "WHERE EXISTS (SELECT 1 FROM alerts_v2 WHERE source_system = 'wazuh') "
        "AND NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'wazuh_legacy_intake')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM system_settings WHERE key = 'wazuh_legacy_intake'")
