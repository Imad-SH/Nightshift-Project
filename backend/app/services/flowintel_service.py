import httpx
import json
import os
from typing import Dict, Any, List
from app.core.config import settings
from datetime import datetime, timezone

class FlowintelService:
    """
    Service to interact with Flowintel v3.1.0 API as a replacement for TheHive.
    Focuses on Case Management and Intelligence ingestion.
    """
    
    def __init__(self):
        self.url = settings.flowintel_url.rstrip("/")
        self.api_key = settings.flowintel_api_key
        self.headers = {}
        self._build_headers()

    def _build_headers(self):
        """Build HTTP headers from current credentials."""
        self.headers = {
            "X-API-KEY": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def reload_credentials(self, url: str = None, api_key: str = None):
        """
        Hot-reload credentials from DB-stored values.
        Called by the reload-integrations endpoint after admin saves new settings.
        """
        if url:
            self.url = url.rstrip("/")
            print(f"🔄 [Flowintel] URL updated to: {self.url}")
        if api_key:
            self.api_key = api_key
            print(f"🔄 [Flowintel] API key updated.")
        self._build_headers()

    async def check_connectivity(self) -> bool:
        """
        Checks if the service can connect to Flowintel API.
        """
        if not self.api_key or not self.url:
            return False
            
        try:
            async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
                # Flowintel v3 health/status check
                response = await client.get(
                    f"{self.url}/api/case/list_status",
                    headers=self.headers
                )
                
                return response.status_code == 200
        except Exception as e:
            print(f"❌ [Flowintel] Connectivity Check exception: {str(e)}")
            return False

    async def create_case(self, alert_id: str, event_data: Dict[str, Any], alert_title: str = "Unknown Alert", alert_agent: str = "Unknown Agent", rule_level: int = 0, force: bool = False, is_ai_analyzed: bool = False, manual_description: str = None, manual_tags: list = None, db=None) -> Dict[str, Any]:
        """
        Escalates a SOC alert to Flowintel as a new Case/Incident.
        """
        if not self.api_key:
            raise ValueError("Flowintel API Key is not configured.")

        # Extract nested node results
        node_results = event_data.get("node_results") or event_data
        judge_data = node_results.get("agent_judge", {})
        
        # 1. Format Description — use manual if provided, skip AI report if not analyzed
        if manual_description:
            description = f"## CASE DESCRIPTION\n{manual_description}\n\n---\n*Escalated manually from {settings.brand_name}*"
        elif is_ai_analyzed:
            description = self._format_description(node_results, alert_agent)
        else:
            description = f"*No AI analysis was performed on this alert.*\n\n---\n*Escalated from {settings.brand_name}*"

        # 2. Extract Indicators (Observables)
        indicators = self._extract_indicators(node_results)

        # 3. Map Severity (1-4)
        if rule_level >= 12:
            severity = 4 # Critical
        elif rule_level >= 8:
            severity = 3 # High
        elif rule_level >= 5:
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
        ticket_id = alert_id
        if force:
            title += " [duplicate]"
            # Use timestamp to make ticket_id unique and avoid 400 Duplicate error from Flowintel
            ticket_id = f"{alert_id}_dup_{int(datetime.now(timezone.utc).timestamp())}"

        # Flowintel v3.1.0 supports standard JSON body for case creation
        payload = {
            "title": title,
            "description": description,
            "severity": severity,
            "status": "open",
            "is_private": False,
            "ticket_id": ticket_id
        }

        async with httpx.AsyncClient(verify=False) as client:
            # Flowintel v3.1.0 REQUIRES a JSON body for case creation
            response = await client.post(
                f"{self.url}/api/case/create",
                headers=self.headers,
                json=payload
            )
            
            if response.status_code not in [200, 201]:
                error_detail = response.text
                print(f"❌ Flowintel Escalation Failed: {response.status_code} - {error_detail}")
                raise Exception(f"Flowintel API Error: {response.status_code}")
            
            res_data = response.json()
            # Normalize case_id to id for UI consistency
            if "case_id" in res_data and "id" not in res_data:
                res_data["id"] = res_data["case_id"]
            
            flowintel_id = res_data.get("id")
            
            # Persist relationship in dashboard DB if provided
            if db and flowintel_id:
                try:
                    from app.services.alert_service import AlertService
                    # Sync with DB using the new Flowintel-specific method
                    await AlertService.update_flowintel_id(db, alert_id, f"FI-{flowintel_id}")
                except Exception as db_err:
                    print(f"⚠️ [Flowintel] DB association failed: {db_err}")

            return res_data

    def _format_description(self, node_results: Dict[str, Any], alert_agent: str) -> str:
        """Formats AI agent data into a professional Markdown description for Flowintel."""
        judge = node_results.get("agent_judge", {})
        extractor = node_results.get("agent_screener", {})
        
        verdict = judge.get('verdict', 'N/A')
        desc = f"## 🤖 AI ANALYSIS REPORT\n"
        desc += f"**VERDICT:** {verdict}\n"
        desc += f"**CONFIDENCE:** {judge.get('confidence_score', 0)}%\n\n"
        
        desc += "### 🛡️ INVESTIGATION REASONING\n"
        desc += f"{judge.get('analysis_reasoning', 'No reasoning provided.')}\n\n"
        
        desc += "### ⚡ RESPONSE STRATEGY\n"
        mitigation = judge.get("mitigation_steps", [])
        if mitigation:
            for step in mitigation:
                desc += f"- {step}\n"
        else:
            desc += "No immediate mitigation recommended.\n"
        
        desc += f"\n---\n*Escalated from {settings.brand_name}*"
        return desc

    def _extract_indicators(self, node_results: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Maps IoCs to Flowintel indicator format."""
        indicators = []
        extractor = node_results.get("agent_screener", {})
        investigator = node_results.get("agent_investigator", {})
        
        # From Investigator (Verified Context)
        for item in investigator.get("sanitized_observables", []):
            indicators.append({
                "type": item.get("type", "other"),
                "value": item.get("ioc"),
                "description": f"CTI Match: {item.get('tool', 'Unknown')}",
                "tags": ["Verified"]
            })
            
        # From Extractor (Uniqueness check)
        seen = {i["value"] for i in indicators}
        
        for ip in extractor.get("network", []):
            if ip not in seen:
                indicators.append({"type": "ip", "value": ip, "tags": ["Semantic-Extract"]})
                seen.add(ip)
                
        for h in extractor.get("files", []):
            if h not in seen:
                indicators.append({"type": "hash", "value": h, "tags": ["Semantic-Extract"]})
                seen.add(h)
        
        return indicators

flowintel_service = FlowintelService()
