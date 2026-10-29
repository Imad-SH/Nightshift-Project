from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.models.alert import AlertModel
from typing import List, Optional
from datetime import datetime, timezone
import json

class AlertService:
    @staticmethod
    async def create_alert(db: AsyncSession, alert_data: dict) -> AlertModel:
        """Create a new alert in the database with proper schema alignment"""
        
        # Extract the actual raw data if it's nested (prevents double-wrapping)
        # The frontend/webhook often sends StandardAlert which contains raw_data
        actual_raw = alert_data.get('raw_data', alert_data)
        
        wazuh_id = alert_data.get('id', '000000')

        db_alert = AlertModel(
            wazuh_id=wazuh_id,
            title=alert_data.get('title', 'Unknown Alert'),
            description=alert_data.get('description'), 
            level=str(alert_data.get('level', 'info')),
            rule_level=int(alert_data.get('rule_level', 0)),
            source=alert_data.get('source', 'Unknown'),
            status=alert_data.get('status', 'new'),
            verdict=alert_data.get('verdict'),
            raw_data=actual_raw,
            source_system=alert_data.get('source_system') or 'wazuh',
        )
        db.add(db_alert)
        await db.commit()
        await db.refresh(db_alert)
        return db_alert

    @staticmethod
    async def get_alerts(db: AsyncSession, limit: int = 200, skip: int = 0) -> List[AlertModel]:
        """Get recent alerts with pagination support"""
        result = await db.execute(
            select(AlertModel).order_by(AlertModel.timestamp.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_alerts_since(db: AsyncSession, start_time: datetime, limit: int = 200, skip: int = 0) -> List[AlertModel]:
        """Get alerts since a specific timestamp with offset pagination support"""
        result = await db.execute(
            select(AlertModel)
            .where(AlertModel.timestamp >= start_time)
            .order_by(AlertModel.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_alerts_between(db: AsyncSession, start_time: datetime, end_time: datetime, limit: int = 200, skip: int = 0) -> List[AlertModel]:
        """Get alerts explicitly between two timestamps"""
        result = await db.execute(
            select(AlertModel)
            .where(AlertModel.timestamp >= start_time)
            .where(AlertModel.timestamp <= end_time)
            .order_by(AlertModel.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_alert_by_wazuh_id(db: AsyncSession, wazuh_id: str) -> Optional[AlertModel]:
        """Check if alert exists"""
        result = await db.execute(
            select(AlertModel).where(AlertModel.wazuh_id == wazuh_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_alert_frequency(db: AsyncSession, title: str, agent_name: str) -> int:
        """Get occurrence count of an alert title on a specific agent for frequency analysis"""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.title == title)
            .where(AlertModel.source.like(f"{agent_name}%")) # Matches "name" or "name (ip)"
        )
        return result.scalar() or 0

    @staticmethod
    async def get_alert_frequency_stats(db: AsyncSession, title: str, agent_name: str) -> dict:
        """Get occurrence count and first seen date of an alert title on a specific agent"""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(AlertModel.id), func.min(AlertModel.timestamp))
            .where(AlertModel.title == title)
            .where(AlertModel.source.like(f"{agent_name}%"))
        )
        row = result.first()
        if row:
            count, first_seen = row
            return {"count": count or 0, "first_seen": first_seen}
        return {"count": 0, "first_seen": None}

    @staticmethod
    async def get_rule_frequency_stats(db: AsyncSession, rule_title: str) -> dict:
        """How many times has this rule fired across ALL agents, and when was it first seen"""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(AlertModel.id), func.min(AlertModel.timestamp), func.count(func.distinct(AlertModel.source)))
            .where(AlertModel.title == rule_title)
        )
        row = result.first()
        if row:
            count, first_seen, agent_count = row
            return {"count": count or 0, "first_seen": first_seen, "agent_count": agent_count or 0}
        return {"count": 0, "first_seen": None, "agent_count": 0}

    @staticmethod
    async def get_agent_frequency_stats(db: AsyncSession, agent_name: str) -> dict:
        """How many total alerts has this agent generated, and how many distinct rule types"""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(AlertModel.id), func.count(func.distinct(AlertModel.title)))
            .where(AlertModel.source.like(f"{agent_name}%"))
        )
        row = result.first()
        if row:
            total_count, distinct_rules = row
            return {"total_count": total_count or 0, "distinct_rules": distinct_rules or 0}
        return {"total_count": 0, "distinct_rules": 0}

    @staticmethod
    async def get_burst_stats(db: AsyncSession, rule_title: str, source: str, alert_time=None) -> dict:
        """Count how many times this rule fired in the 15 minutes around the alert timestamp."""
        from sqlalchemy import func
        from datetime import datetime, timedelta, timezone

        ref = alert_time if alert_time else datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        fifteen_min_ago = ref - timedelta(minutes=15)
        source_name = source.split(' (')[0] if ' (' in source else source

        global_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.title == rule_title)
            .where(AlertModel.timestamp >= fifteen_min_ago)
            .where(AlertModel.timestamp <= ref)
        )
        global_count = global_result.scalar() or 0

        source_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.title == rule_title)
            .where(AlertModel.source.like(f"{source_name}%"))
            .where(AlertModel.timestamp >= fifteen_min_ago)
            .where(AlertModel.timestamp <= ref)
        )
        source_count = source_result.scalar() or 0

        return {
            "global_count": global_count,
            "source_count": source_count,
            "is_burst": global_count >= 3,
        }

    @staticmethod
    async def get_cooccurrence_stats(db: AsyncSession, source: str, alert_time=None) -> dict:
        """Count distinct rules fired from this source in the 1 hour before the alert."""
        from sqlalchemy import func
        from datetime import datetime, timedelta, timezone

        ref = alert_time if alert_time else datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        one_hour_ago = ref - timedelta(hours=1)
        source_name = source.split(' (')[0] if ' (' in source else source

        result = await db.execute(
            select(AlertModel.title, func.count(AlertModel.id).label('count'))
            .where(AlertModel.source.like(f"{source_name}%"))
            .where(AlertModel.timestamp >= one_hour_ago)
            .where(AlertModel.timestamp <= ref)
            .group_by(AlertModel.title)
            .order_by(func.count(AlertModel.id).desc())
        )
        rows = result.fetchall()
        distinct_count = len(rows)

        return {
            "distinct_rules": distinct_count,
            "rules": [{"title": r[0], "count": r[1]} for r in rows[:5]],
            "is_suspicious": distinct_count >= 3,
        }

    @staticmethod
    async def get_time_anomaly_stats(db: AsyncSession, rule_title: str, alert_time=None) -> dict:
        """Check if this rule fired at an unusual hour relative to its 30-day history ending at the alert timestamp."""
        from sqlalchemy import func, extract
        from datetime import datetime, timedelta, timezone

        ref = alert_time if alert_time else datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        thirty_days_ago = ref - timedelta(days=30)
        alert_hour = ref.hour
        is_weekend = ref.weekday() >= 5

        result = await db.execute(
            select(
                extract('hour', AlertModel.timestamp).label('hour'),
                func.count(AlertModel.id).label('count')
            )
            .where(AlertModel.title == rule_title)
            .where(AlertModel.timestamp >= thirty_days_ago)
            .where(AlertModel.timestamp <= ref)
            .group_by(extract('hour', AlertModel.timestamp))
        )
        hour_dist = {int(r[0]): r[1] for r in result.fetchall()}
        total = sum(hour_dist.values()) or 0
        current_hour_count = hour_dist.get(alert_hour, 0)
        current_hour_pct = round((current_hour_count / total) * 100, 1) if total > 0 else 0.0
        is_unusual_timing = current_hour_pct < 2.0 and total >= 10

        return {
            "current_hour": alert_hour,
            "alert_time_utc": ref.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "current_hour_pct": current_hour_pct,
            "is_unusual_timing": is_unusual_timing,
            "is_weekend": is_weekend,
            "total_historical": total,
        }

    @staticmethod
    async def get_rule_velocity_stats(db: AsyncSession, rule_title: str) -> dict:
        """Calculate temporal velocity: baseline rate vs current spiking rate for a rule"""
        from sqlalchemy import func
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        six_hours_ago = now - timedelta(hours=6)

        # Baseline: count alerts in last 30 days → per-day average
        baseline_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.title == rule_title)
            .where(AlertModel.timestamp >= thirty_days_ago)
        )
        baseline_count = baseline_result.scalar() or 0
        baseline_per_day = baseline_count / 30.0 if baseline_count > 0 else 0.1  # avoid division by zero

        # Current rate: count alerts in last 6 hours → extrapolate to per-day
        current_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.title == rule_title)
            .where(AlertModel.timestamp >= six_hours_ago)
        )
        current_count = current_result.scalar() or 0
        current_per_day = (current_count / 6.0) * 24 if current_count > 0 else 0  # 6h → 24h extrapolation

        # Velocity: acceleration factor (current rate / baseline rate)
        velocity = current_per_day / baseline_per_day if baseline_per_day > 0 else 1.0

        return {
            "baseline_per_day": round(baseline_per_day, 2),
            "current_per_day": round(current_per_day, 2),
            "velocity": round(velocity, 2),
            "is_spiking": velocity > 5.0,  # > 5x acceleration = anomaly
        }

    @staticmethod
    async def get_rule_host_frequency_stats(db: AsyncSession, rule_title: str, agent_name: str) -> dict:
        """Count how many times THIS rule has fired on THIS specific endpoint"""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(AlertModel.id), func.min(AlertModel.timestamp), func.max(AlertModel.timestamp))
            .where(AlertModel.title == rule_title)
            .where(AlertModel.source.like(f"{agent_name}%"))
        )
        row = result.first()
        if row:
            count, first_seen, last_seen = row
            return {"count": count or 0, "first_seen": first_seen, "last_seen": last_seen}
        return {"count": 0, "first_seen": None, "last_seen": None}

    @staticmethod
    async def get_rule_endpoint_distribution(db: AsyncSession, rule_title: str, limit: int = 10) -> list:
        """Get list of endpoints that have seen this rule"""
        from sqlalchemy import func
        result = await db.execute(
            select(AlertModel.source, func.count(AlertModel.id).label('count'))
            .where(AlertModel.title == rule_title)
            .group_by(AlertModel.source)
            .order_by(func.count(AlertModel.id).desc())
            .limit(limit)
        )
        return [{"endpoint": row[0].split(' (')[0] if ' (' in row[0] else row[0], "count": row[1]} for row in result.fetchall()]

    @staticmethod
    async def get_source_velocity_stats(db: AsyncSession, source: str) -> dict:
        """Calculate temporal velocity: baseline alert rate vs current spiking rate for any alert source"""
        from sqlalchemy import func
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        six_hours_ago = now - timedelta(hours=6)

        # Match by source name prefix (strips IP suffix if present e.g. "web-server-01 (1.2.3.4)")
        source_name = source.split(' (')[0] if ' (' in source else source

        # Baseline: count all alerts from this source in last 30 days → per-day average
        baseline_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.source.like(f"{source_name}%"))
            .where(AlertModel.timestamp >= thirty_days_ago)
        )
        baseline_count = baseline_result.scalar() or 0
        baseline_per_day = baseline_count / 30.0 if baseline_count > 0 else 0.1

        # Current rate: count all alerts from this source in last 6 hours → extrapolate
        current_result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.source.like(f"{source_name}%"))
            .where(AlertModel.timestamp >= six_hours_ago)
        )
        current_count = current_result.scalar() or 0
        current_per_day = (current_count / 6.0) * 24 if current_count > 0 else 0

        # Velocity: acceleration factor
        velocity = current_per_day / baseline_per_day if baseline_per_day > 0 else 1.0

        return {
            "baseline_per_day": round(baseline_per_day, 2),
            "current_per_day": round(current_per_day, 2),
            "velocity": round(velocity, 2),
            "is_spiking": velocity > 5.0,
        }

    @staticmethod
    async def update_thehive_id(db: AsyncSession, wazuh_id: str, thehive_id: str):
        """Update an alert's TheHive Alert ID after escalation"""
        from sqlalchemy import select
        result = await db.execute(
            select(AlertModel).where(AlertModel.wazuh_id == wazuh_id)
        )
        db_alert = result.scalar_one_or_none()
        if db_alert:
            db_alert.thehive_id = thehive_id
            await db.commit()
            return True
        return False

    @staticmethod
    async def update_flowintel_id(db: AsyncSession, wazuh_id: str, flowintel_id: str):
        """Update an alert's Flowintel ID after escalation"""
        from sqlalchemy import select
        result = await db.execute(
            select(AlertModel).where(AlertModel.wazuh_id == wazuh_id)
        )
        db_alert = result.scalar_one_or_none()
        if db_alert:
            db_alert.flowintel_id = flowintel_id
            await db.commit()
            return True
        return False

    @staticmethod
    async def update_ai_results(db: AsyncSession, wazuh_id: str, node_results: dict, status: str = 'completed', verdict: Optional[str] = None, clear_verdict: bool = False):
        """Persist AI analysis results into raw_data with defensive merging"""
        from sqlalchemy import select
        from sqlalchemy.orm.attributes import flag_modified
        
        result = await db.execute(
            select(AlertModel).where(AlertModel.wazuh_id == wazuh_id)
        )
        db_alert = result.scalar_one_or_none()
        if db_alert:
            current_raw = dict(db_alert.raw_data) if db_alert.raw_data else {}
            current_raw['ai_status'] = status
            
            if status in ['running', 'extracting', 'investigating', 'judging']:
                db_alert.status = 'investigating'
            elif status == 'completed':
                db_alert.status = 'completed'
            elif status == 'failed':
                db_alert.status = 'failed'
            
            if clear_verdict:
                db_alert.verdict = None
                current_raw.pop('verdict', None)
            elif verdict:
                db_alert.verdict = verdict
                current_raw['verdict'] = verdict
            
            # Deep copy and merge raw_data
            existing_results = current_raw.get('ai_analysis_results', {})
            
            # Merge: node_results takes precedence for supplied keys
            merged_results = {**existing_results, **node_results}
            current_raw['ai_analysis_results'] = merged_results
            db_alert.raw_data = current_raw
            
            flag_modified(db_alert, "raw_data")
            await db.commit()
            return True
        return False
    @staticmethod
    async def update_graph_layout(db: AsyncSession, wazuh_id: str, nodes: list, edges: list):
        """Persist full graph layout (positions, etc) into raw_data to allow global synchronization"""
        from sqlalchemy import select
        from sqlalchemy.orm.attributes import flag_modified
        
        result = await db.execute(
            select(AlertModel).where(AlertModel.wazuh_id == wazuh_id)
        )
        db_alert = result.scalars().first()
        if db_alert:
            # Save into raw_data as graph_layout
            current_raw = dict(db_alert.raw_data) if db_alert.raw_data else {}
            current_raw['graph_layout'] = {
                'nodes': nodes,
                'edges': edges,
                'last_updated': datetime.now(timezone.utc).isoformat()
            }
            db_alert.raw_data = current_raw
            
            flag_modified(db_alert, "raw_data")
            await db.commit()
            return True
        return False

    @staticmethod
    async def sanitize_active_scans(db: AsyncSession):
        """Find any alerts stuck in 'active' phases (from a previous crashed session) and mark them as failed"""
        from sqlalchemy import select
        from sqlalchemy.orm.attributes import flag_modified
        
        # We search for any alert that was left in the 'investigating' state
        result = await db.execute(
            select(AlertModel).where(AlertModel.status == 'investigating')
        )
        hanging_alerts = result.scalars().all()
        
        count = 0
        for alert in hanging_alerts:
            raw = dict(alert.raw_data) if alert.raw_data else {}
            ai_status = raw.get('ai_status', 'idle')
            
            # If AI status is not completed/failed/idle, it's hanging
            if ai_status in ['running', 'extracting', 'investigating', 'judging']:
                print(f"🧹 [Sanitize] Fixing hanging alert: {alert.wazuh_id} (status: {ai_status})")
                raw['ai_status'] = 'failed'
                alert.status = 'failed'
                
                # Add a failure note to results
                results = raw.get('ai_analysis_results', {})
                if 'agent_judge' not in results:
                    results['agent_judge'] = {
                        'status': 'Failed',
                        'verdict': 'Error',
                        'analysis_reasoning': 'The investigation was interrupted (system restart or crash).'
                    }
                raw['ai_analysis_results'] = results
                alert.raw_data = raw
                flag_modified(alert, "raw_data")
                count += 1
        
        if count > 0:
            await db.commit()
            print(f"✅ [Sanitize] Reset {count} hanging investigations.")
        return count

    @staticmethod
    async def get_severity_distribution(db: AsyncSession, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> dict:
        """Aggregate all alerts from the DB into severity bins for statistical analysis"""
        from sqlalchemy import func
        
        query = select(AlertModel.rule_level, func.count(AlertModel.id))
        
        if start_time:
            query = query.where(AlertModel.timestamp >= start_time)
        if end_time:
            query = query.where(AlertModel.timestamp <= end_time)
            
        query = query.group_by(AlertModel.rule_level)

        
        result = await db.execute(query)
        rows = result.all()
        
        # Aggregate into SOC severity bins
        stats = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0}
        for level, count in rows:
            # Ensure level is an integer
            l_val = int(level) if level is not None else 0
            if l_val >= 13: stats["critical"] += count
            elif l_val >= 10: stats["high"] += count
            elif l_val >= 7: stats["medium"] += count
            elif l_val >= 4: stats["low"] += count
            else: stats["info"] += count
            stats["total"] += count
            
        return stats

    @staticmethod
    async def get_mitre_distribution(db: AsyncSession, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> List[dict]:
        """Aggregate alerts into MITRE ATT&CK tactics distribution"""
        from sqlalchemy import func
        from app.models.alert import AlertModel
        
        query = select(AlertModel.raw_data)
        if start_time:
            query = query.where(AlertModel.timestamp >= start_time)
        if end_time:
            query = query.where(AlertModel.timestamp <= end_time)
            
        result = await db.execute(query)
        rows = result.scalars().all()

        # Tactics follow the ATT&CK version in use: alerts are placed by their technique IDs
        from app.services import mitre_service
        try:
            await mitre_service.ensure_loaded()
        except Exception as e:
            print(f"⚠️ [MITRE] ATT&CK data unavailable, using the alerts' own tactic names: {e}")

        def as_list(value):
            if isinstance(value, list):
                return value
            return [value] if value else []

        tactics_map = {}
        for raw in rows:
            mitre = ((raw or {}).get('rule') or {}).get('mitre') or {}
            for t in mitre_service.tactics_of_alert(as_list(mitre.get('id')), as_list(mitre.get('tactic'))):
                tactics_map[t] = tactics_map.get(t, 0) + 1

        return [{"tactic": k, "count": v} for k, v in tactics_map.items()]

    @staticmethod
    async def get_kpi_stats(db: AsyncSession, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> dict:
        """Calculate high-level KPIs for a given timeframe across the entire DB dataset"""
        from sqlalchemy import func, case
        from app.models.alert import AlertModel

        # Unified query for core counters
        query = select(
            func.count(AlertModel.id).label('total'),
            func.count(case((AlertModel.rule_level >= 13, 1))).label('critical'),
            func.count(case((AlertModel.status == 'investigating', 1))).label('investigating'),
            func.count(case((
                AlertModel.verdict.in_(['clean', 'safe', 'false positive', 'Clean', 'Safe', 'False Positive'])
            , 1))).label('fp_count'),
            func.count(case((
                func.lower(AlertModel.verdict).in_(['malicious', 'suspicious', 'blocked', 'false positive', 'clean', 'safe'])
            , 1))).label('analyzed_count'),
            # Real threats a security control already stopped: analyzed, but not false positives
            func.count(case((func.lower(AlertModel.verdict) == 'blocked', 1))).label('blocked_count')
        )
        
        if start_time:
            query = query.where(AlertModel.timestamp >= start_time)
        if end_time:
            query = query.where(AlertModel.timestamp <= end_time)
            
        result = await db.execute(query)
        res = result.one()
        
        # Calculate FP Rate
        rate = 0
        if res.analyzed_count > 0:
            rate = round((res.fp_count / res.analyzed_count) * 100, 1)
            
        # Get Dominant Vector (Recalculate accurately from the MITRE distribution logic)
        mitre_stats = await AlertService.get_mitre_distribution(db, start_time, end_time)
        sorted_mitre = sorted(mitre_stats, key=lambda x: x['count'], reverse=True)
        
        dominant = sorted_mitre[0] if sorted_mitre else {"tactic": None, "count": 0}
        valid_mitre_total = sum(x['count'] for x in mitre_stats)
        dominant_perc = 0
        if valid_mitre_total > 0:
            dominant_perc = round((dominant['count'] / valid_mitre_total) * 100, 1)

        return {
            "investigating": res.investigating,
            "critical": res.critical,
            "fp_rate": rate,
            "total_analyzed": res.analyzed_count,
            "blocked": res.blocked_count,
            "dominant_vector": {
                "name": dominant["tactic"],
                "percentage": dominant_perc
            }
        }
