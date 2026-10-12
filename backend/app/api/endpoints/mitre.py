from fastapi import APIRouter, HTTPException
import logging
from app.services.mitre_service import get_mitre_matrix

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/matrix")
async def get_matrix():
    """
    Fetch the MITRE ATT&CK matrix dynamically parsed from the official STIX API.
    """
    try:
        matrix = await get_mitre_matrix()
        return matrix
    except Exception as e:
        logger.error(f"Failed to fetch MITRE matrix: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch MITRE data")
