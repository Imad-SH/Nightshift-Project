from fastapi import APIRouter, Body, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.flowintel_service import flowintel_service
from typing import Dict, Any, Optional, List

router = APIRouter(prefix="/flowintel", tags=["Flowintel"])

@router.post("/escalate")
async def escalate_to_flowintel(
    alert_id: str = Body(..., embed=True),
    alert_title: str = Body("Unknown Alert", embed=True),
    alert_agent: str = Body("Unknown Agent", embed=True),
    rule_level: int = Body(0, embed=True),
    force: bool = Body(False, embed=True),
    is_ai_analyzed: bool = Body(False, embed=True),
    event_data: Dict[str, Any] = Body(...),
    manual_description: Optional[str] = Body(None),
    manual_tags: Optional[List[str]] = Body(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Escalate an alert to Flowintel v3.1.0.
    """
    try:
        # 1. Duplicate Detection Check
        from app.services.alert_service import AlertService
        existing_alert = await AlertService.get_alert_by_wazuh_id(db, alert_id)
        if existing_alert and existing_alert.flowintel_id and not force:
            return {
                "status": "duplicate",
                "already_exists": True,
                "flowintel_id": existing_alert.flowintel_id,
                "message": "Alert has already been escalated to Flowintel."
            }

        # 2. Create Case in Flowintel
        result = await flowintel_service.create_case(alert_id, event_data, alert_title, alert_agent, rule_level, force, is_ai_analyzed=is_ai_analyzed, manual_description=manual_description, manual_tags=manual_tags, db=db)
        flowintel_id = result.get("id")
        
        # 3. Notify the UI via Socket.IO
        from app.core.socket import sio
        from app.core.config import settings as app_settings
        case_url = f"{app_settings.flowintel_url.rstrip('/')}/case/{flowintel_id}" if flowintel_id else None
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'flowintel_id': flowintel_id,
            'flowintel_url': app_settings.flowintel_url,
            'case_url': case_url,
            'node': 'responder',
            'log': f'✓ Successfully escalated Case to Flowintel'
        })

        return {
            "status": "success",
            "message": "Alert escalated successfully to Flowintel",
            "flowintel_id": flowintel_id
        }
    except Exception as e:
        print(f"❌ Flowintel Escalation Endpoint Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def check_flowintel_health():
    """
    Check if Flowintel connection is active.
    """
    is_connected = await flowintel_service.check_connectivity()
    return {
        "status": "CONNECTED" if is_connected else "DISCONNECTED",
        "service": "Flowintel"
    }
