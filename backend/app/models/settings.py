from sqlalchemy import Column, String, JSON
from app.core.database import Base

class SystemSettings(Base):
    """
    Persistent key-value store for system-wide configuration.
    Example: {'ai_analysis_strategy': 'OPTIMIZED'}
    """
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(JSON)

    def __repr__(self):
        return f"<SystemSettings(key={self.key}, value={self.value})>"
