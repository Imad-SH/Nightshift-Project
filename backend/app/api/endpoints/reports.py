from fastapi import APIRouter, Body
from fastapi.responses import HTMLResponse
from app.services.html_report_service import html_report_service

router = APIRouter()

@router.post("/generate", response_class=HTMLResponse)
async def generate_html_report(
    alert_id: str = Body(..., embed=True),
    event_data: dict = Body(...)
):
    """
    Generate a high-fidelity HTML report for a security investigation.
    """
    html_content = html_report_service.generate_report(alert_id, event_data)
    return HTMLResponse(content=html_content, status_code=200)
