"""
Alert ingestion: the single path every alert takes into Nightshift, whatever sent it
(SIEM push, manual upload, "send test alert").
"""
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.base import SiemConnector
from app.core import severity
from app.core.config import settings
from app.services import integrations
from app.services.alert_service import AlertService

logger = logging.getLogger(__name__)

# Identical events (same fingerprint) arriving within this window are one burst: keep the first
BURST_WINDOW_SECONDS = 5.0
# Only alerts younger than this start an AI scan, so a backlog does not flood the pipeline
SCAN_MAX_AGE_SECONDS = 300

_recent: Dict[str, float] = {}


def _is_burst_repeat(key: str) -> bool:
    now = time.monotonic()
    last = _recent.get(key)
    _recent[key] = now
    if len(_recent) > 5000:
        for k, seen in list(_recent.items()):
            if now - seen > BURST_WINDOW_SECONDS:
                del _recent[k]
    return last is not None and now - last < BURST_WINDOW_SECONDS


def _scan_range() -> tuple:
    try:
        return int(settings.ai_analysis_min_threshold), int(settings.ai_analysis_max_threshold)
    except (TypeError, ValueError):
        return 7, 15


async def ingest(db: AsyncSession, connector: SiemConnector, payload: Dict[str, Any],
                 trigger_scan: bool = True, origin: Optional[str] = None) -> Dict[str, Any]:
    """
    origin: recorded as the alert's source_system instead of the connector id when the alert
    did not come from the SIEM itself ("manual" upload, "test" alert), so it never makes a
    source look like it is delivering.
    """
    normalized = connector.normalize(payload, integrations.config_for(connector))

    if normalized.fingerprint and _is_burst_repeat(f"{connector.id}|{normalized.fingerprint}"):
        return {"status": "ignored", "message": "Duplicate alert dropped"}

    alert_id = connector.alert_id(normalized.native_id)
    if await AlertService.get_alert_by_wazuh_id(db, alert_id):
        return {"status": "ignored", "message": "Alert already received", "alert_id": alert_id}

    score = severity.clamp(normalized.score)
    alert = {
        "id": alert_id,
        "timestamp": normalized.timestamp.isoformat(),
        "title": normalized.title,
        "source": normalized.source,
        "level": severity.label(score),
        "rule_level": score,
        "flowintel_id": None,
        "status": "new",
        "ai_status": "idle",
        "verdict": None,
        "graph_state": None,
        "raw_data": normalized.raw,
        "source_system": origin or connector.id,
    }

    # Save first, then show it: a live alert must survive a page refresh
    try:
        await AlertService.create_alert(db, alert)
    except IntegrityError:
        await db.rollback()  # the same alert arrived twice at the same moment
        return {"status": "ignored", "message": "Alert already received", "alert_id": alert_id}

    if origin is None:
        integrations.note_alert_received(connector.id)
    from app.core.socket import sio, trigger_ai_scan
    await sio.emit("new_alert", alert)

    scanned = False
    if trigger_scan:
        low, high = _scan_range()
        age = (datetime.now(timezone.utc) - normalized.timestamp).total_seconds()
        if low <= score <= high and age < SCAN_MAX_AGE_SECONDS:
            await trigger_ai_scan(alert_id, alert)
            scanned = True
            logger.info(f"[Ingest] {connector.id} alert {alert_id} (severity {score}) sent to the AI pipeline")
        else:
            reason = f"older than {SCAN_MAX_AGE_SECONDS}s" if age >= SCAN_MAX_AGE_SECONDS else f"severity {score} outside {low}-{high}"
            logger.info(f"[Ingest] {connector.id} alert {alert_id} stored without AI scan ({reason})")

    return {
        "status": "success",
        "message": "Alert received and broadcasted",
        "alert_id": alert_id,
        "severity": alert["level"],
        "ai_scan": scanned,
        "alert": alert,
    }
