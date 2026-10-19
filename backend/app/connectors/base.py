"""
Connector framework: one class per external system.

SIEM connectors turn alerts pushed by a SIEM into Nightshift alerts.
SOAR connectors send investigated alerts to a case-management system.

Each connector declares its configuration as a list of fields. The fields are
stored as system settings (secrets encrypted) and drive both the API and the
form the Integrations screen renders, so adding a connector needs no UI code.
"""
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class ConnectorField:
    key: str                      # system setting name, e.g. "wazuh_url"
    label: str
    type: str = "text"            # text | url | password | number | toggle | select
    required: bool = False
    placeholder: str = ""
    help: str = ""
    default: Any = None
    options: tuple = ()           # for type "select": ((value, label), ...)
    # The secret is only released to the address saved in this field (see settings API)
    bound_to: Optional[str] = None

    @property
    def secret(self) -> bool:
        return self.type == "password"

    def describe(self) -> Dict[str, Any]:
        d = asdict(self)
        d["options"] = [{"value": v, "label": l} for v, l in self.options]
        d["secret"] = self.secret
        return d


@dataclass
class TestResult:
    ok: bool
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedAlert:
    """What every SIEM connector produces from an inbound event."""
    native_id: str                 # the SIEM's own identifier
    timestamp: datetime
    title: str
    source: str                    # host / asset the alert is about
    score: int                     # 0-15, see app.core.severity
    raw: Dict[str, Any]            # the original event, unchanged
    fingerprint: Optional[str] = None  # for dropping bursts of identical events


@dataclass
class EscalationRequest:
    alert_id: str
    title: str
    source: str
    score: int
    node_results: Dict[str, Any]   # AI pipeline output (may be empty)
    is_ai_analyzed: bool
    manual_description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    force: bool = False            # escalate again even if a case exists


@dataclass
class EscalationResult:
    case_id: Optional[str]
    case_url: Optional[str]
    message: str


class Connector:
    id: str = ""
    kind: str = ""                 # "siem" or "soar"
    name: str = ""
    description: str = ""
    logo: Optional[str] = None     # path under the frontend's public/ folder
    fields: List[ConnectorField] = []
    # Whether test() is safe to run in the background health monitor
    background_health_check: bool = True

    def describe(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "description": self.description,
            "logo": self.logo,
            "fields": [f.describe() for f in self.fields],
        }

    def is_configured(self, config: Dict[str, Any]) -> bool:
        return all(config.get(f.key) not in (None, "") for f in self.fields if f.required)

    async def test(self, config: Dict[str, Any]) -> TestResult:
        raise NotImplementedError


class SiemConnector(Connector):
    kind = "siem"
    # Setting holding the token the SIEM must present when pushing alerts
    @property
    def token_key(self) -> str:
        return f"{self.id}_ingest_token"

    def normalize(self, payload: Dict[str, Any], config: Dict[str, Any]) -> NormalizedAlert:
        raise NotImplementedError

    def alert_id(self, native_id: str) -> str:
        """Nightshift-wide alert id. Prefixed so ids from different SIEMs never collide."""
        return f"{self.id}:{native_id}"

    def sample_event(self) -> Dict[str, Any]:
        """A realistic event in this SIEM's format, for the "Send test alert" button."""
        raise NotImplementedError

    def setup_guide(self, ingest_url: str, token: str) -> Dict[str, Any]:
        """What to configure on the SIEM side: {"steps": [...], "snippets": [{"title", "language", "content"}]}."""
        raise NotImplementedError

    async def test(self, config: Dict[str, Any]) -> TestResult:
        # Push-only connectors have nothing to call; readiness is about the token
        return TestResult(True, "This source pushes alerts to Nightshift; there is no API to call.")


class SoarConnector(Connector):
    kind = "soar"

    async def escalate(self, request: EscalationRequest, config: Dict[str, Any]) -> EscalationResult:
        raise NotImplementedError

    def case_link(self, case_id: str, config: Dict[str, Any]) -> Optional[str]:
        """Browser link to a case, for cases created before links were stored."""
        return None
