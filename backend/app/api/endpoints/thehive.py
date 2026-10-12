from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List
from app.core.database import get_db
from app.services.thehive_service import thehive_service
from app.services.alert_service import AlertService
import logging

router = APIRouter(prefix="/thehive", tags=["TheHive"])
logger = logging.getLogger(__name__)

@router.post("/escalate")
async def escalate_to_thehive(
    alert_id: str = Body(...),
    alert_title: str = Body("Unknown Alert"),
    alert_agent: str = Body("Unknown Agent"),
    rule_level: int = Body(0),
    is_ai_analyzed: bool = Body(False),
    event_data: Dict[str, Any] = Body(...),
    force: bool = Body(False),
    manual_description: Optional[str] = Body(None),
    manual_tags: Optional[List[str]] = Body(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Escalate a SOC alert to TheHive for case management.
    """
    try:
        # 1. Duplicate Detection Check
        existing_alert = await AlertService.get_alert_by_wazuh_id(db, alert_id)
        if existing_alert and existing_alert.thehive_id and not force:
            logger.warning(f"⚠️ Duplicate escalation attempt blocked for alert {alert_id}")
            return {
                "status": "duplicate",
                "already_exists": True,
                "thehive_id": existing_alert.thehive_id,
                "message": "Alert has already been escalated to TheHive."
            }

        # 2. Create Alert in TheHive
        thehive_result = await thehive_service.create_alert(
            alert_id=alert_id,
            event_data=event_data,
            alert_title=alert_title,
            alert_agent=alert_agent,
            rule_level=rule_level,
            is_duplicate=force,
            is_ai_analyzed=is_ai_analyzed,
            manual_description=manual_description,
            manual_tags=manual_tags
        )
        
        # 3. Extract Response ID
        thehive_id = thehive_result.get("id") or thehive_result.get("_id")
        
        # 4. Update local database with the reference
        if thehive_id:
            await AlertService.update_thehive_id(db, alert_id, str(thehive_id))
            logger.info(f"💾 Associated alert {alert_id} with TheHive Alert {thehive_id}")

        # 5. Notify UI via Socket.IO so the badge appears instantly
        from app.core.socket import sio
        from app.core.config import settings as app_settings
        case_url = f"{app_settings.thehive_url.rstrip('/')}/alerts/{thehive_id}/details" if thehive_id else None
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'thehive_id': str(thehive_id) if thehive_id else None,
            'thehive_url': app_settings.thehive_url,
            'case_url': case_url,
            'node': 'responder',
            'log': f'✓ Successfully escalated Alert to TheHive'
        })

        return {
            "status": "success",
            "message": "Alert created in TheHive",
            "thehive_id": thehive_id,
            "data": thehive_result
        }

    except Exception as e:
        logger.error(f"❌ Escalation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def get_thehive_status():
    """
    Check if TheHive is reachable.
    """
    is_up = await thehive_service.check_connectivity()
    return {"status": "online" if is_up else "offline"}
