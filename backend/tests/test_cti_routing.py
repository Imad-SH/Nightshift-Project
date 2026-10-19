"""Indicators are only sent to threat-intelligence services that an admin has configured."""
import asyncio

import pytest

from app.agents.agent_investigator import AgentInvestigator

CTI_KEYS = ["virustotal_api_key", "abuseipdb_api_key", "alienvault_api_key", "greynoise_api_key", "shodan_api_key",
            "urlscan_api_key", "mxtoolbox_api_key", "hybrid_analysis_api_key", "threatfox_api_key",
            "emailrep_api_key", "nvd_api_key", "custom_cti_sources"]

INDICATORS = [
    {"ioc": "185.220.101.45", "type": "ip"},
    {"ioc": "evil.example.com", "type": "domain"},
    {"ioc": "http://evil.example.com/a.ps1", "type": "url"},
    {"ioc": "d41d8cd98f00b204e9800998ecf8427e", "type": "md5"},
    {"ioc": "someone@example.com", "type": "email"},
    {"ioc": "CVE-2021-44228", "type": "cve"},
]


@pytest.fixture
def investigator(monkeypatch):
    agent = AgentInvestigator()
    calls = []

    def recorder(name):
        async def fake(*args, **kwargs):
            calls.append(name)
            return {"ioc": "x", "type": "ip", "tool": name, "verdict": "unknown", "status": 200}
        return fake

    for attr in dir(agent):
        if attr.startswith("_tool_") and not attr.startswith("_tool_local"):
            monkeypatch.setattr(agent, attr, recorder(attr))
    monkeypatch.setattr(agent, "_refine_intel", lambda r: r, raising=False)
    agent.calls = calls
    return agent


def test_nothing_is_sent_without_configured_services(investigator, set_setting):
    for key in CTI_KEYS:
        set_setting(key, "")
    asyncio.run(investigator._query_external_sources(INDICATORS, "alert-1", "000"))
    assert investigator.calls == []


def test_only_configured_services_are_called(investigator, set_setting):
    for key in CTI_KEYS:
        set_setting(key, "")
    set_setting("virustotal_api_key", "vt")
    asyncio.run(investigator._query_external_sources(INDICATORS, "alert-1", "000"))
    assert investigator.calls and set(investigator.calls) == {"_tool_virustotal"}
