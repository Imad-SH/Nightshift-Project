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
    rule_level = Column(Integer, default=0) # Raw numeric level (1-15)
    source = Column(String)
    
    # Status Workflow
    status = Column(String, default="new")  # new, investigating, resolved, closed
    verdict = Column(String, nullable=True) # benign, malicious
    
    # Raw Data
    raw_data = Column(JSON)
    
    # Integration Refs
    flowintel_id = Column(String, nullable=True, index=True)
    thehive_id = Column(String, nullable=True, index=True)
    
    def __repr__(self):
        return f"<Alert(id={self.id}, wazuh_id={self.wazuh_id}, title={self.title})>"
