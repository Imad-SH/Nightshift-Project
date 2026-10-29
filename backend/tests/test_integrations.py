import pytest

from app.connectors import registry
from app.core import credentials
from app.services import integrations

wazuh = registry.SIEM["wazuh"]
thehive = registry.SOAR["thehive"]
P = credentials.SECRET_PLACEHOLDER


def test_placeholder_keeps_stored_secret_for_same_address(set_setting):
    set_setting("thehive_url", "https://hive.local:9000")
    set_setting("thehive_api_key", "stored-key")
    config = integrations.merged_config(thehive, {"thehive_url": "https://hive.local:9000/", "thehive_api_key": P})
    assert config["thehive_api_key"] == "stored-key"


def test_placeholder_is_refused_for_a_new_address(set_setting):
    """A saved secret is never sent to an address it was not saved for."""
    set_setting("thehive_url", "https://hive.local:9000")
    set_setting("thehive_api_key", "stored-key")
    with pytest.raises(ValueError):
        integrations.merged_config(thehive, {"thehive_url": "https://attacker.example", "thehive_api_key": P})


def test_new_secret_is_used_with_a_new_address(set_setting):
    set_setting("thehive_url", "https://hive.local:9000")
    set_setting("thehive_api_key", "stored-key")
    config = integrations.merged_config(thehive, {"thehive_url": "https://hive2.local", "thehive_api_key": "typed"})
    assert config == {**config, "thehive_url": "https://hive2.local", "thehive_api_key": "typed"}


def test_ingest_token_matching(set_setting):
    set_setting("wazuh_ingest_token", "tok-123")
    assert integrations.token_matches(wazuh, "tok-123")
    assert not integrations.token_matches(wazuh, "tok-124")
    assert not integrations.token_matches(wazuh, None)
    set_setting("wazuh_ingest_token", None)
    assert not integrations.token_matches(wazuh, "anything")


@pytest.mark.parametrize("flag,token,expected", [
    ("true", None, True),       # existing installation, no token yet: original path stays open
    ("true", "tok", False),     # a token exists: required everywhere
    (None, None, False),        # fresh installation: never open
])
def test_legacy_wazuh_intake(set_setting, flag, token, expected):
    set_setting("wazuh_legacy_intake", flag)
    set_setting("wazuh_ingest_token", token)
    assert integrations.legacy_wazuh_intake_open() is expected


@pytest.mark.parametrize("enabled,soar,score,verdict,expected", [
    (True, "thehive", 10, "Malicious", True),
    (True, "thehive", 10, "suspicious", True),
    (True, "thehive", 10, "False Positive", False),   # not in the default verdicts
    (True, "thehive", 12, "Blocked", False),           # stopped threat: not escalated unless chosen
    (True, "thehive", 5, "Malicious", False),          # below the minimum severity
    (True, "none", 10, "Malicious", False),            # escalation turned off
    (False, "thehive", 15, "Malicious", False),        # auto-escalation disabled
    (True, "thehive", 10, None, False),                # no verdict (failed scan)
])
def test_should_auto_escalate(set_setting, enabled, soar, score, verdict, expected):
    set_setting("auto_escalation_enabled", enabled)
    set_setting("auto_escalation_min_score", 7)
    set_setting("auto_escalation_verdicts", "Malicious,Suspicious")
    set_setting("active_soar", soar)
    assert integrations.should_auto_escalate(score, verdict) is expected


def test_service_status_keeps_original_keys(set_setting):
    set_setting("active_soar", "flowintel")
    status = integrations.service_status()
    for key in ("wazuh", "thehive", "flowintel", "active_soar", "system", "timestamp"):
        assert key in status
    assert set(status["connectors"]) == {"siem", "soar"}
    assert status["active_soar"] == "flowintel"
