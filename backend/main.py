from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import asyncio
from app.core.config import settings
from app.core.socket import socket_app, sio, check_services_health
from app.services.redis_service import redis_service
from app.api.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print(f"🚀 Starting {settings.app_name} backend...")
    redis_service.connect()
    
    # Initialize Database: apply schema migrations (app/core/migrations.py)
    from app.core.migrations import upgrade_database
    print("🐘 Initializing PostgreSQL Database...")
    
    # Retry logic for DB connection
    db_initialized = False
    retries = 10
    while not db_initialized and retries > 0:
        try:
            await upgrade_database()
            db_initialized = True
            print("✅ PostgreSQL Database Initialized")
        except Exception as e:
            retries -= 1
            print(f"⌛ Waiting for PostgreSQL to be ready... ({retries} retries left) - Error: {e}")
            await asyncio.sleep(2)
    
    if not db_initialized:
        print("❌ CRITICAL: Failed to initialize PostgreSQL after multiple retries. Backend may be unstable.")
    else:
        # Sanitize hanging scans (Phase 2c)
        try:
            from app.services.alert_service import AlertService
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await AlertService.sanitize_active_scans(db)
        except Exception as e:
            print(f"⚠️ [Sanitize] Startup cleanup failed: {e}")

        # Load Settings from DB (secrets are encrypted at rest, decrypted here)
        try:
            from app.services import settings_store
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await settings_store.encrypt_plaintext_secrets(db)
                db_settings = await settings_store.load_all(db)
                if db_settings:
                    settings.update_from_dict(db_settings)
                    print(f"✅ Loaded {len(db_settings)} settings from database")
        except Exception as e:
            print(f"⚠️ [Settings] Startup load failed: {e}")

    # Start Health Monitor
    asyncio.create_task(check_services_health())
    
    yield
    # Shutdown
    print(f"🛑 Shutting down {settings.app_name} backend...")
    redis_service.disconnect()


# Initialize FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http(s)?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(api_router, prefix="/api")

# Static files for reports
import os
if not os.path.exists("downloads"):
    os.makedirs("downloads")

from fastapi.staticfiles import StaticFiles
app.mount("/downloads", StaticFiles(directory="downloads"), name="downloads")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "operational",
        "endpoints": {
            "api": "/api",
            "docs": "/docs",
            "socket": "/socket.io"
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "redis": redis_service.is_connected()
    }


# Socket.IO is mounted last: a mount at "/" would otherwise take precedence over the routes above.
app.mount("/", socket_app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
