"""Flowintel: open-source case management (escalations become Flowintel cases)."""
from typing import Any, Dict, Optional

from app.connectors.base import ConnectorField, EscalationRequest, EscalationResult, SoarConnector, TestResult
from app.services.flowintel_service import FlowintelService


def _service(config: Dict[str, Any]) -> FlowintelService:
    return FlowintelService(
        url=(config.get("flowintel_url") or "").strip(),
        api_key=(config.get("flowintel_api_key") or "").strip(),
        verify_tls=bool(config.get("flowintel_verify_tls")),
    )


class FlowintelConnector(SoarConnector):
    id = "flowintel"
    name = "Flowintel"
    description = "Open-source case management. Each escalation opens a Flowintel case with the AI analysis."
    logo = None
    fields = [
        ConnectorField("flowintel_url", "Flowintel URL", "url", required=True, placeholder="https://flowintel.example.local"),
        ConnectorField("flowintel_api_key", "API key", "password", required=True, bound_to="flowintel_url"),
        ConnectorField("flowintel_verify_tls", "Verify TLS certificate", "toggle", default=False),
    ]

    async def test(self, config: Dict[str, Any]) -> TestResult:
        if not self.is_configured(config):
            return TestResult(False, "Enter the Flowintel URL and API key.")
        if await _service(config).check_connectivity():
            return TestResult(True, "Flowintel connection successful.")
        return TestResult(False, "Flowintel did not accept the connection (check the URL and API key).")

    async def escalate(self, request: EscalationRequest, config: Dict[str, Any]) -> EscalationResult:
        result = await _service(config).create_case(
            request.alert_id,
            {"node_results": request.node_results},
            alert_title=request.title,
            alert_agent=request.source,
            rule_level=request.score,
            force=request.force,
            is_ai_analyzed=request.is_ai_analyzed,
            manual_description=request.manual_description,
            manual_tags=request.tags,
        )
        case_id = result.get("id")
        case_id = str(case_id) if case_id is not None else None
        return EscalationResult(case_id, self.case_link(case_id, config) if case_id else None,
                                "Case created in Flowintel")

    def case_link(self, case_id: str, config: Dict[str, Any]) -> Optional[str]:
        url = (config.get("flowintel_url") or "").rstrip("/")
        return f"{url}/case/{case_id}" if url and case_id else None
