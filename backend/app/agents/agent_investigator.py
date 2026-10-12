import asyncio
import httpx
import json
import os
import sys
import re
import ipaddress
import base64
import dns.resolver
import urllib.parse
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import redis.asyncio as redis

# --- PATH & ENV INITIALIZATION ---
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(script_dir))
sys.path.append(backend_dir)

env_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=env_path)

from app.core.config import settings

class AgentInvestigator:
    """
    Agent 2: The Investigator (Production-Grade CTI Pipeline)
    Role: High-fidelity orchestration, caching, rate-limiting, and normalization.
    """

    _global_semaphores = None

    def __init__(self):
        # Redis Cache Client
        self._redis = redis.Redis(
            host=os.getenv("REDIS_HOST", "redis"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=int(os.getenv("REDIS_DB", 0)),
            decode_responses=True
        )
        
        # Concurrency Semaphores (Rate Limiting per Vendor) - Shared across all instances
        if AgentInvestigator._global_semaphores is None:
            AgentInvestigator._global_semaphores = {
                "VirusTotal": asyncio.Semaphore(2),
                "AbuseIPDB": asyncio.Semaphore(10),
                "URLScan": asyncio.Semaphore(5),
                "AlienVault OTX": asyncio.Semaphore(5),
                "Hybrid Analysis": asyncio.Semaphore(2),
                "MxToolbox": asyncio.Semaphore(2),
                "GreyNoise": asyncio.Semaphore(5),
                "ThreatFox": asyncio.Semaphore(5),
                "Shodan": asyncio.Semaphore(2),
                "URLhaus": asyncio.Semaphore(5),
                "MalwareBazaar": asyncio.Semaphore(5),
                "NVD": asyncio.Semaphore(3),
                "EmailRep": asyncio.Semaphore(3)
            }
        self._semaphores = AgentInvestigator._global_semaphores
        
        # Domain Safelist (Externalized)
        sl_env = os.getenv("SAFELIST_DOMAINS", "")
        self._safelist_domains = set(d.strip() for d in sl_env.split(",") if d.strip())
        if not self._safelist_domains:
            # Fallback defaults if env is empty
            self._safelist_domains = {
                "google.com", "microsoft.com", "aws.amazon.com", "azure.com", "cloudflare.com",
                "akamai.com", "apple.com", "github.com", "windows.com", "office.com", "google.co.uk"
            }

    async def run(self, alert_id: str, observables: Dict[str, Any], raw_data: Dict[str, Any], db=None) -> Dict[str, Any]:
        """Main entry point for Agent 2."""
        try:
            await self._emit_log(alert_id, "[Agent 2] Production Pipeline Initiated")

            # 1. Internal Context (Frequency/Anomaly)
            internal_context = await self._check_internal_context(alert_id, observables, raw_data, db)

            # 2. Sanitize Observables (Scrubbing & Safelists)
            await self._emit_log(alert_id, "[Sanitizer] Scrubbing indicators...")
            sanitized = self._sanitize_observables(observables)

            # 3. Query External Sources (Router + Cache + Semaphore)
            # Safely extract Agent ID for routing (handle both string and dict formats)
            agent_val = raw_data.get('agent', {})
            agent_id = agent_val.get('id', '000') if isinstance(agent_val, dict) else '000'
            await self._emit_log(alert_id, f"[Router] Dispatching {len(sanitized)} tasks...")
            external_intel = await self._query_external_sources(sanitized, alert_id, agent_id)

            # 4. IOC Cross-Alert Fingerprinting (Redis TTL keys, tooltip-only)
            ioc_fingerprint = await self._fingerprint_iocs(sanitized, alert_id, raw_data, external_intel)

            return {
                "source": internal_context.get("source"),
                "rule_count": internal_context.get("rule_frequency", {}).get("count", 0),
                "rule_on_host": internal_context.get("rule_on_host", {}).get("count", 0),
                "is_burst": internal_context.get("burst", {}).get("is_burst", False),
                "burst_global": internal_context.get("burst", {}).get("global_count", 0),
                "burst_source": internal_context.get("burst", {}).get("source_count", 0),
                "is_suspicious_cooc": internal_context.get("cooccurrence", {}).get("is_suspicious", False),
                "cooc_distinct": internal_context.get("cooccurrence", {}).get("distinct_rules", 0),
                "is_unusual_timing": internal_context.get("time_anomaly", {}).get("is_unusual_timing", False),
                "hour_pct": internal_context.get("time_anomaly", {}).get("current_hour_pct", 0),
                "alert_time_utc": internal_context.get("time_anomaly", {}).get("alert_time_utc"),
                "current_hour": internal_context.get("time_anomaly", {}).get("current_hour", 0),
                "external_intel": external_intel,
                "sanitized_observables": sanitized,
                "ioc_fingerprint": ioc_fingerprint,
                "pipeline_version": "2.0.0-PROD"
            }
        except Exception as e:
            error_msg = f"[Agent Investigator Error]: {e}"
            print(error_msg)
            await self._emit_log(alert_id, error_msg)
            return {"error": str(e)}

    def _sanitize_observables(self, observables: Any) -> List[Dict[str, str]]:
        """
        Converts raw Agent 1 output into a deduplicated list of enrichable IoC dicts.
        Handles Observable dicts, raw strings, and both list/dict input shapes.
        Covers: IP, MD5/SHA1/SHA256/SHA512, URL, domain, file path,
                email, registry key, CVE ID.
        """
        sanitized: List[Dict[str, str]] = []
        seen: set = set()

        def _val(item) -> str:
            if isinstance(item, dict):
                return str(item.get('value') or item.get('ioc') or '').strip()
            return str(item).strip()

        def _add(ioc: str, ioc_type: str):
            key = (ioc, ioc_type)
            if ioc and key not in seen:
                seen.add(key)
                sanitized.append({"ioc": ioc, "type": ioc_type})

        # Normalize input shape
        obs_dict: Dict[str, list] = {}
        if isinstance(observables, list):
            obs_dict = {"network": [], "files": []}
            for item in observables:
                if not isinstance(item, dict):
                    continue
                ioc_val = item.get("ioc")
                ioc_type = item.get("type", "")
                if ioc_type in ("ip", "url", "domain"):
                    obs_dict["network"].append(ioc_val)
                elif ioc_type in ("md5", "sha256", "file_path"):
                    obs_dict["files"].append(ioc_val)
        elif isinstance(observables, dict):
            obs_dict = observables
        else:
            return []

        _CVE_RE = re.compile(r'^CVE-\d{4}-\d{4,7}$', re.IGNORECASE)
        _EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,8}$')
        _REG_RE = re.compile(r'^HK(EY_[A-Z_]+|LM|CU|U|CR|CC)\\', re.IGNORECASE)

        # Common real TLDs — prevents internal hostnames like "wazuh.manager", "host.agent" etc.
        _REAL_TLDS = {
            'com','net','org','io','gov','edu','mil','int','co','uk','us','de','fr','nl',
            'ru','cn','jp','br','au','ca','in','it','es','mx','se','no','fi','dk','pl',
            'ch','at','be','nz','sg','za','kr','tw','hk','info','biz','name','pro','mobi',
            'xyz','app','dev','ai','tech','cloud','online','site','web','store','shop',
            'club','media','news','email','live','tv','cc','me','ly','gl','gg','eu','ac',
        }

        # 1. IPs — exclude private/loopback/reserved/multicast
        for raw_item in obs_dict.get('network', []):
            ip = _val(raw_item)
            try:
                ip_obj = ipaddress.ip_address(ip)
                if ip_obj.is_global and not ip_obj.is_multicast:
                    _add(ip, "ip")
            except ValueError:
                pass

        # 2. File hashes — MD5 / SHA1 / SHA256 / SHA512
        for raw_item in obs_dict.get('files', []):
            h = _val(raw_item)
            if re.match(r'^[a-fA-F0-9]{32}$', h):
                _add(h, "md5")
            elif re.match(r'^[a-fA-F0-9]{40}$', h):
                _add(h, "sha1")
            elif re.match(r'^[a-fA-F0-9]{64}$', h):
                _add(h, "sha256")
            elif re.match(r'^[a-fA-F0-9]{128}$', h):
                _add(h, "sha512")

        # 3. URLs & domains — apply safelist, validate TLD
        for raw_item in obs_dict.get('network', []):
            item = _val(raw_item)
            if not item:
                continue
            if item.startswith(('http://', 'https://')):
                _add(item, "url")
            elif (
                '.' in item and
                '\\' not in item and
                ' ' not in item and
                item.split('.')[-1].lower() in _REAL_TLDS
            ):
                domain = item.lower().strip()
                if domain not in self._safelist_domains and \
                        not any(domain.endswith(f'.{d}') for d in self._safelist_domains):
                    _add(domain, "domain")

        # 4. File paths — must look like a path and not be a hash
        for raw_item in obs_dict.get('files', []):
            path_str = _val(raw_item)
            if ('\\' in path_str or '/' in path_str or '.' in path_str) and \
                    not re.match(r'^[a-fA-F0-9]{32,128}$', path_str):
                _add(path_str, "file_path")

        # 5. Emails — from identities section
        for raw_item in obs_dict.get('identities', []):
            item = _val(raw_item)
            if item and _EMAIL_RE.match(item):
                _add(item.lower(), "email")

        # 6. Registry keys & CVE IDs — from system section
        for raw_item in obs_dict.get('system', []):
            item = _val(raw_item)
            if not item:
                continue
            if _CVE_RE.match(item):
                _add(item.upper(), "cve")
            elif _REG_RE.match(item):
                _add(item, "registry_key")

        # 7. CVE IDs — cross-section scan (LLM may place them in any field)
        for section in ('identities', 'network', 'files'):
            for raw_item in obs_dict.get(section, []):
                item = _val(raw_item)
                if item and _CVE_RE.match(item):
                    _add(item.upper(), "cve")

        return sanitized

    async def _query_external_sources(self, sanitized: List[Dict[str, str]], alert_id: str, agent_id: str) -> List[Dict[str, Any]]:
        """Phase 2: Router with triangulation logic."""
        tasks = []
        async with httpx.AsyncClient(timeout=20.0, verify=False, follow_redirects=True) as client:
            for item in sanitized:
                ioc = item['ioc']
                ioc_type = item['type']

                # Check Cache First <-- Removed as per user request to always query fresh data
                # cached = await self._get_from_cache(ioc)
                # if cached:
                #     tasks.append(self._return_cached(cached))
                #     continue

                # Triangulation Routing
                if ioc_type == "ip":
                    # Detect IPv4 vs IPv6 for OTX endpoint selection
                    try:
                        otx_type = "IPv6" if ipaddress.ip_address(ioc).version == 6 else "IPv4"
                    except Exception:
                        otx_type = "IPv4"
                    tasks.append(self._tool_abuseipdb(client, ioc))
                    tasks.append(self._tool_otx(client, ioc, otx_type))
                    tasks.append(self._tool_greynoise(client, ioc))
                    tasks.append(self._tool_shodan(client, ioc))
                    tasks.append(self._tool_virustotal(client, ioc, "ip_addresses"))
                elif ioc_type in ("md5", "sha1", "sha256", "sha512"):
                    tasks.append(self._tool_virustotal(client, ioc, "files"))
                    tasks.append(self._tool_hybrid_analysis_lookup(client, ioc))
                    tasks.append(self._tool_threatfox(client, ioc, "hash"))
                    tasks.append(self._tool_malwarebazaar(client, ioc))
                elif ioc_type == "url":
                    harmful_exts = ('.exe', '.dll', '.ps1', '.sh', '.msi', '.bin', '.bat', '.vbs')
                    if any(ioc.lower().endswith(ext) for ext in harmful_exts):
                        tasks.append(self._tool_virustotal(client, ioc, "urls"))
                        tasks.append(self._tool_urlhaus(client, ioc))
                    else:
                        tasks.append(self._tool_urlscan(client, ioc))
                        tasks.append(self._tool_virustotal(client, ioc, "urls"))
                        tasks.append(self._tool_urlhaus(client, ioc))
                elif ioc_type == "domain":
                    tasks.append(self._tool_virustotal(client, ioc, "domains"))
                    tasks.append(self._tool_mxtoolbox(client, ioc))
                    tasks.append(self._tool_threatfox(client, ioc, "domain"))
                    tasks.append(self._tool_otx(client, ioc, "domain"))
                    tasks.append(self._tool_urlhaus(client, ioc))
                elif ioc_type == "email":
                    tasks.append(self._tool_emailrep(client, ioc))
                elif ioc_type == "cve":
                    tasks.append(self._tool_nvd(client, ioc))
                elif ioc_type == "file_path":
                    tasks.append(self._tool_local_file(ioc))
                elif ioc_type == "registry_key":
                    tasks.append(self._tool_local_registry(ioc))

                # Custom CTI Sources — dynamically routed based on user-configured iocTypes
                custom_sources_json = getattr(settings, 'custom_cti_sources', None)
                if custom_sources_json:
                    try:
                        _ioc_type_map = {
                            'ip': 'IP', 'domain': 'Domain', 'url': 'URL',
                            'md5': 'File', 'sha1': 'File', 'sha256': 'File', 'sha512': 'File',
                            'email': 'Email', 'cve': 'CVE',
                        }
                        ui_type = _ioc_type_map.get(ioc_type)
                        if ui_type:
                            for cs in json.loads(custom_sources_json):
                                if ui_type in (cs.get('iocTypes') or []) and cs.get('baseUrl'):
                                    tasks.append(self._tool_custom(client, ioc, ioc_type, cs))
                    except Exception:
                        pass

            results = await asyncio.gather(*tasks, return_exceptions=True)
        
        output = []
        fail_count = 0
        rate_limit_tools = []
        
        for res in results:
            if isinstance(res, Exception):
                fail_count += 1
                output.append({"status": "error", "error": f"Task Failed: {str(res)}"})
            elif res:
                refined = self._refine_intel(res)
                output.append(refined)
                
                # Check for HTTP errors in refined output
                if res.get("status", 200) != 200:
                    fail_count += 1
                    if res.get("status") == 429:
                        rate_limit_tools.append(res.get("tool", "Unknown"))
        
        # UI Feedback for errors
        if rate_limit_tools:
            tools_str = ", ".join(list(set(rate_limit_tools)))
            await self._emit_log(alert_id, f"⚠️ Rate Limit (429) hit for: {tools_str}. Some CTI data may be missing.")
        elif fail_count > 0:
            await self._emit_log(alert_id, f"⚠️ {fail_count} CTI tools returned errors. Proceeding with available data.")
            
        return output

    # --- CACHING LOGIC (REDIS) ---
    async def _get_from_cache(self, ioc: str) -> Optional[Dict[str, Any]]:
        try:
            cached = await self._redis.get(f"cti:{ioc}")
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"[Redis Error] Get failed: {e}")
        return None

    async def _set_to_cache(self, normalized: Dict[str, Any]):
        ioc = normalized.get("ioc")
        ioc_type = normalized.get("type")
        if not ioc or normalized.get("verdict") == "unknown": return
        
        # TTL: 24h for IPs, 7d for others
        ttl_seconds = 86400 if ioc_type == "ip" else 604800
        try:
            await self._redis.setex(f"cti:{ioc}", ttl_seconds, json.dumps(normalized))
        except Exception as e:
            print(f"[Redis Error] Set failed: {e}")

    async def _return_cached(self, data: Dict[str, Any]):
        return {"_cached": True, **data}

    # --- NORMALIZER (HIGH-FIDELITY SCHEMA) ---
    def _refine_intel(self, raw_res: Dict[str, Any]) -> Dict[str, Any]:
        """Converts vendor responses into the high-fidelity standard schema."""
        if raw_res.get("_cached") or raw_res.get("_refined"):
            return raw_res 

        tool = raw_res.get("tool")
        ioc = raw_res.get("ioc") or raw_res.get("path")
        status = raw_res.get("status", 0)
        body = raw_res.get("body", {})
        
        refined = {
            "ioc": ioc,
            "type": self._infer_type(ioc, tool, raw_res.get("type")),
            "tool": tool,
            "verdict": "unknown",
            "risk_score": 0,
            "confidence": "medium",
            "category_tags": [],
            "tactical_summary": "No data available.",
            "mitre_technique": None,
            "reference_link": None,
            "scan_timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        }

        if status != 200:
            if tool in ["VirusTotal", "Hybrid Analysis"] and status == 404:
                refined["verdict"] = "unknown"
                refined["tactical_summary"] = f"Indicator never seen by {tool}."
                return refined
            
            # Standardize error response to maintain High-Fidelity Schema
            refined.update({
                "verdict": "unknown",
                "risk_score": 0,
                "tactical_summary": f"Provider Error: {raw_res.get('error')} (Status {status})",
                "category_tags": ["API_ERROR"],
                "raw_error_detail": str(body)[:500] if body else None
            })
            return refined

        try:
            if tool == "AbuseIPDB":
                data = body.get("data", {})
                score = data.get("abuseConfidenceScore", 0)
                refined.update({
                    "risk_score": score,
                    "verdict": "malicious" if score > 50 else ("suspicious" if score > 10 else "safe"),
                    "confidence": "high" if score > 75 else "medium",
                    "category_tags": [data.get("usageType")] if data.get("usageType") else [],
                    "tactical_summary": f"Abuse confidence: {score}%. Reports: {data.get('totalReports')}",
                    "reference_link": f"https://www.abuseipdb.com/check/{ioc}"
                })

            elif tool == "VirusTotal":
                attrs = body.get("data", {}).get("attributes", {})
                stats = attrs.get("last_analysis_stats", {})
                malicious = stats.get("malicious", 0)
                total = sum(stats.values())
                risk_score = int((malicious / total) * 100) if total > 0 else 0
                
                # Logic fix: Use the correct VT ID for the reference link (Base64 for URLs)
                vt_ref_id = ioc
                if "/urls/" in str(body.get("data", {}).get("links", {}).get("self", "")):
                    import base64
                    vt_ref_id = base64.urlsafe_b64encode(ioc.encode()).decode().strip("=")
                
                refined.update({
                    "risk_score": risk_score,
                    "verdict": "malicious" if malicious > 0 else "safe",
                    "category_tags": attrs.get("tags", [])[:5],
                    "tactical_summary": f"Detections: {malicious}/{total}. Community Score: {attrs.get('reputation')}. Result: {'Malicious' if malicious > 0 else 'Clean'}",
                    "reference_link": f"https://www.virustotal.com/gui/{'url' if len(vt_ref_id) > 64 or ioc.startswith('http') else 'search'}/{vt_ref_id}"
                })

            elif tool == "URLScan":
                results = body.get("results", [])
                if results:
                    v = results[0].get("verdict", {})
                    score = v.get("score", 0)
                    refined.update({
                        "risk_score": score,
                        "verdict": "malicious" if v.get("malicious") else "safe",
                        "tactical_summary": f"URLScan score: {score}. Verdict: {v.get('verdict')}",
                        "reference_link": results[0].get("result")
                    })

            elif tool == "AlienVault OTX":
                pulses = body.get("pulse_info", {}).get("pulses", [])
                p_count = len(pulses)
                refined.update({
                    "risk_score": min(p_count * 10, 100),
                    "verdict": "malicious" if p_count > 5 else ("suspicious" if p_count > 0 else "safe"),
                    "category_tags": list(set([t for p in pulses for t in p.get("tags", [])]))[:5],
                    "tactical_summary": f"Associated with {p_count} OTX pulses.",
                    "reference_link": f"https://otx.alienvault.com/indicator/{refined['type']}/{ioc}"
                })

            elif tool == "Hybrid Analysis":
                data = body[0] if isinstance(body, list) and body else body
                if isinstance(data, dict):
                    score = data.get("threat_score") or 0 # Fix: Handle None types for threat_score
                    refined.update({
                        "risk_score": score,
                        "verdict": "malicious" if score > 75 else ("suspicious" if score > 25 else "safe"),
                        "tactical_summary": f"Threat Score: {score}. VX Family: {data.get('vx_family')}",
                        "mitre_technique": data.get("mitre_attck_id")
                    })

            elif tool == "MxToolbox":
                # Ensure we use the specialized verdict from the tool itself
                pass


        except Exception as e:
            refined["parsing_error"] = str(e)
        return refined

    def _infer_type(self, ioc: str, tool: str = None, hint: str = None) -> str:
        if hint: return hint
        if not ioc: return "unknown"
        if re.match(r'^[a-fA-F0-9]{32}$', ioc): return "file(md5)"
        if re.match(r'^[a-fA-F0-9]{40}$', ioc): return "file(sha1)"
        if re.match(r'^[a-fA-F0-9]{64}$', ioc): return "file(sha256)"
        if re.match(r'^[a-fA-F0-9]{128}$', ioc): return "file(sha512)"
        if re.match(r'^\d{1,3}(\.\d{1,3}){3}$', ioc): return "ip"
        if re.match(r'^CVE-\d{4}-\d{4,7}$', ioc, re.IGNORECASE): return "cve"
        if re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,8}$', ioc): return "email"
        if re.match(r'^HK(EY_[A-Z_]+|LM|CU|U|CR|CC)\\', ioc, re.IGNORECASE): return "registry_key"
        if ioc.startswith("http"):
            harmful_exts = ('.exe', '.dll', '.ps1', '.sh', '.msi', '.bin', '.bat', '.vbs')
            if any(ioc.lower().split('?')[0].endswith(ext) for ext in harmful_exts):
                return "url(binary)"
            return "url(website)"
        if "\\" in ioc or ioc.startswith("/"):
            return "file_path"
        return "domain"

    # --- TOOLS WITH SEMAPHORE RATE LIMITING ---
    async def _tool_local_file(self, ioc: str):
        """Dummy tool to represent local file analysis (bypasses network)."""
        ext = (ioc.rsplit('.', 1)[-1] if '.' in ioc else '').lower()
        if ext in ('exe', 'dll', 'msi', 'scr', 'com', 'pif'):  file_type = 'Executable'
        elif ext in ('ps1', 'vbs', 'js', 'py', 'sh', 'bat', 'cmd', 'wsf', 'hta'): file_type = 'Script'
        elif ext in ('sys', 'drv', 'ocx'):  file_type = 'Driver'
        elif ext in ('doc', 'docx', 'xls', 'xlsx', 'pdf', 'ppt', 'pptx'): file_type = 'Document'
        elif ext in ('zip', 'tar', 'gz', 'rar', '7z', 'cab'): file_type = 'Archive'
        elif ext in ('log', 'tmp', 'ini', 'cfg', 'conf', 'dat'): file_type = 'System File'
        else: file_type = 'File Path'
        return {
            "ioc": ioc,
            "type": "file_path",
            "tool": "Local Analysis",
            "verdict": "info",
            "risk_score": 0,
            "category_tags": [file_type],
            "tactical_summary": f"{file_type} noted. No external network query performed.",
            "_refined": True
        }

    async def _tool_abuseipdb(self, client: httpx.AsyncClient, ioc: str):
        async with self._semaphores["AbuseIPDB"]:
            url = "https://api.abuseipdb.com/api/v2/check"
            headers = {"Key": settings.abuseipdb_api_key, "Accept": "application/json"}
            params = {"ipAddress": ioc, "maxAgeInDays": "90"}
            res = await self._http_call(client, url, headers, params)
            res.update({"tool": "AbuseIPDB", "ioc": ioc})
            return res

    async def _tool_virustotal(self, client: httpx.AsyncClient, ioc: str, vt_type: str):
        async with self._semaphores["VirusTotal"]:
            # VirusTotal API v3 requires URLs to be base64 identifiers
            vt_id = ioc
            if vt_type == "urls":
                vt_id = base64.urlsafe_b64encode(ioc.encode()).decode().strip("=")

            url = f"https://www.virustotal.com/api/v3/{vt_type}/{vt_id}"
            headers = {"x-apikey": settings.virustotal_api_key}
            res = await self._http_call(client, url, headers)
            
            # Active Scanning for URLs if 404
            if res.get("status") == 404 and vt_type == "urls":
                # Submit for scanning
                scan_url = "https://www.virustotal.com/api/v3/urls"
                try:
                    # VT expects the raw URL in form-data for submission
                    post_data = {"url": ioc}
                    post_res = await client.post(scan_url, headers=headers, data=post_data)
                    if post_res.status_code == 200:
                         return {
                             "ioc": ioc, "tool": "VirusTotal", "verdict": "unknown", 
                             "risk_score": 0, "tactical_summary": "URL submitted for scanning (queued).", 
                             "_refined": True
                         }
                except:
                    pass

            res.update({"tool": "VirusTotal", "ioc": ioc})
            return res

    def _get_time(self):
        return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    def _generate_error_record(self, error_msg, tool, ioc):
        return {
            "ioc": ioc,
            "tool": tool,
            "verdict": "unknown",
            "risk_score": 0,
            "confidence": "low",
            "category_tags": ["ERROR"],
            "tactical_summary": f"Tool Error: {error_msg}",
            "scan_timestamp": self._get_time(),
            "_refined": True
        }

    def _generate_urlscan_summary(self, data: Dict[str, Any]) -> str:
        """Generates a rich summary from URLScan data."""
        stats = data.get("stats", {})
        page = data.get("page", {})
        task = data.get("task", {})
        
        ips_count = stats.get("uniqIPs", 0)
        country = page.get("country", "Unknown Country")
        asn = page.get("asnname", "Unknown ASN")
        server = page.get("server", "Unknown Server")
        title = page.get("title", "No Title")
        
        return f"Contacted {ips_count} IPs in {country}. Hosted by {asn}. Server: {server}. Page Title: {title}."

    async def _tool_urlscan(self, client: httpx.AsyncClient, ioc: str):
        async with self._semaphores["URLScan"]:
            try:
                # 1. ATTEMPT PASSIVE SEARCH (Fast)
                search_url = "https://urlscan.io/api/v1/search/"
                headers = {"API-Key": settings.urlscan_api_key}
                query = f'task.url:"{ioc}" OR page.url:"{ioc}"'
                
                resp = await client.get(search_url, headers=headers, params={"q": query, "size": 1})
                results = resp.json().get("results", [])

                data = {}
                is_stale = False
                
                if results:
                    data = results[0]
                    # Check if result is older than 24 hours
                    try:
                        time_str = data.get("task", {}).get("time")
                        if time_str:
                            last_seen = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                            if (datetime.now(timezone.utc) - last_seen).total_seconds() > 86400:
                                is_stale = True
                    except:
                        is_stale = True

                # 2. IF NOT FOUND OR STALE: Trigger Active Scan (Slow but guaranteed)
                if not data or is_stale:
                    scan_url = "https://urlscan.io/api/v1/scan/"
                    scan_body = {"url": ioc, "visibility": "public"}
                    scan_resp = await client.post(scan_url, headers=headers, json=scan_body)
                    
                    if scan_resp.status_code == 200:
                        result_url = scan_resp.json().get("api")
                        
                        # 3. POLL FOR RESULTS (Increase timeout to 90 seconds)
                        # 45 iterations * 2 seconds = 90 seconds
                        for _ in range(45):
                            await asyncio.sleep(2)
                            poll_resp = await client.get(result_url, headers=headers)
                            if poll_resp.status_code == 200:
                                data = poll_resp.json()
                                break
                    else:
                         # Fallback to search results if scan fails but we had stale data
                         if not data:
                             return {"ioc": ioc, "tool": "URLScan", "verdict": "unknown", "risk_score": 0, "tactical_summary": "Scan submission failed", "_refined": True}

                if not data:
                     return {"ioc": ioc, "tool": "URLScan", "verdict": "unknown", "risk_score": 0, "tactical_summary": "Scan timed out or no data", "_refined": True}

                # 4. PARSE RESULTS
                # Normalize data extraction
                task = data.get("task", {})
                page = data.get("page", {})
                # For scan results, verdicts are deeply nested
                verdicts = data.get("verdicts", {}).get("overall", {}) if "verdicts" in data else data.get("verdict", {})
                
                score = verdicts.get("score", 0)
                malicious = verdicts.get("malicious", False)

                # Heuristic Override: If score is 0 but keywords exist in Page Title or content
                # Note: URLScan API full results include 'page.title' and 'data.requests'
                keywords = ["malware", "phishing", "login", "verify", "bank", "account"]
                page_title = page.get("title", "").lower()
                
                # Extract domain to prevent heuristic false positives on known safe domains
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(ioc).netloc.lower()
                    is_safelisted = domain in self._safelist_domains or any(domain.endswith(f".{d}") for d in self._safelist_domains)
                except:
                    is_safelisted = False
                
                if score == 0 and not is_safelisted:
                    for kw in keywords:
                        if kw in page_title:
                            score = 50
                            malicious = True
                            break

                # Final Verdict Determination
                if malicious or score >= 50:
                    verdict = "malicious"
                elif score > 0:
                    verdict = "suspicious"
                else:
                    verdict = "info"

                return {
                    "ioc": ioc, 
                    "type": "url", 
                    "tool": "URLScan",
                    "verdict": verdict,
                    "risk_score": score,
                    "confidence": "high",
                    "category_tags": [page.get("country", ""), page.get("asnname", ""), page.get("server", "")],
                    "tactical_summary": self._generate_urlscan_summary(data),
                    "reference_link": task.get("reportURL") or data.get("result"),
                    "screenshot": task.get("screenshotURL"), 
                    "scan_timestamp": self._get_time(),
                    "_refined": True
                }

            except Exception as e: 
                return self._generate_error_record(str(e), "URLScan", ioc)

    async def _tool_greynoise(self, client: httpx.AsyncClient, ioc: str):
        async with self._semaphores["GreyNoise"]:
            try:
                # Limit: Community API might just check 'noise' status or quick context
                url = f"https://api.greynoise.io/v3/community/{ioc}"
                headers = {"key": settings.greynoise_api_key, "Accept": "application/json"}
                res = await self._http_call(client, url, headers)
                
                body = res.get("body", {})
                if res.get("status") == 404:
                     return {
                        "ioc": ioc, "tool": "GreyNoise", "verdict": "safe", 
                        "risk_score": 0, "tactical_summary": "IP not seen in GreyNoise internet background noise.", 
                        "_refined": True
                    }

                classification = body.get("classification", "unknown")
                noise = body.get("noise", False)
                riot = body.get("riot", False)
                
                # Robust extraction for RIOT/Business service names
                name = body.get("name") or body.get("actor") or body.get("metadata", {}).get("org") or "Verified Infrastructure"
                
                # RIOT = known business service but not necessarily safe — still "unknown" unless explicitly classified
                verdict = "malicious" if classification == "malicious" else ("safe" if classification == "benign" else "unknown")
                score = 80 if classification == "malicious" else 0

                summary = f"GreyNoise: {classification.capitalize()}."
                if riot:
                    summary = f"Known Business Service ({name}) — not observed mass-scanning. Further investigation recommended."
                elif noise:
                    summary += " IP is known internet background noise (Scanner)."

                return {
                    "ioc": ioc,
                    "tool": "GreyNoise",
                    "verdict": verdict,
                    "risk_score": score,
                    "confidence": "high",
                    "category_tags": body.get("tags", []),
                    "tactical_summary": summary,
                    "reference_link": body.get("link"),
                    "scan_timestamp": self._get_time(),
                    "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "GreyNoise", ioc)

    async def _tool_threatfox(self, client: httpx.AsyncClient, ioc: str, tf_type: str):
        async with self._semaphores["ThreatFox"]:
            try:
                url = "https://threatfox-api.abuse.ch/api/v1/"
                # ThreatFox uses POST for search
                body = {"query": "search_ioc", "search_term": ioc}
                headers = {"Auth-Key": settings.threatfox_api_key} if getattr(settings, 'threatfox_api_key', None) else {}
                
                resp = await client.post(url, json=body, headers=headers)
                
                # Handle 404 or other non-200 responses
                if resp.status_code != 200:
                    return {
                        "ioc": ioc, 
                        "tool": "ThreatFox", 
                        "verdict": "unknown", 
                        "risk_score": 0, 
                        "confidence": "high",
                        "tactical_summary": "Not found in ThreatFox C2 database (Unknown).", 
                        "_refined": True
                    }

                data = resp.json()
                query_status = data.get("query_status")
                
                # Handle "no_result" status
                if query_status == "no_result":
                     return {
                        "ioc": ioc, 
                        "tool": "ThreatFox", 
                        "verdict": "unknown", 
                        "risk_score": 0, 
                        "confidence": "high",
                        "tactical_summary": "Not found in ThreatFox C2 database (Unknown).", 
                        "_refined": True
                    }
                
                # Check for any other non-ok status
                if query_status != "ok":
                    return self._generate_error_record(f"ThreatFox Query Status: {query_status}", "ThreatFox", ioc)

                # Found
                result = data.get("data", [])[0] # Take first match
                confidence = result.get("confidence_level", 0)
                
                return {
                    "ioc": ioc,
                    "tool": "ThreatFox",
                    "verdict": "malicious", # ThreatFox only lists malware/botnets
                    "risk_score": confidence,
                    "confidence": "high",
                    "category_tags": [result.get("threat_type"), result.get("malware_printable")],
                    "tactical_summary": f"ThreatFox: {result.get('threat_type')} ({result.get('malware_printable')}). Confidence: {confidence}",
                    "reference_link": result.get("reference"),
                    "scan_timestamp": self._get_time(),
                    "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "ThreatFox", ioc)

    async def _tool_shodan(self, client: httpx.AsyncClient, ioc: str):
        async with self._semaphores["Shodan"]:
            try:
                if not settings.shodan_api_key:
                    return self._generate_error_record("Missing Shodan API Key", "Shodan", ioc)

                url = f"https://api.shodan.io/shodan/host/{ioc}?key={settings.shodan_api_key}"
                headers = {"Accept": "application/json"}
                res = await self._http_call(client, url, headers)
                
                status = res.get("status")
                body = res.get("body", {})
                
                if status == 200:
                    ports = body.get("ports", [])
                    org = body.get("org", "Unknown")
                    os = body.get("os", "Unknown")
                    tags = body.get("tags", [])
                    
                    # Clean up strings
                    org_clean = org.strip().replace("..", ".")
                    os_str = f" ({os})" if os and str(os).lower() != "none" else ""
                    
                    # Logic: VPNs/Proxies/Tor are suspicious
                    tags_flat = [str(tag).lower() for tag in tags]
                    is_suspicious = any(t in ["vpn", "proxy", "tor", "hosting"] for t in tags_flat)
                    verdict = "suspicious" if is_suspicious else "unknown"
                    
                    # Tactical summary: "Organization | OS | X Ports"
                    summary = f"{org_clean}{os_str} | {len(ports)} Open Ports"
                    
                    return {
                        "ioc": ioc,
                        "tool": "Shodan",
                        "verdict": verdict,
                        "risk_score": 10 if len(ports) > 10 else 0,
                        "confidence": "high",
                        "category_tags": [f"Port {p}" for p in ports[:6]], 
                        "tactical_summary": summary,
                        "reference_link": f"https://www.shodan.io/host/{ioc}",
                        "scan_timestamp": self._get_time(),
                        "_refined": True
                    }
                elif status == 404:
                    return {
                        "ioc": ioc, "tool": "Shodan", "verdict": "unknown", 
                        "risk_score": 0, "tactical_summary": "IP not indexed by Shodan.", 
                        "_refined": True
                    }
                else:
                    error_detail = res.get("error") or f"HTTP {status}"
                    return {
                        "ioc": ioc, "tool": "Shodan", "verdict": "unknown", 
                        "risk_score": 0, "tactical_summary": f"Provider Error: {error_detail}", 
                        "_refined": True
                    }
            except Exception as e:
                return self._generate_error_record(str(e), "Shodan", ioc)

    async def _tool_otx(self, client: httpx.AsyncClient, ioc: str, otx_type: str):
        async with self._semaphores["AlienVault OTX"]:
            url = f"https://otx.alienvault.com/api/v1/indicators/{otx_type}/{ioc}/general"
            headers = {"X-OTX-API-KEY": settings.alienvault_api_key}
            res = await self._http_call(client, url, headers)
            res.update({"tool": "AlienVault OTX", "ioc": ioc})
            return res

    async def _tool_hybrid_analysis_lookup(self, client: httpx.AsyncClient, ioc: str):
        async with self._semaphores["Hybrid Analysis"]:
            headers = {
                "api-key": settings.hybrid_analysis_api_key, 
                "User-Agent": "Falcon Sandbox",
                "Accept": "application/json"
            }
            if len(ioc) == 64:
                # search/hash is deprecated for newer keys; use overview endpoint for direct lookup for SHA256
                url = f"https://hybrid-analysis.com/api/v2/overview/{ioc}"
                res = await self._http_call(client, url, headers, method="GET")
            else:
                # Fallback to search/hash for MD5 (32 chars) and SHA1 (40 chars)
                url = "https://hybrid-analysis.com/api/v2/search/hash"
                res = await self._http_call(client, url, headers, method="POST", data={"hash": ioc})
                
                # Map empty search results to 404 for consistent UI feedback
                if res.get("status") == 200 and isinstance(res.get("body"), list) and len(res.get("body")) == 0:
                    res["status"] = 404
                    res["body"] = {}

            res.update({"tool": "Hybrid Analysis", "ioc": ioc})
            return res

    async def _tool_mxtoolbox(self, client: httpx.AsyncClient, ioc: str):
        """Performs Forensic DNS Analysis on a domain."""
        try:
            loop = asyncio.get_event_loop()
            
            # 1. Resolve A Record (IP + TTL)
            try:
                a_records = await loop.run_in_executor(None, dns.resolver.resolve, ioc, 'A')
                ip = a_records[0].address
                ttl = a_records.rrset.ttl
            except:
                ip, ttl = "N/A", 0

            # 2. Resolve MX Records (Mail)
            has_mx = False
            try:
                mx_records = await loop.run_in_executor(None, dns.resolver.resolve, ioc, 'MX')
                has_mx = len(mx_records) > 0
            except:
                has_mx = False

            # 3. Resolve NS Records (Hosting Provider Context)
            ns_provider = "Unknown Provider"
            try:
                ns_records = await loop.run_in_executor(None, dns.resolver.resolve, ioc, 'NS')
                ns_list = [str(ns.target) for ns in ns_records]
                ns_provider = ns_list[0] if ns_list else "Unknown Provider"
            except:
                ns_provider = "Unknown Provider"

            # 4. GeoIP Lookup (IP-API.com)
            country = "Unknown Location"
            if ip != "N/A":
                try:
                    geo_res = await client.get(f"http://ip-api.com/json/{ip}", timeout=5)
                    if geo_res.status_code == 200:
                        country = geo_res.json().get("country", "Unknown Location")
                except:
                    pass

            # 5. Risk Heuristics
            category_tags = ["DNS Resolved", ip]
            if ttl > 0 and ttl < 300:
                category_tags.append("Low TTL (Fast Flux?)")
            if not has_mx:
                category_tags.append("No Email Config")

            # Logic fix: If a suspected domain doesn't even resolve or has no provider, it's UNKNOWN or SUSPICIOUS, not Safe.
            verdict = "unknown" if ip == "N/A" else "info"
            tactical_summary = f"DNS Resolution: {ip} ({country}). MX Records: {'Yes' if has_mx else 'No'}. TTL: {ttl}s. Provider: {ns_provider}."

            return {
                "ioc": ioc,
                "type": "domain",
                "tool": "MxToolbox",
                "verdict": verdict,
                "risk_score": 0,
                "category_tags": category_tags,
                "tactical_summary": tactical_summary,
                "_refined": True
            }

        except Exception as e:
            return self._generate_error_record(str(e), "MxToolbox", ioc)

    async def _tool_nvd(self, client: httpx.AsyncClient, ioc: str):
        """Queries NIST NVD for CVE CVSS scoring and description. Free; no API key required."""
        async with self._semaphores["NVD"]:
            try:
                headers = {"Accept": "application/json"}
                if hasattr(settings, 'nvd_api_key') and settings.nvd_api_key:
                    headers["apiKey"] = settings.nvd_api_key
                resp = await client.get(
                    "https://services.nvd.nist.gov/rest/json/cves/2.0",
                    headers=headers, params={"cveId": ioc}
                )
                if resp.status_code != 200:
                    return self._generate_error_record(f"HTTP {resp.status_code}", "NVD (NIST)", ioc)

                vulns = resp.json().get("vulnerabilities", [])
                if not vulns:
                    return {
                        "ioc": ioc, "type": "cve", "tool": "NVD (NIST)",
                        "verdict": "unknown", "risk_score": 0, "confidence": "high",
                        "tactical_summary": "CVE not found in NVD database.",
                        "reference_link": f"https://nvd.nist.gov/vuln/detail/{ioc}",
                        "scan_timestamp": self._get_time(), "_refined": True
                    }

                cve = vulns[0].get("cve", {})
                metrics = cve.get("metrics", {})

                base_score, severity, vector, cvss_data = 0.0, "Unknown", "N/A", {}
                for key in ("cvssMetricV31", "cvssMetricV30"):
                    entries = metrics.get(key, [])
                    if entries:
                        cvss_data = entries[0].get("cvssData", {})
                        base_score = cvss_data.get("baseScore", 0.0)
                        severity = cvss_data.get("baseSeverity", "Unknown")
                        vector = cvss_data.get("vectorString", "N/A")
                        break
                if not cvss_data:
                    v2 = metrics.get("cvssMetricV2", [])
                    if v2:
                        cvss_data = v2[0].get("cvssData", {})
                        base_score = cvss_data.get("baseScore", 0.0)
                        severity = v2[0].get("baseSeverity", "Unknown")
                        vector = cvss_data.get("vectorString", "N/A")

                desc = next(
                    (d["value"] for d in cve.get("descriptions", []) if d.get("lang") == "en"),
                    "No description."
                )[:300]
                cwes = [
                    d["value"]
                    for w in cve.get("weaknesses", [])
                    for d in w.get("description", [])
                    if d.get("lang") == "en"
                ][:3]

                return {
                    "ioc": ioc, "type": "cve", "tool": "NVD (NIST)",
                    "verdict": "malicious" if base_score >= 7.0 else ("suspicious" if base_score >= 4.0 else "safe"),
                    "risk_score": min(int(base_score * 10), 100),
                    "confidence": "high",
                    "category_tags": cwes + ([severity] if severity != "Unknown" else []),
                    "tactical_summary": f"CVSS {base_score} ({severity}) | {vector} | {desc}",
                    "reference_link": f"https://nvd.nist.gov/vuln/detail/{ioc}",
                    "scan_timestamp": self._get_time(), "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "NVD (NIST)", ioc)

    async def _tool_emailrep(self, client: httpx.AsyncClient, ioc: str):
        """
        Queries EmailRep.io for email threat reputation — blacklist status, malicious activity,
        credentials leaks, disposable detection. Free tier: 1000 req/day with API key.
        """
        async with self._semaphores["EmailRep"]:
            try:
                headers = {"User-Agent": f"{settings.product_name}-Investigator"}
                if getattr(settings, 'emailrep_api_key', None):
                    headers["Key"] = settings.emailrep_api_key

                resp = await client.get(f"https://emailrep.io/{ioc}", headers=headers)

                if resp.status_code == 400:
                    return self._generate_error_record("Invalid email format", "EmailRep", ioc)
                if resp.status_code == 401:
                    return self._generate_error_record("Invalid EmailRep API key", "EmailRep", ioc)
                if resp.status_code == 429:
                    return self._generate_error_record("Rate limit exceeded (1000/day free tier)", "EmailRep", ioc)
                if resp.status_code != 200:
                    return self._generate_error_record(f"HTTP {resp.status_code}", "EmailRep", ioc)

                data = resp.json()
                details = data.get("details", {})
                reputation = data.get("reputation", "none")  # high / medium / low / none
                suspicious = data.get("suspicious", False)

                # Build risk score from individual signals
                risk_score = 0
                risk_flags = []

                if details.get("blacklisted"):
                    risk_score += 40; risk_flags.append("Blacklisted")
                if details.get("malicious_activity_recent"):
                    risk_score += 35; risk_flags.append("Recent malicious activity")
                elif details.get("malicious_activity"):
                    risk_score += 20; risk_flags.append("Prior malicious activity")
                if details.get("credentials_leaked_recent"):
                    risk_score += 25; risk_flags.append("Recent credentials leak")
                elif details.get("credentials_leaked"):
                    risk_score += 15; risk_flags.append("Credentials leaked")
                if details.get("disposable"):
                    risk_score += 20; risk_flags.append("Disposable email")
                if details.get("spam"):
                    risk_score += 15; risk_flags.append("Spam activity")
                if details.get("data_breach"):
                    risk_score += 10; risk_flags.append("Data breach")
                if reputation == "low":
                    risk_score += 15
                elif reputation == "none":
                    risk_score += 5

                risk_score = min(risk_score, 100)

                if risk_score >= 60 or details.get("blacklisted") or details.get("malicious_activity_recent"):
                    verdict = "malicious"
                elif risk_score >= 20 or suspicious:
                    verdict = "suspicious"
                else:
                    verdict = "safe"

                domain_rep = details.get("domain_reputation", "unknown")
                first_seen = details.get("first_seen", "unknown")
                summary = (
                    f"Reputation: {reputation.capitalize()}. "
                    + (f"Flags: {', '.join(risk_flags)}. " if risk_flags else "No threat signals. ")
                    + f"Domain rep: {domain_rep}. First seen: {first_seen}."
                )

                tags = risk_flags[:4]
                if details.get("free_provider"):
                    tags.append("Free provider")

                return {
                    "ioc": ioc, "type": "email", "tool": "EmailRep",
                    "verdict": verdict,
                    "risk_score": risk_score,
                    "confidence": "high" if reputation != "none" else "medium",
                    "category_tags": tags,
                    "tactical_summary": summary,
                    "reference_link": f"https://emailrep.io/{ioc}",
                    "scan_timestamp": self._get_time(), "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "EmailRep", ioc)

    async def _tool_urlhaus(self, client: httpx.AsyncClient, ioc: str):
        """Queries Abuse.ch URLhaus for malware-distribution history on a domain or URL. Free API key required."""
        async with self._semaphores["URLhaus"]:
            try:
                from urllib.parse import urlparse
                is_url = ioc.startswith('http')
                host = urlparse(ioc).netloc if is_url else ioc

                if not getattr(settings, 'threatfox_api_key', None):
                    return self._generate_error_record("Missing threatfox_api_key (shared Abuse.ch key)", "URLhaus", ioc)
                headers = {"Auth-Key": settings.threatfox_api_key}

                if is_url:
                    resp = await client.post("https://urlhaus-api.abuse.ch/v1/url/", data={"url": ioc}, headers=headers)
                    ref_link = f"https://urlhaus.abuse.ch/browse.php?search={urllib.parse.quote(ioc, safe='')}"
                else:
                    resp = await client.post("https://urlhaus-api.abuse.ch/v1/host/", data={"host": ioc}, headers=headers)
                    ref_link = f"https://urlhaus.abuse.ch/host/{host}/"

                if resp.status_code != 200:
                    return self._generate_error_record(f"HTTP {resp.status_code}", "URLhaus", ioc)

                data = resp.json()
                if data.get("query_status") in ("no_results", "not_found"):
                    return {
                        "ioc": ioc, "tool": "URLhaus",
                        "verdict": "unknown", "risk_score": 0, "confidence": "high",
                        "tactical_summary": "Not found in URLhaus malware distribution database.",
                        "reference_link": ref_link,
                        "scan_timestamp": self._get_time(), "_refined": True
                    }

                urls_list = data.get("urls", [])
                blacklists = data.get("blacklists", {})
                active_count = sum(1 for u in urls_list if u.get("url_status") == "online")
                tags_all = list({t for u in urls_list for t in (u.get("tags") or [])})[:5]
                is_spamhaus = blacklists.get("spamhaus_dbl") not in (None, "not listed")
                is_surbl = blacklists.get("surbl") not in (None, "not listed")

                bl_notes = []
                if is_spamhaus: bl_notes.append(f"Spamhaus DBL: {blacklists['spamhaus_dbl']}")
                if is_surbl: bl_notes.append(f"SURBL: {blacklists['surbl']}")

                return {
                    "ioc": ioc, "tool": "URLhaus",
                    "verdict": "malicious" if (active_count > 0 or is_spamhaus or is_surbl) else ("suspicious" if urls_list else "safe"),
                    "risk_score": min(active_count * 25 + (30 if is_spamhaus else 0) + (20 if is_surbl else 0), 100),
                    "confidence": "high",
                    "category_tags": bl_notes + tags_all,
                    "tactical_summary": f"{active_count} active / {len(urls_list)} total malware URLs hosted. {'; '.join(bl_notes) or 'No blacklist entries.'}",
                    "reference_link": ref_link,
                    "scan_timestamp": self._get_time(), "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "URLhaus", ioc)

    async def _tool_malwarebazaar(self, client: httpx.AsyncClient, ioc: str):
        """Queries Abuse.ch MalwareBazaar to identify known malware samples by hash. Free API key required."""
        async with self._semaphores["MalwareBazaar"]:
            try:
                if not getattr(settings, 'threatfox_api_key', None):
                    return self._generate_error_record("Missing threatfox_api_key (shared Abuse.ch key)", "MalwareBazaar", ioc)
                headers = {"Auth-Key": settings.threatfox_api_key}
                resp = await client.post("https://mb-api.abuse.ch/api/v1/", data={"query": "get_info", "hash": ioc}, headers=headers)
                if resp.status_code != 200:
                    return self._generate_error_record(f"HTTP {resp.status_code}", "MalwareBazaar", ioc)

                data = resp.json()
                status = data.get("query_status")
                if status == "hash_not_found":
                    return {
                        "ioc": ioc, "tool": "MalwareBazaar",
                        "verdict": "unknown", "risk_score": 0, "confidence": "high",
                        "tactical_summary": "Hash not found in MalwareBazaar malware sample repository.",
                        "reference_link": f"https://bazaar.abuse.ch/sample/{ioc}/",
                        "scan_timestamp": self._get_time(), "_refined": True
                    }
                if status != "ok":
                    return self._generate_error_record(f"Status: {status}", "MalwareBazaar", ioc)

                sample = (data.get("data") or [{}])[0]
                family = sample.get("signature") or (sample.get("tags") or ["Unknown"])[0]
                tags = (sample.get("tags") or [])[:5]
                return {
                    "ioc": ioc, "tool": "MalwareBazaar",
                    "verdict": "malicious", "risk_score": 100, "confidence": "high",
                    "category_tags": tags,
                    "tactical_summary": (
                        f"Known malware: {family} ({sample.get('file_type', 'Unknown')}). "
                        f"First seen: {sample.get('first_seen', 'Unknown')}. "
                        f"Reporter: {sample.get('reporter', 'Anonymous')}."
                    ),
                    "reference_link": f"https://bazaar.abuse.ch/sample/{ioc}/",
                    "scan_timestamp": self._get_time(), "_refined": True
                }
            except Exception as e:
                return self._generate_error_record(str(e), "MalwareBazaar", ioc)

    async def _tool_local_registry(self, ioc: str):
        """Classifies a Windows registry key by hive and known persistence/attack patterns."""
        PERSISTENCE_PATTERNS = (
            r"software\microsoft\windows\currentversion\run",
            r"software\microsoft\windows\currentversion\runonce",
            r"system\currentcontrolset\services",
            r"software\microsoft\windows nt\currentversion\winlogon",
            r"software\classes\clsid",
            r"software\microsoft\windows\currentversion\explorer\shell folders",
            r"software\policies\microsoft\windows\powershell",
            r"software\microsoft\windows\currentversion\appinit_dlls",
            r"system\currentcontrolset\control\session manager",
            r"software\microsoft\windows\currentversion\image file execution options",
        )
        path_lower = ioc.lower().replace("/", "\\")
        hive = ioc.split("\\")[0].upper() if "\\" in ioc else ioc.split("/")[0].upper()
        is_persistence = any(p in path_lower for p in PERSISTENCE_PATTERNS)
        return {
            "ioc": ioc, "type": "registry_key",
            "tool": "Local Registry Classifier",
            "is_local": True,
            "verdict": "suspicious" if is_persistence else "info",
            "risk_score": 65 if is_persistence else 0,
            "confidence": "medium",
            "category_tags": [hive, "Persistence Candidate" if is_persistence else "Registry Key"],
            "tactical_summary": (
                f"Registry key in {hive} hive. Path matches known persistence/execution hijack location."
                if is_persistence else
                f"Registry key in {hive} hive. No persistence pattern matched."
            ),
            "scan_timestamp": self._get_time(), "_refined": True
        }

    async def _tool_custom(self, client: httpx.AsyncClient, ioc: str, ioc_type: str, source: dict):
        """Queries a user-defined custom CTI source using its configured base URL and auth method."""
        source_name = source.get('name', 'Custom CTI')
        base_url = source.get('baseUrl', '').rstrip('/')
        auth_type = source.get('authType', 'header')
        auth_param = source.get('authParam', 'X-API-Key')
        settings_key = source.get('settingsKey', '')

        if not base_url:
            return self._generate_error_record("No base URL configured", source_name, ioc)

        api_key = getattr(settings, settings_key, None)
        if not api_key:
            return self._generate_error_record(f"No API key configured for {source_name}", source_name, ioc)

        try:
            headers: Dict[str, str] = {'Accept': 'application/json'}
            params: Dict[str, str] = {}

            if auth_type == 'bearer':
                headers['Authorization'] = f'Bearer {api_key}'
            elif auth_type == 'query_param':
                params[auth_param] = api_key
            else:
                headers[auth_param] = api_key

            query_url = f"{base_url}/{urllib.parse.quote(ioc, safe='')}"
            resp = await client.get(query_url, headers=headers, params=params, timeout=15.0)

            if resp.status_code == 200:
                try:
                    body = resp.json()
                except Exception:
                    body = {'raw': resp.text[:500]}

                body_keys = list(body.keys())[:5] if isinstance(body, dict) else []
                return {
                    'ioc': ioc,
                    'type': ioc_type,
                    'tool': source_name,
                    'verdict': 'unknown',
                    'risk_score': 0,
                    'confidence': 'medium',
                    'category_tags': ['Custom CTI'],
                    'tactical_summary': f'{source_name}: Data retrieved. Response fields: {body_keys}',
                    'raw_response': body,
                    'scan_timestamp': self._get_time(),
                    '_refined': True,
                }
            else:
                return self._generate_error_record(f"HTTP {resp.status_code}", source_name, ioc)
        except Exception as e:
            return self._generate_error_record(str(e), source_name, ioc)

    # --- HTTP HELPER ---
    async def _http_call(self, client: httpx.AsyncClient, url: str, headers: Dict[str, str], params: Dict[str, Any] = None, method: str = "GET", data: Dict[str, Any] = None, json_data: Dict[str, Any] = None):
        try:
            if method == "POST": 
                resp = await client.post(url, headers=headers, data=data, json=json_data)
            else: 
                resp = await client.get(url, headers=headers, params=params)
            
            # Robust body extraction
            resp_body = {}
            try:
                resp_body = resp.json() if "application/json" in resp.headers.get("Content-Type", "") else resp.text
            except:
                resp_body = resp.text

            # Enhanced Error Mapping
            error_reason = None
            if resp.status_code != 200:
                if resp.status_code == 429:
                    error_reason = "Rate Limit Exceeded (429)"
                elif resp.status_code == 403:
                    error_reason = "Access Forbidden/Invalid API Key (403)"
                elif resp.status_code == 401:
                    error_reason = "Unauthorized (401)"
                elif resp.status_code >= 500:
                    error_reason = f"Provider Server Error ({resp.status_code})"
                else:
                    error_reason = f"HTTP Error {resp.status_code}"

            return {
                "body": resp_body,
                "status": resp.status_code,
                "error": error_reason
            }
        except Exception as e:
            return {"body": {}, "status": 0, "error": f"Connection Error: {str(e)}"}

    async def _fingerprint_iocs(self, sanitized: List[Dict[str, str]], alert_id: str, raw_data: Dict[str, Any], external_intel: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Store per-IOC sightings in Redis and return cross-alert correlation context (tooltip only, not forwarded to Agent 3)."""
        agent_val = raw_data.get('agent', {})
        host = agent_val.get('name', 'unknown') if isinstance(agent_val, dict) else str(agent_val)

        # Use alert trigger time, not scan time
        alert_timestamp = None
        for ts_key in ('timestamp', '@timestamp', 'alert_timestamp'):
            ts_val = raw_data.get(ts_key)
            if ts_val:
                try:
                    if isinstance(ts_val, datetime):
                        alert_timestamp = ts_val if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc)
                    else:
                        alert_timestamp = datetime.fromisoformat(str(ts_val).replace('Z', '+00:00'))
                        if alert_timestamp.tzinfo is None:
                            alert_timestamp = alert_timestamp.replace(tzinfo=timezone.utc)
                    break
                except Exception:
                    pass
        timestamp = (alert_timestamp or datetime.now(timezone.utc)).isoformat().replace('+00:00', 'Z')

        fingerprints = []

        for item in sanitized:
            ioc = item['ioc']
            ioc_type = item['type']
            ttl = 86400 if ioc_type == 'ip' else 604800
            redis_key = f"fp:ioc::{ioc}"

            # Resolve best verdict/score from CTI results for this IOC
            best_score, best_verdict = 0, 'unknown'
            for r in external_intel:
                if r.get('ioc') == ioc:
                    score = r.get('risk_score', 0) or 0
                    if score > best_score:
                        best_score = score
                        best_verdict = r.get('verdict', 'unknown')

            try:
                existing_raw = await self._redis.get(redis_key)
                sightings = json.loads(existing_raw) if existing_raw else []
                # Deduplicate by alert_id so re-scanning the same alert doesn't inflate the count
                sightings = [s for s in sightings if s.get('alert_id') != alert_id]
                sightings.append({"alert_id": alert_id, "host": host, "timestamp": timestamp, "risk_score": best_score, "verdict": best_verdict})
                await self._redis.setex(redis_key, ttl, json.dumps(sightings))
            except Exception as e:
                print(f"[Fingerprint] Redis error for {ioc}: {e}")
                sightings = [{"alert_id": alert_id, "host": host, "timestamp": timestamp, "risk_score": best_score, "verdict": best_verdict}]

            affected_hosts = list(dict.fromkeys(s['host'] for s in sightings))
            fingerprints.append({
                "ioc": ioc,
                "type": ioc_type,
                "sighting_count": len(sightings),
                "affected_hosts": affected_hosts[:10],
                "first_seen": sightings[0]['timestamp'],
                "last_seen": sightings[-1]['timestamp'],
                "verdict_history": [s['verdict'] for s in sightings[-5:]],
                "is_recurring": len(sightings) > 1,
            })

        return fingerprints

    async def _check_internal_context(self, alert_id: str, observables: Dict[str, Any], raw_data: Dict[str, Any], db=None) -> Dict[str, Any]:
        rule_stats = {"count": 0, "first_seen": None, "agent_count": 0}
        rule_host_stats = {"count": 0, "first_seen": None, "last_seen": None}
        rule_endpoints = []
        burst_stats = {"global_count": 0, "source_count": 0, "is_burst": False}
        cooccurrence_stats = {"distinct_rules": 0, "rules": [], "is_suspicious": False}
        time_anomaly_stats = {"current_hour": 0, "current_hour_pct": 0.0, "is_unusual_timing": False, "is_weekend": False, "total_historical": 0}
        try:
            from app.services.alert_service import AlertService

            # Resolve source: prefer pre-built source string, then agent dict, then manager
            source_val = raw_data.get('source')
            if source_val and isinstance(source_val, str) and source_val != 'Unknown':
                source = source_val.split(' (')[0]
            else:
                agent_val = raw_data.get('agent', {})
                if isinstance(agent_val, dict) and agent_val.get('name'):
                    source = agent_val['name']
                elif raw_data.get('manager'):
                    mgr = raw_data['manager']
                    source = mgr.get('name', 'Unknown') if isinstance(mgr, dict) else str(mgr)
                else:
                    source = 'Unknown'

            rule_title = raw_data.get('title')
            if not rule_title:
                rule_val = raw_data.get('rule', {})
                rule_title = rule_val.get('description', 'Generic Alert') if isinstance(rule_val, dict) else str(rule_val)

            # Parse alert timestamp — try multiple field names used across Wazuh/internal formats
            alert_time = None
            for ts_key in ('timestamp', '@timestamp', 'alert_timestamp'):
                ts_val = raw_data.get(ts_key)
                if ts_val:
                    try:
                        from datetime import datetime, timezone
                        if isinstance(ts_val, datetime):
                            alert_time = ts_val if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc)
                        else:
                            ts_str = str(ts_val).replace('Z', '+00:00')
                            alert_time = datetime.fromisoformat(ts_str)
                            if alert_time.tzinfo is None:
                                alert_time = alert_time.replace(tzinfo=timezone.utc)
                        break
                    except Exception:
                        pass

            if db:
                rule_stats, rule_host_stats, rule_endpoints, burst_stats, cooccurrence_stats, time_anomaly_stats = await asyncio.gather(
                    AlertService.get_rule_frequency_stats(db, rule_title),
                    AlertService.get_rule_host_frequency_stats(db, rule_title, source),
                    AlertService.get_rule_endpoint_distribution(db, rule_title, limit=5),
                    AlertService.get_burst_stats(db, rule_title, source, alert_time),
                    AlertService.get_cooccurrence_stats(db, source, alert_time),
                    AlertService.get_time_anomaly_stats(db, rule_title, alert_time),
                )
        except Exception as e:
            print(f"[Agent Investigator] Context Warning: {e}")

        return {
            "source": source,
            "rule_frequency": {
                "count": rule_stats["count"],
                "agent_count": rule_stats["agent_count"],
                "first_seen": rule_stats["first_seen"].isoformat() if rule_stats.get("first_seen") else None,
                "is_rare": rule_stats["count"] <= 1,
            },
            "rule_on_host": {
                "count": rule_host_stats["count"],
                "first_seen": rule_host_stats["first_seen"].isoformat() if rule_host_stats.get("first_seen") else None,
                "last_seen": rule_host_stats["last_seen"].isoformat() if rule_host_stats.get("last_seen") else None,
            },
            "rule_endpoints": rule_endpoints,
            "burst": burst_stats,
            "cooccurrence": cooccurrence_stats,
            "time_anomaly": time_anomaly_stats,
        }

    async def _emit_log(self, alert_id: str, log: str):
        try:
            from app.core.socket import sio
            await sio.emit('agent_update', {
                "alert_id": alert_id,
                "node": "agent_investigator",
                "log": log
            })
        except:
            pass

    async def close(self):
        """Gracefully close connections."""
        if self._redis:
            await self._redis.close()

agent_investigator = AgentInvestigator()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("observables_file")
    args = parser.parse_args()

    async def main():
        if not os.path.exists(args.observables_file):
            print(f"File not found: {args.observables_file}")
            return
        with open(args.observables_file, 'r') as f: 
            obs_data = json.load(f)
        
        # Ensure we pass the expected dict structure to run()
        structured_obs = obs_data if isinstance(obs_data, dict) else {"network": [], "files": []}
        if isinstance(obs_data, list):
            for item in obs_data:
                t = item.get("type")
                ioc = item.get("ioc")
                if t in ["ip", "url", "domain"]: structured_obs["network"].append(ioc)
                else: structured_obs["files"].append(ioc)

        try:
            results = await agent_investigator.run(
                "CLI-TEST-001", 
                structured_obs, 
                {"agent": obs_data.get("agent", {"id": "001", "name": "test-agent"})}
            )
            print(json.dumps(results, indent=4))
        finally:
            await agent_investigator.close()

    asyncio.run(main())
