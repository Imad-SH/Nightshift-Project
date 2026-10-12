import socketio
import logging
import asyncio
import os
import traceback
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from app.core.database import AsyncSessionLocal
import httpx

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Note: Agent and Service imports moved inside functions to prevent circular dependencies

# Setup logging to stdout (standard for Docker)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Socket.IO async server
# INCREASE BUFFER SIZE for Base64 PDF transmission (Default is 1MB)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=settings.socketio_cors_allowed_origins,
    logger=True,
    engineio_logger=True,
    max_http_buffer_size=10 * 1024 * 1024  # 10MB
)

# Create ASGI application for Socket.IO
# mounting at '/socket.io' in main.py, so we set path to "" here
socket_app = socketio.ASGIApp(sio, socketio_path="")

# Track active scan tasks and service health
active_scans = {}
last_service_status = {'wazuh': 'DISCONNECTED', 'thehive': 'DISCONNECTED', 'flowintel': 'DISCONNECTED'}

# Dynamic integration credentials (overridden from DB by admin via UI)
# Falls back to settings.* (env vars) when not set
integration_overrides = {
    'wazuh_url': None,
    'wazuh_user': None,
    'wazuh_password': None,
    'thehive_url': None,
    'thehive_api_key': None,
    'flowintel_url': None,
    'flowintel_api_key': None,
    'active_soar': 'thehive',
}

def reload_integration_settings(db_settings: dict):
    """
    Hot-reload integration credentials from DB-stored values.
    Called by the reload-integrations API endpoint.
    """
    global integration_overrides, last_service_status
    for key in integration_overrides:
        if key in db_settings:
            integration_overrides[key] = db_settings[key]
            
    # CRITICAL: Reset all statuses to DISCONNECTED immediately while we verify
    # This prevents the header from showing "CONNECTED" using old stale data
    last_service_status['wazuh'] = 'DISCONNECTED'
    last_service_status['thehive'] = 'DISCONNECTED'
    last_service_status['flowintel'] = 'DISCONNECTED'
    last_service_status['active_soar'] = integration_overrides['active_soar']
    
    # NEW: Force immediate emit so the UI reflects the change in milliseconds
    import asyncio
    asyncio.create_task(sio.emit('service_status', last_service_status))
    
    print(f"🔄 [Health] Integration overrides updated & Broadcasted. Active SOAR: {integration_overrides['active_soar']}")

def _get_wazuh_creds():
    """Get Wazuh credentials, preferring DB overrides over env vars."""
    url = integration_overrides['wazuh_url'] or settings.wazuh_url
    return (
        url.strip().rstrip("/") if url else "",
        (integration_overrides['wazuh_user'] or settings.wazuh_user or "").strip(),
        (integration_overrides['wazuh_password'] or settings.wazuh_password or "").strip(),
    )

def _get_thehive_url():
    """Get TheHive URL, preferring DB override over env var."""
    url = integration_overrides['thehive_url'] or settings.thehive_url
    return url.strip().rstrip("/") if url else ""

async def _load_overrides_from_db():
    """Load integration overrides from DB on first health check cycle."""
    global integration_overrides
    try:
        from app.models.settings import SystemSettings
        from sqlalchemy.future import select
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SystemSettings))
            db_settings = {s.key: s.value for s in result.scalars().all()}
            for key in integration_overrides:
                if key in db_settings and db_settings[key]:
                    integration_overrides[key] = db_settings[key]
            
            # Also reload SOAR services if DB has credentials
            thehive_url = db_settings.get('thehive_url')
            thehive_key = db_settings.get('thehive_api_key')
            flowintel_url = db_settings.get('flowintel_url')
            flowintel_key = db_settings.get('flowintel_api_key')
            
            if thehive_url or thehive_key:
                from app.services.thehive_service import thehive_service
                thehive_service.reload_credentials(url=thehive_url, api_key=thehive_key)
            
            if flowintel_url or flowintel_key:
                from app.services.flowintel_service import flowintel_service
                flowintel_service.reload_credentials(url=flowintel_url, api_key=flowintel_key)
            
            loaded = [k for k,v in integration_overrides.items() if v]
            if loaded:
                print(f"🔄 [Health] DB overrides loaded on startup: {loaded}")
    except Exception as e:
        print(f"⚠️ [Health] Could not load DB overrides: {e}")
        traceback.print_exc()

async def check_services_health():
    """Background task to monitor Wazuh and TheHive connectivity"""
    global last_service_status
    print("🛰️ [Health] Starting periodic service monitor...")
    
    # On first cycle, try to load DB-stored overrides
    await _load_overrides_from_db()
    
    while True:
        try:
            # 1. Check Wazuh
            wazuh_status = 'DISCONNECTED'
            wazuh_url, wazuh_user, wazuh_password = _get_wazuh_creds()
            try:
                # Extended timeout: allow busy manager time to respond during indexing
                async with httpx.AsyncClient(verify=False, timeout=120.0) as client:
                    auth = (wazuh_user, wazuh_password)
                    response = await client.get(f"{wazuh_url}/security/user/authenticate", auth=auth)
                    if response.status_code == 200:
                        wazuh_status = 'CONNECTED'
                        # Log success for visibility
                        # print(f"🛰️ [Health] Wazuh check: {wazuh_status}")
            except Exception as e:
                print(f"⚠️ [Health] Wazuh check failed: {str(e)}")

            # 2. Check TheHive
            thehive_status = 'DISCONNECTED'
            try:
                from app.services.thehive_service import thehive_service
                # reload_credentials already called by settings.py, so we just check
                is_ok = await thehive_service.check_connectivity()
                if is_ok:
                    thehive_status = 'CONNECTED'
            except Exception as e:
                print(f"⚠️ [Health] TheHive check failed: {str(e)}")

            # 3. Check Flowintel
            flowintel_status = 'DISCONNECTED'
            flowintel_url = integration_overrides['flowintel_url'] or settings.flowintel_url
            flowintel_key = integration_overrides['flowintel_api_key'] or settings.flowintel_api_key
            
            if flowintel_url and flowintel_key:
                try:
                    from app.services.flowintel_service import flowintel_service
                    # Explicitly reload service with current health check creds
                    flowintel_service.reload_credentials(url=flowintel_url, api_key=flowintel_key)
                    is_ok = await flowintel_service.check_connectivity()
                    if is_ok:
                        flowintel_status = 'CONNECTED'
                except Exception as e:
                    print(f"⚠️ [Health] Flowintel check failed: {str(e)}")

            # Update global state
            last_service_status = {
                'wazuh': wazuh_status,
                'thehive': thehive_status,
                'flowintel': flowintel_status,
                'active_soar': integration_overrides['active_soar'],
                'system': 'ONLINE' if (wazuh_status == 'CONNECTED') else 'OFFLINE',
                'timestamp': datetime.now().isoformat()
            }

            # Emit to all connected clients
            await sio.emit('service_status', last_service_status)
            
        except Exception as global_err:
            print(f"❌ [Health] Global Monitor Error: {global_err}")
            
        await asyncio.sleep(10) # Check every 10s

async def perform_immediate_health_check():
    """
    Force a health check to run right now instead of waiting for the 30s cycle.
    Useful after admin saves new integration settings.
    """
    print("🛰️ [Health] Manual trigger: Running immediate health check...")
    global last_service_status
    
    # Check Wazuh
    wazuh_status = 'DISCONNECTED'
    wazuh_url, wazuh_user, wazuh_password = _get_wazuh_creds()
    print(f"🛰️ [Health] Checking Wazuh: {wazuh_url} with user {wazuh_user}")
    try:
        async with httpx.AsyncClient(verify=False, timeout=20.0) as client:
            auth = (wazuh_user, wazuh_password)
            response = await client.get(f"{wazuh_url}/security/user/authenticate", auth=auth)
            print(f"🛰️ [Health] Wazuh Response: {response.status_code}")
            if response.status_code == 200:
                wazuh_status = 'CONNECTED'
    except Exception as e:
        print(f"⚠️ [Health] Manual Wazuh check failed: {e}")

    # Check TheHive
    thehive_status = 'DISCONNECTED'
    try:
        from app.services.thehive_service import thehive_service
        # Force a deep check
        if await thehive_service.check_connectivity():
            thehive_status = 'CONNECTED'
    except Exception as e:
        print(f"⚠️ [Health] Manual TheHive check failed: {e}")

    # Check Flowintel
    flowintel_status = 'DISCONNECTED'
    flowintel_url = (integration_overrides['flowintel_url'] or settings.flowintel_url or "").strip().rstrip("/")
    flowintel_key = (integration_overrides['flowintel_api_key'] or settings.flowintel_api_key or "").strip()
    if flowintel_url and flowintel_key:
        try:
            from app.services.flowintel_service import flowintel_service
            flowintel_service.reload_credentials(url=flowintel_url, api_key=flowintel_key)
            if await flowintel_service.check_connectivity():
                flowintel_status = 'CONNECTED'
        except Exception as e:
            print(f"⚠️ [Health] Manual Flowintel check failed: {e}")

    # Update and Emit
    last_service_status = {
        'wazuh': wazuh_status,
        'thehive': thehive_status,
        'flowintel': flowintel_status,
        'active_soar': integration_overrides['active_soar'],
        'system': 'ONLINE' if wazuh_status == 'CONNECTED' else 'OFFLINE',
        'timestamp': datetime.now().isoformat()
    }
    await sio.emit('service_status', last_service_status)
    print(f"🛰️ [Health] Manual trigger complete: {wazuh_status} / {thehive_status}")

@sio.event
async def connect(sid, environ):
    """Handle client connection with history re-hydration"""
    print(f"🔌 Client connected: {sid}")
    
    # 1. Immediately confirm connection to restore "ONLINE" status
    await sio.emit('connection_established', {'status': 'connected'}, room=sid)
    
    # 2. Immediately send last known service status for instant UI sync
    await sio.emit('service_status', last_service_status, room=sid)

    # 3. HYDRATION: Fetch ALL alerts from the database
    print(f"📥 [Socket] Synchronizing FULL alert history for {sid}...")
    
    # [FIX] RACE CONDITION: Give frontend (React) half a second to attach all 'alert_history' listeners
    await asyncio.sleep(0.5)
    
    from app.services.alert_service import AlertService
    async with AsyncSessionLocal() as db:
        try:
            # Removed all limits to fetch the entire database history
            db_alerts = await AlertService.get_alerts(db, limit=None)
            
            # Format alerts for frontend consumption
            history_payload = []
            for alert in db_alerts:
                raw = alert.raw_data or {}
                # Extract persisted AI info from raw_data
                ai_status = raw.get('ai_status', 'idle')
                verdict = raw.get('verdict', alert.verdict)
                graph_state = raw.get('graph_layout', None)

                history_payload.append({
                    'id': alert.wazuh_id,
                    'title': alert.title,
                    'timestamp': alert.timestamp.isoformat() if alert.timestamp else None,
                    'rule_level': alert.rule_level,
                    'source': alert.source,
                    'status': ai_status,
                    'alert_status': alert.status,
                    'verdict': verdict,
                    'ai_analysis_results': raw.get('ai_analysis_results', {}),
                    'graph_state': graph_state,
                    'raw_data': raw,
                    'thehive_id': alert.thehive_id,
                    'thehive_url': settings.thehive_url if alert.thehive_id else None,
                    'flowintel_id': alert.flowintel_id,
                    'flowintel_url': settings.flowintel_url if alert.flowintel_id else None,
                    'case_url': f"{settings.thehive_url.rstrip('/')}/alerts/{alert.thehive_id}/details" if alert.thehive_id else (f"{settings.flowintel_url.rstrip('/')}/case/{alert.flowintel_id}" if alert.flowintel_id else None),
                })

            # Emit history payload ONLY to the newly connected client
            await sio.emit('alert_history', {
                'alerts': history_payload,
                'is_append': False
            }, room=sid)
            print(f"✅ History sync complete: {len(history_payload)} alerts sent to {sid}")
            
        except Exception as e:
            print(f"⚠️ [Socket] Failed to fetch alert history: {str(e)}")

    print(f"✅ Connection handshake completed for {sid}")

@sio.on('get_alerts_history')
async def handle_get_alerts_history(sid, data=None):
    """Explicitly request a history re-sync with pagination (skip/limit) support"""
    from app.services.alert_service import AlertService
    if data is None: data = {}
    
    # Rolling Window parameters
    hours = data.get('hours', 48)
    skip = data.get('skip', 0)
    limit = data.get('limit', 1000)
    is_append = data.get('is_append', False)
    
    start_time_str = data.get('start_time')
    end_time_str = data.get('end_time')
    
    print(f"🔄 [Socket] History requested by {sid} (skip={skip}, limit={limit}, hours={hours}, explicit_date={bool(start_time_str)})")
    
    async with AsyncSessionLocal() as db:
        try:
             if start_time_str and end_time_str:
                 # Explicit Date Range
                 start_dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                 end_dt = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                 db_alerts = await AlertService.get_alerts_between(db, start_time=start_dt, end_time=end_dt, limit=None, skip=skip)
             elif hours == -1:
                 # Fetch all history regardless of time
                 db_alerts = await AlertService.get_alerts(db, limit=None, skip=skip)
             else:
                 # Rolling Window
                 start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
                 db_alerts = await AlertService.get_alerts_since(db, start_time=start_time, limit=limit, skip=skip)

                 
             history_payload = []
             for alert in db_alerts:
                raw = alert.raw_data or {}
                # Extract persisted AI info from raw_data
                ai_status = raw.get('ai_status', 'idle')
                verdict = raw.get('verdict', alert.verdict)
                graph_state = raw.get('graph_layout', None)

                history_payload.append({
                    'id': alert.wazuh_id,
                    'title': alert.title,
                    'timestamp': alert.timestamp.isoformat() if alert.timestamp else None,
                    'rule_level': alert.rule_level,
                    'source': alert.source,
                    'status': ai_status,
                    'alert_status': alert.status,
                    'verdict': verdict,
                    'ai_analysis_results': raw.get('ai_analysis_results', {}),
                    'graph_state': graph_state,
                    'raw_data': raw,
                    'thehive_id': alert.thehive_id,
                    'thehive_url': settings.thehive_url if alert.thehive_id else None,
                    'flowintel_id': alert.flowintel_id,
                    'flowintel_url': settings.flowintel_url if alert.flowintel_id else None,
                    'case_url': f"{settings.thehive_url.rstrip('/')}/alerts/{alert.thehive_id}/details" if alert.thehive_id else (f"{settings.flowintel_url.rstrip('/')}/case/{alert.flowintel_id}" if alert.flowintel_id else None),
                })

             await sio.emit('alert_history', {
                 'alerts': history_payload,
                 'is_append': is_append
             }, room=sid)
             print(f"✅ History sync complete: {len(history_payload)} items (is_append={is_append})")
        except Exception as e:
             print(f"⚠️ [Socket] Manual sync failed: {str(e)}")

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    print(f"🔌 Client disconnected: {sid}")

@sio.on('stop_scan')
async def handle_stop_scan(sid, data):
    """Handle request to stop an active scan"""
    alert_id = data.get('alert_id')
    print(f"📡 [Socket] Received stop_scan request for ID: {alert_id} from {sid}")
    
    # 1. Cancel the async task if it exists
    if alert_id in active_scans:
        print(f"🛑 [Socket] Task found! Cancelling scan for alert: {alert_id}")
        task = active_scans.pop(alert_id)
        task.cancel()
    
    # 2. PERSIST the failed status so it doesn't revert on refresh
    from app.services.alert_service import AlertService
    async with AsyncSessionLocal() as db:
        try:
            await AlertService.update_ai_results(
                db, alert_id, 
                node_results={'agent_judge': {'status': 'Failed', 'analysis_reasoning': 'Scan cancelled by operator.'}}, 
                status='failed'
            )
            print(f"💾 [Socket] Persisted 'failed' status for stopped scan: {alert_id}")
        except Exception as e:
            print(f"⚠️ [Socket] Failed to persist stop status: {str(e)}")

    # 3. Notify UI
    await sio.emit('agent_update', {
        'alert_id': alert_id,
        'node': 'error',
        'pipeline_status': 'failed',
        'log': '🛑 Scan halted by operator.'
    })

async def trigger_ai_scan(alert_id: str, alert_data: dict):
    """
    Unified entry point for triggering an AI scan.
    Can be called from Socket.IO events or from the Webhook.
    """
    if alert_id in active_scans:
        print(f"🛑 [Socket] Scan already in progress for {alert_id}. Cancelling to initiate Re-scan.")
        task = active_scans.pop(alert_id)
        task.cancel()
        # Non-blocking wait for cancellation if possible
        try:
             await asyncio.sleep(0) # Give event loop a chance
        except: pass

    # Create background task
    task = asyncio.create_task(run_scan_pipeline(alert_id, alert_data))
    active_scans[alert_id] = task
    
    # Clean up when task is done
    def on_task_done(t):
        if active_scans.get(alert_id) == t:
            active_scans.pop(alert_id, None)
            print(f"🧹 [Socket] Cleaned up completed/cancelled task for: {alert_id}")
            
    task.add_done_callback(on_task_done)
    return task

@sio.on('save_graph_state')
async def handle_save_graph(sid, data):
    """Save the full graph node/edge positions to the backend for universal sync"""
    alert_id = data.get('alert_id')
    nodes = data.get('nodes', [])
    edges = data.get('edges', [])
    
    if not alert_id: return
    
    from app.services.alert_service import AlertService
    async with AsyncSessionLocal() as db:
        try:
            success = await AlertService.update_graph_layout(db, alert_id, nodes, edges)
            if success:
                print(f"📊 [Socket] Graph Layout synced to DB for: {alert_id}")
        except Exception as e:
            print(f"⚠️ [Socket] Graph Sync Failed: {str(e)}")
@sio.on('initiate_scan')
async def handle_initiate_scan(sid, data):
    """Handle AI scan initiation from frontend"""
    alert_id = data.get('alert_id')
    await trigger_ai_scan(alert_id, data.get('alert_data'))

@sio.on('generate_report')
async def handle_generate_report(sid, data):
    """Handle request to generate a detailed PDF report for an investigation (Non-blocking)"""
    alert_id = data.get('alert_id')
    print(f"📄 [Report] Generation requested for: {alert_id}")
    
    event_data = data.get('event_data')
    
    # 1. Validate Data
    if not alert_id or not event_data:
        err_msg = 'Missing alertID or event_data for report.'
        print(f"❌ [Report] Validation Failed: {err_msg}")
        await sio.emit('report_error', {
            'alert_id': alert_id,
            'error': err_msg
        })
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'error',
            'pipeline_status': 'failed', # Force UI to stop loading
            'log': f'[Report] Failed: {err_msg}'
        })
        return

    # Import moved to top level
    try:
        # 2. Notify User: Starting
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'responder',
            'log': '[Report] Compiling AI analysis and formatting PDF...'
        })
        
        # 3. Offload to Thread Pool (Non-Blocking)
        loop = asyncio.get_running_loop()
        
        from app.services.report_service import report_service
        # Force run in executor to prevent freezing the event loop
        report_result = await loop.run_in_executor(
            None, 
            report_service.generate_pdf_report, 
            alert_id, 
            event_data
        )
        
        if report_result and isinstance(report_result, dict):
            b64_pdf = report_result.get("base64")
            report_path = report_result.get("path")
            filename = f"{settings.product_name}_Report_{alert_id}.pdf"
            
            print(f"✅ [Report] Success: {len(b64_pdf) if b64_pdf else 0} bytes")
            
            # Emit Success Log
            await sio.emit('agent_update', {
                'alert_id': alert_id,
                'node': 'responder',
                'log': f'[Report] Download Ready',
                'data': {
                    'report_path': report_path
                }
            })

            # Emit Download Event with DATA payload
            # Frontend will decode base64 -> Blob
            await sio.emit('report_generated', {
                'alert_id': alert_id,
                'file_data': b64_pdf,  # Base64 string
                'filename': filename,
                'report_path': report_path
            })
        else:
             raise Exception("Report service returned invalid result (Unknown Error)")
        
    except Exception as e:
        print(f"❌ [Report] CRITICAL FAILURE: {str(e)}")
        traceback.print_exc() # PRINT FULL STACK TRACE TO CONSOLE
        
        await sio.emit('report_error', {
            'alert_id': alert_id,
            'error': f"Generation Failed: {str(e)}"
        })
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'error',
            'log': f'[Report] Exception: {str(e)}'
        })

async def run_scan_pipeline(alert_id: str, raw_data: any):
    """The actual async pipeline logic"""
    print(f"🚀 [Socket] AI Scan pipeline started for alert: {alert_id}")

    from app.services.alert_service import AlertService

    # Always source clean Wazuh data from DB to prevent AI output from previous scans
    # from contaminating re-scans (ai_status/ai_analysis_results/verdict/graph_layout are
    # written back into raw_data by update_ai_results and must be stripped before agents see it).
    _AI_KEYS = {'ai_status', 'ai_analysis_results', 'verdict', 'graph_layout'}
    async with AsyncSessionLocal() as db:
        db_alert = await AlertService.get_alert_by_wazuh_id(db, alert_id)
        if db_alert and db_alert.raw_data:
            raw_data = {k: v for k, v in db_alert.raw_data.items() if k not in _AI_KEYS}
            print(f"✅ [Socket] Loaded clean Wazuh data from DB for {alert_id} ({len(raw_data)} keys)")

        # Reset AI state so re-scan starts visually and logically fresh
        await AlertService.update_graph_layout(db, alert_id, [], [])
        await AlertService.update_ai_results(db, alert_id, {}, status='running', clear_verdict=True)

    await sio.emit('agent_update', {
        'alert_id': alert_id,
        'node': 'reset',
        'pipeline_status': 'running',
        'log': '♻️ Starting fresh investigation sequence...'
    })
    
    if not raw_data:
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'error',
            'pipeline_status': 'failed', # Force UI to stop loading
            'log': '[Error] No alert data provided'
        })
        return
    
    try:
        # Move imports inside to break circularity
        from app.agents.agent_extractor import IocExtractor
        
        # Emit initial status
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_screener',
            'log': '[IOC Extractor] Starting extraction...'
        })
        
        # Phase 1: IOC Extraction
        extractor = IocExtractor()
        try:
            # Added safety timeout matching the LLM 120s timeout + overhead
            extracted_data = await asyncio.wait_for(
                extractor.run(alert_id=alert_id, raw_data=raw_data),
                timeout=120
            )
        except asyncio.TimeoutError:
            print(f"⌛ [Socket] Agent 1 TIMEOUT for {alert_id}")
            extracted_data = {
                "identities": [], "network": [], "system": [], "files": [],
                "status": "Failed",
                "summary": "Agent 1 timed out after 2 minutes."
            }
        except Exception as e:
            print(f"❌ [Socket] Agent 1 CRASHED: {str(e)}")
            extracted_data = {
                "identities": [], "network": [], "system": [], "files": [],
                "status": "Failed",
                "summary": f"Agent 1 error: {str(e)}"
            }
        # ABORT PIPELINE if Agent 1 failed
        if extracted_data.get("status") == "Failed":
            print(f"🛑 [Socket] Agent 1 failed for {alert_id}. Aborting pipeline.")
            await sio.emit('agent_update', {
                'alert_id': alert_id,
                'node': 'error',
                'pipeline_status': 'failed',
                'log': f"🛑 Investigation halted: {extracted_data.get('summary', 'Agent 1 failed.')}"
            })
            return
        # Check if extraction returned observables
        # [NEW] Enriched format for UI, Flat format for Agent 2
        enriched_data = {
            'network': extracted_data.get('network', []),
            'files': extracted_data.get('files', []),
            'system': extracted_data.get('system', []),
            'identities': extracted_data.get('identities', [])
        }
        
        # Flatten for Investigator (Agent 2 expects List[str])
        observables = {
            k: [obj.get('value') if isinstance(obj, dict) else str(obj) for obj in v] 
            for k, v in enriched_data.items()
        }
        
        total_iocs = sum(len(v) for v in observables.values())
        
        if total_iocs == 0:
             log_msg = '[IOC Extractor] No technical IOCs identified. Proceeding to behavioral analysis.'
        else:
             log_msg = f'[IOC Extractor] Extracted {total_iocs} IOCs'

        # Emit extraction complete (Unified)
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_screener',
            'log': log_msg,
            'model': extracted_data.get('model'),
            'data': {
                **enriched_data, # Send structured data to UI
                'log_source': extracted_data.get('log_source', 'Security Logs'),
                'summary': extracted_data.get('summary', 'No summary generated.'),
                'status': extracted_data.get('status', 'Complete'),
                'model': extracted_data.get('model')
            }
        })
        
        # PERSIST: Save Agent 1 results to DB for history/refresh support
        from app.services.alert_service import AlertService
        screener_for_db = {
            **observables,
            'summary': extracted_data.get('summary', 'No summary generated.'),
            'log_source': extracted_data.get('log_source', 'Wazuh Alert Data')
        }
        
        async with AsyncSessionLocal() as db:
            await AlertService.update_ai_results(
                db, alert_id, 
                node_results={'agent_screener': screener_for_db}, 
                status='investigating'
            )
        
        # Phase 2: Investigation (ALWAYS RUN for Context/Frequency)
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_investigator',
            'log': '[Investigator] Starting investigation...'
        })
        
        from app.agents.agent_investigator import AgentInvestigator
        async with AsyncSessionLocal() as db:
            investigator = AgentInvestigator()
            try:
                # Standardized 3-minute safety timeout for Investigator
                investigation_results = await asyncio.wait_for(
                    investigator.run(
                        alert_id=alert_id,
                        observables=observables,
                        raw_data=raw_data,
                        db=db
                    ),
                    timeout=120
                )
            except asyncio.TimeoutError:
                print(f"⌛ [Socket] Agent 2 TIMEOUT for {alert_id}")
                investigation_results = {
                    "external_intel": [],
                    "source": None,
                    "rule_count": 0,
                    "rule_on_host": 0,
                    "is_burst": False,
                    "burst_global": 0,
                    "burst_source": 0,
                    "is_suspicious_cooc": False,
                    "cooc_distinct": 0,
                    "is_unusual_timing": False,
                    "hour_pct": 0,
                    "current_hour": 0,
                    "status": "Failed",
                    "summary": "Agent 2 timed out after 2 minutes."
                }
            except Exception as e:
                print(f"❌ [Socket] Agent 2 CRASHED: {str(e)}")
                investigation_results = {
                    "external_intel": [],
                    "source": None,
                    "rule_count": 0,
                    "rule_on_host": 0,
                    "is_burst": False,
                    "burst_global": 0,
                    "burst_source": 0,
                    "is_suspicious_cooc": False,
                    "cooc_distinct": 0,
                    "is_unusual_timing": False,
                    "hour_pct": 0,
                    "current_hour": 0,
                    "status": "Failed"
                }
        # ABORT PIPELINE if Agent 2 failed
        if investigation_results.get("status") == "Failed":
            reason = investigation_results.get('summary', 'Agent 2 failed.')
            print(f"🛑 [Socket] Agent 2 failed for {alert_id}. Reason: {reason}")
            
            # Update DB with descriptive error verdict
            from app.services.alert_service import AlertService
            async with AsyncSessionLocal() as db:
                error_verdict = "Error: Timeout" if "timeout" in reason.lower() else "Error: Failed"
                await AlertService.update_ai_results(db, alert_id, {}, status='failed', verdict=error_verdict)

            await sio.emit('agent_update', {
                'alert_id': alert_id,
                'node': 'error',
                'pipeline_status': 'failed',
                'verdict': error_verdict,
                'log': f"🛑 Investigation halted: {reason}"
            })
            return
        # DEBUG: Print keys to verify internal_context existence
        print(f"🕵️ [Socket] Agent 2 Results Keys: {list(investigation_results.keys())}")
        
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_investigator',
            'log': f'[Investigator] Investigation complete. Analyzed {total_iocs} IOCs',
            'data': {
                **investigation_results,
                "sources_queried": list(set([intel.get("tool") for intel in investigation_results.get("external_intel", []) if intel.get("tool")])),
                "frequency": investigation_results.get("rule_count", 1)
            }
        })

        # PERSIST: Save Agent 2 results to DB
        from app.services.alert_service import AlertService
        async with AsyncSessionLocal() as db:
            # We now use keyword arguments for safety and support merging in AlertService
            full_results = {
                'agent_screener': screener_for_db,
                'agent_investigator': investigation_results
            }
            await AlertService.update_ai_results(
                db, alert_id, 
                node_results=full_results, 
                status='investigating'
            )

        # Phase 3: Judgment (Agent 3)
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_judge',
            'log': '[Judge] Synthesizing evidence for final verdict...'
        })
        
        from app.agents.agent_judge import AgentJudge
        judge = AgentJudge()
        try:
            # Standardized 1-minute safety timeout for Judge
            verdict = await asyncio.wait_for(
                judge.run(
                    alert_id=alert_id,
                    extraction_data={"observables": observables, "counts": {k: len(v) for k,v in observables.items()}},
                    investigation_data=investigation_results,
                    raw_log=raw_data
                ),
                timeout=120
            )
        except asyncio.TimeoutError:
            print(f"⌛ [Socket] Agent 3 TIMEOUT for {alert_id}")
            verdict = {
                "verdict": "Suspicious",
                "confidence_score": 0,
                "severity": "Unknown",
                "analysis_reasoning": "Agent 3 (Judge) timed out after 2 minutes. Manual review required.",
                "failed": True
            }
        except Exception as e:
            print(f"❌ [Socket] Agent 3 CRASHED: {str(e)}")
            verdict = {"failed": True, "analysis_reasoning": f"Agent 3 error: {str(e)}"}

        if verdict.get("failed"):
            reason = verdict.get("analysis_reasoning", "Unknown Error")
            print(f"🛑 [Socket] Agent 3 failed for {alert_id}. Reason: {reason}")
            
            # Update DB with descriptive error verdict
            from app.services.alert_service import AlertService
            async with AsyncSessionLocal() as db:
                error_verdict = "Error: Judge Timeout" if "timeout" in reason.lower() else "Error: Judge Failed"
                await AlertService.update_ai_results(db, alert_id, {}, status='failed', verdict=error_verdict)

            await sio.emit('agent_update', {
                'alert_id': alert_id,
                'node': 'agent_judge',
                'pipeline_status': 'failed',
                'verdict': error_verdict,
                'log': f'[Judge] Analysis Failed. Reason: {reason}',
                'data': verdict
            })
            return

        # Emit completion ONLY on success
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'agent_judge',
            'pipeline_status': 'completed',
            'log': f'[Judge] Case Closed. Verdict: {verdict.get("verdict")}',
            'data': {**verdict, "status": "Complete"}
        })

        # PERSIST: Save final results and verdict to DB
        from app.services.alert_service import AlertService
        async with AsyncSessionLocal() as db:
            full_results = {
                'agent_screener': screener_for_db,
                'agent_investigator': investigation_results,
                'agent_judge': verdict
            }
            await AlertService.update_ai_results(
                db, alert_id, 
                node_results=full_results, 
                status='completed', 
                verdict=verdict.get('verdict')
            )

        # --- PHASE 4: AUTOMATED ESCALATION (CRITICAL AUTOMATION) ---
        rule_level = raw_data.get('rule_level', 0)
        flowintel_id = None

        if rule_level >= 7 and not verdict.get("failed"):
            try:
                print(f"🚀 [Socket] Level {rule_level} Detected. Auto-escalating to Flowintel...")
                
                # Context assembly for Flowintel
                escalation_context = {
                    "node_results": {
                        "agent_screener": {
                            "network": observables.get('network', []),
                            "files": observables.get('files', []),
                            "identities": observables.get('identities', []),
                            "system": observables.get('system', []),
                            "summary": extracted_data.get('summary', '')
                        },
                        "agent_investigator": investigation_results,
                        "agent_judge": verdict
                    }
                }
                
                # Metadata
                title = raw_data.get('title', 'AI Escalation')
                agent = raw_data.get('source', 'Unknown Agent')
                
                # Trigger Escalation
                from app.services.flowintel_service import flowintel_service
                async with AsyncSessionLocal() as esc_db:
                    res = await flowintel_service.create_case(
                        alert_id=alert_id,
                        event_data=escalation_context,
                        alert_title=title,
                        alert_agent=agent,
                        rule_level=rule_level,
                        db=esc_db
                    )
                flowintel_id = res.get("id")
                
                await sio.emit('agent_update', {
                    'alert_id': alert_id,
                    'node': 'responder',
                    'log': f'📤 Automatically escalated to Flowintel (ID: {flowintel_id})'
                })

            except Exception as esc_err:
                print(f"❌ [Socket] Auto-escalation failed: {esc_err}")
                await sio.emit('agent_update', {
                    'alert_id': alert_id,
                    'node': 'error',
                    'log': f'[Flowintel] Auto-escalation failed: {str(esc_err)}'
                })

        # NO-OP: Persistence handled at each agent step now

        # Final Pipeline Completion
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'pipeline_status': 'completed',
            'flowintel_id': flowintel_id
        })

        print(f"✅ [Socket] AI Scan pipeline complete for alert: {alert_id}")
        
    except asyncio.CancelledError:
        print(f"🛑 [Socket] Pipeline explicitly cancelled for: {alert_id}")
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'error',
            'pipeline_status': 'failed',
            'log': '🛑 Pipeline Task Terminated.'
        })
        raise

    except Exception as e:
        logger.error(f"❌ [Socket] Error during AI scan: {str(e)}")
        import traceback
        traceback.print_exc()
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'node': 'error',
            'pipeline_status': 'failed', # Force UI to stop loading
            'log': f'[Error] {str(e)}'
        })
    finally:
        # Cleanup task tracking
        if alert_id in active_scans:
            active_scans.pop(alert_id, None)
            print(f"🧹 [Socket] Cleaned up status for: {alert_id}")

# Export singleton instance
__all__ = ['sio', 'socket_app', 'check_services_health', 'reload_integration_settings']
