"""Settings changed from the UI apply immediately, every time (not only the first time)."""
from app.core.config import Settings


def test_settings_outside_the_model_can_change_repeatedly():
    s = Settings()
    for value in (True, False, True, False):
        s.update_from_dict({"auto_escalation_enabled": value})
        assert s.auto_escalation_enabled is value
    for soar in ("thehive", "flowintel", "none"):
        s.update_from_dict({"active_soar": soar})
        assert s.active_soar == soar
    # A regenerated intake token replaces the old one at once
    s.update_from_dict({"wazuh_ingest_token": "old-token"})
    s.update_from_dict({"wazuh_ingest_token": "new-token"})
    assert s.wazuh_ingest_token == "new-token"


def test_declared_settings_keep_their_types():
    s = Settings()
    s.update_from_dict({"mitre_auto_update": "false", "ai_analysis_min_threshold": "9", "wazuh_url": "https://wazuh:55000"})
    assert s.mitre_auto_update is False
    assert s.ai_analysis_min_threshold == 9
    assert s.wazuh_url == "https://wazuh:55000"
