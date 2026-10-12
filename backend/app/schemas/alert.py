from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone


# ===== Wazuh Alert Models =====
class WazuhRule(BaseModel):
    """Wazuh rule information"""
    id: Optional[str] = "000000"
    level: Optional[int] = 1
    description: Optional[str] = "Unknown Event"
    groups: Optional[list[str]] = []
    firedtimes: Optional[int] = 0
    model_config = {"extra": "allow"}


class WazuhAgent(BaseModel):
    """Wazuh agent information"""
    id: Optional[str] = "000"
    name: Optional[str] = "unknown-agent"
    ip: Optional[str] = None
    model_config = {"extra": "allow"}


class WazuhData(BaseModel):
    """Additional data from Wazuh alert"""
    srcip: Optional[str] = None
    dstip: Optional[str] = None
    srcport: Optional[str] = None
    dstport: Optional[str] = None
    protocol: Optional[str] = None


class WazuhAlert(BaseModel):
    """Complete Wazuh webhook alert structure - flexible for different integration types"""
    id: Optional[str] = Field(default="000000")
    timestamp: Optional[str] = None
    rule: Optional[WazuhRule] = Field(default_factory=WazuhRule)
    agent: Optional[WazuhAgent] = Field(default_factory=WazuhAgent)
    manager: Optional[Dict[str, Any]] = {}
    decoder: Optional[Dict[str, Any]] = {}
    data: Optional[Dict[str, Any]] = None
    location: Optional[str] = None
    full_log: Optional[str] = None
    
    # Additional fields for flexibility
    # Pydantic v2 configuration
    model_config = {
        "extra": "allow"
    }


# ===== Standardized Alert Model for Frontend =====
class StandardAlert(BaseModel):
    """Normalized alert model for frontend consumption"""
    id: str = Field(..., description="Unique alert identifier")
    timestamp: datetime = Field(..., description="Alert timestamp")
    title: str = Field(..., description="Alert title/description")
    source: str = Field(..., description="Source of the alert (agent name/IP)")
    level: str = Field(..., description="Severity level: info, low, medium, high, critical")
    rule_level: int = Field(default=0, description="Raw Wazuh rule level (1-15)")
    flowintel_id: Optional[str] = Field(default=None, description="Flowintel Case ID")
    status: str = Field(default="new", description="Wazuh status")
    ai_status: str = Field(default="idle", description="AI analysis status")
    verdict: Optional[str] = Field(default=None, description="AI verdict")
    graph_state: Optional[Dict[str, Any]] = Field(default=None, description="Persisted graph layout")
    raw_data: Dict[str, Any] = Field(default_factory=dict, description="Original alert data")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "1234567890",
                "timestamp": "2024-01-11T10:30:00Z",
                "title": "SSH Brute Force Attempt Detected",
                "source": "web-server-01 (192.168.1.100)",
                "level": "high",
                "raw_data": {}
            }
        }


def normalize_wazuh_alert(wazuh_alert: WazuhAlert) -> StandardAlert:
    """
    Convert Wazuh alert to standardized format
    Maps Wazuh severity levels (1-15) to human-readable strings
    """
    # Map Wazuh levels to severity strings
    level_mapping = {
        range(0, 4): "info",      # 0-3: Informational
        range(4, 7): "low",        # 4-6: Low
        range(7, 11): "medium",    # 7-10: Medium
        range(11, 13): "high",     # 11-12: High
        range(13, 16): "critical"  # 13-15: Critical
    }
    
    # Handle missing rule / level
    wazuh_level = wazuh_alert.rule.level if wazuh_alert.rule and wazuh_alert.rule.level else 1
    severity = "info"
    for level_range, severity_name in level_mapping.items():
        if wazuh_level in level_range:
            severity = severity_name
            break
    
    # Build source identifier (handle missing agent)
    if wazuh_alert.agent:
        source = f"{wazuh_alert.agent.name}"
        if wazuh_alert.agent.ip:
            source += f" ({wazuh_alert.agent.ip})"
    else:
        source = wazuh_alert.manager.get("name", "Unknown") if wazuh_alert.manager else "Unknown"
    
    # Handle missing ID
    alert_id = wazuh_alert.id if wazuh_alert.id else "000000"

    # Handle missing timestamp
    if wazuh_alert.timestamp:
        try:
             ts = datetime.fromisoformat(wazuh_alert.timestamp.replace('Z', '+00:00'))
        except ValueError:
             ts = datetime.now(timezone.utc)
    else:
        ts = datetime.now(timezone.utc)

    # Handle missing title
    title = wazuh_alert.rule.description if wazuh_alert.rule and wazuh_alert.rule.description else "Raw Alert Received"

    return StandardAlert(
        id=alert_id,
        timestamp=ts,
        title=title,
        source=source,
        level=severity,
        rule_level=wazuh_level,
        raw_data=wazuh_alert.model_dump()
    )
