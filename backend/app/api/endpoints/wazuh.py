from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.alert_service import AlertService
from app.schemas.alert import WazuhAlert, StandardAlert, normalize_wazuh_alert, WazuhRule, WazuhAgent
from app.core.socket import sio
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["Ingestion"])


# Global in-memory cache for deduplication
# Format: {fingerprint: timestamp}
ALERT_CACHE = {}

@router.post("/wazuh")
async def wazuh_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Wazuh webhook endpoint - The Ingestion Bridge
    """
    global ALERT_CACHE
    try:
        # Parse raw JSON
        raw_json = await request.json()
        
        # Extract alert data - handle Wazuh's wrapper formats
        # Check for 'payload' wrapper (common in integration scripts)
        if 'payload' in raw_json:
            alert_data = raw_json['payload']
        # Check if the alert is wrapped in an 'alert' key (sometimes happens)
        elif 'alert' in raw_json:
            alert_data = raw_json['alert']
        # Check if this IS the alert (has 'rule' or 'agent' keys)
        elif 'rule' in raw_json or 'agent' in raw_json:
            alert_data = raw_json
        # Check for Common flat formats
        elif 'id' in raw_json and 'full_log' in raw_json:
            alert_data = raw_json
        # Fallback to the raw json itself
        else:
            alert_data = raw_json
        
        # --- DEDUPLICATION LOGIC ---
        try:
             # Clean up old cache entries (simple garbage collection on every 100th request or just lazy expiration)
             current_time = datetime.now().timestamp()
             
             # Create Fingerprint: Agent Name + Rule ID + Target User (if found) + Source IP (if found)
             # Use safe gets for nested data
             agent_name = alert_data.get('agent', {}).get('name', 'unknown')
             rule_id = alert_data.get('rule', {}).get('id', 'unknown')
             
             # Extract Target User & Source IP deeply
             data_block = alert_data.get('data', {})
             win_evt = data_block.get('win', {}).get('eventdata', {})
             
             target_user = win_evt.get('targetUserName', 'unknown')
             source_ip = win_evt.get('ipAddress', data_block.get('srcip', 'unknown'))
             
             fingerprint = f"{agent_name}|{rule_id}|{target_user}|{source_ip}"
             
             # Check Cache
             if fingerprint in ALERT_CACHE:
                 last_seen = ALERT_CACHE[fingerprint]
                 if current_time - last_seen < 5.0:
                     logger.warning(f"🔇 DROPPED DUPLICATE: {fingerprint} (Seen {current_time - last_seen:.2f}s ago)")
                     return {"status": "ignored", "message": "Duplicate alert dropped"}
             
             # Update Cache
             ALERT_CACHE[fingerprint] = current_time
             
             # Optional: Clear very old entries to prevent memory leak (basic)
             if len(ALERT_CACHE) > 1000:
                 ALERT_CACHE.clear()

        except Exception as dedup_err:
             logger.error(f"⚠️ Deduplication check failed (skipping): {dedup_err}")
        # ---------------------------

        # DEBUG: Log the keys to understand structure issues
        logger.warning(f"⬇️ INCOMING KEYS: {list(alert_data.keys())}")
        import json
        logger.warning(f"⬇️ PAYLOAD PREVIEW: {json.dumps(alert_data, default=str)[:500]}")

        # Parse JSON string if payload is double-encoded (common in some integrations)
        if isinstance(alert_data, str):
            import json
            try:
                alert_data = json.loads(alert_data)
            except json.JSONDecodeError:
                pass
        
        # DEBUG: Log full incoming data
        logger.info(f"📥 RAW ALERT - ID: {alert_data.get('id', 'MISSING')}")
        logger.info(f"📥 Alert keys: {list(alert_data.keys())}")

        # Validate with Pydantic model
        try:
            wazuh_alert = WazuhAlert(**alert_data)
        except Exception as val_err:
            logger.error(f"❌ VALIDATION FAILED: {val_err}")
            # Try a partial recovery or use the raw data
            try:
                # Minimum viable alert
                wazuh_alert = WazuhAlert()
                # Manually inject what we can
                if isinstance(alert_data, dict):
                    wazuh_alert.id = str(alert_data.get('id', '000000'))
                    wazuh_alert.timestamp = alert_data.get('timestamp')
                    
                    # More robust nested data extraction
                    rule_obj = alert_data.get('rule', {})
                    if isinstance(rule_obj, dict):
                        wazuh_alert.rule = WazuhRule(**rule_obj)
                    
                    agent_obj = alert_data.get('agent', {})
                    if isinstance(agent_obj, dict):
                         wazuh_alert.agent = WazuhAgent(**agent_obj)
                    
                    wazuh_alert.data = alert_data.get('data')
            except Exception as recover_err:
                 logger.error(f"❌ RECOVERY FAILED: {recover_err}")
                 raise ValueError(f"CRITICAL Schema mismatch: {str(val_err)}")
        
        # Normalize to standard format
        standard_alert = normalize_wazuh_alert(wazuh_alert)
        
        # Convert to dict for Socket.IO
        alert_data = standard_alert.model_dump(mode='json')
        
        # Debug: Log before emitting
        logger.info(f"🔊 EMITTING 'new_alert' event to all clients")
        logger.info(f"🔊 Alert data keys: {list(alert_data.keys())}")
        
        # Broadcast to all connected clients
        await sio.emit("new_alert", alert_data)
        
        # Persist to PostgreSQL (Phase 2b)
        try:
            await AlertService.create_alert(db, alert_data)
            logger.info(f"💾 Saved alert {standard_alert.id} to PostgreSQL")
            
            # --- START COGNITIVE PIPELINE (LOUD SCAN) ---
            from app.models.settings import SystemSettings
            from sqlalchemy.future import select
            from datetime import timezone, timedelta
            
            # Fetch Threshold Range
            min_threshold = 7
            max_threshold = 15
            try:
                # Need to run two separate queries or fetch all settings
                # For efficiency, let's fetch all settings and extract what we need
                result = await db.execute(select(SystemSettings).where(SystemSettings.key.in_(["ai_analysis_min_threshold", "ai_analysis_max_threshold"])))
                settings = result.scalars().all()
                for s in settings:
                    if s.key == "ai_analysis_min_threshold":
                        min_threshold = int(s.value)
                    elif s.key == "ai_analysis_max_threshold":
                        max_threshold = int(s.value)
            except Exception as e:
                logger.error(f"⚠️ [Webhook] Failed to fetch threshold range: {e}")

            # Age Check: Only scan fresh alerts (less than 5 minutes old)
            # This prevents "storming" the AI pipeline with old alerts during startup or backlog ingestion
            now = datetime.now(timezone.utc)
            alert_ts = standard_alert.timestamp
            
            # Ensure alert_ts has timezone info (it should from normalize_wazuh_alert)
            if alert_ts.tzinfo is None:
                alert_ts = alert_ts.replace(tzinfo=timezone.utc)
                
            alert_age_seconds = (now - alert_ts).total_seconds()
            is_fresh = alert_age_seconds < 300 # 5 Minutes
            
            if (min_threshold <= standard_alert.rule_level <= max_threshold) and is_fresh:
                from app.core.socket import trigger_ai_scan
                await trigger_ai_scan(standard_alert.id, alert_data)
                print(f"🚀 [Webhook] [RANGE: {min_threshold}-{max_threshold}] TRIGGERED AI investigation for {standard_alert.id}")
            elif not is_fresh:
                print(f"⏭️ [Webhook] SKIPPING AI pipeline for OLD alert {standard_alert.id} (Age: {alert_age_seconds:.0f}s)")
            else:
                print(f"⏭️ [Webhook] [RANGE: {min_threshold}-{max_threshold}] SKIPPING AI pipeline for level {standard_alert.rule_level}")
            # -------------------------------
            
        except Exception as db_err:
            logger.error(f"❌ Database save failed: {db_err}")
        
        logger.info(f"🔊 Emit completed successfully")
        
        return {
            "status": "success",
            "message": "Alert received and broadcasted",
            "alert_id": standard_alert.id,
            "severity": standard_alert.level
        }
        
        logger.info(
            f"✅ Alert processed and broadcasted | "
            f"ID: {standard_alert.id} | "
            f"Level: {standard_alert.level} | "
            f"Source: {standard_alert.source}"
        )
        
        return {
            "status": "success",
            "message": "Alert received and broadcasted",
            "alert_id": standard_alert.id,
            "severity": standard_alert.level
        }
        
    except ValueError as e:
        logger.error(f"❌ Validation error: {e}")
        raise HTTPException(status_code=422, detail=f"Invalid alert format: {str(e)}")
    
    except Exception as e:
        logger.error(f"❌ Processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/health")
async def webhook_health():
    """Health check endpoint for the webhook service"""
    return {
        "status": "healthy",
        "service": "wazuh-webhook",
        "timestamp": datetime.now().isoformat()
    }
