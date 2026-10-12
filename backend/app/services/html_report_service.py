import html
from datetime import datetime
from typing import Dict, Any

class HTMLReportService:
    def __init__(self):
        pass

    def clean_data(self, text: Any) -> str:
        """
        Sanitizes text and replaces emojis with professional tags.
        """
        if text is None:
            return ""
        text = str(text)
        
        # Professional tag replacements
        replacements = {
            "⚠️": "[ALERT]",
            "✅": "[SAFE]",
            "❌": "[MALICIOUS]",
            "🚀": "[INFO]",
            "🔒": "[SECURE]",
            "🛡️": "[PROTECTED]",
            "🧠": "[ANALYSIS]",
            "🎯": "[VERDICT]"
        }
        
        for emoji, tag in replacements.items():
            text = text.replace(emoji, tag)
            
        return html.escape(text)

    def generate_report(self, alert_id: str, event_data: Dict[str, Any]) -> str:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        verdict = self.clean_data(event_data.get("verdict", "N/A")).upper()
        
        # Determine verdict color
        verdict_color = "#94a3b8"  # Slate (N/A)
        bg_verdict = "rgba(148, 163, 184, 0.1)"
        if "MALICIOUS" in verdict:
            verdict_color = "#f43f5e"  # Rose/Red
            bg_verdict = "rgba(244, 63, 94, 0.1)"
        elif "SUSPICIOUS" in verdict:
            verdict_color = "#fbbf24"  # Amber
            bg_verdict = "rgba(251, 191, 36, 0.1)"
        elif "SAFE" in verdict or "BENIGN" in verdict:
            verdict_color = "#10b981"  # Emerald
            bg_verdict = "rgba(16, 185, 129, 0.1)"

        results = event_data.get("node_results", {})
        
        # Enrichment: Agent Context
        agent_data = event_data.get("alert_data", {}).get("agent", {})
        agent_name = self.clean_data(agent_data.get("name", "Unknown Agent"))
        agent_id_val = self.clean_data(agent_data.get("id", "N/A"))
        agent_ip = self.clean_data(agent_data.get("ip", "N/A"))
        
        # Enrichment: Rule Context
        rule_data = event_data.get("alert_data", {}).get("rule", {})
        rule_id = self.clean_data(rule_data.get("id", "N/A"))
        rule_level = self.clean_data(rule_data.get("level", "0"))

        # Extract technical evidence
        screener = results.get("agent_screener", {})
        ioc_rows = ""
        if isinstance(screener, dict):
            for cat in ['network', 'files', 'identities', 'system']:
                vals = screener.get(cat, [])
                if vals:
                    val_str = ", ".join([self.clean_data(v) for v in vals])
                    ioc_rows += f"""
                    <tr>
                        <td class="category">{cat.upper()}</td>
                        <td class="data forensic">{val_str}</td>
                    </tr>
                    """
        
        if not ioc_rows:
            ioc_rows = "<tr><td colspan='2' class='no-data forensic'>No structured forensics available for this investigation.</td></tr>"

        # Analytical Summary
        investigator = results.get("agent_investigator", {})
        intel_summary = "Analytical summary pending."
        burst_global = 0
        burst_source = 0
        is_burst = False
        cooc_distinct = 0
        cooc_rules = []
        is_suspicious_cooc = False
        current_hour = 0
        hour_pct = 0.0
        is_unusual_timing = False
        total_historical = 0
        if isinstance(investigator, dict):
            intel_summary = investigator.get("intel_analysis") or "Investigation completed. No critical indicators surfaced during deep-scan."
            ic = investigator.get("internal_context", {})
            burst_data = ic.get("burst", {})
            cooc_data = ic.get("cooccurrence", {})
            time_data = ic.get("time_anomaly", {})
            burst_global = burst_data.get("global_count", 0)
            burst_source = burst_data.get("source_count", 0)
            is_burst = burst_data.get("is_burst", False)
            cooc_distinct = cooc_data.get("distinct_rules", 0)
            cooc_rules = cooc_data.get("rules", [])
            is_suspicious_cooc = cooc_data.get("is_suspicious", False)
            current_hour = time_data.get("current_hour", 0)
            hour_pct = time_data.get("current_hour_pct", 0.0)
            is_unusual_timing = time_data.get("is_unusual_timing", False)
            total_historical = time_data.get("total_historical", 0)
        
        # Analytical Rationale
        judge = results.get("agent_judge", {})
        reasoning = "N/A"
        if isinstance(judge, dict):
            reasoning = judge.get("analysis_reasoning") or judge.get("justification") or "Rationale provided in summary."

        html_template = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Executive Investigation Report - {alert_id}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        .report-isolation {{
            --bg-deep: #0a0f1e;
            --bg-card: #111827;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #38bdf8;
            --border: #1f2937;
            --verdict-color: {verdict_color};
            --verdict-bg: {bg_verdict};
            
            background-color: #111827;
            margin: 0;
            padding: 15mm 0;
            font-family: 'Inter', sans-serif;
            color: var(--text-main);
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            width: 100%;
        }}

        .report-isolation .page {{
            width: 210mm;
            min-height: 297mm;
            margin: auto;
            background-color: var(--bg-deep);
            padding: 25mm 20mm;
            box-sizing: border-box;
            position: relative;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }}

        .report-isolation .forensic {{
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            letter-spacing: -0.2px;
        }}

        .report-isolation header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 40px;
        }}

        .report-isolation .brand {{
            font-weight: 700;
            font-size: 20px;
            letter-spacing: -0.5px;
            color: var(--text-main);
        }}

        .report-isolation .brand span {{
            color: var(--accent);
        }}

        .report-isolation .doc-meta {{
            text-align: right;
            font-size: 11px;
            color: var(--text-muted);
            font-family: 'JetBrains Mono', monospace;
        }}

        .report-isolation .verdict-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 20px 25px;
            border-radius: 8px;
            margin-bottom: 40px;
        }}

        .report-isolation .verdict-info h1 {{
            margin: 0;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-muted);
            margin-bottom: 8px;
        }}

        .report-isolation .badge {{
            display: inline-block;
            padding: 6px 16px;
            background: var(--verdict-bg);
            border: 1px solid var(--verdict-color);
            color: var(--verdict-color);
            font-weight: 700;
            font-size: 18px;
            border-radius: 4px;
            letter-spacing: 1px;
        }}

        .report-isolation h2 {{
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--accent);
            margin: 0 0 20px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .report-isolation h2::after {{
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border);
        }}

        .report-isolation .context-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 40px;
        }}

        .report-isolation .context-box {{
            background: rgba(255,255,255,0.02);
            border: 1px solid var(--border);
            padding: 20px;
            border-radius: 6px;
        }}

        .report-isolation .data-row {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
        }}

        .report-isolation .label {{
            color: var(--text-muted);
        }}

        .report-isolation .val {{
            font-weight: 500;
        }}

        .report-isolation .forensic-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
        }}

        .report-isolation .forensic-table th {{
            text-align: left;
            padding: 12px 15px;
            background: var(--bg-card);
            color: var(--text-muted);
            font-size: 10px;
            text-transform: uppercase;
            border-bottom: 2px solid var(--border);
        }}

        .report-isolation .forensic-table td {{
            padding: 12px 15px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
        }}

        .report-isolation .category {{
            width: 120px;
            font-weight: 600;
            color: var(--accent);
            font-size: 10px;
        }}

        .report-isolation .analysis-section {{
            margin-bottom: 40px;
        }}

        .report-isolation .analysis-text {{
            font-size: 14px;
            color: #d1d5db;
            line-height: 1.7;
            white-space: pre-wrap;
        }}

        .report-isolation footer {{
            position: absolute;
            bottom: 20mm;
            left: 20mm;
            right: 20mm;
            padding-top: 20px;
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: var(--text-muted);
            font-family: 'JetBrains Mono', monospace;
        }}

        @media print {{
            body {{ background: transparent; padding: 0; }}
            .page {{ box-shadow: none; width: 100%; height: 100%; margin: 0; }}
        }}
    </style>
</head>
<body>
    <div class="report-isolation">
        <div class="page">
        <header>
            <div class="brand">CORTEX<span>OS</span></div>
            <div class="doc-meta">
                <div>REF: {alert_id}</div>
                <div>ISSUED: {timestamp}</div>
            </div>
        </header>

        <div class="verdict-header">
            <div class="verdict-info">
                <h1>Investigation Result</h1>
                <div class="badge">{verdict}</div>
            </div>
            <div class="verdict-info" style="text-align: right;">
                <h1>Threat Level</h1>
                <div class="badge forensic" style="border-color: var(--border); color: var(--text-main); background: transparent;">CAT-{rule_level}</div>
            </div>
        </div>

        <section class="context-grid">
            <div class="context-box">
                <h2>Host Context</h2>
                <div class="data-row"><span class="label">Agent Name</span><span class="val">{agent_name}</span></div>
                <div class="data-row"><span class="label">Identifier</span><span class="val forensic">{agent_id_val}</span></div>
                <div class="data-row"><span class="label">IP Address</span><span class="val forensic">{agent_ip}</span></div>
            </div>
            <div class="context-box">
                <h2>Logic Context</h2>
                <div class="data-row"><span class="label">Rule ID</span><span class="val forensic">{rule_id}</span></div>
                <div class="data-row"><span class="label">Severity</span><span class="val font-bold">Level {rule_level}</span></div>
                <div class="data-row"><span class="label">Trigger</span><span class="val" style="font-size: 10px;">MATCHED_PATTERN</span></div>
            </div>
        </section>

        <section>
            <h2>Observation Forensics</h2>
            <table class="forensic-table">
                <thead>
                    <tr>
                        <th>Artifact Class</th>
                        <th>Evidence String</th>
                    </tr>
                </thead>
                <tbody>
                    {ioc_rows}
                </tbody>
            </table>
        </section>

        <section class="analysis-section">
            <h2 style="color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                Behavioral Context
            </h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;">
                <div style="background:rgba(15, 23, 42, 0.4); border:1px solid {'#f43f5e' if is_burst else 'var(--border)'}; border-radius:12px; padding:18px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:{'#f43f5e' if is_burst else '#10b981'};"></div>
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">Burst check (15min)</div>
                    <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">
                        <div style="font-family:'JetBrains Mono',monospace; font-size:24px; font-weight:700; color:{'#f43f5e' if is_burst else '#10b981'};">{burst_global}</div>
                        <div style="font-size:11px; font-weight:700; color:{'#f43f5e' if is_burst else '#10b981'}; opacity:0.8;">{'[!] BURST' if is_burst else '[OK] NORMAL'}</div>
                    </div>
                    <div style="font-size:11px; color:#94a3b8; line-height:1.5;">
                        <strong>{burst_global}</strong> hits globally and <strong>{burst_source}</strong> from this host in the last 15 minutes.
                        {'A burst (3+ hits in 15 min) indicates rapid-fire activity consistent with an attack or automated scanning.' if is_burst else 'No burst pattern detected.'}
                    </div>
                </div>
                <div style="background:rgba(15, 23, 42, 0.4); border:1px solid {'#fbbf24' if is_suspicious_cooc else 'var(--border)'}; border-radius:12px; padding:18px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:{'#fbbf24' if is_suspicious_cooc else '#10b981'};"></div>
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">Multi-Rule Correlation</div>
                    <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">
                        <div style="font-family:'JetBrains Mono',monospace; font-size:24px; font-weight:700; color:{'#fbbf24' if is_suspicious_cooc else '#10b981'};">{cooc_distinct}</div>
                        <div style="font-size:11px; font-weight:700; color:{'#fbbf24' if is_suspicious_cooc else '#10b981'}; opacity:0.8;">{'[!] MULTI-RULE' if is_suspicious_cooc else '[OK] NORMAL'}</div>
                    </div>
                    <div style="font-size:11px; color:#94a3b8; line-height:1.5;">
                        <strong>{cooc_distinct}</strong> distinct detection rule{'' if cooc_distinct == 1 else 's'} fired from this host in the last hour.
                        {'Multiple distinct rules from one host is a strong indicator of a multi-stage or coordinated attack.' if is_suspicious_cooc else 'No multi-rule correlation detected.'}
                    </div>
                </div>
            </div>
            <div style="margin-top:16px; padding:14px 18px; background:{'rgba(168,85,247,0.06)' if is_unusual_timing else 'rgba(15,23,42,0.4)'}; border:1px solid {'#a855f7' if is_unusual_timing else 'var(--border)'}; border-radius:12px; display:flex; align-items:center; gap:16px;">
                <div style="flex:1;">
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:{'#a855f7' if is_unusual_timing else 'var(--text-muted)'}; margin-bottom:4px;">Unusual Timing</div>
                    <div style="font-size:13px; font-weight:700; color:{'#c084fc' if is_unusual_timing else '#94a3b8'};">
                        Hour {current_hour}:00 &mdash; {hour_pct}% of historical activity at this hour
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">
                        {'UNUSUAL TIMING DETECTED: Historically only ' + str(hour_pct) + '% of alerts fire at this time. Based on ' + str(total_historical) + ' alerts over 30 days. Rare occurrence window.' if is_unusual_timing else 'Normal activity window based on ' + str(total_historical) + ' historical alerts over 30 days.'}
                    </div>
                </div>
                <div style="font-size:10px; font-weight:800; padding:4px 10px; border-radius:6px; border:1px solid {'#a855f7' if is_unusual_timing else '#334155'}; color:{'#c084fc' if is_unusual_timing else '#64748b'}; background:{'rgba(168,85,247,0.1)' if is_unusual_timing else 'transparent'}; white-space:nowrap;">
                    {'UNUSUAL TIMING' if is_unusual_timing else 'NORMAL'}
                </div>
            </div>
        </section>

        <section class="analysis-section">
            <h2>Analytical Rationale & Recommendation</h2>
            <div class="analysis-text" style="font-size: 13px; font-style: italic; opacity: 0.9;">{self.clean_data(reasoning)}</div>
        </section>

        <footer>
            <div>CONFIDENTIAL PROPERTY OF CORTEX SYSTEMS</div>
            <div>PAGE 01 // 01</div>
        </footer>
    </div>
    </div>
</body>
</html>
        """
        return html_template

html_report_service = HTMLReportService()
