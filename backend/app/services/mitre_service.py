"""
MITRE ATT&CK (Enterprise) data for the matrix, kept up to date with MITRE's releases.

Sources:
  * the copy bundled in the image at release time (works offline), described by a small
    meta file with its ATT&CK version;
  * a newer version downloaded from MITRE's official ATT&CK repository. When automatic
    updates are on (MITRE_AUTO_UPDATE, default true), the published versions are checked
    once a day and a newer one replaces the current data without a restart.
The newest available copy is used. The parsed matrix is kept in memory: the 30-50 MB
bundle is only read again when it changes.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

INDEX_URL = "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/index.json"
CHECK_INTERVAL_SECONDS = 24 * 3600
FIRST_CHECK_DELAY_SECONDS = 60
# A download is only used if it looks like a complete Enterprise ATT&CK release
MIN_TACTICS = 10
MIN_TECHNIQUES = 100

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else BACKEND_ROOT / p


BUNDLED_FILE = _resolve(settings.mitre_data_file)
UPDATE_DIR = _resolve(settings.mitre_update_dir)

# Used only when a bundle has no matrix object to give the order
MITRE_ORDER = [
    "reconnaissance", "resource-development", "initial-access", "execution",
    "persistence", "privilege-escalation", "defense-evasion", "credential-access",
    "discovery", "lateral-movement", "collection", "command-and-control",
    "exfiltration", "impact"
]

_cache: Dict[str, Any] = {"matrix": None, "info": {}}
_check: Dict[str, Any] = {"checked_at": None, "latest_version": None, "error": None}
_load_lock = asyncio.Lock()
_update_lock = asyncio.Lock()
_task: Optional[asyncio.Task] = None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0), follow_redirects=True)


def _auto_update_enabled() -> bool:
    return str(getattr(settings, "mitre_auto_update", True)).lower() not in ("false", "0", "no", "off")


def version_tuple(version: Optional[str]) -> Tuple[int, ...]:
    try:
        return tuple(int(part) for part in str(version).split("."))
    except (TypeError, ValueError):
        return (0,)


def _meta_path(data_file: Path) -> Path:
    return data_file.with_name(data_file.stem + ".meta.json")


def _read_meta(data_file: Path) -> Dict[str, Any]:
    try:
        return json.loads(_meta_path(data_file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


# ---- parsing -------------------------------------------------------------------------

def _attack_id(obj: Dict[str, Any]) -> str:
    refs = obj.get("external_references", [])
    ref = next((r for r in refs if r.get("source_name") == "mitre-attack"), refs[0] if refs else {})
    return ref.get("external_id", "")


def _active(obj: Dict[str, Any]) -> bool:
    return not obj.get("revoked") and not obj.get("x_mitre_deprecated")


def build_matrix(stix_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Tactics in MITRE's order, each with its techniques and their sub-techniques."""
    objects = stix_data.get("objects", [])

    tactics_map: Dict[str, Dict[str, Any]] = {}
    tactic_ids: Dict[str, str] = {}
    techniques = []

    for obj in objects:
        if obj.get("type") == "x-mitre-tactic" and _active(obj):
            shortname = obj.get("x_mitre_shortname")
            tactics_map[shortname] = {
                "id": _attack_id(obj),
                "name": obj.get("name"),
                "description": obj.get("description"),
                "shortname": shortname,
                "techniques": []
            }
            tactic_ids[obj.get("id")] = shortname
        elif obj.get("type") == "attack-pattern":
            if not _active(obj):
                continue
            mitre_ref = next((r for r in obj.get("external_references", []) if r.get("source_name") == "mitre-attack"), None)
            if not mitre_ref:
                continue
            phases = obj.get("kill_chain_phases", [])
            techniques.append({
                "t_code": mitre_ref.get("external_id"),
                "name": obj.get("name"),
                "description": obj.get("description"),
                "is_subtechnique": obj.get("x_mitre_is_subtechnique", False),
                "tactics": [p["phase_name"] for p in phases if p.get("kill_chain_name") == "mitre-attack"]
            })

    base_techniques = {}
    sub_techniques = []
    for t in techniques:
        if t["is_subtechnique"]:
            sub_techniques.append(t)
        else:
            t["subtechniques"] = []
            base_techniques[t["t_code"]] = t

    for sub in sub_techniques:
        if "." in sub["t_code"]:
            parent = base_techniques.get(sub["t_code"].split(".")[0])
            if parent:
                parent["subtechniques"].append(sub)

    for t in base_techniques.values():
        for tactic_sn in t["tactics"]:
            if tactic_sn in tactics_map:
                tactics_map[tactic_sn]["techniques"].append(t)

    for tactic in tactics_map.values():
        tactic["techniques"].sort(key=lambda x: x["name"])
        for t in tactic["techniques"]:
            t["subtechniques"].sort(key=lambda x: x["name"])

    # Column order as published in MITRE's Enterprise matrix; tactics it does not list
    # (e.g. added by a later release) are kept, at the end
    order: List[str] = []
    matrix_obj = next((o for o in objects if o.get("type") == "x-mitre-matrix" and _active(o)), None)
    if matrix_obj:
        order = [tactic_ids[ref] for ref in matrix_obj.get("tactic_refs", []) if ref in tactic_ids]
    if not order:
        order = [sn for sn in MITRE_ORDER if sn in tactics_map]
    order += sorted(sn for sn in tactics_map if sn not in order)
    return [tactics_map[sn] for sn in order]


def _bundle_version(stix_data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    objects = stix_data.get("objects", [])
    collection = next((o for o in objects if o.get("type") == "x-mitre-collection"), None)
    matrix_obj = next((o for o in objects if o.get("type") == "x-mitre-matrix"), None)
    return {"version": (collection or {}).get("x_mitre_version"),
            "released": (collection or matrix_obj or {}).get("modified")}


def _parse_file(path: Path) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        stix_data = json.load(f)
    matrix = build_matrix(stix_data)
    info = _bundle_version(stix_data)
    info["version"] = info["version"] or _read_meta(path).get("version")
    base = {t["t_code"] for tactic in matrix for t in tactic["techniques"]}
    subs = {s["t_code"] for tactic in matrix for t in tactic["techniques"] for s in t["subtechniques"]}
    info.update(tactics=len(matrix), techniques=len(base), subtechniques=len(subs))
    return matrix, info


# ---- loading ---------------------------------------------------------------------------

def _candidates() -> List[Tuple[Path, str]]:
    """Data files on disk, newest ATT&CK version first (the bundled copy wins ties)."""
    found = []
    update_file = UPDATE_DIR / "enterprise-attack.json"
    if BUNDLED_FILE.exists():
        found.append((BUNDLED_FILE, "bundled", version_tuple(_read_meta(BUNDLED_FILE).get("version"))))
    if update_file.exists():
        found.append((update_file, "update", version_tuple(_read_meta(update_file).get("version"))))
    found.sort(key=lambda c: (c[2], c[1] == "bundled"), reverse=True)
    return [(path, source) for path, source, _ in found]


async def ensure_loaded() -> None:
    if _cache["matrix"] is not None:
        return
    async with _load_lock:
        if _cache["matrix"] is not None:
            return
        for path, source in _candidates():
            try:
                matrix, info = await asyncio.to_thread(_parse_file, path)
            except Exception as e:
                logger.error(f"[MITRE] Cannot read {path}: {e}")
                continue
            info["source"] = source
            _cache.update(matrix=matrix, info=info)
            logger.info(f"[MITRE] ATT&CK {info.get('version') or '(version unknown)'} loaded ({source}): "
                        f"{info['tactics']} tactics, {info['techniques']} techniques, {info['subtechniques']} sub-techniques")
            return
    # Nothing usable on disk (e.g. a development checkout without data/): fetch the latest now
    await check_for_update(force=True)
    if _cache["matrix"] is None:
        raise RuntimeError("No MITRE ATT&CK data available")


async def get_mitre_matrix() -> List[Dict[str, Any]]:
    await ensure_loaded()
    return _cache["matrix"]


# ---- tactics of alerts -------------------------------------------------------------------

# Tactic names from older ATT&CK releases that SIEMs still send, mapped to the tactic ID
# that now carries them. ATT&CK v20 renamed Defense Evasion (TA0005) to Stealth when it split
# off Defense Impairment (TA0112).
LEGACY_TACTIC_IDS = {"defense evasion": "TA0005"}


def _index() -> Dict[str, Any]:
    """Lookups built from the loaded matrix (rebuilt when the matrix changes)."""
    matrix = _cache["matrix"] or []
    if _cache.get("index_of") is not matrix:
        names = {t["shortname"]: t["name"] for t in matrix}
        technique_tactics: Dict[str, List[str]] = {}
        for tactic in matrix:
            for technique in tactic["techniques"]:
                for item in [technique] + technique["subtechniques"]:
                    technique_tactics.setdefault(item["t_code"], [names[s] for s in item["tactics"] if s in names])
        _cache["index"] = {
            "tactics": [{"id": t["id"], "name": t["name"], "shortname": t["shortname"]} for t in matrix],
            "technique_tactics": technique_tactics,
            "by_name": {t["name"].lower(): t["name"] for t in matrix},
            "by_id": {t["id"]: t["name"] for t in matrix},
        }
        _cache["index_of"] = matrix
    return _cache["index"]


def tactics() -> List[Dict[str, str]]:
    """The tactics of the loaded ATT&CK version, in MITRE's order."""
    return _index()["tactics"]


def tactics_of_alert(technique_ids: List[Any], tactic_names: List[Any]) -> List[str]:
    """
    The current ATT&CK tactics an alert belongs to. Its technique IDs decide when the loaded
    ATT&CK knows them (technique IDs are stable, while tactics get renamed and split); otherwise
    the tactic names it carries are used, older names mapped to their successor.
    """
    index = _index()
    found: List[str] = []
    for technique_id in technique_ids:
        for name in index["technique_tactics"].get(str(technique_id).strip().upper(), []):
            if name not in found:
                found.append(name)
    if found:
        return found
    for raw in tactic_names:
        key = str(raw).replace("-", " ").strip().lower()
        name = index["by_name"].get(key) or index["by_id"].get(LEGACY_TACTIC_IDS.get(key, "")) \
            or str(raw).replace("-", " ").title()
        if name not in found:
            found.append(name)
    return found


# ---- updates ---------------------------------------------------------------------------

def latest_enterprise(index: Dict[str, Any]) -> Dict[str, str]:
    """The newest Enterprise ATT&CK release listed in MITRE's collection index."""
    collection = next(c for c in index.get("collections", []) if "enterprise" in c.get("name", "").lower())
    newest = max(collection["versions"], key=lambda v: version_tuple(v.get("version")))
    return {"version": newest["version"], "url": newest["url"]}


async def check_for_update(force: bool = False) -> Dict[str, Any]:
    """Download and switch to a newer published ATT&CK version, if there is one."""
    if not force and not _auto_update_enabled():
        return status()
    async with _update_lock:
        _check["checked_at"] = datetime.now(timezone.utc).isoformat()
        UPDATE_DIR.mkdir(parents=True, exist_ok=True)
        target = UPDATE_DIR / "enterprise-attack.json"
        partial = UPDATE_DIR / "enterprise-attack.download"
        current = _cache["info"].get("version")
        try:
            async with _client() as client:
                resp = await client.get(INDEX_URL)
                resp.raise_for_status()
                latest = latest_enterprise(resp.json())
                _check["latest_version"] = latest["version"]
                if _cache["matrix"] is not None and version_tuple(latest["version"]) <= version_tuple(current):
                    _check["error"] = None
                    return status()
                logger.info(f"[MITRE] Downloading ATT&CK {latest['version']} (current: {current or 'none'})")
                async with client.stream("GET", latest["url"]) as download:
                    download.raise_for_status()
                    with open(partial, "wb") as f:
                        async for chunk in download.aiter_bytes():
                            f.write(chunk)
            matrix, info = await asyncio.to_thread(_parse_file, partial)
            if info.get("version") != latest["version"] or info["tactics"] < MIN_TACTICS or info["techniques"] < MIN_TECHNIQUES:
                raise ValueError(f"the download does not look like ATT&CK {latest['version']} "
                                 f"({info['tactics']} tactics, {info['techniques']} techniques)")
            os.replace(partial, target)
            _meta_path(target).write_text(json.dumps({"version": info["version"], "released": info.get("released"),
                                                      "downloaded_at": _check["checked_at"]}), encoding="utf-8")
            info["source"] = "update"
            _cache.update(matrix=matrix, info=info)
            _check["error"] = None
            logger.info(f"[MITRE] Now using ATT&CK {info['version']}: {info['tactics']} tactics, "
                        f"{info['techniques']} techniques, {info['subtechniques']} sub-techniques")
        except Exception as e:
            _check["error"] = f"{type(e).__name__}: {e}"[:300]
            logger.warning(f"[MITRE] Update check failed, keeping ATT&CK {current or '(none)'}: {e}")
        finally:
            if partial.exists():
                try:
                    partial.unlink()
                except OSError:
                    pass
    return status()


def status() -> Dict[str, Any]:
    info = _cache["info"]
    latest = _check["latest_version"]
    return {
        "loaded": _cache["matrix"] is not None,
        "version": info.get("version"),
        "released": info.get("released"),
        "source": info.get("source"),
        "tactics": info.get("tactics"),
        "techniques": info.get("techniques"),
        "subtechniques": info.get("subtechniques"),
        "auto_update": _auto_update_enabled(),
        "checked_at": _check["checked_at"],
        "latest_version": latest,
        "up_to_date": bool(latest) and version_tuple(info.get("version")) >= version_tuple(latest),
        "error": _check["error"],
    }


async def _updater() -> None:
    await asyncio.sleep(FIRST_CHECK_DELAY_SECONDS)
    while True:
        if _auto_update_enabled():
            try:
                await ensure_loaded()
                await check_for_update()
            except Exception as e:
                logger.warning(f"[MITRE] Scheduled update check failed: {e}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def start_updater() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_updater())
