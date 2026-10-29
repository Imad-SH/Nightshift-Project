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


MAX_BULK_IMPORT = 500  # alerts per bulk request; the interface sends larger imports in batches


async def _import_alert(db: AsyncSession, raw_json) -> dict:
    """
    One manual import: the same intake as SIEM alerts, without an AI scan. Accepts a Wazuh alert as
    Wazuh writes it (alerts.json) or an OpenSearch export of one; any other JSON is refused, so a
    random file never shows up as an alert. Returns the ingest result; raises HTTPException with the
    reason when the alert is not imported.
    """
    import uuid
    from datetime import datetime, timezone
    from app.connectors import registry
    from app.connectors.siem.wazuh import is_wazuh_alert
    from app.services import ingest

    if not isinstance(raw_json, dict):
        raise HTTPException(status_code=400, detail="The alert must be a JSON object")

    # Unwrap common envelope formats
    if isinstance(raw_json.get('_source'), dict):
        # OpenSearch / Elasticsearch document envelope (exported from Wazuh/OpenSearch Dashboards)
        alert_data = raw_json['_source']
    elif isinstance(raw_json.get('payload'), dict):
        alert_data = raw_json['payload']
    elif isinstance(raw_json.get('alert'), dict):
        alert_data = raw_json['alert']
    else:
        alert_data = raw_json
    if alert_data is not raw_json:
        # Carry over the importer metadata the interface stamps on the outer envelope
        for _k in ('_injected_by', '_injected_at'):
            if _k in raw_json:
                alert_data[_k] = raw_json[_k]

    if not is_wazuh_alert(alert_data):
        raise HTTPException(
            status_code=400,
            detail="Not a Wazuh alert: it needs a rule with an id, a level and a description, "
                   "as Wazuh writes it (alerts.json).",
        )

    # Assign a unique ID only if the JSON has none
    if not alert_data.get('id'):
        alert_data['id'] = f"manual-{uuid.uuid4().hex[:12]}"

    # Stamp with current time if no timestamp provided
    if not alert_data.get('timestamp') and not alert_data.get('@timestamp'):
        alert_data['timestamp'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    connector = registry.SIEM['wazuh']
    try:
        result = await ingest.ingest(db, connector, alert_data, trigger_scan=False, origin="manual")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Could not parse alert: {e}")
    if result.get("status") != "success":
        raise HTTPException(status_code=409, detail=result.get("message", "Alert not accepted"))
    return result


@router.post("/manual-upload")
async def manual_alert_upload(request: Request, db: AsyncSession = Depends(get_db)):
    """Manually inject one Wazuh alert into the live stream (see _import_alert)."""
    try:
        raw_json = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    result = await _import_alert(db, raw_json)
    return {"status": "ok", "alert_id": result["alert_id"], "alert": result["alert"], "message": "Alert injected into live stream"}


@router.post("/manual-upload/bulk")
async def manual_alert_upload_bulk(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Inject several Wazuh alerts at once: {"alerts": [...]}, at most MAX_BULK_IMPORT per request.
    Each alert is checked and imported on its own; the answer lists the imported alerts and, for the
    others, their position in the list and why they were skipped.
    """
    import logging
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    alerts = body.get("alerts") if isinstance(body, dict) else None
    if not isinstance(alerts, list) or not alerts:
        raise HTTPException(status_code=400, detail='Send {"alerts": [...]} with at least one alert')
    if len(alerts) > MAX_BULK_IMPORT:
        raise HTTPException(status_code=413, detail=f"At most {MAX_BULK_IMPORT} alerts per request")

    imported, skipped = [], []
    for index, item in enumerate(alerts):
        try:
            result = await _import_alert(db, item)
            imported.append(result["alert"])
        except HTTPException as e:
            skipped.append({"index": index, "reason": str(e.detail)})
        except Exception as e:  # one broken alert must not stop the others
            await db.rollback()
            logging.getLogger(__name__).warning(f"[Import] Alert {index} failed: {e}")
            skipped.append({"index": index, "reason": "Could not import this alert"})
    return {"imported": imported, "skipped": skipped}
