"""Generic webhook: send escalations as JSON to any SOAR or automation tool (Shuffle, Tines, Splunk SOAR, XSOAR, ...)."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.connectors.base import ConnectorField, EscalationRequest, EscalationResult, SoarConnector, TestResult
from app.core import severity
from app.core.config import settings

TIMEOUT_SECONDS = 20.0


def _headers(config: Dict[str, Any]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json", "User-Agent": f"{settings.product_name}-Escalation"}
    name = (config.get("webhook_soar_auth_header") or "").strip()
    value = (config.get("webhook_soar_auth_token") or "").strip()
    if name and value:
        headers[name] = value
    return headers


def _indicators(node_results: Dict[str, Any]) -> List[Dict[str, str]]:
    screener = node_results.get("agent_screener") or {}
    found = []
    for category in ("network", "files", "system", "identities"):
        for item in screener.get(category) or []:
            value = item.get("value") if isinstance(item, dict) else item
            if value:
                found.append({"category": category, "value": str(value)})
    return found


class WebhookSoarConnector(SoarConnector):
    id = "webhook"
    name = "Generic Webhook"
    description = ("Sends each escalation as a JSON event to any SOAR or automation platform that accepts "
                   "webhooks: Shuffle, Tines, Splunk SOAR, Cortex XSOAR and more.")
    logo = None
    # Testing delivers an event to the receiver, so only on demand
    background_health_check = False
    fields = [
        ConnectorField("webhook_soar_url", "Webhook URL", "url", required=True, placeholder="https://soar.example.local/hooks/nightshift"),
        ConnectorField("webhook_soar_auth_header", "Auth header name", default="Authorization",
                       help="Header carrying the credential, e.g. Authorization or X-API-Key. Leave the token empty for none."),
        ConnectorField("webhook_soar_auth_token", "Auth header value", "password", bound_to="webhook_soar_url",
                       help="Sent as is, e.g. 'Bearer abc123'."),
        ConnectorField("webhook_soar_verify_tls", "Verify TLS certificate", "toggle", default=True),
    ]

    async def _post(self, config: Dict[str, Any], body: Dict[str, Any]) -> httpx.Response:
        async with httpx.AsyncClient(verify=bool(config.get("webhook_soar_verify_tls", True)), timeout=TIMEOUT_SECONDS) as client:
            return await client.post(config["webhook_soar_url"].strip(), json=body, headers=_headers(config))

    async def test(self, config: Dict[str, Any]) -> TestResult:
        if not self.is_configured(config):
            return TestResult(False, "Enter the webhook URL.")
        try:
            resp = await self._post(config, {
                "event": "nightshift.connection_test",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "message": f"Connection test from {settings.brand_name}. No action needed.",
            })
        except Exception as e:
            return TestResult(False, f"Cannot reach the webhook: {e}")
        if resp.status_code < 300:
            return TestResult(True, f"The webhook accepted the test event (HTTP {resp.status_code}).")
        return TestResult(False, f"The webhook answered HTTP {resp.status_code}.")

    async def escalate(self, request: EscalationRequest, config: Dict[str, Any]) -> EscalationResult:
        judge = request.node_results.get("agent_judge") or {}
        body = {
            "event": "nightshift.escalation",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "product": settings.brand_name,
            "alert": {
                "id": request.alert_id,
                "title": request.title,
                "source": request.source,
                "severity": severity.label(request.score),
                "severity_score": request.score,
            },
            "analysis": {
                "ai_analyzed": request.is_ai_analyzed,
                "verdict": judge.get("verdict"),
                "confidence": judge.get("confidence_score"),
                "reasoning": judge.get("analysis_reasoning"),
                "mitigation_steps": judge.get("mitigation_steps"),
                "mitre_tactics": judge.get("mitre_tactics"),
            },
            "indicators": _indicators(request.node_results),
            "manual_description": request.manual_description,
            "tags": request.tags,
            "repeat_escalation": request.force,
        }
        resp = await self._post(config, body)
        if resp.status_code >= 300:
            raise RuntimeError(f"Webhook answered HTTP {resp.status_code}")

        # Use the receiver's case id / link if it returns one
        case_id: Optional[str] = None
        case_url: Optional[str] = None
        try:
            data = resp.json()
            if isinstance(data, dict):
                raw_id = data.get("case_id") or data.get("id") or data.get("execution_id")
                case_id = str(raw_id) if raw_id is not None else None
                case_url = data.get("case_url") or data.get("url")
        except ValueError:
            pass
        return EscalationResult(case_id, case_url, "Escalation delivered to the webhook")
