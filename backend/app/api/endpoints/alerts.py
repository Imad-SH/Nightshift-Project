from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.database import get_db
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["Alerts"])

@router.get("/history")
async def get_alert_history(
    limit: int = 100,
    skip: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """
    Get historical alerts from PostgreSQL
    """
    db_alerts = await AlertService.get_alerts(db, limit, skip)
    
    # Map back to StandardAlert schema or similar
    # The frontend expects {id, title, timestamp, ...}
    
    formatted_alerts = []
    for alert in db_alerts:
        formatted_alerts.append({
            "id": str(alert.wazuh_id),
            "title": alert.title,
            "timestamp": alert.timestamp.isoformat(),
            "level": alert.level,
            "source": alert.source,
            "status": alert.status,
            "thehive_id": alert.thehive_id,
            "flowintel_id": alert.flowintel_id,
            "raw_data": alert.raw_data
        })
        
    return formatted_alerts
    
@router.get("/stats/severity")
async def get_severity_stats(
    timeframe: Optional[str] = Query(None, description="TODAY, THIS_MONTH, or ALL"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated severity statistics for all alerts in the DB
    """
    from datetime import datetime, timezone
    
    start_time = None
    end_time = None
    now = datetime.now(timezone.utc)
    
    if timeframe == 'TODAY':
        start_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif timeframe == 'THIS_MONTH':
        start_time = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif start_date:
        try:
            start_time = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if end_date:
                end_time = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            pass # Fallback to None
    
    stats = await AlertService.get_severity_distribution(db, start_time, end_time)
    return stats

@router.get("/stats/mitre")
async def get_mitre_stats(
    timeframe: Optional[str] = Query(None, description="TODAY, THIS_MONTH, or ALL"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated MITRE ATT&CK statistics
    """
    from datetime import datetime, timezone
    
    start_time = None
    end_time = None
    now = datetime.now(timezone.utc)
    
    if timeframe == 'TODAY':
        start_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif timeframe == 'THIS_MONTH':
        start_time = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif start_date:
        try:
            start_time = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if end_date:
                end_time = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            pass
    
    stats = await AlertService.get_mitre_distribution(db, start_time, end_time)
    return stats



@router.get("/stats/kpis")
async def get_dashboard_kpis(
    timeframe: Optional[str] = Query(None, description="TODAY, THIS_MONTH, or ALL"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Get high-level dashboard KPIs (FP Rate, Dominant Vector, Threat Count)
    """
    from datetime import datetime, timezone
    
    start_time = None
    end_time = None
    now = datetime.now(timezone.utc)
    
    if timeframe == 'TODAY':
        start_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif timeframe == 'THIS_MONTH':
        start_time = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif start_date:
        try:
            start_time = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if end_date:
                end_time = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            pass
            
    stats = await AlertService.get_kpi_stats(db, start_time, end_time)
    return stats


@router.post("/manual-upload")
async def manual_alert_upload(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Manually inject a JSON alert into the live stream — same pipeline as the Wazuh webhook.
    Accepts raw Wazuh alert JSON or any compatible format.
    """
    from app.schemas.alert import WazuhAlert, normalize_wazuh_alert, WazuhRule, WazuhAgent
    from app.core.socket import sio
    import logging, uuid
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)

    try:
        raw_json = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Unwrap common envelope formats
    if '_source' in raw_json:
        # OpenSearch / Elasticsearch document envelope (exported from Wazuh/OpenSearch Dashboards)
        alert_data = raw_json['_source']
        # Carry over injected metadata that was stamped on the outer envelope by the frontend
        for _k in ('_injected_by', '_injected_at'):
            if _k in raw_json:
                alert_data[_k] = raw_json[_k]
    elif 'payload' in raw_json:
        alert_data = raw_json['payload']
    elif 'alert' in raw_json:
        alert_data = raw_json['alert']
    elif 'rule' in raw_json or 'agent' in raw_json:
        alert_data = raw_json
    else:
        alert_data = raw_json

    # Assign a unique ID only if the JSON has none
    if not alert_data.get('id'):
        alert_data['id'] = f"manual-{uuid.uuid4().hex[:12]}"

    # Stamp with current time if no timestamp provided
    if not alert_data.get('timestamp') and not alert_data.get('@timestamp'):
        alert_data['timestamp'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    # Normalise through the same Pydantic pipeline as the Wazuh webhook
    try:
        wazuh_alert = WazuhAlert(**alert_data)
    except Exception:
        try:
            wazuh_alert = WazuhAlert()
            wazuh_alert.id = str(alert_data.get('id', uuid.uuid4().hex[:12]))
            wazuh_alert.timestamp = alert_data.get('timestamp')
            rule_obj = alert_data.get('rule', {})
            if isinstance(rule_obj, dict):
                wazuh_alert.rule = WazuhRule(**rule_obj)
            agent_obj = alert_data.get('agent', {})
            if isinstance(agent_obj, dict):
                wazuh_alert.agent = WazuhAgent(**agent_obj)
            wazuh_alert.data = alert_data.get('data')
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse alert: {e}")

    standard_alert = normalize_wazuh_alert(wazuh_alert)
    emittable = standard_alert.model_dump(mode='json')

    # Broadcast to live stream
    await sio.emit("new_alert", emittable)

    # Persist to DB
    try:
        await AlertService.create_alert(db, emittable)
    except Exception as e:
        logger.warning(f"[ManualUpload] DB persist failed (alert still emitted): {e}")

    return {"status": "ok", "alert_id": emittable.get("id"), "alert": emittable, "message": "Alert injected into live stream"}
