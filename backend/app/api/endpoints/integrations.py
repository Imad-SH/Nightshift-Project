"""
Integrations API: SIEM and SOAR connectors (configuration, tests, ingest tokens,
setup guides) and escalation to the active SOAR.
"""
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors import registry
from app.connectors.base import Connector, EscalationRequest, SiemConnector, SoarConnector
from app.core.database import get_db
from app.core.security import require_role
from app.services import ingest, integrations

router = APIRouter(prefix="/integrations", tags=["integrations"])
ADMIN = Depends(require_role("soc_admin"))


# ---- views ------------------------------------------------------------------------

def _common(connector: Connector) -> Dict[str, Any]:
    return {
        **connector.describe(),
        "values": integrations.public_config(connector),
        "configured": connector.is_configured(integrations.config_for(connector)),
        "status": integrations.status_of(connector.kind, connector.id),
    }


def _siem_view(connector: SiemConnector) -> Dict[str, Any]:
    token_set = integrations.has_ingest_token(connector)
    return {
        **_common(connector),
        "ingest_path": f"/api/ingest/{connector.id}",
        "token_set": token_set,
        "last_alert_at": integrations.last_alert_at(connector.id),
        # The original unauthenticated Wazuh path stays open until a token is generated
        "legacy_path_open": connector.id == "wazuh" and not token_set,
    }


def _soar_view(connector: SoarConnector) -> Dict[str, Any]:
    return {**_common(connector), "active": integrations.active_soar_id() == connector.id}


def _connector(kind: str, connector_id: str) -> Connector:
    connector = registry.get(kind, connector_id) if kind in ("siem", "soar") else None
    if connector is None:
        raise HTTPException(status_code=404, detail=f"Unknown {kind} connector: {connector_id}")
    return connector


def _ingest_url(base_url: Optional[str], request: Request, connector: SiemConnector) -> str:
    base = (base_url or str(request.base_url)).strip().rstrip("/")
    return f"{base}/api/ingest/{connector.id}"


# ---- configuration (admin) ------------------------------------------------------------

@router.get("/", dependencies=[ADMIN])
async def list_integrations():
    return {
        "siem": [_siem_view(c) for c in registry.SIEM.values()],
        "soar": [_soar_view(c) for c in registry.SOAR.values()],
        "active_soar": integrations.active_soar_id(),
        "auto_escalation": integrations.auto_escalation_settings(),
    }


class ValuesBody(BaseModel):
    values: Dict[str, Any] = {}


@router.put("/{kind}/{connector_id}", dependencies=[ADMIN])
async def save_connector(kind: str, connector_id: str, body: ValuesBody, db: AsyncSession = Depends(get_db)):
    connector = _connector(kind, connector_id)
    try:
        await integrations.save_config(db, connector, body.values)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await integrations.refresh_status(connector)
    await integrations.broadcast_status()
    return _siem_view(connector) if kind == "siem" else _soar_view(connector)


@router.post("/{kind}/{connector_id}/test", dependencies=[ADMIN])
async def test_connector(kind: str, connector_id: str, body: ValuesBody):
    connector = _connector(kind, connector_id)
    try:
        config = integrations.merged_config(connector, body.values)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        result = await connector.test(config)
    except Exception as e:
        return {"ok": False, "message": f"Test failed: {e}"}
    return {"ok": result.ok, "message": result.message, "details": result.details}


class BaseUrlBody(BaseModel):
    base_url: Optional[str] = None  # address the SIEM uses to reach Nightshift


@router.post("/siem/{connector_id}/token", dependencies=[ADMIN])
async def generate_token(connector_id: str, body: BaseUrlBody, request: Request, db: AsyncSession = Depends(get_db)):
    """Create (or replace) the source's ingest token. This is the only time it is shown."""
    connector = _connector("siem", connector_id)
    token = await integrations.generate_ingest_token(db, connector)
    await integrations.broadcast_status()
    return {"token": token, "setup": connector.setup_guide(_ingest_url(body.base_url, request, connector), token)}


@router.post("/siem/{connector_id}/setup", dependencies=[ADMIN])
async def setup_guide(connector_id: str, body: BaseUrlBody, request: Request):
    connector = _connector("siem", connector_id)
    return {"setup": connector.setup_guide(_ingest_url(body.base_url, request, connector), "<YOUR_INGEST_TOKEN>")}


@router.post("/siem/{connector_id}/test-alert", dependencies=[ADMIN])
async def send_test_alert(connector_id: str, db: AsyncSession = Depends(get_db)):
    """Run a sample alert in this source's format through intake, without starting an AI scan."""
    connector = _connector("siem", connector_id)
    result = await ingest.ingest(db, connector, connector.sample_event(), trigger_scan=False, origin="test")
    if result.get("status") != "success":
        raise HTTPException(status_code=409, detail=result.get("message", "Test alert not accepted"))
    return result


class ActiveSoarBody(BaseModel):
    connector: str


@router.put("/soar-active", dependencies=[ADMIN])
async def choose_active_soar(body: ActiveSoarBody, db: AsyncSession = Depends(get_db)):
    try:
        await integrations.set_active_soar(db, body.connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"active_soar": integrations.active_soar_id()}


class AutoEscalationBody(BaseModel):
    auto_escalation_enabled: Optional[bool] = None
    auto_escalation_min_score: Optional[int] = None
    auto_escalation_verdicts: Optional[List[str]] = None


@router.put("/auto-escalation", dependencies=[ADMIN])
async def save_auto_escalation(body: AutoEscalationBody, db: AsyncSession = Depends(get_db)):
    return await integrations.save_auto_escalation(db, body.model_dump(exclude_none=True))


# ---- escalation (any signed-in user) ------------------------------------------------------

class EscalateBody(BaseModel):
    alert_id: str
    alert_title: str = "Unknown Alert"
    alert_agent: Any = "Unknown Agent"
    rule_level: int = 0
    is_ai_analyzed: bool = False
    event_data: Dict[str, Any] = {}
    force: bool = False
    manual_description: Optional[str] = None
    manual_tags: Optional[List[str]] = None


async def _escalate(body: EscalateBody, db: AsyncSession, connector: Optional[SoarConnector] = None) -> Dict[str, Any]:
    agent = body.alert_agent if isinstance(body.alert_agent, str) else (body.alert_agent or {}).get("name", "Unknown Agent")
    node_results = body.event_data.get("node_results") or {}
    request = EscalationRequest(
        alert_id=body.alert_id, title=body.alert_title, source=agent, score=body.rule_level,
        node_results=node_results if body.is_ai_analyzed else {}, is_ai_analyzed=body.is_ai_analyzed,
        manual_description=body.manual_description, tags=body.manual_tags or [], force=body.force,
    )
    try:
        result = await integrations.escalate(db, request, connector)
    except integrations.AlreadyEscalated as e:
        return {"status": "duplicate", "already_exists": True,
                **integrations.case_fields(e.case_system, e.case_id, None),
                "message": "This alert has already been escalated."}
    except LookupError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Escalation failed: {e}")
    system = (connector or integrations.active_soar()).id
    return {"status": "success", "message": result.message,
            **integrations.case_fields(system, result.case_id, result.case_url)}


@router.post("/escalate")
async def escalate_alert(body: EscalateBody, db: AsyncSession = Depends(get_db)):
    """Escalate an alert to the active SOAR."""
    return await _escalate(body, db)


# Original per-SOAR endpoints, kept for anything still calling them
legacy_router = APIRouter(prefix="/v1", tags=["integrations"])


@legacy_router.post("/flowintel/escalate")
async def legacy_flowintel_escalate(body: EscalateBody, db: AsyncSession = Depends(get_db)):
    return await _escalate(body, db, registry.SOAR["flowintel"])


@legacy_router.post("/thehive/escalate")
async def legacy_thehive_escalate(body: EscalateBody, db: AsyncSession = Depends(get_db)):
    return await _escalate(body, db, registry.SOAR["thehive"])


@legacy_router.get("/flowintel/health")
async def legacy_flowintel_health():
    state = integrations.status_of("soar", "flowintel")["state"]
    return {"status": "CONNECTED" if state == "connected" else "DISCONNECTED", "service": "Flowintel"}


@legacy_router.get("/thehive/status")
async def legacy_thehive_status():
    state = integrations.status_of("soar", "thehive")["state"]
    return {"status": "online" if state == "connected" else "offline"}
