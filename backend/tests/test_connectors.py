from datetime import timezone

import pytest

from app.connectors import registry
from app.core import credentials

wazuh = registry.SIEM["wazuh"]
webhook = registry.SIEM["webhook"]

WAZUH_ALERT = {
    "id": "1729330000.123456",
    "timestamp": "2026-10-19T09:30:00.123+0000",
    "rule": {"id": "5712", "level": 10, "description": "sshd: brute force"},
    "agent": {"id": "001", "name": "web-01", "ip": "10.0.0.5"},
    "data": {"srcip": "203.0.113.7"},
}


# ---- Wazuh ------------------------------------------------------------------------

def test_wazuh_normalize():
    n = wazuh.normalize(WAZUH_ALERT, {})
    assert (n.native_id, n.title, n.source, n.score) == ("1729330000.123456", "sshd: brute force", "web-01 (10.0.0.5)", 10)
    assert n.timestamp.tzinfo is not None and n.timestamp.astimezone(timezone.utc).hour == 9
    assert n.raw["rule"]["id"] == "5712"


@pytest.mark.parametrize("envelope", ["payload", "alert", "_source"])
def test_wazuh_unwraps_envelopes(envelope):
    assert wazuh.normalize({envelope: WAZUH_ALERT}, {}).native_id == "1729330000.123456"


def test_wazuh_ids_stay_unprefixed_for_existing_alerts():
    assert wazuh.alert_id("123.456") == "123.456"


def test_wazuh_partial_alert_is_recovered():
    n = wazuh.normalize({"id": "x1", "rule": {"level": 3}}, {})
    assert n.native_id == "x1" and n.score == 3 and n.title == "Unknown Event"  # WazuhRule default, as before


def test_wazuh_fingerprint_identifies_bursts():
    a = wazuh.normalize(WAZUH_ALERT, {}).fingerprint
    b = wazuh.normalize({**WAZUH_ALERT, "id": "other"}, {}).fingerprint
    c = wazuh.normalize({**WAZUH_ALERT, "data": {"srcip": "198.51.100.1"}}, {}).fingerprint
    assert a == b and a != c


def test_wazuh_setup_guide_has_url_and_token():
    guide = wazuh.setup_guide("https://soc.example/api/ingest/wazuh", "TOKEN123")
    ossec = guide["snippets"][0]["content"]
    assert "<hook_url>https://soc.example/api/ingest/wazuh</hook_url>" in ossec and "<api_key>TOKEN123</api_key>" in ossec
    assert any("custom-nightshift.py" in s["title"] for s in guide["snippets"])


# ---- Generic webhook ----------------------------------------------------------------

@pytest.mark.parametrize("payload,expected", [
    ({"sid": "s1", "search_name": "Brute force", "result": {"host": "DC01", "urgency": "high"}},
     ("webhook:s1", "Brute force", "DC01", 10)),
    ({"kibana.alert.uuid": "u1", "kibana.alert.rule.name": "Mimikatz", "kibana.alert.severity": "critical",
      "host": {"name": "WS-07"}},
     ("webhook:u1", "Mimikatz", "WS-07", 13)),
    ({"id": "i1", "title": "Impossible travel", "severity": "Medium", "hostname": "AAD"},
     ("webhook:i1", "Impossible travel", "AAD", 7)),
    ({"id": "r1", "name": "Ransomware", "risk_score": 92, "host": "FS-02"},
     ("webhook:r1", "Ransomware", "FS-02", 14)),
])
def test_webhook_detects_common_shapes(payload, expected):
    n = webhook.normalize(payload, {})
    assert (webhook.alert_id(n.native_id), n.title, n.source, n.score) == expected


def test_webhook_configured_paths_and_inverted_scale():
    cfg = {"webhook_severity_field": "evt.pri", "webhook_severity_scale": "1-5-inverted",
           "webhook_title_field": "evt.ttl", "webhook_host_field": "evt.who"}
    n = webhook.normalize({"evt": {"pri": 1, "ttl": "Mapped", "who": "srv9"}}, cfg)
    assert (n.title, n.source, n.score) == ("Mapped", "srv9", 15)


def test_webhook_without_id_gets_a_stable_one():
    a = webhook.normalize({"message": "same"}, {}).native_id
    b = webhook.normalize({"message": "same"}, {}).native_id
    assert a == b and a != webhook.normalize({"message": "other"}, {}).native_id


def test_webhook_missing_severity_counts_as_medium():
    assert webhook.normalize({"id": "x", "title": "t"}, {}).score == 7


@pytest.mark.parametrize("ts", ["2026-10-19T09:30:00Z", 1792402200, 1792402200000, "1792402200"])
def test_webhook_timestamps(ts):
    n = webhook.normalize({"id": "t", "@timestamp": ts}, {})
    assert n.timestamp.tzinfo is not None and n.timestamp.year == 2026


def test_webhook_rejects_non_objects():
    with pytest.raises(ValueError):
        webhook.normalize(["not", "an", "object"], {})


# ---- Field definitions --------------------------------------------------------------

@pytest.mark.parametrize("connector", list(registry.SIEM.values()) + list(registry.SOAR.values()), ids=lambda c: f"{c.kind}:{c.id}")
def test_secret_fields_are_stored_as_secrets(connector):
    """Every password field must match the naming rule, so it is encrypted and masked."""
    for field in connector.fields:
        if field.secret:
            assert credentials.is_secret_key(field.key), field.key
        if field.bound_to:
            assert field.bound_to in {f.key for f in connector.fields}
