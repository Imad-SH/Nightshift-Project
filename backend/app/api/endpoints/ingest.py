"""
Alert intake from SIEMs. Not behind the user login: SIEMs authenticate with their
connector's ingest token (Authorization: Bearer <token>, X-Nightshift-Token header,
or ?token= for tools that cannot set headers).
"""
import json
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors import registry
from app.connectors.base import SiemConnector
from app.core.database import get_db
from app.services import ingest, integrations

router = APIRouter(tags=["Ingestion"])

UNAUTHORIZED = HTTPException(status_code=401, detail="Missing or invalid ingest token",
                             headers={"WWW-Authenticate": "Bearer"})


def _presented_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.headers.get("x-nightshift-token") or request.query_params.get("token")


async def _read_alert(request: Request) -> Dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Body is not valid JSON")
    if isinstance(body, str):  # some integrations double-encode
        try:
            body = json.loads(body)
        except ValueError:
            pass
    if not isinstance(body, dict):
        raise HTTPException(status_code=422, detail="The alert must be a JSON object")
    return body


async def _ingest(connector: SiemConnector, request: Request, db: AsyncSession) -> Dict[str, Any]:
    payload = await _read_alert(request)
    try:
        return await ingest.ingest(db, connector, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid alert format: {e}")


@router.post("/ingest/{connector_id}")
async def ingest_alert(connector_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    connector = registry.SIEM.get(connector_id)
    if connector is None:
        raise HTTPException(status_code=404, detail=f"Unknown alert source: {connector_id}")
    if not integrations.token_matches(connector, _presented_token(request)):
        raise UNAUTHORIZED
    return await _ingest(connector, request, db)


@router.post("/webhook/wazuh")
async def legacy_wazuh_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Original Wazuh intake path, kept for integrations already pointing at it.
    Once a Wazuh ingest token exists, it is required here too; until then the path
    accepts alerts as it always did (the Integrations screen flags it as unprotected).
    """
    connector = registry.SIEM["wazuh"]
    if integrations.has_ingest_token(connector) and not integrations.token_matches(connector, _presented_token(request)):
        raise UNAUTHORIZED
    return await _ingest(connector, request, db)


@router.get("/webhook/health")
async def webhook_health():
    """Health check endpoint for the intake service"""
    return {
        "status": "healthy",
        "service": "wazuh-webhook",
        "timestamp": datetime.now().isoformat()
    }
