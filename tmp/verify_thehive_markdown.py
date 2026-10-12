from typing import Dict, Any, List

def _get_ioc_table(node_results: Dict[str, Any]) -> str:
    """Generates a professional markdown table for identified Indicators of Compromise (IoCs)."""
    extractor = node_results.get("agent_screener", {})
    investigator = node_results.get("agent_investigator", {})
    
    rows = []
    # From Investigator (Verified Context)
    seen_iocs = set()
    for item in investigator.get("sanitized_observables", []):
        ioc = item.get("ioc")
        if ioc and ioc not in seen_iocs:
            rows.append(f"| {item.get('type', 'other').upper()} | `{ioc}` |")
            seen_iocs.add(ioc)
            
    # From Extractor (Standard results)
    for ip in extractor.get("network", []):
        if ip not in seen_iocs:
            rows.append(f"| IP | `{ip}` |")
            seen_iocs.add(ip)
            
    for h in extractor.get("files", []):
        if h not in seen_iocs:
            rows.append(f"| HASH | `{h}` |")
            seen_iocs.add(h)
    
    if not rows:
        return "_No specific indicators detected._"
        
    header = "| Type | Value |\n| :--- | :--- |\n"
    return header + "\n".join(rows)

def _format_description(node_results: Dict[str, Any]) -> str:
    judge = node_results.get("agent_judge", {})
    
    verdict = judge.get('verdict', 'N/A')
    desc = f"## AI ANALYSIS REPORT\n"
    desc += f"**VERDICT:** {verdict}\n"
    desc += f"**CONFIDENCE:** {judge.get('confidence_score', 0)}%\n\n"
    
    desc += "### INVESTIGATION REASONING\n"
    desc += f"{judge.get('analysis_reasoning', 'No reasoning provided.')}\n\n"

    desc += "### INDICATORS OF COMPROMISE\n"
    desc += _get_ioc_table(node_results) + "\n\n"
    
    desc += "### RECOMMENDED ACTIONS\n"
    mitigation = judge.get("mitigation_steps", [])
    if mitigation:
        for step in mitigation:
            desc += f"- {step}\n"
    else:
        desc += "No immediate mitigation recommended.\n"
    
    desc += "\n---\n*Escalated from Cognitive SOC Dashboard*"
    return desc

# Test Data
sample_results = {
    "agent_judge": {
        "verdict": "False Positive",
        "confidence_score": 95,
        "analysis_reasoning": "Alert represents a routine Windows service logon...",
        "mitigation_steps": ["No action required."]
    },
    "agent_screener": {
        "network": ["127.0.0.1", "192.168.1.1"],
        "files": ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]
    },
    "agent_investigator": {
        "sanitized_observables": [
            {"type": "ip", "ioc": "192.168.1.1"},
            {"type": "hash", "ioc": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
        ]
    }
}

print(_format_description(sample_results))
