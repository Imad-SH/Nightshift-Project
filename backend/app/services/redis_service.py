from redis import Redis
from app.core.config import settings
from typing import Optional


class RedisService:
    """
    Redis service for buffering and caching
    Currently a skeleton for Phase 1 - will be expanded in Phase 2
    """
    
    def __init__(self):
        self.client: Optional[Redis] = None
        
    def connect(self):
        """Establish Redis connection"""
        try:
            self.client = Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                db=settings.redis_db,
                decode_responses=True
            )
            # Test connection
            self.client.ping()
            print("✅ Redis connection established")
        except Exception as e:
            print(f"❌ Redis connection failed: {e}")
            self.client = None
    
    def disconnect(self):
        """Close Redis connection"""
        if self.client:
            self.client.close()
            print("🔌 Redis connection closed")
    
    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        if not self.client:
            return False
        try:
            return self.client.ping()
        except:
            return False


    def save_alert(self, alert_data: dict):
        """Save alert to Redis rolling list (Max 50)"""
        if not self.client:
            return
        
        try:
            import json
            # Store as JSON string
            self.client.lpush("nightshift:alerts", json.dumps(alert_data))
            # Keep only last 50
            self.client.ltrim("nightshift:alerts", 0, 49)
        except Exception as e:
            print(f"❌ Redis save failed: {e}")

    def get_recent_alerts(self, limit: int = 50) -> list:
        """Retrieve recent alerts"""
        if not self.client:
            return []
        
        try:
            import json
            # Get all items from list
            raw_alerts = self.client.lrange("nightshift:alerts", 0, limit - 1)
            return [json.loads(alert) for alert in raw_alerts]
        except Exception as e:
            print(f"❌ Redis retrieve failed: {e}")
            return []

# Singleton instance
redis_service = RedisService()
redis_service.connect() # Auto-connect on import
