from fastapi import APIRouter, Depends
from app.api.endpoints import wazuh, alerts, upload, reports, flowintel, thehive, admin, settings, mitre
from app.core.security import get_current_user

# Create main API router
api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(wazuh.router) # Wazuh webhooks are internal and not OIDC protected
api_router.include_router(alerts.router, dependencies=[Depends(get_current_user)])
api_router.include_router(settings.router, dependencies=[Depends(get_current_user)])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"], dependencies=[Depends(get_current_user)])
api_router.include_router(reports.router, prefix="/v1/reports", tags=["reports"], dependencies=[Depends(get_current_user)])
api_router.include_router(flowintel.router, prefix="/v1", tags=["flowintel"], dependencies=[Depends(get_current_user)])
api_router.include_router(thehive.router, prefix="/v1", tags=["thehive"], dependencies=[Depends(get_current_user)])
api_router.include_router(mitre.router, prefix="/mitre", tags=["mitre"], dependencies=[Depends(get_current_user)])

# Admin/RBAC Endpoints
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])

# Future routers will be added here:
# api_router.include_router(agents.router)
# api_router.include_router(analytics.router)
