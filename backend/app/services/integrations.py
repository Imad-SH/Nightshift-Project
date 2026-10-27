"""
Integration state: connector configuration, health monitoring, ingest tokens,
the active SOAR and escalation.

Connector settings live in system_settings (secrets encrypted) and in the
in-memory `settings` object, which is updated whenever they are saved.
"""
import asyncio
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors import registry
from app.connectors.base import Connector, EscalationRequest, EscalationResult, SiemConnector, SoarConnector
from app.core import credentials
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.alert import AlertModel
from app.services import settings_store

logger = logging.getLogger(__name__)

HEALTH_INTERVAL_SECONDS = 15
RECEIVING_WINDOW = timedelta(hours=24)

AUTO_ESCALATION_DEFAULTS = {
    "auto_escalation_enabled": True,
    "auto_escalation_min_score": 7,
    "auto_escalation_verdicts": "Malicious,Suspicious",
}

# (kind, connector id) -> {"state", "message", "checked_at"}. Keyed by kind too:
# a SIEM and a SOAR connector can share an id ("webhook").
_status: Dict[tuple, Dict[str, Any]] = {}
# SIEM connector id -> time of the last alert it delivered
_last_alert_at: Dict[str, datetime] = {}
_monitor_task: Optional[asyncio.Task] = None


# ---- configuration -----------------------------------------------------------

def config_for(connector: Connector) -> Dict[str, Any]:
    """The connector's current settings (secrets in clear: server-side use only)."""
    config = {}
    for field in connector.fields:
        value = getattr(settings, field.key, None)
        config[field.key] = field.default if value in (None, "") else value
    return config


def public_config(connector: Connector) -> Dict[str, Any]:
    return {key: credentials.mask(value) if credentials.is_secret_key(key) else value
            for key, value in config_for(connector).items()}


def merged_config(connector: Connector, submitted: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stored settings overlaid with values from the UI. A masked secret stays the stored one,
    but only while the address it is bound to is unchanged (see the settings API).
    """
    stored = config_for(connector)
    config = dict(stored)
    for field in connector.fields:
        if field.key not in submitted:
            continue
        value = submitted[field.key]
        if field.secret and value == credentials.SECRET_PLACEHOLDER:
            if field.bound_to and field.bound_to in submitted:
                same = str(submitted[field.bound_to] or "").strip().rstrip("/").lower() == \
                    str(stored.get(field.bound_to) or "").strip().rstrip("/").lower()  # the saved address, not the submitted one
                if not same:
                    raise ValueError(f"The address changed: re-enter the {field.label.lower()} to use it with the new address.")
            continue
        config[field.key] = value
    return config


async def save_config(db: AsyncSession, connector: Connector, submitted: Dict[str, Any]) -> List[str]:
    allowed = {f.key for f in connector.fields}
    unknown = set(submitted) - allowed
    if unknown:
        raise ValueError(f"Unknown settings for {connector.name}: {', '.join(sorted(unknown))}")
    merged_config(connector, submitted)  # validates the secret/address binding
    applied = await settings_store.save(db, submitted)
    settings.update_from_dict(applied)
    asyncio.create_task(refresh_status(connector))
    return list(applied)


# ---- SIEM ingest tokens --------------------------------------------------------

def has_ingest_token(connector: SiemConnector) -> bool:
    return bool(getattr(settings, connector.token_key, None))


async def generate_ingest_token(db: AsyncSession, connector: SiemConnector) -> str:
    token = secrets.token_urlsafe(32)
    applied = await settings_store.save(db, {connector.token_key: token})
    settings.update_from_dict(applied)
    _set_status("siem", connector.id, *_siem_state(connector))
    return token


def legacy_wazuh_intake_open() -> bool:
    """
    Whether /api/webhook/wazuh accepts alerts without a token: only on installations that
    used it before tokens existed (flag set by migration 0003), and until a Wazuh token exists.
    """
    allowed = str(getattr(settings, "wazuh_legacy_intake", "false")).lower() in ("true", "1", "yes")
    return allowed and not has_ingest_token(registry.SIEM["wazuh"])


def token_matches(connector: SiemConnector, presented: Optional[str]) -> bool:
    expected = getattr(settings, connector.token_key, None)
    if not expected or not presented:
        return False
    return hmac.compare_digest(expected.encode(), presented.encode())


def note_alert_received(connector_id: str, when: Optional[datetime] = None) -> None:
    _last_alert_at[connector_id] = when or datetime.now(timezone.utc)
    connector = registry.SIEM.get(connector_id)
    if connector and connector.id != "wazuh":  # Wazuh's state comes from its API check
        _set_status("siem", connector.id, *_siem_state(connector))


async def load_last_alert_times(db: AsyncSession) -> None:
    rows = await db.execute(select(AlertModel.source_system, func.max(AlertModel.received_at))
                            .group_by(AlertModel.source_system))
    for source_system, last in rows.all():
        if source_system and last:
            _last_alert_at[source_system] = last if last.tzinfo else last.replace(tzinfo=timezone.utc)


# ---- SOAR selection and auto-escalation -----------------------------------------

def active_soar_id() -> str:
    value = getattr(settings, "active_soar", None) or registry.NO_SOAR
    return value if value in registry.SOAR or value == registry.NO_SOAR else registry.NO_SOAR


def active_soar() -> Optional[SoarConnector]:
    return registry.SOAR.get(active_soar_id())


async def set_active_soar(db: AsyncSession, connector_id: str) -> None:
    if connector_id != registry.NO_SOAR and connector_id not in registry.SOAR:
        raise ValueError(f"Unknown SOAR connector: {connector_id}")
    applied = await settings_store.save(db, {"active_soar": connector_id})
    settings.update_from_dict(applied)
    await broadcast_status()


def auto_escalation_settings() -> Dict[str, Any]:
    result = {}
    for key, default in AUTO_ESCALATION_DEFAULTS.items():
        value = getattr(settings, key, None)
        result[key] = default if value in (None, "") else value
    result["auto_escalation_enabled"] = str(result["auto_escalation_enabled"]).lower() in ("true", "1", "yes")
    result["auto_escalation_min_score"] = int(result["auto_escalation_min_score"])
    return result


async def save_auto_escalation(db: AsyncSession, values: Dict[str, Any]) -> Dict[str, Any]:
    updates = {}
    if "auto_escalation_enabled" in values:
        updates["auto_escalation_enabled"] = bool(values["auto_escalation_enabled"])
    if "auto_escalation_min_score" in values:
        updates["auto_escalation_min_score"] = max(0, min(15, int(values["auto_escalation_min_score"])))
    if "auto_escalation_verdicts" in values:
        verdicts = values["auto_escalation_verdicts"]
        if isinstance(verdicts, list):
            verdicts = ",".join(verdicts)
        updates["auto_escalation_verdicts"] = str(verdicts)
    applied = await settings_store.save(db, updates)
    settings.update_from_dict(applied)
    return auto_escalation_settings()


def should_auto_escalate(score: int, verdict: Optional[str]) -> bool:
    cfg = auto_escalation_settings()
    if not cfg["auto_escalation_enabled"] or active_soar() is None or not verdict:
        return False
    allowed = {v.strip().lower() for v in str(cfg["auto_escalation_verdicts"]).split(",") if v.strip()}
    return score >= cfg["auto_escalation_min_score"] and verdict.strip().lower() in allowed


# ---- escalation -------------------------------------------------------------------

class AlreadyEscalated(Exception):
    def __init__(self, case_system: str, case_id: Optional[str]):
        self.case_system, self.case_id = case_system, case_id


def case_link(alert: AlertModel) -> Optional[str]:
    if alert.case_url:
        return alert.case_url
    connector = registry.SOAR.get(alert.case_system or "")
    if connector and alert.case_id:
        return connector.case_link(alert.case_id, config_for(connector))
    return None


async def escalate(db: AsyncSession, request: EscalationRequest,
                   connector: Optional[SoarConnector] = None) -> EscalationResult:
    """Send an alert to the SOAR (the active one unless given) and record the case on the alert."""
    connector = connector or active_soar()
    if connector is None:
        raise LookupError("No case-management system is active. Choose one under Integrations.")
    config = config_for(connector)
    if not connector.is_configured(config):
        raise LookupError(f"{connector.name} is not configured. Add its settings under Integrations.")

    alert = (await db.execute(select(AlertModel).where(AlertModel.wazuh_id == request.alert_id))).scalar_one_or_none()
    if alert is not None and not request.force:
        legacy_id = {"thehive": alert.thehive_id, "flowintel": alert.flowintel_id}.get(connector.id)
        if (alert.case_system == connector.id and alert.case_id) or legacy_id:
            raise AlreadyEscalated(connector.id, alert.case_id or legacy_id)

    result = await connector.escalate(request, config)

    if alert is not None:
        alert.case_system = connector.id
        alert.case_id = result.case_id
        alert.case_url = result.case_url
        # Keep the legacy per-SOAR columns filled for existing screens
        if connector.id == "thehive" and result.case_id:
            alert.thehive_id = result.case_id
        elif connector.id == "flowintel" and result.case_id:
            alert.flowintel_id = f"FI-{result.case_id}"
        await db.commit()

    from app.core.socket import sio
    await sio.emit("agent_update", {
        "alert_id": request.alert_id,
        "node": "responder",
        "log": f"✓ Escalated to {connector.name}" + (f" (case {result.case_id})" if result.case_id else ""),
        **case_fields(connector.id, result.case_id, result.case_url),
    })
    return result


def case_fields(case_system: Optional[str], case_id: Optional[str], case_url: Optional[str]) -> Dict[str, Any]:
    """Case reference as sent to the UI, including the legacy per-SOAR fields it still reads."""
    fields: Dict[str, Any] = {"case_system": case_system, "case_id": case_id, "case_url": case_url}
    if case_system == "thehive":
        fields.update(thehive_id=case_id, thehive_url=getattr(settings, "thehive_url", None))
    elif case_system == "flowintel":
        fields.update(flowintel_id=case_id, flowintel_url=getattr(settings, "flowintel_url", None))
    return fields


# ---- health status ------------------------------------------------------------------

def _set_status(kind: str, connector_id: str, state: str, message: str) -> None:
    _status[(kind, connector_id)] = {"state": state, "message": message,
                             "checked_at": datetime.now(timezone.utc).isoformat()}


def _siem_state(connector: SiemConnector) -> tuple:
    last = _last_alert_at.get(connector.id)
    if last and datetime.now(timezone.utc) - last < RECEIVING_WINDOW:
        return "receiving", "Receiving alerts"
    if has_ingest_token(connector):
        return "ready", "Waiting for the first alert"
    return "not_configured", "Not set up"


async def refresh_status(connector: Connector) -> None:
    config = config_for(connector)
    if connector.id == "wazuh":
        if config.get("wazuh_url") and config.get("wazuh_user") and config.get("wazuh_password"):
            result = await connector.test(config)
            _set_status(connector.kind, connector.id, "connected" if result.ok else "error", result.message)
        else:
            _set_status(connector.kind, connector.id, *_siem_state(connector))
    elif connector.kind == "siem":
        _set_status(connector.kind, connector.id, *_siem_state(connector))
    elif not connector.is_configured(config):
        _set_status(connector.kind, connector.id, "not_configured", "Not set up")
    elif not connector.background_health_check:
        _set_status(connector.kind, connector.id, "configured", "Configured (use Test to check it)")
    else:
        try:
            result = await connector.test(config)
            _set_status(connector.kind, connector.id, "connected" if result.ok else "error", result.message)
        except Exception as e:
            _set_status(connector.kind, connector.id, "error", str(e))


def mark_unverified(connector_id: str) -> bool:
    """Show a connector as unverified while its settings are being edited."""
    if connector_id not in registry.SIEM and connector_id not in registry.SOAR:
        return False
    for kind, connectors in (("siem", registry.SIEM), ("soar", registry.SOAR)):
        if connector_id in connectors:
            _set_status(kind, connector_id, "unknown", "Settings changed, not verified yet")
    return True


def status_of(kind: str, connector_id: str) -> Dict[str, Any]:
    return _status.get((kind, connector_id), {"state": "unknown", "message": "Checking...", "checked_at": None})


def last_alert_at(connector_id: str) -> Optional[str]:
    last = _last_alert_at.get(connector_id)
    return last.isoformat() if last else None


def service_status() -> Dict[str, Any]:
    """Status broadcast to every client. Keeps the original keys the UI already reads."""
    def legacy(kind: str, cid: str) -> str:
        return "CONNECTED" if status_of(kind, cid)["state"] == "connected" else "DISCONNECTED"

    siem_up = any(status_of("siem", cid)["state"] in ("connected", "receiving", "ready") for cid in registry.SIEM)
    return {
        "wazuh": legacy("siem", "wazuh"),
        "thehive": legacy("soar", "thehive"),
        "flowintel": legacy("soar", "flowintel"),
        "active_soar": active_soar_id(),
        "system": "ONLINE" if siem_up else "OFFLINE",
        "timestamp": datetime.now().isoformat(),
        "connectors": {
            "siem": {cid: status_of("siem", cid) for cid in registry.SIEM},
            "soar": {cid: status_of("soar", cid) for cid in registry.SOAR},
        },
    }


async def broadcast_status() -> None:
    from app.core.socket import sio
    await sio.emit("service_status", service_status())


async def check_all() -> None:
    connectors: List[Connector] = list(registry.SIEM.values()) + list(registry.SOAR.values())
    await asyncio.gather(*(refresh_status(c) for c in connectors), return_exceptions=True)
    await broadcast_status()


async def _monitor() -> None:
    try:
        async with AsyncSessionLocal() as db:
            await load_last_alert_times(db)
    except Exception as e:
        logger.warning(f"[Integrations] Could not load last alert times: {e}")
    while True:
        try:
            await check_all()
        except Exception as e:
            logger.error(f"[Integrations] Health check failed: {e}")
        await asyncio.sleep(HEALTH_INTERVAL_SECONDS)


async def on_database_ready() -> None:
    """The database became reachable after startup: load what the monitor could not, then
    refresh every status now (the settings were just loaded)."""
    try:
        async with AsyncSessionLocal() as db:
            await load_last_alert_times(db)
    except Exception as e:
        logger.warning(f"[Integrations] Could not load last alert times: {e}")
    await check_all()


def start_monitor() -> None:
    global _monitor_task
    if _monitor_task is None or _monitor_task.done():
        _monitor_task = asyncio.create_task(_monitor())
