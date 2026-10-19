"""TheHive: case management platform (escalations become TheHive alerts)."""
from typing import Any, Dict, Optional

from app.connectors.base import ConnectorField, EscalationRequest, EscalationResult, SoarConnector, TestResult
from app.services.thehive_service import TheHiveService


def _service(config: Dict[str, Any]) -> TheHiveService:
    return TheHiveService(
        url=(config.get("thehive_url") or "").strip(),
        api_key=(config.get("thehive_api_key") or "").strip(),
        verify_tls=bool(config.get("thehive_verify_tls")),
    )


class TheHiveConnector(SoarConnector):
    id = "thehive"
    name = "TheHive"
    description = "Security incident response platform. Each escalation creates a TheHive alert with observables."
    logo = "/assets/TheHive Logo.png"
    fields = [
        ConnectorField("thehive_url", "TheHive URL", "url", required=True, placeholder="https://thehive.example.local:9000"),
        ConnectorField("thehive_api_key", "API key", "password", required=True, bound_to="thehive_url"),
        ConnectorField("thehive_verify_tls", "Verify TLS certificate", "toggle", default=False),
    ]

    async def test(self, config: Dict[str, Any]) -> TestResult:
        if not self.is_configured(config):
            return TestResult(False, "Enter the TheHive URL and API key.")
        if await _service(config).check_connectivity():
            return TestResult(True, "TheHive connection successful.")
        return TestResult(False, "TheHive did not accept the connection (check the URL and API key).")

    async def escalate(self, request: EscalationRequest, config: Dict[str, Any]) -> EscalationResult:
        result = await _service(config).create_alert(
            alert_id=request.alert_id,
            event_data={"node_results": request.node_results},
            alert_title=request.title,
            alert_agent=request.source,
            rule_level=request.score,
            is_duplicate=request.force,
            is_ai_analyzed=request.is_ai_analyzed,
            manual_description=request.manual_description,
            manual_tags=request.tags,
        )
        case_id = result.get("id") or result.get("_id")  # same order as the original endpoint
        case_id = str(case_id) if case_id is not None else None
        return EscalationResult(case_id, self.case_link(case_id, config) if case_id else None,
                                "Alert created in TheHive")

    def case_link(self, case_id: str, config: Dict[str, Any]) -> Optional[str]:
        url = (config.get("thehive_url") or "").rstrip("/")
        return f"{url}/alerts/{case_id}/details" if url and case_id else None
