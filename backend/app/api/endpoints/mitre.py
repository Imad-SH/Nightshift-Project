from fastapi import APIRouter, Depends, HTTPException
import logging
from app.core.security import require_role
from app.services import mitre_service
from app.services.mitre_service import get_mitre_matrix

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/matrix")
async def get_matrix():
    """
    The MITRE ATT&CK Enterprise matrix (tactics, techniques, sub-techniques), from the
    newest ATT&CK version available (kept up to date with MITRE's releases).
    """
    try:
        matrix = await get_mitre_matrix()
        return matrix
    except Exception as e:
        logger.error(f"Failed to fetch MITRE matrix: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch MITRE data")


@router.get("/status")
async def get_status():
    """ATT&CK version in use, its size, and the result of the last update check."""
    try:
        await mitre_service.ensure_loaded()
    except Exception as e:
        logger.error(f"Failed to load MITRE data: {e}")
    return mitre_service.status()


@router.post("/update", dependencies=[Depends(require_role("soc_admin"))])
async def check_for_update():
    """Check MITRE's published versions now and switch to a newer one if there is one."""
    try:
        await mitre_service.ensure_loaded()
    except Exception as e:
        logger.error(f"Failed to load MITRE data: {e}")
    return await mitre_service.check_for_update(force=True)
