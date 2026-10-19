from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core import credentials
from app.core.config import settings as app_settings
from app.core.security import require_role
from app.services import settings_store
from pydantic import BaseModel
from typing import Optional, List
import httpx
import json
import os

router = APIRouter(prefix="/settings", tags=["settings"])

# Changing settings, testing credentials and reloading integrations are admin-only.
# Reading is open to any signed-in user (the UI needs e.g. the logo), with secrets masked.
ADMIN = Depends(require_role("soc_admin"))


def _same_url(a: Optional[str], b: Optional[str]) -> bool:
    return (a or "").strip().rstrip("/").lower() == (b or "").strip().rstrip("/").lower()


def _resolve_secret(provided: Optional[str], key: str, target_url: Optional[str] = None, saved_url: Optional[str] = None) -> str:
    """
    Turn a credential sent by the UI into the real one. The masked placeholder stands for the
    stored secret, which is only released to the address it was saved for: testing against a
    different address requires typing the credential again.
    """
    if provided == credentials.SECRET_PLACEHOLDER and target_url is not None and not _same_url(target_url, saved_url):
        raise HTTPException(
            status_code=400,
            detail="The address changed: re-enter the credential to test it against the new address.",
        )
    return credentials.resolve(provided, key)

class SettingUpdate(BaseModel):
    key: str
    value: str

class VerifyRequest(BaseModel):
    provider: str
    key: str

@router.post("/invalidate-status", dependencies=[ADMIN])
async def invalidate_status(request: dict):
    """
    Mark a service as DISCONNECTED immediately in the global status.
    Called when the UI detects that an admin is tampering with credentials.
    """
    service = request.get("service")
    if not service:
        return {"status": "error"}

    from app.core.socket import last_service_status, sio
    if service in last_service_status:
        last_service_status[service] = 'DISCONNECTED'
        await sio.emit('service_status', last_service_status)
        print(f"🛑 [Status] Service '{service}' invalidated by UI (tampering detected)")
    return {"status": "ok"}
    
@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """
    All system settings (in-memory defaults with stored values on top).
    Secrets are masked and server-only settings are omitted.
    """
    try:
        all_settings = app_settings.model_dump()
        all_settings.update(await settings_store.load_all(db))
        return settings_store.public_view(all_settings)
    except Exception as e:
        print(f"❌ [SettingsAPI] GET failed: {e}")
        return {}

@router.patch("/", dependencies=[ADMIN])
async def update_settings(updates: dict, db: AsyncSession = Depends(get_db)):
    """Update or create multiple system settings at once"""
    try:
        applied = await settings_store.save(db, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ [SettingsAPI] Bulk PATCH failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # 🔥 HOT RELOAD: Update the global settings instance in memory
    app_settings.update_from_dict(applied)
    return {"status": "success", "updated_keys": list(applied)}

class ModelsRequest(BaseModel):
    provider: str
    key: str
    base_url: Optional[str] = None

@router.post("/get-provider-models", dependencies=[ADMIN])
async def get_provider_models(request: ModelsRequest):
    """
    Fetch the list of available models from a provider's API.
    Used to populate dropdowns dynamically in the UI.
    """
    if request.provider == 'nebius':
        request.key = _resolve_secret(request.key, "nebius_api_key",
                                      request.base_url or app_settings.nebius_base_url, app_settings.nebius_base_url)
    else:
        request.key = _resolve_secret(request.key, f"{request.provider}_api_key")
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            models = []
            if request.provider == 'openai':
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {request.key}"}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m['id'] for m in data.get('data', []) if 'gpt' in m['id'].lower() or 'o1' in m['id'].lower()]
            
            elif request.provider == 'nebius':
                url = request.base_url.rstrip("/") if request.base_url else "https://api.studio.nebius.ai/v1"
                print(f"📡 [ModelsAPI] Fetching Nebius models from: {url}")
                resp = await client.get(
                    f"{url}/models",
                    headers={"Authorization": f"Bearer {request.key}"}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m['id'] for m in data.get('data', [])]
                    print(f"✅ [ModelsAPI] Found {len(models)} Nebius models")
            
            elif request.provider == 'anthropic':
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": request.key,
                        "anthropic-version": "2023-06-01"
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m['id'] for m in data.get('data', [])]
            
            elif request.provider == 'gemini':
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={request.key}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m['name'].replace('models/', '') for m in data.get('models', []) if 'gemini' in m['name'].lower()]
            
            else:
                raise HTTPException(status_code=400, detail="Unknown provider")

            if resp.status_code != 200:
                print(f"⚠️ [ModelsAPI] {request.provider} returned {resp.status_code}: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Provider error: {resp.status_code}")

            # Sort alphabetically for better UI presentation
            models.sort()
            return {"status": "ok", "models": models}
                
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            print(f"❌ [ModelsAPI] Protocol failure for {request.provider}: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-provider", dependencies=[ADMIN])
async def verify_provider_key(request: VerifyRequest):
    """Perform a real-world health check handshake with the provider"""
    if request.provider != 'gateway':  # for 'gateway' the key field carries the URL
        request.key = _resolve_secret(request.key, f"{request.provider}_api_key")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if request.provider == 'openai':
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {request.key}"}
                )
            elif request.provider == 'nebius':
                resp = await client.get(
                    "https://api.tokenfactory.nebius.com/v1/models",
                    headers={"Authorization": f"Bearer {request.key}"}
                )
            elif request.provider == 'anthropic':
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": request.key,
                        "anthropic-version": "2023-06-01"
                    }
                )
            elif request.provider == 'gemini':
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={request.key}"
                )
            elif request.provider == 'gateway':
                url = request.key.strip().rstrip("/")
                if not url.startswith(('http://', 'https://')):
                    url = f"https://{url}"
                # Tighten: Check for /models to ensure it's a real LLM gateway
                resp = await client.get(f"{url}/models")
            else:
                raise HTTPException(status_code=400, detail="Unknown provider")

            # Broaden verification: Success if 200, or for Gateways, if the endpoint exists (not 404) and is reachable (< 500)
            is_gateway_reachable = request.provider == 'gateway' and resp.status_code < 500 and resp.status_code != 404
            if resp.status_code == 200 or is_gateway_reachable:
                return {"status": "ok", "message": "Verification Successful"}
            else:
                print(f"⚠️ [Verification] {request.provider} rejected key/url: {resp.status_code} - {resp.text}")
                raise HTTPException(
                    status_code=resp.status_code, 
                    detail=f"Verification Failed: {resp.status_code}"
                )
                
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            print(f"❌ [Verification] Network/Protocol failure for {request.provider}: {e}")
            raise HTTPException(status_code=500, detail=f"Handshake error: {str(e)}")


class IntegrationVerifyRequest(BaseModel):
    service: str  # 'wazuh' or 'thehive'
    url: str
    user: str = None
    password: str = None
    api_key: str = None


@router.post("/verify-integration", dependencies=[ADMIN])
async def verify_integration(request: IntegrationVerifyRequest):
    """
    Live connectivity test for Wazuh or TheHive using admin-provided credentials.
    This does NOT save anything — it only tests the connection.
    """
    if request.service == 'wazuh':
        request.password = _resolve_secret(request.password, "wazuh_password", request.url, app_settings.wazuh_url)
    elif request.service in ('thehive', 'flowintel'):
        request.api_key = _resolve_secret(request.api_key, f"{request.service}_api_key",
                                          request.url, getattr(app_settings, f"{request.service}_url", None))
    url = request.url.strip().rstrip("/")
    
    try:
        if request.service == 'wazuh':
            user = request.user.strip() if request.user else ""
            password = request.password.strip() if request.password else ""
            
            if not user or not password:
                raise HTTPException(status_code=400, detail="Wazuh requires username and password")
            
            # LOGGING: Verify credentials being used for check
            print(f"📡 [Verifying] {request.service.upper()} | URL: {url} | User: {user}")
            
            async with httpx.AsyncClient(verify=False, timeout=20.0) as client:
                auth = (user, password)
                resp = await client.get(
                    f"{url}/security/user/authenticate",
                    auth=auth
                )
                print(f"📡 [Verifying] Wazuh Response: {resp.status_code}")
                
                if resp.status_code == 200:
                    return {"status": "ok", "message": "Wazuh API connection successful"}
                else:
                    print(f"⚠️ [IntegrationVerify] Wazuh auth failed: {resp.status_code} for user {user}")
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=f"Wazuh authentication failed: {resp.status_code}"
                    )

        elif request.service == 'thehive':
            api_key = request.api_key.strip() if request.api_key else ""
            if not api_key:
                raise HTTPException(status_code=400, detail="TheHive requires an API key")
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "X-API-KEY": api_key,
                "Accept": "application/json"
            }
            async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                resp = await client.get(f"{url}/api/user/current", headers=headers)
                if resp.status_code == 200:
                    return {"status": "ok", "message": "TheHive API connection successful"}
                # Also accept 401 from base URL check as "service is up"
                elif resp.status_code == 401:
                    # Try base URL — service is reachable but key might be wrong
                    raise HTTPException(
                        status_code=401,
                        detail="TheHive is reachable but rejected the API key"
                    )
                else:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=f"TheHive connection failed: {resp.status_code}"
                    )

        elif request.service == 'flowintel':
            api_key = request.api_key.strip() if request.api_key else ""
            if not api_key:
                raise HTTPException(status_code=400, detail="Flowintel requires an API key")
            
            headers = {
                "X-API-KEY": api_key,
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                # Use Flowintel v3.1 check endpoint
                resp = await client.get(f"{url}/api/case/list_status", headers=headers)
                if resp.status_code == 200:
                    return {"status": "ok", "message": "Flowintel connection successful"}
                else:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=f"Flowintel connection failed: {resp.status_code}"
                    )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown service: {request.service}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [IntegrationVerify] {request.service} connectivity test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")


@router.post("/reload-integrations", dependencies=[ADMIN])
async def reload_integrations(db: AsyncSession = Depends(get_db)):
    """
    Force the backend services to reload their credentials from the database.
    Called after saving new Wazuh/TheHive settings from the UI.
    """
    try:
        # Fetch all integration-related settings from DB
        all_settings = await settings_store.load_all(db)

        reloaded = []

        # Reload TheHive & Flowintel service credentials
        from app.services.thehive_service import thehive_service
        from app.services.flowintel_service import flowintel_service
        
        new_thehive_url = all_settings.get('thehive_url')
        new_thehive_key = all_settings.get('thehive_api_key')
        new_flowintel_url = all_settings.get('flowintel_url')
        new_flowintel_key = all_settings.get('flowintel_api_key')
        
        # Update TheHive
        if new_thehive_url or new_thehive_key:
            thehive_service.reload_credentials(
                url=new_thehive_url,
                api_key=new_thehive_key
            )
            reloaded.append('thehive')

        # Update Flowintel (Now correctly uses its own URL/KEY)
        if new_flowintel_url or new_flowintel_key:
            flowintel_service.reload_credentials(
                url=new_flowintel_url,
                api_key=new_flowintel_key
            )
            reloaded.append('flowintel')
            
        print(f"🔄 [Reload] SOAR services (TheHive: {new_thehive_url}, Flowintel: {new_flowintel_url}) updated from DB")

        # Reload global settings from DB (ensures LLM keys are updated)
        from app.core.config import settings
        settings.update_from_dict(all_settings)
        print(f"🔄 [Reload] Global settings hot-reloaded from DB")

        # Invalidate AI Agent LLM clients so they rebuild with new keys
        from app.agents.agent_extractor import ioc_extractor
        from app.agents.agent_judge import agent_judge
        ioc_extractor._llm = None
        agent_judge.llm = None
        print(f"🔄 [Reload] AI Agents (Extractor & Judge) LLM clients invalidated")

        # Reload Wazuh health check credentials (stored in socket module's global)
        from app.core.socket import reload_integration_settings, perform_immediate_health_check
        reload_integration_settings(all_settings)
        reloaded.append('wazuh')
        reloaded.append('llm')
        print(f"🔄 [Reload] Wazuh & LLM health check credentials updated from DB")
        
        # Trigger an immediate health check so the UI reflects the status instantly
        # We await this to ensure the frontend gets the socket update BEFORE the save promise resolves
        await perform_immediate_health_check()

        return {
            "status": "ok",
            "reloaded": reloaded,
            "message": f"Reloaded: {', '.join(reloaded)}"
        }
    except Exception as e:
        print(f"❌ [Reload] Failed to reload integrations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CtiVerifyRequest(BaseModel):
    provider: str
    key: str
    test_url: Optional[str] = None
    auth_type: Optional[str] = None   # "header" | "bearer" | "query_param"
    auth_param: Optional[str] = None  # header name or query param name
    settings_key: Optional[str] = None  # where the key is stored, for testing a saved (masked) key


# Built-in CTI providers and the setting that holds each one's key
_CTI_KEYS = {
    'virustotal': 'virustotal_api_key', 'abuseipdb': 'abuseipdb_api_key', 'urlscan': 'urlscan_api_key',
    'greynoise': 'greynoise_api_key', 'shodan': 'shodan_api_key', 'otx': 'alienvault_api_key',
    'alienvault': 'alienvault_api_key', 'hybrid': 'hybrid_analysis_api_key',
    'hybrid_analysis': 'hybrid_analysis_api_key', 'mxtoolbox': 'mxtoolbox_api_key',
    'emailrep': 'emailrep_api_key', 'nvd': 'nvd_api_key', 'abusech': 'threatfox_api_key',
}


def _resolve_cti_key(request: "CtiVerifyRequest") -> str:
    if request.key != credentials.SECRET_PLACEHOLDER:
        return request.key.strip()
    key_name = _CTI_KEYS.get(request.provider.lower())
    if key_name:
        return credentials.resolve(request.key, key_name)
    # User-defined source: only its own key, and only to the test URL it was saved with
    key_name = request.settings_key or ""
    if not (key_name.startswith("custom_cti_") and key_name.endswith("_key")):
        raise HTTPException(status_code=400, detail="Re-enter the API key to test it.")
    saved_url = None
    try:
        for source in json.loads(getattr(app_settings, "custom_cti_sources", None) or "[]"):
            if source.get("settingsKey") == key_name:
                saved_url = source.get("testEndpoint")
    except (ValueError, TypeError):
        pass
    return _resolve_secret(request.key, key_name, request.test_url or "", saved_url)


@router.post("/verify-cti", dependencies=[ADMIN])
async def verify_cti_key(request: CtiVerifyRequest):
    """Perform a live handshake with the CTI provider using the provided key"""
    provider = request.provider.lower()
    key = _resolve_cti_key(request)
    
    if not key:
        raise HTTPException(status_code=400, detail="API Key is required to test")
        
    async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
        try:
            if provider == 'virustotal':
                resp = await client.get(
                    "https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8",
                    headers={"x-apikey": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "VirusTotal key is valid"}
                else:
                    detail = f"VirusTotal rejected key (HTTP {resp.status_code})"
                    if resp.status_code in [401, 403]:
                        detail = "Invalid VirusTotal API key"
                    raise HTTPException(status_code=resp.status_code if resp.status_code in [401, 403] else 400, detail=detail)
                    
            elif provider == 'abuseipdb':
                resp = await client.get(
                    "https://api.abuseipdb.com/api/v2/check",
                    params={"ipAddress": "8.8.8.8"},
                    headers={"Key": key, "Accept": "application/json"}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "AbuseIPDB key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid AbuseIPDB API key")

            elif provider == 'urlscan':
                resp = await client.get(
                    "https://urlscan.io/api/v1/search/?q=domain:google.com&size=1",
                    headers={"API-Key": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "URLScan key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid URLScan API key")

            elif provider == 'greynoise':
                resp = await client.get(
                    "https://api.greynoise.io/v3/community/8.8.8.8",
                    headers={"key": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "GreyNoise key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid GreyNoise API key")

            elif provider == 'shodan':
                resp = await client.get(f"https://api.shodan.io/api-info?key={key}")
                if resp.status_code == 200:
                    return {"status": "ok", "message": "Shodan key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid Shodan API key")

            elif provider in ['otx', 'alienvault']:
                resp = await client.get(
                    "https://otx.alienvault.com/api/v1/indicators/IPv4/8.8.8.8/general",
                    headers={"X-OTX-API-KEY": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "AlienVault OTX key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid AlienVault OTX API key")

            elif provider in ['hybrid', 'hybrid_analysis']:
                # Use the same endpoint as the agent — 200=found, 404=not found but key valid, 401/403=bad key
                test_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                resp = await client.get(
                    f"https://hybrid-analysis.com/api/v2/overview/{test_hash}",
                    headers={"api-key": key, "User-Agent": "Falcon Sandbox", "Accept": "application/json"}
                )
                if resp.status_code in [200, 404]:
                    return {"status": "ok", "message": "Hybrid Analysis key is valid"}
                else:
                    raise HTTPException(status_code=400, detail=f"Invalid Hybrid Analysis API key (HTTP {resp.status_code})")

            elif provider == 'mxtoolbox':
                resp = await client.get(
                    "https://api.mxtoolbox.com/api/v1/lookup/mx/google.com",
                    headers={"Authorization": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "MxToolbox key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid MxToolbox API key")

            elif provider == 'emailrep':
                resp = await client.get(
                    "https://emailrep.io/query/test@gmail.com",
                    headers={"Key": key, "User-Agent": "SOC-Platform"}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "EmailRep key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid EmailRep API key")

            elif provider == 'nvd':
                resp = await client.get(
                    "https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2021-44228",
                    headers={"apiKey": key}
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": "NIST NVD key is valid"}
                else:
                    raise HTTPException(status_code=400, detail="Invalid NIST NVD API key")

            elif provider == 'abusech':
                resp = await client.post(
                    "https://threatfox-api.abuse.ch/api/v1/",
                    json={"query": "get_iocs", "days": 1},
                    headers={"Auth-Key": key}
                )
                if resp.status_code == 200:
                    body_json = {}
                    try: body_json = resp.json()
                    except: pass
                    if body_json.get("query_status") == "illegal_key":
                        raise HTTPException(status_code=401, detail="Invalid Abuse.ch API key")
                    return {"status": "ok", "message": "Abuse.ch key is valid"}
                elif resp.status_code == 429:
                    return {"status": "ok", "message": "Abuse.ch key is valid (rate limited)"}
                else:
                    raise HTTPException(status_code=400, detail=f"Abuse.ch: HTTP {resp.status_code}")

            elif provider.startswith('custom-') or request.test_url:
                if not request.test_url:
                    return {"status": "ok", "message": "Key saved (no test URL configured — add one to validate)"}

                headers: dict = {}
                params: dict = {}
                auth_type = (request.auth_type or "header").lower()
                auth_param = request.auth_param or "X-API-Key"

                if auth_type == "bearer":
                    headers["Authorization"] = f"Bearer {key}"
                elif auth_type == "query_param":
                    params[auth_param] = key
                else:
                    headers[auth_param] = key

                resp = await client.get(request.test_url, headers=headers, params=params)
                if resp.status_code < 400:
                    return {"status": "ok", "message": f"Connection successful (HTTP {resp.status_code})"}
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Test endpoint returned HTTP {resp.status_code} — check your URL and auth settings"
                    )

            else:
                return {"status": "ok", "message": "Verification completed"}

        except httpx.TimeoutException:
            # The external API didn't respond in time — key is saved but connectivity unconfirmed
            return {"status": "ok", "message": f"Key saved — {provider} did not respond in time (connectivity unconfirmed)"}
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            print(f"❌ [CTIVerification] Handshake error for {provider}: {e}")
            raise HTTPException(status_code=500, detail=f"Handshake error: {str(e)}")
