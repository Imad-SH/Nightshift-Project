"""Wazuh: alerts pushed by the Wazuh manager's integrator; health checked through the Wazuh API."""
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import httpx

from app.connectors.base import ConnectorField, NormalizedAlert, SiemConnector, TestResult
from app.core import severity
from app.schemas.alert import WazuhAgent, WazuhAlert, WazuhRule

KIT_DIR = Path(__file__).resolve().parent / "wazuh_kit"


def _unwrap(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Integration scripts and exports wrap the alert in different envelopes."""
    for key in ("payload", "alert", "_source"):
        inner = payload.get(key)
        if isinstance(inner, dict):
            return inner
    return payload


def is_wazuh_alert(payload: Any) -> bool:
    """True when the JSON is a Wazuh alert, as Wazuh writes it (alerts.json) or exported from OpenSearch:
    a rule with an id, a numeric level and a description. Manual imports use it to refuse other files;
    the intake from the Wazuh manager stays lenient and recovers partial alerts."""
    if not isinstance(payload, dict):
        return False
    rule = _unwrap(payload).get("rule")
    if not isinstance(rule, dict):
        return False
    level = rule.get("level")
    if isinstance(level, bool):
        return False
    try:
        int(level)
    except (TypeError, ValueError):
        return False
    return bool(str(rule.get("id") or "").strip()) and bool(str(rule.get("description") or "").strip())


def _parse(alert: Dict[str, Any]) -> WazuhAlert:
    try:
        return WazuhAlert(**alert)
    except Exception:
        # Partial recovery: keep what can be read
        parsed = WazuhAlert()
        parsed.id = str(alert.get("id", "000000"))
        parsed.timestamp = alert.get("timestamp")
        if isinstance(alert.get("rule"), dict):
            parsed.rule = WazuhRule(**alert["rule"])
        if isinstance(alert.get("agent"), dict):
            parsed.agent = WazuhAgent(**alert["agent"])
        parsed.data = alert.get("data")
        return parsed


class WazuhConnector(SiemConnector):
    id = "wazuh"
    name = "Wazuh"
    description = "Open-source SIEM/XDR. The Wazuh manager pushes alerts to Nightshift; its API is used for health checks."
    logo = "/assets/Wazuh Logo.png"
    fields = [
        ConnectorField("wazuh_url", "Wazuh API URL", "url", placeholder="https://wazuh-manager.example.local:55000",
                       help="The Wazuh server API (port 55000). Used to check the connection; alerts arrive by push."),
        ConnectorField("wazuh_user", "API user", placeholder="wazuh-wui"),
        ConnectorField("wazuh_password", "API password", "password", bound_to="wazuh_url"),
        ConnectorField("wazuh_verify_tls", "Verify TLS certificate", "toggle", default=False,
                       help="Wazuh ships a self-signed API certificate. Turn on once it has a trusted one."),
    ]

    def alert_id(self, native_id: str) -> str:
        # Wazuh ids are unique per manager and were stored unprefixed before connectors existed
        return native_id

    def normalize(self, payload: Dict[str, Any], config: Dict[str, Any]) -> NormalizedAlert:
        alert = _unwrap(payload)
        parsed = _parse(alert)

        score = parsed.rule.level if parsed.rule and parsed.rule.level else 1
        if parsed.agent:
            source = parsed.agent.name or "unknown-agent"
            if parsed.agent.ip:
                source += f" ({parsed.agent.ip})"
        else:
            source = (parsed.manager or {}).get("name", "Unknown")

        ts = datetime.now(timezone.utc)
        if parsed.timestamp:
            try:
                ts = datetime.fromisoformat(parsed.timestamp.replace("Z", "+00:00"))
            except ValueError:
                pass
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        # Bursts of the same event (same host, rule, user and source IP) within seconds are noise
        data = alert.get("data") if isinstance(alert.get("data"), dict) else {}
        win = (data.get("win") or {}).get("eventdata") or {}
        fingerprint = "|".join(str(x) for x in (
            (alert.get("agent") or {}).get("name", "unknown"),
            (alert.get("rule") or {}).get("id", "unknown"),
            win.get("targetUserName", "unknown"),
            win.get("ipAddress", data.get("srcip", "unknown")),
        ))

        return NormalizedAlert(
            native_id=parsed.id or "000000",
            timestamp=ts,
            title=(parsed.rule.description if parsed.rule and parsed.rule.description else "Raw Alert Received"),
            source=source,
            score=severity.clamp(score),
            raw=parsed.model_dump(),
            fingerprint=fingerprint,
        )

    async def test(self, config: Dict[str, Any]) -> TestResult:
        url = (config.get("wazuh_url") or "").strip().rstrip("/")
        user = (config.get("wazuh_user") or "").strip()
        password = (config.get("wazuh_password") or "").strip()
        if not (url and user and password):
            return TestResult(False, "Enter the API URL, user and password to check the connection.")
        try:
            async with httpx.AsyncClient(verify=bool(config.get("wazuh_verify_tls")), timeout=20.0) as client:
                resp = await client.get(f"{url}/security/user/authenticate", auth=(user, password))
        except httpx.ConnectError as e:
            return TestResult(False, f"Cannot reach the Wazuh API: {e}")
        except Exception as e:
            return TestResult(False, f"Connection error: {e}")
        if resp.status_code == 200:
            return TestResult(True, "Wazuh API connection successful.")
        if resp.status_code in (401, 403):
            return TestResult(False, "Wazuh rejected the API credentials.")
        return TestResult(False, f"Wazuh API answered HTTP {resp.status_code}.")

    def sample_event(self) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        return {
            "id": f"{int(time.time())}.{random.randint(100000, 999999)}",
            "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+0000",
            "rule": {
                "id": "5712", "level": 10, "firedtimes": 12,
                "description": "sshd: brute force trying to get access to the system. Non existent user. (Nightshift test alert)",
                "groups": ["syslog", "sshd", "authentication_failures"],
                "mitre": {"id": ["T1110"], "tactic": ["Credential Access"], "technique": ["Brute Force"]},
            },
            "agent": {"id": "000", "name": "nightshift-test-host", "ip": "10.0.0.15"},
            "manager": {"name": "wazuh.manager"},
            "decoder": {"name": "sshd", "parent": "sshd"},
            "data": {"srcip": "185.220.101.45", "srcport": "51022", "srcuser": "admin"},
            "location": "/var/log/auth.log",
            "full_log": f"{now:%b %d %H:%M:%S} nightshift-test-host sshd[2211]: Failed password for invalid user admin from 185.220.101.45 port 51022 ssh2",
        }

    def setup_guide(self, ingest_url: str, token: str) -> Dict[str, Any]:
        launcher = (KIT_DIR / "custom-nightshift").read_text(encoding="utf-8")
        script = (KIT_DIR / "custom-nightshift.py").read_text(encoding="utf-8")
        return {
            "steps": [
                "On the Wazuh manager, save the two files below in /var/ossec/integrations/.",
                "Set their owner and permissions (command below).",
                "Add the <integration> block to /var/ossec/etc/ossec.conf, inside <ossec_config>.",
                "Restart the manager: systemctl restart wazuh-manager (or restart the manager container).",
                "If Nightshift uses a self-signed or private-CA certificate, copy that CA certificate to "
                "/var/ossec/integrations/custom-nightshift.ca.",
                "New alerts at or above <level> appear in Nightshift within seconds. Failures are logged in "
                "/var/ossec/logs/integrations.log.",
            ],
            "snippets": [
                {"title": "ossec.conf", "language": "xml", "content": (
                    "<integration>\n"
                    "  <name>custom-nightshift</name>\n"
                    f"  <hook_url>{ingest_url}</hook_url>\n"
                    f"  <api_key>{token}</api_key>\n"
                    "  <level>3</level>\n"
                    "  <alert_format>json</alert_format>\n"
                    "</integration>"
                )},
                {"title": "Permissions", "language": "bash", "content": (
                    "cd /var/ossec/integrations\n"
                    "chown root:wazuh custom-nightshift custom-nightshift.py\n"
                    "chmod 750 custom-nightshift custom-nightshift.py"
                )},
                {"title": "/var/ossec/integrations/custom-nightshift", "language": "bash", "content": launcher},
                {"title": "/var/ossec/integrations/custom-nightshift.py", "language": "python", "content": script},
            ],
        }
