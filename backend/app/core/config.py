import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from typing import Optional

# Absolute path to .env file relative to this file (backend/app/core/config.py)
# backend/app/core -> backend/app -> backend
ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
print(f"📡 [Config] Using environment file: {ENV_PATH}")
load_dotenv(ENV_PATH)

class Settings(BaseSettings):
    """Application configuration settings"""
    
    # Branding — display names only. Override via VENDOR_NAME / PRODUCT_NAME to white-label.
    vendor_name: str = "BlueSec"
    product_name: str = "Nightshift"

    # API Settings
    app_name: str = "BlueSec Nightshift"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # CORS Settings
    frontend_url: str = "http://localhost:5173"
    allowed_origins: list = [
        "http://localhost:5173", 
        "http://localhost:5174", 
        "http://localhost:5175", 
        "http://localhost:3000"
    ]
    
    # Redis Settings
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    
    # Socket.IO Settings
    socketio_path: str = "socket.io"
    socketio_cors_allowed_origins: str = "*"

    # Keycloak Settings
    keycloak_server_url: str = "http://localhost:8080"
    keycloak_realm: str = "nightshift"
    keycloak_client_id: str = "bluesec-frontend"
    keycloak_admin_user: str = "admin"
    keycloak_admin_password: str = "admin"

    # Database Settings (PostgreSQL)
    postgres_server: str = "localhost"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "cortex"
    
    # LLM Settings (OpenAI / Nebius / Groq / Anthropic / Gemini)
    openai_api_key: Optional[str] = None
    nebius_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    nebius_base_url: str = "https://api.tokenfactory.nebius.com/v1/"
    nebius_model: str = "deepseek-ai/DeepSeek-V3.2" # Default fallback
    nebius_extractor_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    nebius_judge_model: str = "deepseek-ai/DeepSeek-V3.2"
    
    # Generic Agent Model Selection (Preferred for UI)
    ai_extractor_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    ai_judge_model: str = "deepseek-ai/DeepSeek-V3.2"
    
    groq_model: str = "llama-3.3-70b-versatile"
    
    # New Dynamic Agent Settings (Persisted in DB)
    ai_architecture: str = "API" # "API" or "LOCAL"
    agent1_model: Optional[str] = None
    agent1_prompt: Optional[str] = None
    agent3_model: Optional[str] = None
    agent3_prompt: Optional[str] = None
    ai_analysis_strategy: str = "OPTIMIZED"
    ai_analysis_min_threshold: int = 7
    ai_analysis_max_threshold: int = 15
    
    # Local LLM Specifics
    local_base_url: str = "http://localhost:11434/v1/"
    local_agent1_model: Optional[str] = None
    local_agent3_model: Optional[str] = None

    # External CTI Settings
    virustotal_api_key: Optional[str] = None
    urlscan_api_key: Optional[str] = None
    abuseipdb_api_key: Optional[str] = None
    alienvault_api_key: Optional[str] = None
    hybrid_analysis_api_key: Optional[str] = None
    mxtoolbox_api_key: Optional[str] = None
    greynoise_api_key: Optional[str] = None
    threatfox_api_key: Optional[str] = None
    shodan_api_key: Optional[str] = None
    emailrep_api_key: Optional[str] = None   # EmailRep.io — email threat reputation (free, 1000 req/day)
    # URLhaus + MalwareBazaar reuse the same Abuse.ch account key as ThreatFox (threatfox_api_key)
    nvd_api_key: Optional[str] = None        # NIST NVD — CVE enrichment (optional; free without key)
    custom_cti_sources: Optional[str] = None  # JSON blob of user-added CTI sources

    # Flowintel Settings (Replacement for TheHive)
    flowintel_url: str = "http://flowintel:8080"
    flowintel_api_key: Optional[str] = None
    
    # TheHive Settings (DEPRECATED: Use Flowintel)
    thehive_url: str = "http://localhost:9000"
    thehive_api_key: Optional[str] = None
    
    # Wazuh Settings
    wazuh_url: str = "https://localhost:55000"
    wazuh_user: str = "admin"
    wazuh_password: str = "admin"
    wazuh_incoming_dir: str = "/var/ossec/incoming"
    
    # Pydantic v2 configuration
    model_config = {
        "env_file": ENV_PATH,
        "case_sensitive": False,
        "extra": "ignore"
    }

    @property
    def brand_name(self) -> str:
        """Full product name shown to users, e.g. 'BlueSec Nightshift'."""
        return f"{self.vendor_name} {self.product_name}".strip()

    def update_from_dict(self, updates: dict):
        """Hot-reload settings from a dictionary (e.g. database values)"""
        for key, value in updates.items():
            try:
                if hasattr(self, key):
                    if isinstance(getattr(self, key), bool) and isinstance(value, str):
                        setattr(self, key, value.lower() in ('true', '1', 'yes'))
                    elif isinstance(getattr(self, key), int) and isinstance(value, str):
                        try:
                            setattr(self, key, int(value))
                        except:
                            pass
                    else:
                        setattr(self, key, value)
                else:
                    # Store dynamic keys (e.g. custom_cti_xxx_key) not declared in the model
                    object.__setattr__(self, key, value)
            except Exception:
                pass
        print(f"🔄 [Config] settings updated from dictionary ({len(updates)} keys processed)")


# Global settings instance
settings = Settings()
