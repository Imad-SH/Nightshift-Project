"""MITRE ATT&CK data: building the matrix, and switching to newer published versions."""
import asyncio
import json

import httpx
import pytest

from app.core.config import settings
from app.services import mitre_service as ms

INDEX_URL = ms.INDEX_URL


def bundle(version, extra_tactic=False):
    """A small ATT&CK bundle in MITRE's format."""
    tactics = [("TA0043", "reconnaissance", "Reconnaissance"), ("TA0001", "initial-access", "Initial Access"),
               ("TA0002", "execution", "Execution")]
    if extra_tactic:
        tactics.append(("TA0099", "new-tactic", "New Tactic"))
    objects = [{"type": "x-mitre-collection", "x_mitre_version": version, "modified": "2026-10-13T00:00:00Z"}]
    for tid, sn, name in tactics:
        objects.append({"type": "x-mitre-tactic", "id": f"x-mitre-tactic--{sn}", "x_mitre_shortname": sn, "name": name,
                        "external_references": [{"source_name": "mitre-attack", "external_id": tid}]})
    # MITRE's column order (execution before initial access here, to show it comes from the data)
    objects.append({"type": "x-mitre-matrix",
                    "tactic_refs": [f"x-mitre-tactic--{sn}" for sn in ("reconnaissance", "execution", "initial-access")]})

    def technique(code, name, tactics_of, sub=False, **extra):
        return {"type": "attack-pattern", "name": name, "x_mitre_is_subtechnique": sub,
                "external_references": [{"source_name": "mitre-attack", "external_id": code}],
                "kill_chain_phases": [{"kill_chain_name": "mitre-attack", "phase_name": t} for t in tactics_of], **extra}

    objects += [
        technique("T1595", "Active Scanning", ["reconnaissance"]),
        technique("T1595.001", "Scanning IP Blocks", ["reconnaissance"], sub=True),
        technique("T1059", "Command and Scripting Interpreter", ["execution"]),
        technique("T1059.001", "PowerShell", ["execution"], sub=True),
        technique("T1078", "Valid Accounts", ["initial-access", "execution"]),
        technique("T1000", "Revoked Technique", ["execution"], revoked=True),
        technique("T1001", "Deprecated Technique", ["execution"], x_mitre_deprecated=True),
    ]
    return {"type": "bundle", "objects": objects}


def names(tactic):
    return [t["name"] for t in tactic["techniques"]]


def test_tactics_follow_mitre_order_and_new_tactics_appear():
    matrix = ms.build_matrix(bundle("20.0", extra_tactic=True))
    assert [t["shortname"] for t in matrix] == ["reconnaissance", "execution", "initial-access", "new-tactic"]
    assert matrix[0]["id"] == "TA0043"


def test_techniques_sub_techniques_and_retired_ones():
    matrix = {t["shortname"]: t for t in ms.build_matrix(bundle("20.0"))}
    assert names(matrix["execution"]) == ["Command and Scripting Interpreter", "Valid Accounts"]
    assert "Valid Accounts" in names(matrix["initial-access"])
    interpreter = matrix["execution"]["techniques"][0]
    assert [s["t_code"] for s in interpreter["subtechniques"]] == ["T1059.001"]


def test_newest_enterprise_version_is_compared_as_numbers():
    index = {"collections": [
        {"name": "Mobile ATT&CK", "versions": [{"version": "99.0", "url": "m"}]},
        {"name": "Enterprise ATT&CK", "versions": [{"version": "9.0", "url": "a"}, {"version": "20.0", "url": "b"},
                                                    {"version": "19.2", "url": "c"}]},
    ]}
    assert ms.latest_enterprise(index) == {"version": "20.0", "url": "b"}


@pytest.fixture
def mitre(tmp_path, monkeypatch):
    """The service with a bundled ATT&CK 19.2, an empty update folder and fake MITRE servers."""
    bundled = tmp_path / "mitre" / "enterprise-attack.json"
    bundled.parent.mkdir()
    bundled.write_text(json.dumps(bundle("19.2")))
    (tmp_path / "mitre" / "enterprise-attack.meta.json").write_text('{"version": "19.2"}')
    monkeypatch.setattr(ms, "BUNDLED_FILE", bundled)
    monkeypatch.setattr(ms, "UPDATE_DIR", tmp_path / "updates")
    monkeypatch.setattr(ms, "_cache", {"matrix": None, "info": {}})
    monkeypatch.setattr(ms, "_check", {"checked_at": None, "latest_version": None, "error": None})
    monkeypatch.setattr(ms, "MIN_TACTICS", 1)
    monkeypatch.setattr(ms, "MIN_TECHNIQUES", 1)
    monkeypatch.setattr(settings, "mitre_auto_update", True)

    calls = []
    servers = {"online": True, "published": "20.0"}

    def handler(request):
        calls.append(str(request.url))
        if not servers["online"]:
            raise httpx.ConnectError("no route to host")
        if str(request.url) == INDEX_URL:
            v = servers["published"]
            return httpx.Response(200, json={"collections": [{"name": "Enterprise ATT&CK", "versions": [
                {"version": "19.2", "url": "https://mitre.test/ea-19.2.json"},
                {"version": v, "url": f"https://mitre.test/ea-{v}.json"}]}]})
        return httpx.Response(200, content=json.dumps(bundle(str(request.url).split("ea-")[1][:-5])).encode())

    monkeypatch.setattr(ms, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return {"tmp": tmp_path, "calls": calls, "servers": servers}


def run(coro):
    return asyncio.run(coro)


def test_a_newer_published_version_replaces_the_bundled_one(mitre):
    run(ms.ensure_loaded())
    assert ms.status()["version"] == "19.2" and ms.status()["source"] == "bundled"

    status = run(ms.check_for_update())
    assert status["version"] == "20.0" and status["source"] == "update" and status["up_to_date"]
    assert status["error"] is None
    updates = mitre["tmp"] / "updates"
    assert (updates / "enterprise-attack.json").exists()
    assert json.loads((updates / "enterprise-attack.meta.json").read_text())["version"] == "20.0"
    assert not (updates / "enterprise-attack.download").exists()

    # After a restart the newer copy is the one used
    ms._cache.update(matrix=None, info={})
    run(ms.ensure_loaded())
    assert ms.status()["version"] == "20.0"


def test_nothing_is_downloaded_when_already_up_to_date(mitre):
    mitre["servers"]["published"] = "19.2"
    run(ms.ensure_loaded())
    status = run(ms.check_for_update())
    assert status["version"] == "19.2" and status["up_to_date"]
    assert mitre["calls"] == [INDEX_URL]


def test_without_internet_the_current_version_stays(mitre):
    mitre["servers"]["online"] = False
    run(ms.ensure_loaded())
    status = run(ms.check_for_update())
    assert status["version"] == "19.2" and status["source"] == "bundled"
    assert "ConnectError" in status["error"]
    assert not (mitre["tmp"] / "updates" / "enterprise-attack.download").exists()


def test_automatic_checks_can_be_turned_off(mitre, monkeypatch):
    monkeypatch.setattr(settings, "mitre_auto_update", False)
    run(ms.ensure_loaded())
    status = run(ms.check_for_update())
    assert mitre["calls"] == [] and status["version"] == "19.2" and status["auto_update"] is False
    # An administrator's explicit "check now" still works
    assert run(ms.check_for_update(force=True))["version"] == "20.0"


def test_an_incomplete_download_is_rejected(mitre, monkeypatch):
    monkeypatch.setattr(ms, "MIN_TECHNIQUES", 1000)
    run(ms.ensure_loaded())
    status = run(ms.check_for_update())
    assert status["version"] == "19.2" and "does not look like" in status["error"]
    assert not (mitre["tmp"] / "updates" / "enterprise-attack.json").exists()
