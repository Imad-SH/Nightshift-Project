from fastapi import APIRouter, File, UploadFile, HTTPException
import shutil
import os

router = APIRouter()

@router.post("/evidence")
async def upload_evidence(file: UploadFile = File(...)):
    """
    Endpoint for Agents to upload evidence files.
    Files are saved to the shared volume at /app/downloads.
    """
    try:
        # Ensure download directory exists
        download_dir = "/app/downloads"
        if not os.path.exists(download_dir):
            os.makedirs(download_dir)
            
        file_path = os.path.join(download_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"filename": file.filename, "status": "uploaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
