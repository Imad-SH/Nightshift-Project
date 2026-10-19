from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base

class AlertModel(Base):
    __tablename__ = "alerts_v2"

    id = Column(Integer, primary_key=True, index=True)
    wazuh_id = Column(String, unique=True, index=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    
    title = Column(String)
    description = Column(String, nullable=True)
    level = Column(String) # info, low, medium, high, critical
    rule_level = Column(Integer, default=0) # Severity score 0-15, common to all sources (app/core/severity.py)
    source = Column(String)
    
    # Status Workflow
    status = Column(String, default="new")  # new, investigating, resolved, closed
    verdict = Column(String, nullable=True) # benign, malicious
    
    # Raw Data
    raw_data = Column(JSON)
    
    # Which SIEM connector ingested the alert (see app/connectors)
    source_system = Column(String(32), nullable=True, server_default="wazuh")

    # Case created in the SOAR by escalation
    case_system = Column(String(32), nullable=True)
    case_id = Column(String, nullable=True)
    case_url = Column(String, nullable=True)

    # Legacy per-SOAR references, kept for existing escalations (mirrored into case_*)
    flowintel_id = Column(String, nullable=True, index=True)
    thehive_id = Column(String, nullable=True, index=True)
    
    def __repr__(self):
        return f"<Alert(id={self.id}, wazuh_id={self.wazuh_id}, title={self.title})>"
