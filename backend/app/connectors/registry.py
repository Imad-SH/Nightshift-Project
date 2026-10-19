"""All available connectors, by kind and id."""
from typing import Dict, Optional, Union

from app.connectors.base import SiemConnector, SoarConnector
from app.connectors.siem.wazuh import WazuhConnector
from app.connectors.siem.webhook import GenericWebhookConnector
from app.connectors.soar.flowintel import FlowintelConnector
from app.connectors.soar.thehive import TheHiveConnector
from app.connectors.soar.webhook import WebhookSoarConnector

SIEM: Dict[str, SiemConnector] = {c.id: c for c in (WazuhConnector(), GenericWebhookConnector())}
SOAR: Dict[str, SoarConnector] = {c.id: c for c in (FlowintelConnector(), TheHiveConnector(), WebhookSoarConnector())}

# Selecting "none" as the active SOAR turns escalation off
NO_SOAR = "none"


def get(kind: str, connector_id: str) -> Optional[Union[SiemConnector, SoarConnector]]:
    return (SIEM if kind == "siem" else SOAR).get(connector_id)
