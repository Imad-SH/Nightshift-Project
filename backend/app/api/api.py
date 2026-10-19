from fastapi import APIRouter, Depends
from app.api.endpoints import ingest, alerts, upload, reports, integrations, admin, settings, mitre
from app.core.security import get_current_user

# Create main API router
api_router = APIRouter()

# Alert intake from SIEMs: authenticated with ingest tokens, not user logins
api_router.include_router(ingest.router)

api_router.include_router(alerts.router, dependencies=[Depends(get_current_user)])
api_router.include_router(settings.router, dependencies=[Depends(get_current_user)])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"], dependencies=[Depends(get_current_user)])
api_router.include_router(reports.router, prefix="/v1/reports", tags=["reports"], dependencies=[Depends(get_current_user)])
api_router.include_router(integrations.router, dependencies=[Depends(get_current_user)])
# Original /v1/flowintel and /v1/thehive endpoints, now served by the connector framework
api_router.include_router(integrations.legacy_router, dependencies=[Depends(get_current_user)])
api_router.include_router(mitre.router, prefix="/mitre", tags=["mitre"], dependencies=[Depends(get_current_user)])

# Admin/RBAC Endpoints
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
