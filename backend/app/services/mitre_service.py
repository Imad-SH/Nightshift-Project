import httpx
import json
import logging
from typing import Dict, List, Any
from pathlib import Path

logger = logging.getLogger(__name__)

STIX_URL = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"
CACHE_FILE = Path(__file__).parent.parent.parent / "scratch" / "mitre_cache.json"

MITRE_ORDER = [
    "reconnaissance", "resource-development", "initial-access", "execution", 
    "persistence", "privilege-escalation", "defense-evasion", "credential-access", 
    "discovery", "lateral-movement", "collection", "command-and-control", 
    "exfiltration", "impact"
]

async def fetch_mitre_stix() -> Dict[str, Any]:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading mitre cache: {e}")
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(STIX_URL, timeout=60.0)
        resp.raise_for_status()
        data = resp.json()
        
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
            
        return data

async def get_mitre_matrix() -> List[Dict[str, Any]]:
    stix_data = await fetch_mitre_stix()
    objects = stix_data.get("objects", [])
    
    tactics_map = {} 
    techniques = []
    
    for obj in objects:
        if obj.get("type") == "x-mitre-tactic":
            shortname = obj.get("x_mitre_shortname")
            tactics_map[shortname] = {
                "id": obj.get("external_references", [{}])[0].get("external_id", ""),
                "name": obj.get("name"),
                "description": obj.get("description"),
                "shortname": shortname,
                "techniques": []
            }
        elif obj.get("type") == "attack-pattern":
            if obj.get("revoked") or obj.get("x_mitre_deprecated"):
                continue
                
            external_refs = obj.get("external_references", [])
            mitre_ref = next((ref for ref in external_refs if ref.get("source_name") == "mitre-attack"), None)
            if not mitre_ref:
                continue
                
            t_code = mitre_ref.get("external_id")
            
            phases = obj.get("kill_chain_phases", [])
            tactic_shortnames = [p["phase_name"] for p in phases if p.get("kill_chain_name") == "mitre-attack"]
            
            techniques.append({
                "t_code": t_code,
                "name": obj.get("name"),
                "description": obj.get("description"),
                "is_subtechnique": obj.get("x_mitre_is_subtechnique", False),
                "tactics": tactic_shortnames
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
            parent_code = sub["t_code"].split(".")[0]
            if parent_code in base_techniques:
                base_techniques[parent_code]["subtechniques"].append(sub)
                
    for t in base_techniques.values():
        for tactic_sn in t["tactics"]:
            if tactic_sn in tactics_map:
                tactics_map[tactic_sn]["techniques"].append(t)
                
    # Sort techniques alphabetically by name
    for tactic in tactics_map.values():
        tactic["techniques"].sort(key=lambda x: x["name"])
        for t in tactic["techniques"]:
            t["subtechniques"].sort(key=lambda x: x["name"])
                
    # Sort tactics by official order
    sorted_tactics = []
    for sn in MITRE_ORDER:
        if sn in tactics_map:
            sorted_tactics.append(tactics_map[sn])
            
    return sorted_tactics
