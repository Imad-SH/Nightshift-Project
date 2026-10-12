import httpx
import json
import os
from typing import Any, Dict, List
from app.core.config import settings
from datetime import datetime, timezone


def _normalize_ioc(item: Any) -> str:
    """Extract a plain string from either a str or a dict IOC object."""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(
            item.get("value") or item.get("label") or item.get("ioc")
            or item.get("data") or next(iter(item.values()), "")
        )
    return str(item)

class TheHiveService:
    """
    Service to interact with TheHive v4/v5 API for formal Case Management.
    """
    
    def __init__(self):
        self.url = settings.thehive_url.rstrip("/")
        self.api_key = settings.thehive_api_key
        # TheHive v4/v5 usually expects 'Bearer' or 'Key' prefix. 
        # We provide both standard 'Authorization' and 'X-API-KEY' for compatibility.
        self._build_headers()

    def _build_headers(self):
        """Build HTTP headers from current credentials."""
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-API-KEY": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def reload_credentials(self, url: str = None, api_key: str = None):
        """
        Hot-reload credentials from DB-stored values.
        Called by the reload-integrations endpoint after admin saves new settings.
        Falls back to existing values if new ones are not provided.
        """
        if url:
            self.url = url.rstrip("/")
            print(f"🔄 [TheHive] URL updated to: {self.url}")
        if api_key:
            self.api_key = api_key
            print(f"🔄 [TheHive] API key updated (length: {len(api_key)})")
        self._build_headers()

    async def check_connectivity(self) -> bool:
        """
        Checks if the service can connect to TheHive API.
        """
        if not self.api_key:
            print(f"⚠️ [TheHive] Connectivity Check failed: THEHIVE_API_KEY is missing from environment.")
            return False
            
        if not self.url:
            print(f"⚠️ [TheHive] Connectivity Check failed: THEHIVE_URL is missing from environment.")
            return False
            
        try:
            async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
                # TheHive health check based on user details
                response = await client.get(
                    f"{self.url}/api/user/current",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    print(f"✅ [TheHive] Connectivity Check result: True")
                    return True
                else:
                    print(f"❌ [TheHive] Connectivity Check failed: Status {response.status_code} - {response.text[:50]}")
                    return False
        except Exception as e:
            print(f"❌ [TheHive] Connectivity Check exception: {str(e)}")
            return False

    async def create_alert(self, alert_id: str, event_data: Dict[str, Any], alert_title: str = "Unknown Alert", alert_agent: str = "Unknown Agent", rule_level: int = 0, is_duplicate: bool = False, is_ai_analyzed: bool = False, manual_description: str = None, manual_tags: list = None) -> Dict[str, Any]:
        """
        Escalates a SOC alert to TheHive as a new Alert.
        """
        if not self.api_key:
            raise ValueError("TheHive API Key is not configured.")

        # Extract nested node results
        node_results = event_data.get("node_results") or event_data
        
        # 1. Format Description (Markdown) — use manual if provided, skip AI report if not analyzed
        if manual_description:
            description = f"## CASE DESCRIPTION\n{manual_description}\n\n---\n*Escalated manually from {settings.brand_name}*"
        elif is_ai_analyzed:
            description = self._format_description(event_data, alert_agent)
        else:
            description = f"*No AI analysis was performed on this alert.*\n\n---\n*Escalated from {settings.brand_name}*"

        # 2. Extract Observables
        observables = self._extract_observables(node_results)

        # 3. Map Severity (1-3)
        if rule_level >= 12:
            severity = 3 # High
        elif rule_level >= 8:
            severity = 2 # Medium
        else:
            severity = 1 # Low

        # 4. Adjust for Duplicates
        if manual_description:
            title = f"[Manual] {alert_title}"
        elif is_ai_analyzed:
            title = f"[AI] {alert_title}"
        else:
            title = alert_title
        source_ref = alert_id
        if is_duplicate:
            title += " [duplicate]"
            # Use timestamp to make sourceRef unique and avoid 400 Duplicate error
            source_ref = f"{alert_id}_dup_{int(datetime.now(timezone.utc).timestamp())}"

        # TheHive Alert Payload
        payload = {
            "title": title,
            "description": description,
            "severity": severity,
            "type": "external",
            "source": "Cognitive-SOC",
            "sourceRef": source_ref,
            "externalLink": f"{settings.frontend_url}/alerts/{alert_id}",
            "observables": observables,
            "tags": (manual_tags if manual_description else (["AI-Analyzed"] if is_ai_analyzed else [])) + [f"Agent:{alert_agent}"]
        }

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(
                f"{self.url}/api/alert",
                headers=self.headers,
                json=payload
            )
            
            if response.status_code not in [200, 201]:
                error_detail = response.text
                print(f"❌ TheHive Escalation Failed: {response.status_code} - {error_detail}")
                raise Exception(f"TheHive API Error: {response.status_code}")
            
            return response.json()

    def _format_description(self, event_data: Dict[str, Any], alert_agent: str) -> str:
        """Formats AI agent data into a professional Markdown description for TheHive."""
        node_results = event_data.get("node_results") or event_data
        judge = node_results.get("agent_judge", {})
        screener = node_results.get("agent_screener", {})
        
        # Robust Verdict Extraction (Search nested first, then top level)
        verdict = judge.get('verdict') or event_data.get('verdict') or 'N/A'
        confidence = judge.get('confidence_score') or event_data.get('confidence') or 0
        reasoning = judge.get('analysis_reasoning') or event_data.get('reasoning') or 'No reasoning provided.'
        summary = screener.get('summary') or 'No tactical summary available.'

        desc = f"## AI ANALYSIS REPORT\n"
        desc += f"**VERDICT:** {verdict}\n"
        desc += f"**CONFIDENCE:** {confidence}%\n\n"

        desc += "### TACTICAL SUMMARY\n"
        desc += f"{summary}\n\n"
        
        desc += "### INVESTIGATION REASONING\n"
        desc += f"{reasoning}\n\n"

        # --- BEHAVIORAL ANALYSIS ---
        try:
            def safe_dict(val):
                if isinstance(val, dict): return val
                if isinstance(val, str):
                    import json
                    try: return json.loads(val)
                    except: return {}
                return {}

            def safe_int(val, default=0):
                try: return int(float(val))
                except: return default

            def safe_float(val, default=0.0):
                try: return float(val)
                except: return default

            def safe_bool(val, default=False):
                if isinstance(val, bool): return val
                if isinstance(val, str): return val.lower() in ('true', '1', 'yes')
                return bool(val)

            # Properly extract investigator from node_results before using it
            raw_investigator = node_results.get("agent_investigator", {})
            investigator = safe_dict(raw_investigator)
            
            burst = safe_dict(investigator.get("burst"))
            burst_source = safe_int(burst.get("source_count") if burst.get("source_count") is not None else investigator.get("burst_source"), 0)
            is_burst = safe_bool(burst.get("is_burst") if burst.get("is_burst") is not None else investigator.get("is_burst"), False)
            burst_global = safe_int(burst.get("global_count") if burst.get("global_count") is not None else investigator.get("burst_global"), 0)
            
            burst_source_str = "NO" if burst_source == 0 else str(burst_source)
            burst_global_str = "NO" if burst_global == 0 else str(burst_global)
            burst_hits_word = "hit" if burst_source == 1 else "hits"
            burst_text = f"This host **({alert_agent})** has triggered **{burst_source_str} {burst_hits_word}** of this rule in the last 15 minutes, which {'indicates a significant activity burst' if is_burst else 'is currently within normal volume limits'} compared to the **{burst_global_str} total** network-wide triggers."

            cooccurrence = safe_dict(investigator.get("cooccurrence"))
            cooc_distinct = safe_int(cooccurrence.get("distinct_rules") if cooccurrence.get("distinct_rules") is not None else investigator.get("cooc_distinct"), 0)
            is_susp_cooc = safe_bool(cooccurrence.get("is_suspicious") if cooccurrence.get("is_suspicious") is not None else investigator.get("is_suspicious_cooc"), False)
            
            if cooc_distinct == 0:
                cooc_text = f"This host **({alert_agent})** has triggered **NO** security rules within the last 1 hour, which currently shows no suspicious rule correlation."
            else:
                cooc_rule_word = "rule" if cooc_distinct == 1 else "rules"
                cooc_text = f"This host **({alert_agent})** has triggered **{cooc_distinct} different** security {cooc_rule_word} within the last 1 hour, which {'could be a strong indicator of a multi-stage attack' if is_susp_cooc else 'currently shows no suspicious rule correlation'}."

            time_anomaly = safe_dict(investigator.get("time_anomaly"))
            total_historical = safe_int(time_anomaly.get("total_historical") if time_anomaly.get("total_historical") is not None else investigator.get("total_historical"), 0)
            hour_pct = safe_float(time_anomaly.get("current_hour_pct") if time_anomaly.get("current_hour_pct") is not None else investigator.get("hour_pct"), 0.0)
            is_unusual_timing = safe_bool(time_anomaly.get("is_unusual_timing") if time_anomaly.get("is_unusual_timing") is not None else investigator.get("is_unusual_timing"), False)
            
            local_hour = safe_int(time_anomaly.get("current_hour") if time_anomaly.get("current_hour") is not None else investigator.get("current_hour"), 0)
            local_next_hour = (local_hour + 1) % 24
            time_range = f"**{local_hour:02d}:00** and **{local_next_hour:02d}:00**"

            rule_id = "Unknown"
            rule = event_data.get("rule")
            if isinstance(rule, dict):
                rule_id = str(rule.get("id", "Unknown"))
            elif event_data.get("rule_id"):
                rule_id = str(event_data.get("rule_id"))

            alert_time = None
            for ts_key in ('timestamp', '@timestamp', 'alert_timestamp', 'alert_time_utc'):
                ts_val = event_data.get(ts_key)
                if ts_val:
                    try:
                        from datetime import datetime
                        if isinstance(ts_val, datetime):
                            alert_time = ts_val
                        else:
                            alert_time = datetime.fromisoformat(str(ts_val).replace('Z', '+00:00'))
                        break
                    except:
                        pass

            local_time_str = alert_time.strftime("%H:%M:%S") if alert_time else f"{local_hour:02d}:00:00"

            if total_historical >= 10:
                timing_text = f"This alert was triggered at **{local_time_str}**, out of all **{total_historical} similar alerts** with this rule **({rule_id})**, coming from the same source **({alert_agent})**, spanning a 30-day window, **{hour_pct}%** of them are usually triggered between {time_range}, which is why this is **{'an anomaly' if is_unusual_timing else 'an expected behavior'}** since it **{'deviates significantly from' if is_unusual_timing else 'matches'}** established historical patterns."
            else:
                timing_text = f"This alert was triggered at **{local_time_str}** with rule **({rule_id})** from source **({alert_agent})**. Insufficient 30-day history available for baseline timing comparison."

            desc += "### BEHAVIORAL ANALYSIS\n"
            desc += f"**Burst Check (15min):** {burst_text}\n\n"
            desc += f"**Multi-Rule Correlation:** {cooc_text}\n\n"
            desc += f"**Forensic Timing Summary:** {timing_text}\n\n"
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"[TheHive] Failed to generate Behavioral Analysis: {e}\n{tb}")
            desc += "### BEHAVIORAL ANALYSIS\n"
            desc += f"_Failed to generate behavioral analysis due to internal data error: {str(e)}_\n\n"

        desc += "### INDICATORS OF COMPROMISE\n"
        desc += self._get_ioc_table(node_results) + "\n\n"
        
        desc += "### RECOMMENDED ACTIONS\n"
        mitigation = judge.get("mitigation_steps", [])
        if mitigation:
            for step in mitigation:
                desc += f"- {step}\n"
        else:
            desc += "No immediate mitigation recommended.\n"
        
        desc += f"\n---\n*Escalated from {settings.brand_name}*"
        return desc

    def _get_ioc_table(self, node_results: Dict[str, Any]) -> str:
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
        for cat_key in ["network", "files", "identities", "system"]:
            for raw_item in extractor.get(cat_key, []):
                val = _normalize_ioc(raw_item)
                if not val or val in seen_iocs:
                    continue
                
                # Determine the type label
                ioc_type = cat_key.upper()
                if isinstance(raw_item, dict):
                    extracted_label = raw_item.get("label") or raw_item.get("type")
                    if extracted_label:
                        ioc_type = str(extracted_label).upper()
                else:
                    # Fallback for legacy string lists saved in DB before schema enforcement
                    val_str = str(val)
                    if cat_key == 'system':
                        if val_str.isdigit() and len(val_str) <= 7: ioc_type = "PROCESS ID"
                        elif '{' in val_str and '}' in val_str: ioc_type = "CLSID / GUID"
                        elif '\\' in val_str or '/' in val_str: ioc_type = "SYSTEM PATH"
                        elif val_str.lower().endswith(('.exe', '.dll', '.sys', '.ps1', '.bat')): ioc_type = "FILE NAME"
                        elif '-' in val_str and 'Windows' in val_str: ioc_type = "SERVICE / COMPONENT"
                        else: ioc_type = "SYSTEM ARTIFACT"
                    elif cat_key == 'identities': ioc_type = "IDENTITY / SID"
                    elif cat_key == 'network': ioc_type = "NETWORK INDICATOR"
                
                rows.append(f"| {ioc_type} | `{val}` |")
                seen_iocs.add(val)
        
        if not rows:
            return "_No specific indicators detected._"
            
        header = "| Type | Value |\n| :--- | :--- |\n"
        return header + "\n".join(rows)

    def _extract_observables(self, node_results: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Maps IoCs to TheHive observable format."""
        observables = []
        extractor = node_results.get("agent_screener", {})
        investigator = node_results.get("agent_investigator", {})
        
        # From Investigator (Verified Context)
        for item in investigator.get("sanitized_observables", []):
            observables.append({
                "type": item.get("type", "other"),
                "data": item.get("ioc"),
                "description": f"CTI Match: {item.get('tool', 'Unknown')}",
                "tags": ["Verified"]
            })
            
        # From Extractor (Uniqueness check) — normalize dicts to strings for old stored alerts
        seen = {o["data"] for o in observables}

        for raw_ip in extractor.get("network", []):
            ip = _normalize_ioc(raw_ip)
            if ip and ip not in seen:
                observables.append({"type": "ip", "data": ip, "tags": ["Semantic-Extract"]})
                seen.add(ip)

        for raw_h in extractor.get("files", []):
            h = _normalize_ioc(raw_h)
            if h and h not in seen:
                observables.append({"type": "hash", "data": h, "tags": ["Semantic-Extract"]})
                seen.add(h)
        
        return observables

thehive_service = TheHiveService()
