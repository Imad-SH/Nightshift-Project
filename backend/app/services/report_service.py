import os
import logging
from datetime import datetime
from typing import Dict, Any
from fpdf import FPDF

logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
COLOR_PRIMARY = (13, 17, 23)
COLOR_ACCENT = (6, 182, 212)
COLOR_SECONDARY = (240, 248, 255)
COLOR_TEXT = (40, 40, 40)

class ModernReport(FPDF):
    def __init__(self, alert_id: str, timestamp: str):
        super().__init__()
        self.alert_id = alert_id
        self.report_date = timestamp
        self.set_auto_page_break(auto=True, margin=15)

    def clean_text(self, text):
        """
        The 'Nuclear Option': Forces all text to Latin-1.
        Replaces emojis/unknown chars with '?' to prevent crashes.
        """
        if text is None:
            return ""
        text = str(text)
        # 1. Manual replacements for common status emojis
        replacements = {"⚠️": "[!]", "✅": "[OK]", "❌": "[X]", "🚀": "->"}
        for k, v in replacements.items():
            text = text.replace(k, v)
        
        # 2. Force encoding to remove remaining unicode
        return text.encode('latin-1', 'replace').decode('latin-1')

    def header(self):
        self.set_fill_color(*COLOR_PRIMARY)
        self.rect(0, 0, 210, 25, 'F')
        
        self.set_font('Helvetica', 'B', 14)
        self.set_text_color(255, 255, 255)
        self.set_xy(10, 6)
        self.cell(0, 8, "CORTEX INVESTIGATION REPORT", 0, 1, 'L')
        
        self.set_font('Courier', 'B', 10)
        self.set_text_color(*COLOR_ACCENT)
        self.set_xy(10, 14)
        # Use clean_text just in case ID has weird chars
        self.cell(0, 6, f"ID: {self.clean_text(self.alert_id)}", 0, 1, 'L')
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

    def chapter_title(self, title):
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(*COLOR_PRIMARY)
        self.cell(0, 8, self.clean_text(title.upper()), 0, 1, 'L')
        self.set_draw_color(*COLOR_ACCENT)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def add_info_box(self, label, content):
        if not content: return
        self.ln(2)
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(*COLOR_PRIMARY)
        self.cell(0, 5, self.clean_text(label), 0, 1, 'L')
        
        self.set_fill_color(*COLOR_SECONDARY)
        self.set_text_color(20, 20, 20)
        self.set_font('Courier', '', 9)
        self.multi_cell(0, 5, self.clean_text(str(content)), border=1, fill=True)
        self.ln(4)

class ReportService:
    def __init__(self):
        # Determine absolute path to avoid confusion
        self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.output_dir = os.path.join(self.base_dir, "downloads", "reports")
        
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir, exist_ok=True)

    def generate_pdf_report(self, alert_id: str, event_data: Dict[str, Any]) -> str:
        try:
            filename = f"Cortex_Report_{alert_id}_{datetime.now().strftime('%H%M%S')}.pdf"
            filepath = os.path.join(self.output_dir, filename)

            # Initialize PDF
            pdf = ModernReport(alert_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            pdf.add_page()
            
            # 1. Executive Summary
            pdf.chapter_title("1. Executive Summary")
            verdict = str(event_data.get('verdict', 'N/A')).upper()
            pdf.add_info_box("Verdict", verdict)
            
            results = event_data.get('node_results', {})
            screener = results.get('agent_screener', {})
            if isinstance(screener, dict) and screener.get('summary'):
                pdf.add_info_box("AI Summary", screener.get('summary'))
            
            # 2. IOCs (Safe Parsing)
            pdf.chapter_title("2. Technical Evidence")
            results = event_data.get('node_results', {})
            screener = results.get('agent_screener', {})
            
            if isinstance(screener, dict):
                for cat in ['network', 'files', 'identities', 'system']:
                    vals = screener.get(cat, [])
                    if vals:
                        val_str = ", ".join(map(str, vals))
                        pdf.add_info_box(cat.title(), val_str)
            else:
                pdf.add_info_box("Evidence", "No structured IOCs found.")

            # 3. Investigation
            pdf.chapter_title("3. Analysis")
            investigator = results.get('agent_investigator', {})
            
            # Handle if it's a dict (expected) or string (error)
            intel = "N/A"
            if isinstance(investigator, dict):
                # Try to get intel_analysis, or fallback to tactical_summary of results
                intel = investigator.get('intel_analysis')
                if not intel:
                    ext_intel = investigator.get('external_intel', [])
                    if isinstance(ext_intel, list) and ext_intel:
                        intel = " | ".join([res.get('tactical_summary', '') for res in ext_intel if isinstance(res, dict)])
            
            pdf.add_info_box("Intel Summary", intel or "No analysis available.")

            # 4. Behavioral Context & Velocity
            pdf.chapter_title("4. Behavioral Context & Velocity")
            
            investigator_data = results.get('agent_investigator', {})
            ic = investigator_data.get('internal_context', {})
            rv = ic.get('rule_velocity', {})
            av = ic.get('agent_velocity', {})
            
            rule_vel = rv.get('velocity', 1.0)
            rule_is_spiking = rv.get('is_spiking', False)
            agent_vel = av.get('velocity', 1.0)
            agent_is_spiking = av.get('is_spiking', False)

            # Rule Velocity Box
            pdf.set_fill_color(245, 248, 255)
            pdf.set_draw_color(200, 220, 255)
            pdf.rect(pdf.get_x(), pdf.get_y(), 190, 25, 'FD')
            
            curr_y = pdf.get_y()
            pdf.set_xy(pdf.get_x() + 5, curr_y + 3)
            pdf.set_font('Helvetica', 'B', 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 4, "ENVIRONMENTAL RULE FREQUENCY", 0, 1)
            
            pdf.set_x(pdf.get_x() + 5)
            pdf.set_font('Courier', 'B', 14)
            rule_color = (244, 63, 94) if rule_is_spiking else (16, 185, 129)
            pdf.set_text_color(*rule_color)
            status = "SPIKING" if rule_is_spiking else "STABLE"
            pdf.cell(40, 10, f"{rule_vel:.2f}x", 0, 0)
            pdf.set_font('Helvetica', 'B', 9)
            pdf.cell(0, 10, f"[{status}]", 0, 1)
            
            pdf.set_x(pdf.get_x() + 5)
            pdf.set_font('Helvetica', 'I', 8)
            pdf.set_text_color(120, 120, 120)
            pdf.cell(0, 4, f"Global rate: {rule_vel:.1f}x deviation from 30-day baseline.", 0, 1)
            pdf.set_xy(10, curr_y + 25 + 5)

            # Host Velocity Box
            pdf.set_fill_color(245, 248, 255)
            pdf.set_draw_color(200, 220, 255)
            pdf.rect(pdf.get_x(), pdf.get_y(), 190, 25, 'FD')
            
            curr_y = pdf.get_y()
            pdf.set_xy(pdf.get_x() + 5, curr_y + 3)
            pdf.set_font('Helvetica', 'B', 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 4, "SPECIFIC ASSET CORRELATION", 0, 1)
            
            pdf.set_x(pdf.get_x() + 5)
            pdf.set_font('Courier', 'B', 14)
            agent_color = (251, 191, 36) if agent_is_spiking else (16, 185, 129)
            pdf.set_text_color(*agent_color)
            status = "SPIKING" if agent_is_spiking else "STABLE"
            pdf.cell(40, 10, f"{agent_vel:.2f}x", 0, 0)
            pdf.set_font('Helvetica', 'B', 9)
            pdf.cell(0, 10, f"[{status}]", 0, 1)
            
            pdf.set_x(pdf.get_x() + 5)
            pdf.set_font('Helvetica', 'I', 8)
            pdf.set_text_color(120, 120, 120)
            pdf.cell(0, 4, f"Host rate: {agent_vel:.1f}x activity increase compared to normal behavior.", 0, 1)
            pdf.set_xy(10, curr_y + 25 + 5)

            # Explanation
            pdf.set_font('Helvetica', '', 8)
            pdf.set_text_color(100, 100, 100)
            pdf.multi_cell(0, 4, "METRIC INTERPRETATION: These coefficients compare activity in the last 6 hours against a 30-day sliding window. Values above 1.0x indicate increased activity. Rates exceeding 5.0x are considered statistically significant anomalies.")
            pdf.ln(5)

            # 5. Judge
            pdf.chapter_title("5. Analytical Rationale")
            judge = results.get('agent_judge', {})
            # Fix: AgentJudge returns 'analysis_reasoning' not 'justification'
            reason = judge.get('analysis_reasoning') or judge.get('justification', "N/A") if isinstance(judge, dict) else str(judge)
            pdf.add_info_box("Judge Reasoning", reason)

            # Output
            # Save to Memory (Bytes) instead of disk
            # FPDF output(dest='S') returns bytearray or string depending on version/config
            raw_output = pdf.output(dest='S')
            
            if isinstance(raw_output, str):
                pdf_bytes = raw_output.encode('latin-1')
            elif isinstance(raw_output, (bytes, bytearray)):
                pdf_bytes = bytes(raw_output)
            else:
                raise ValueError(f"Unknown FPDF output type: {type(raw_output)}")

            # Dual Output: Return B64 AND Save to Disk for URL fallback
            import base64
            b64_pdf = base64.b64encode(pdf_bytes).decode('utf-8')
            
            # Save to disk
            try:
                with open(filepath, "wb") as f:
                    f.write(pdf_bytes)
                logger.info(f"✅ PDF Saved to Disk: {filepath}")
                # Return tuple/dict with both
                return {
                    "base64": b64_pdf,
                    "path": f"downloads/reports/{filename}"
                }
            except Exception as disk_err:
                logger.error(f"Failed to save PDF to disk: {disk_err}")
                return {"base64": b64_pdf, "path": None}

        except Exception as e:
            logger.error(f"PDF Gen Failed: {e}")
            raise e

report_service = ReportService()