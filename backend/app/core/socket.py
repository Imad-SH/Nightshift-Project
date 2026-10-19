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
    cors_allowed_origins=(settings.socketio_cors_allowed_origins.strip() if settings.socketio_cors_allowed_origins.strip() == "*"
                          else [o.strip() for o in settings.socketio_cors_allowed_origins.split(",") if o.strip()]),
    # Packet-level logging writes every alert payload to the logs: keep it off.
    logger=settings.debug,
    engineio_logger=False,
    max_http_buffer_size=10 * 1024 * 1024  # 10MB
)

# ASGI application for Socket.IO. Mounted at the root in main.py (after the HTTP routes);
# it only answers /socket.io/ so it never shadows other paths.
socket_app = socketio.ASGIApp(sio, socketio_path="socket.io")

# Track active scan tasks
active_scans = {}


def _alert_payload(alert) -> dict:
    """An alert as sent to the UI when (re)loading history."""
    from app.services import integrations
    raw = alert.raw_data or {}
    return {
        'id': alert.wazuh_id,
        'title': alert.title,
        'timestamp': alert.timestamp.isoformat() if alert.timestamp else None,
        'rule_level': alert.rule_level,
        'source': alert.source,
        'source_system': alert.source_system or 'wazuh',
        'status': raw.get('ai_status', 'idle'),
        'alert_status': alert.status,
        'verdict': raw.get('verdict', alert.verdict),
        'ai_analysis_results': raw.get('ai_analysis_results', {}),
        'graph_state': raw.get('graph_layout', None),
        'raw_data': raw,
        'thehive_id': alert.thehive_id,
        'thehive_url': settings.thehive_url if alert.thehive_id else None,
        'flowintel_id': alert.flowintel_id,
        'flowintel_url': settings.flowintel_url if alert.flowintel_id else None,
        'case_system': alert.case_system,
        'case_id': alert.case_id,
        'case_url': integrations.case_link(alert),
    }

@sio.event
async def connect(sid, environ, auth=None):
    """Handle client connection with history re-hydration"""
    # Same identity check as the HTTP API: a valid Keycloak access token is required,
    # since this channel carries every alert and can start (paid) AI scans.
    token = auth.get("token") if isinstance(auth, dict) else None
    if not token:
        raise socketio.exceptions.ConnectionRefusedError("authentication required")
    try:
        from app.core.security import verify_jwt
        user = await asyncio.to_thread(verify_jwt, token)
    except Exception:
        raise socketio.exceptions.ConnectionRefusedError("invalid or expired token")
    await sio.save_session(sid, {"username": user.get("preferred_username")})
    print(f"🔌 Client connected: {sid} ({user.get('preferred_username')})")
    
    # 1. Immediately confirm connection to restore "ONLINE" status
    await sio.emit('connection_established', {'status': 'connected'}, room=sid)
    
    # 2. Immediately send last known service status for instant UI sync
    from app.services import integrations
    await sio.emit('service_status', integrations.service_status(), room=sid)

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
            history_payload = [_alert_payload(alert) for alert in db_alerts]

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

                 
             history_payload = [_alert_payload(alert) for alert in db_alerts]

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

        # Normalized fields, the same for every source: used for internal context and escalation
        _fallback = raw_data if isinstance(raw_data, dict) else {}
        alert_info = {
            'title': db_alert.title if db_alert else _fallback.get('title', 'AI Escalation'),
            'source': db_alert.source if db_alert else _fallback.get('source', 'Unknown Agent'),
            'score': (db_alert.rule_level if db_alert else _fallback.get('rule_level', 0)) or 0,
        }

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
            # Record the failure, as for Agents 2 and 3, so the alert does not stay "running"
            reason = extracted_data.get('summary', 'Agent 1 failed.')
            error_verdict = "Error: Timeout" if "timed out" in reason.lower() else "Error: Extractor Failed"
            async with AsyncSessionLocal() as db:
                await AlertService.update_ai_results(db, alert_id, {}, status='failed', verdict=error_verdict)
            await sio.emit('agent_update', {
                'alert_id': alert_id,
                'node': 'error',
                'pipeline_status': 'failed',
                'verdict': error_verdict,
                'log': f"🛑 Investigation halted: {reason}"
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
                        raw_data={**raw_data, 'title': alert_info['title'], 'source': alert_info['source']},
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

        # --- PHASE 4: AUTOMATED ESCALATION to the active SOAR (Integrations > Auto-escalation) ---
        from app.services import integrations
        from app.connectors.base import EscalationRequest
        case_info = {}
        if integrations.should_auto_escalate(alert_info['score'], verdict.get('verdict')):
            soar = integrations.active_soar()
            try:
                print(f"🚀 [Socket] Severity {alert_info['score']}, verdict {verdict.get('verdict')}: auto-escalating to {soar.name}...")
                async with AsyncSessionLocal() as esc_db:
                    result = await integrations.escalate(esc_db, EscalationRequest(
                        alert_id=alert_id,
                        title=alert_info['title'],
                        source=alert_info['source'],
                        score=alert_info['score'],
                        node_results={
                            "agent_screener": {
                                "network": observables.get('network', []),
                                "files": observables.get('files', []),
                                "identities": observables.get('identities', []),
                                "system": observables.get('system', []),
                                "summary": extracted_data.get('summary', '')
                            },
                            "agent_investigator": investigation_results,
                            "agent_judge": verdict
                        },
                        is_ai_analyzed=True,
                    ))
                case_info = integrations.case_fields(soar.id, result.case_id, result.case_url)
            except integrations.AlreadyEscalated:
                print(f"ℹ️ [Socket] {alert_id} already has a case in {soar.name}; not escalating again.")
            except Exception as esc_err:
                print(f"❌ [Socket] Auto-escalation failed: {esc_err}")
                await sio.emit('agent_update', {
                    'alert_id': alert_id,
                    'node': 'error',
                    'log': f'[{soar.name}] Auto-escalation failed: {str(esc_err)}'
                })

        # NO-OP: Persistence handled at each agent step now

        # Final Pipeline Completion
        await sio.emit('agent_update', {
            'alert_id': alert_id,
            'pipeline_status': 'completed',
            'flowintel_id': None,
            **case_info
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
        try:
            async with AsyncSessionLocal() as db:
                await AlertService.update_ai_results(db, alert_id, {}, status='failed', verdict="Error: Failed")
        except Exception as persist_err:
            print(f"⚠️ [Socket] Could not record the failed scan: {persist_err}")
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
__all__ = ['sio', 'socket_app', 'trigger_ai_scan']
