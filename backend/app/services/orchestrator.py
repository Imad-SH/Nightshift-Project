import asyncio
from app.core.socket import sio
from app.agents.agent_extractor import ioc_extractor
from app.agents.agent_investigator import agent_investigator
from app.agents.agent_judge import agent_judge
from app.core.database import AsyncSessionLocal

class Orchestrator:
    """
    AI Orchestration Layer - Handles the Cognitive Pipeline
    Ref: SOC Cognitif V2.1 Architecture
    """

    @staticmethod
    async def dispatch_investigation(alert_id: str, raw_data: dict, title: str, rule_level: int = 0):
        """
        Async Dispatcher: Spawns the worker pipeline for a new alert.
        Enforces a Strategy Gate:
        - OPTIMIZED: Severity (rule_level) must be >= 7.
        - AGGRESSIVE: Process everything.
        """
        from app.models.settings import SystemSettings
        from sqlalchemy.future import select

        # 1. Fetch Threshold Range from DB
        min_threshold = 7 # Default
        max_threshold = 15 # Default
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(SystemSettings).where(SystemSettings.key.in_(["ai_analysis_min_threshold", "ai_analysis_max_threshold"])))
                settings = result.scalars().all()
                for s in settings:
                    if s.key == "ai_analysis_min_threshold":
                        min_threshold = int(s.value)
                    elif s.key == "ai_analysis_max_threshold":
                        max_threshold = int(s.value)
        except Exception as e:
            print(f"⚠️ [Dispatcher] Failed to fetch threshold range, defaulting to 7-15: {e}")

        # 2. Enforce Gate
        if not (min_threshold <= rule_level <= max_threshold):
            print(f"⏭️ [Dispatcher] [RANGE] Skipping alert {alert_id}: Severity {rule_level} not in [{min_threshold}-{max_threshold}].")
            return

        print(f"🚀 [Dispatcher] [RANGE] Spawning pipeline for alert: {alert_id} (Severity: {rule_level})")
        asyncio.create_task(Orchestrator._run_pipeline(alert_id, raw_data, title))

    @staticmethod
    async def _run_pipeline(alert_id: str, raw_data: dict, title: str):
        """
        The Orchestrator: Manages the transition between agents.
        """
        try:
            # 1. IoC EXTRACTOR (Agent 1)
            observables = await ioc_extractor.run(alert_id, raw_data)
            
            # Use Database Session for subsequent agents
            async with AsyncSessionLocal() as db:
                # 2. SMART INVESTIGATOR (Agent 2)
                # Chains observables from Agent 1 into deeper investigation
                # Using the NEW AgentInvestigator architecture
                investigation = await agent_investigator.run(alert_id, observables, raw_data, db=db)

                # 3. AI JUDGE (Agent 3)
                # Strip ioc_fingerprint — it's tooltip-only context, not evidence for the judge
                judge_input = {k: v for k, v in investigation.items() if k != 'ioc_fingerprint'}
                verdict = await agent_judge.run(alert_id, judge_input, raw_data)
                
                # Final Completion Update with Verdict
                await sio.emit('agent_update', {
                    "alert_id": alert_id,
                    "node": "responder",
                    "log": f"[COMPLETED] Investigation finished: {verdict.verdict_label}",
                    "state": {
                        "verdict": verdict.verdict_label,
                        "score": verdict.verdict_score,
                        "justification": verdict.justification,
                        "risk_factors": verdict.risk_factors
                    }
                })

        except Exception as e:
            print(f"❌ [Pipeline Error] Alert {alert_id}: {e}")
            await sio.emit('agent_update', {
                "alert_id": alert_id,
                "node": "error",
                "log": f"[ERROR] Pipeline failed: {str(e)}"
            })

orchestrator = Orchestrator()
