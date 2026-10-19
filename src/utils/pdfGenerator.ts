import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { BRAND } from '../brand';

export interface BlueSecReportData {
    id: string;
    title: string;       // For "Alert Title" display
    verdict: string;
    confidence: number;
    reasoning: string;
    attack_category?: string;
    ai_summary: string;     // Agent 1: 1st paragraph on Page 2
    ai_reasoning: string;   // Agent 3: ANALYSIS_REASONING
    source?: string;
    burst_global?: number;
    burst_source?: number;
    is_burst?: boolean;
    cooc_distinct?: number;
    is_suspicious_cooc?: boolean;
    current_hour?: number;
    hour_pct?: number;
    is_unusual_timing?: boolean;
    alert_time_utc?: string;
    total_historical?: number;
    first_seen?: string;
    iocs_list: Array<{ type: string; value: string; source?: string; status?: string }>;
    raw_log: string;
    severity: number;
    agent_name: string;  // For "Wazuh Agent" field
    mitre_id: string;    // For "Mitre ATT&CK ID" field
    rule_id?: string;    // Wazuh Rule ID
    description: string; // Alert identifier/brief
    mitigation_steps?: string[]; // Agent 3: MITIGATION_STEPS
}

// Canva Colors - Updated for new template
const CANVA_DARK_BLUE: [number, number, number] = [10, 74, 130];  // Sidebar & Dark Titles
const CANVA_SIDEBAR_BLUE: [number, number, number] = [19, 83, 138]; // #13538a

export const generateBlueSecReport = async (alertData: BlueSecReportData, customLogo?: string | null) => {
    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

        // Helper: Draw Sidebar & Background (Every Page)
        const drawBackground = (pdf: jsPDF) => {
            // Background Color: #f0f4f8
            pdf.setFillColor(240, 244, 248);
            pdf.rect(0, 0, pageWidth, pageHeight, 'F');

            // Header Background: #e8f3ff
            pdf.setFillColor(232, 243, 255);
            pdf.rect(0, 0, pageWidth, 35, 'F');

            // Dark Blue Sidebar - Adjusted to 12mm
            pdf.setFillColor(CANVA_SIDEBAR_BLUE[0], CANVA_SIDEBAR_BLUE[1], CANVA_SIDEBAR_BLUE[2]);
            pdf.rect(0, 0, 12, pageHeight, 'F');
        };

        const drawHeader = (pdf: jsPDF) => {
            // Logo at top left
            try {
                const logoSrc = customLogo || BRAND.logo;
                pdf.addImage(logoSrc, 'PNG', 22, 10, 40, 16);
            } catch (e) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(22);
                pdf.setTextColor(CANVA_DARK_BLUE[0], CANVA_DARK_BLUE[1], CANVA_DARK_BLUE[2]);
                pdf.text(BRAND.fullName, 22, 22);
            }

            // Generated Timestamp (Top Right)
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.setTextColor(CANVA_DARK_BLUE[0], CANVA_DARK_BLUE[1], CANVA_DARK_BLUE[2]);
            const headerX = pageWidth - 54;
            pdf.text('Generated :', headerX, 17);
            pdf.text(`${timestamp}`, headerX, 23.4);

            // Dotted Separator Line
            pdf.setDrawColor(21, 58, 102); // #153a66
            pdf.setLineWidth(0.2);
            pdf.setLineDashPattern([0.5, 0.5], 0);
            pdf.line(12, 35, pageWidth, 35);
            pdf.setLineDashPattern([], 0);
        };

        drawBackground(doc);
        drawHeader(doc);

        // --- 2. REPORT TITLE ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22.9);
        doc.setTextColor(39, 65, 147); // #274193

        const titleText = '- AI REPORT SUMMARY -';
        const charSpaceSum = 1.2;
        const centerX = pageWidth / 2 + 6;
        const titleWidth = doc.getTextWidth(titleText) + (titleText.length - 1) * charSpaceSum;
        const titleStartX = centerX - (titleWidth / 2);

        doc.text(titleText, titleStartX, 64, { charSpace: charSpaceSum });

        // --- 3. TITRE BOX ---
        const titleBoxY = 85;
        const titleBoxWidth = 160;
        const titleBoxX = centerX - (titleBoxWidth / 2);

        // Prepare wrapped text
        doc.setFont('times', 'bold');
        doc.setFontSize(20.8);
        doc.setTextColor(21, 58, 102);
        const alertTitleText = alertData.title || 'Alert Title';
        const maxWidth = titleBoxWidth - 20; // Padding inside box
        const wrappedTitle = doc.splitTextToSize(alertTitleText, maxWidth);

        // Calculate dynamic height
        const lineHeight = 10; // Increased for font size 20.8
        const titleBoxHeight = Math.max(22, (wrappedTitle.length * lineHeight) + 12); // More generous padding

        // Lines above and below Titre
        doc.setDrawColor(CANVA_DARK_BLUE[0], CANVA_DARK_BLUE[1], CANVA_DARK_BLUE[2]);
        doc.setLineWidth(0.4);
        const lineOffset = 25;
        doc.line(titleBoxX + lineOffset, titleBoxY - 4, titleBoxX + titleBoxWidth - lineOffset, titleBoxY - 4);
        doc.line(titleBoxX + lineOffset, titleBoxY + titleBoxHeight + 4, titleBoxX + titleBoxWidth - lineOffset, titleBoxY + titleBoxHeight + 4);

        // Rounded Box with Fill and Border
        doc.setFillColor(232, 243, 255); // #e8f3ff
        doc.setDrawColor(19, 83, 138); // #13538a
        doc.setLineWidth(0.4);
        doc.roundedRect(titleBoxX, titleBoxY, titleBoxWidth, titleBoxHeight, 2, 2, 'FD');

        // Render wrapped title - Precise manual vertical centering
        // fontSize 20.8pt is approx 7.3mm. Line height is 10mm.
        // startY centers the entire block by accounting for cap height and total lines
        const startY = titleBoxY + (titleBoxHeight / 2) + 3.65 - ((wrappedTitle.length - 1) * lineHeight / 2);

        doc.text(wrappedTitle, centerX, startY, {
            align: 'center'
        });

        // --- 4. THREAT LEVEL GAUGE ---
        const drawThreatGauge = (x: number, y: number, radius: number) => {
            const verdict = (alertData.verdict || 'SUSPICIOUS').toUpperCase();
            const confidence = alertData.confidence || 50;

            // Score mapping: 0 to 100
            let score = 50;
            if (verdict === 'MALICIOUS') {
                score = 66 + (confidence / 100) * 34;
            } else if (verdict === 'SUSPICIOUS') {
                score = 33 + (confidence / 100) * 33;
            } else { // BENIGN / FALSE POSITIVE
                score = 33 - (confidence / 100) * 33;
            }
            score = Math.max(0, Math.min(100, Math.round(score)));

            // 1. Navy Outer Border Arc
            doc.setLineCap('butt'); // "Edgy" flat ends
            doc.setDrawColor(19, 83, 138); // Brand Navy #13538a
            doc.setLineWidth(4.5);

            const borderRadius = radius + 11.5;
            const borderSegments = 1000;
            for (let i = 0; i < borderSegments; i++) {
                const s = i / borderSegments;
                const nextS = (i + 1.1) / borderSegments; // Overlap covers the hairline gaps
                const a1 = Math.PI - (s * Math.PI);
                const a2 = Math.PI - (nextS * Math.PI);
                doc.line(x + borderRadius * Math.cos(a1), y - borderRadius * Math.sin(a1), x + borderRadius * Math.cos(a2), y - borderRadius * Math.sin(a2));
            }

            // 2. Draw 5 Discrete Segments
            const colors = [
                [34, 197, 94],   // Green
                [132, 204, 22],  // Light Green/Yellow
                [234, 179, 8],   // Yellow
                [249, 115, 22],  // Orange
                [239, 68, 68]    // Red
            ];

            const thickness = 10;
            const segmentsCount = 5;
            for (let i = 0; i < segmentsCount; i++) {
                const aStart = Math.PI - (i / segmentsCount * Math.PI);
                const aEnd = Math.PI - ((i + 1) / segmentsCount * Math.PI);

                // Draw segment
                doc.setDrawColor(colors[i][0], colors[i][1], colors[i][2]);
                doc.setLineWidth(thickness);

                const detail = 100;
                for (let j = 0; j < detail; j++) {
                    const s = j / detail;
                    const nextS = (j + 1.1) / detail; // Overlap covers the hairline gaps
                    const a1 = aStart + s * (aEnd - aStart);
                    const a2 = aStart + nextS * (aEnd - aStart);
                    doc.line(x + radius * Math.cos(a1), y - radius * Math.sin(a1), x + radius * Math.cos(a2), y - radius * Math.sin(a2));
                }

                // White Divider (except after the last segment)
                if (i < segmentsCount - 1) {
                    doc.setDrawColor(255, 255, 255);
                    doc.setLineWidth(0.6);
                    const x1 = x + (radius - thickness / 2) * Math.cos(aEnd);
                    const y1 = y - (radius - thickness / 2) * Math.sin(aEnd);
                    const x2 = x + (radius + thickness / 2) * Math.cos(aEnd);
                    const y2 = y - (radius + thickness / 2) * Math.sin(aEnd);
                    doc.line(x1, y1, x2, y2);
                }
            }

            // 3. Tapered Navy Needle
            const needleAngle = Math.PI - (score / 100 * Math.PI);
            const needleLen = radius + 2;
            const nx = x + needleLen * Math.cos(needleAngle);
            const ny = y - needleLen * Math.sin(needleAngle);

            // Needle drawing (as a filled polygon for tapering)
            const baseWidth = 4;
            const leftAngle = needleAngle + Math.PI / 2;
            const rightAngle = needleAngle - Math.PI / 2;

            const bx1 = x + (baseWidth / 2) * Math.cos(leftAngle);
            const by1 = y - (baseWidth / 2) * Math.sin(leftAngle);
            const bx2 = x + (baseWidth / 2) * Math.cos(rightAngle);
            const by2 = y - (baseWidth / 2) * Math.sin(rightAngle);

            doc.setFillColor(30, 41, 59);
            doc.triangle(bx1, by1, bx2, by2, nx, ny, 'F');

            // Needle Cap
            doc.setFillColor(30, 41, 59);
            doc.circle(x, y, 3, 'F');
            doc.setFillColor(255, 255, 255);
            doc.circle(x, y, 1, 'F');

            // 4. Integrated Bottom Label (Dynamic Coloring)
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');

            const prefix = "Threat Level: ";
            const statusText = `${verdict} (${score}/100)`;

            const prefixWidth = doc.getTextWidth(prefix);
            const statusWidth = doc.getTextWidth(statusText);
            const totalWidth = prefixWidth + statusWidth;
            const startX = x - (totalWidth / 2);

            // "Threat Level: " in Navy
            doc.setTextColor(21, 58, 102);
            doc.text(prefix, startX, y + 14);

            // Status in Segment Color
            const colorIdx = Math.min(4, Math.floor(score / 20));
            const statusColor = colors[colorIdx];
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
            doc.text(statusText, startX + prefixWidth, y + 14);

            // AI Confidence Label (Green)
            doc.setTextColor(34, 197, 94); // Green #22c55e
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            const confidenceText = `AI Confidence : ${confidence}%`;
            doc.text(confidenceText, x, y + 21, { align: 'center' });
        };

        const gaugeY = titleBoxY + titleBoxHeight + 46;
        drawThreatGauge(centerX, gaugeY, 22);

        // --- 5. ALERT DETAILS TABLE ---
        const tableY = gaugeY + 31; // Shifted down relative to gauge
        const tableWidth = 120;
        const tableX = centerX - (tableWidth / 2);

        autoTable(doc, {
            startY: tableY,
            head: [[{ content: '', colSpan: 2, styles: { minCellHeight: 15 } }]],
            body: [
                ['Alert ID', alertData.id || 'N/A'],
                ['Wazuh Agent', alertData.agent_name || 'N/A'],
                ['Rule Level', String(alertData.severity || 0)],
                ['Mitre ATT&CK ID', alertData.mitre_id || 'N/A']
            ],
            theme: 'grid',
            headStyles: {
                fillColor: [232, 243, 255], // #e8f3ff
                lineWidth: 0.4,
                lineColor: [21, 58, 102] // #153a66
            },
            bodyStyles: {
                fillColor: [240, 244, 248], // #f0f4f8
                textColor: [0, 0, 0],
                fontSize: 11.9,
                font: 'helvetica',
                valign: 'middle',
                cellPadding: 5,
                lineColor: [21, 58, 102], // #153a66
                lineWidth: 0.4
            },
            columnStyles: {
                0: {
                    cellWidth: 48,
                    fontStyle: 'bold',
                    halign: 'left',
                    fillColor: [232, 243, 255] // #e8f3ff background for labels
                },
                1: {
                    cellWidth: 72,
                    fontStyle: 'bold', // Made bold per user request
                    textColor: [19, 83, 138], // #13538a
                    halign: 'center',
                    fillColor: [240, 244, 248] // #f0f4f8 background for values (matches PDF background)
                }
            },
            margin: { left: tableX },
            tableWidth: tableWidth,
            tableLineWidth: 0.4,
            tableLineColor: [21, 58, 102],
            didDrawCell: (data) => {
                if (data.section === 'head' && data.column.index === 0) {
                    try {
                        const imgWidth = 40.4;
                        const imgHeight = 8;
                        const x = data.cell.x + (data.cell.width / 2) - (imgWidth / 2);
                        const y = data.cell.y + (data.cell.height / 2) - (imgHeight / 2);
                        doc.addImage('/assets/wazuh-logo-full.png', 'PNG', x, y, imgWidth, imgHeight);
                    } catch (e) {
                        // Fallback
                    }
                }
            }
        });

        // --- 6. PAGE 2: DETAILED ANALYSIS ---
        doc.addPage();
        drawBackground(doc);
        drawHeader(doc);

        let currentY = 55; // Shifted up from 65

        // Title: AI Report Summary
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(37); // Specific request
        doc.setTextColor(19, 83, 138); // #13538a
        doc.text('AI Report Summary', 25, currentY);

        // Underline for title
        currentY += 8;
        doc.setDrawColor(19, 83, 138);
        doc.setLineWidth(0.3);
        doc.line(25, currentY, 195, currentY);

        // Paragraph 1: AI Summary (Agent 1)
        currentY += 10; // Tightened from 12
        doc.setFont('times', 'normal');
        doc.setFontSize(14);
        doc.setTextColor(19, 83, 138); // Brand Navy #13538a
        const summaryText = alertData.ai_summary || 'No summary available.';
        const wrappedSummary = doc.splitTextToSize(summaryText, 170);
        doc.text(wrappedSummary, 25, currentY);
        currentY += (wrappedSummary.length * 7) + 8; // Precision shrink from 15

        // Page overflow check for new section (avoid starting in bottom 10% of page)
        if (currentY > 260) {
            doc.addPage();
            drawBackground(doc);
            drawHeader(doc);
            currentY = 55;
        }

        // Section: AI Reasoning (Agent 3)
        doc.setFont('times', 'bold');
        doc.setFontSize(20.8);
        doc.setTextColor(19, 83, 138);
        doc.text('•  AI Reasoning', 25, currentY);

        currentY += 10; // Increased and standardized gap
        const reasoningText = alertData.ai_reasoning || 'No analysis available.';

        doc.setFont('times', 'normal');
        doc.setFontSize(13);
        doc.setTextColor(0, 0, 0); // Pure Black

        const wrappedReasoning = doc.splitTextToSize(reasoningText, 160);
        const reasoningBoxHeight = (wrappedReasoning.length * 6) + 10;

        doc.setFillColor(232, 243, 255); // #e8f3ff
        doc.setDrawColor(19, 83, 138);
        doc.setLineWidth(0.4);
        doc.roundedRect(25, currentY, 170, reasoningBoxHeight, 2, 2, 'FD');

        doc.text(wrappedReasoning, 30, currentY + 9.3); // High-precision centering
        currentY += reasoningBoxHeight + 15; // Tightened gap from 20

        // Page overflow check for new section (avoid starting in bottom 10% of page)
        if (currentY > 260) {
            doc.addPage();
            drawBackground(doc);
            drawHeader(doc);
            currentY = 55;
        }

        // Section: Behavioral Context (Agent 2)
        doc.setFont('times', 'bold');
        doc.setFontSize(20.8);
        doc.setTextColor(19, 83, 138);
        doc.text('•  Behavioral Context', 25, currentY);

        currentY += 10;
        const burstGlobal = alertData.burst_global ?? 0;
        const burstSource = alertData.burst_source ?? 0;
        const isBurst = alertData.is_burst ?? false;
        const coocDistinct = alertData.cooc_distinct ?? 0;
        const isSuspiciousCooc = alertData.is_suspicious_cooc ?? false;
        const currentHour = alertData.current_hour ?? 0;
        const hourPct = alertData.hour_pct ?? 0;
        const isUnusualTiming = alertData.is_unusual_timing ?? false;
        const totalHistorical = alertData.total_historical ?? 0;
        const hostName = alertData.source || 'This host';

        // Helper to draw a forensic metric row with wrapped narrative text and highlighted variables
        const drawMetricRow = (
            label: string,
            narrative: string, // supports [[variable]] for colored text
            status: string,
            isAlert: boolean,
            alertColor: [number, number, number],
            neutralColor: [number, number, number]
        ) => {
            const rowColor: [number, number, number] = isAlert ? alertColor : neutralColor;
            const maxTextW = 145;
            
            // 1. Calculate height by stripping highlight tags first
            const plainText = narrative.replace(/\[\[/g, '').replace(/\]\]/g, '');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const lines = doc.splitTextToSize(plainText, maxTextW);
            const rowH = Math.max(16, (lines.length * 4.8) + 11);

            // Page overflow check (avoid cutting frames at the bottom)
            if (currentY + rowH > 275) {
                doc.addPage();
                drawBackground(doc);
                drawHeader(doc);
                currentY = 55;
            }

            const y = currentY;

            // Row background
            doc.setFillColor(isAlert ? 255 : 245, isAlert ? 245 : 248, isAlert ? 245 : 255);
            doc.setDrawColor(rowColor[0], rowColor[1], rowColor[2]);
            doc.setLineWidth(0.3);
            doc.roundedRect(25, y, 170, rowH, 1.5, 1.5, 'FD');

            // Left colored accent bar
            doc.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
            doc.rect(25, y, 3, rowH, 'F');

            // Label (bold, colored)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(rowColor[0], rowColor[1], rowColor[2]);
            doc.text(label, 32, y + 5.5);

            // Status badge (right side, auto-sized to text)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            const badgePadding = 3;
            const badgeTextW = doc.getTextWidth(status);
            const badgeW = badgeTextW + badgePadding * 2;
            const badgeX = 192 - badgeW; // right-aligned inside row
            doc.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
            doc.roundedRect(badgeX, y + 1.5, badgeW, 7, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(status, badgeX + badgeW / 2, y + 6.5, { align: 'center' });

            // 2. Render Narrative with Highlights
            // We'll process the original narrative line-by-line (using the plainText line breaks as a guide)
            // This is a simplified version that works as long as highlights don't span lines
            let currentLineY = y + 11;
            
            // Re-splitting narrative into parts manually for the wrapping logic
            // To keep it simple and robust, we'll draw the segments and handle wrapping
            let cursorX = 32;
            const words = narrative.split(/(\s+|\[\[|\]\])/);

            doc.setFontSize(9);
            doc.setTextColor(40, 40, 60); // Ensure initial text is dark grey
            words.forEach(word => {
                if (!word) return;
                if (word === '[[') {
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(rowColor[0], rowColor[1], rowColor[2]);
                    return;
                }
                if (word === ']]') {
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(40, 40, 60);
                    return;
                }

                const wordW = doc.getTextWidth(word);
                if (cursorX + wordW > 25 + maxTextW) {
                    cursorX = 32;
                    currentLineY += 4.8;
                }
                doc.text(word, cursorX, currentLineY);
                cursorX += wordW;
            });

            currentY += rowH + 4;
        };

        // Row 1: Burst Check
        const burstSourceStr = burstSource === 0 ? 'NO' : burstSource;
        const burstGlobalStr = burstGlobal === 0 ? 'NO' : burstGlobal;
        const burstHitsWord = burstSource === 1 ? 'hit' : 'hits';
        const burstNarrative = `This host [[(${hostName})]] has triggered [[${burstSourceStr} ${burstHitsWord}]] of this rule in the last 15 minutes, which ${isBurst ? 'indicates a significant activity burst' : 'is currently within normal volume limits'} compared to the [[${burstGlobalStr} total]] network-wide triggers.`;
        drawMetricRow('Burst Check (15min)', burstNarrative, isBurst ? 'BURST' : 'NORMAL', isBurst, [180, 40, 60], [30, 130, 90]);

        // Row 2: Multi-Rule Correlation
        let coocNarrative = '';
        if (coocDistinct === 0) {
            coocNarrative = `This host [[(${hostName})]] has triggered [[NO]] security rules within the last 1 hour, which currently shows no suspicious rule correlation.`;
        } else {
            const coocRuleWord = coocDistinct === 1 ? 'rule' : 'rules';
            coocNarrative = `This host [[(${hostName})]] has triggered [[${coocDistinct} different]] security ${coocRuleWord} within the last 1 hour, which ${isSuspiciousCooc ? 'could be a strong indicator of a multi-stage attack' : 'currently shows no suspicious rule correlation'}.`;
        }
        drawMetricRow('Multi-Rule Correlation', coocNarrative, isSuspiciousCooc ? 'CORRELATED' : 'NORMAL', isSuspiciousCooc, [160, 100, 0], [30, 130, 90]);

        // Row 3: Timing Analysis
        const localDate = alertData.alert_time_utc ? new Date(alertData.alert_time_utc) : null;
        const localHour = localDate ? localDate.getHours() : (currentHour ?? 0);
        const localNextHour = (localHour + 1) % 24;
        const localTimeStr = localDate ? localDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : `${String(localHour).padStart(2, '0')}:00:00`;
        const timeRange = `[[${String(localHour).padStart(2, '0')}:00]] and [[${String(localNextHour).padStart(2, '0')}:00]]`;
        const ruleId = alertData.rule_id || 'Unknown';

        const timingNarrative = totalHistorical >= 10
            ? `This alert was triggered at [[${localTimeStr}]], out of all [[${totalHistorical} similar alerts]] with this rule [[(${ruleId})]], coming from the same source [[(${hostName})]], spanning a 30-day window, [[${hourPct}%]] of them are usually triggered between ${timeRange}, which is why this is [[${isUnusualTiming ? 'an anomaly' : 'an expected behavior'}]] since it [[${isUnusualTiming ? 'deviates significantly from' : 'matches'}]] established historical patterns.`
            : `This alert was triggered at [[${localTimeStr}]] with rule [[(${ruleId})]] from source [[(${hostName})]]. Insufficient 30-day history available for baseline timing comparison.`;
        
        drawMetricRow('Forensic Timing Summary', timingNarrative, isUnusualTiming ? 'ANOMALY' : 'EXPECTED', isUnusualTiming, [100, 50, 180], [30, 130, 90]);

        currentY += 11;

        // Page overflow check for new section (avoid starting in bottom 10% of page)
        if (currentY > 260) {
            doc.addPage();
            drawBackground(doc);
            drawHeader(doc);
            currentY = 55;
        }

        // Section: Key Forensic Artifacts
        doc.setFont('times', 'bold');
        doc.setFontSize(20.8);
        doc.setTextColor(19, 83, 138);
        doc.text('•  Key Forensic Artifacts', 25, currentY);

        currentY += 10; // Increased and standardized gap

        // Helper to normalize IP addresses (compress IPv6 loopback)
        const normalizeIP = (val: string) => {
            if (!val) return 'N/A';
            if (val === '0000:0000:0000:0000:0000:0000:0000:0001' || val === '0:0:0:0:0:0:0:1') return '::1';
            return val;
        };

        const iocBody = (alertData.iocs_list || []).map(ioc => [
            (ioc.type || 'UNKNOWN').toUpperCase(),
            normalizeIP(ioc.value), // Apply normalization
            ioc.source || 'INTERNAL'
        ]);

        // Monkey-patch doc.addPage so auto-generated pages from autoTable get the template BEFORE table cells are drawn
        const originalAddPage = doc.addPage.bind(doc);
        doc.addPage = function (...args: any[]) {
            const res = originalAddPage(...args);
            drawBackground(doc);
            drawHeader(doc);
            return res;
        };

        autoTable(doc, {
            startY: currentY,
            head: [['Type', 'Value', 'Source']],
            body: iocBody.length > 0 ? iocBody : [['-', 'No IoCs detected', '-']],
            theme: 'grid',
            headStyles: {
                fillColor: [19, 83, 138], // #13538a
                textColor: 255,
                fontSize: 13,
                font: 'helvetica',
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 9,
                cellPadding: 4,
                lineColor: [19, 83, 138], // Brand Navy #13538a
                lineWidth: 0.3, // Thinned borders
                overflow: 'linebreak', // Allow long strings like URLs to break nicely
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 35 },      // Type
                1: { cellWidth: 100 },     // Value (large enough for URLs)
                2: { cellWidth: 35 }       // Source
            },
            bodyStyles: {
                textColor: [19, 83, 138] // Brand Navy text for body
            },
            didDrawCell: (data) => {
                // Custom styling for Header: White vertical separators only
                if (data.section === 'head' && data.column.index < 2) {
                    const docToUse = data.doc;
                    // Reset to White for the vertical divider
                    docToUse.setDrawColor(255, 255, 255);
                    docToUse.setLineWidth(0.7); // Visually match standard border thickness
                    docToUse.line(
                        data.cell.x + data.cell.width,
                        data.cell.y,
                        data.cell.x + data.cell.width,
                        data.cell.y + data.cell.height
                    );
                }
            },
            margin: { top: 50, left: 25, right: 15, bottom: 20 }
        });

        // --- 7. MITIGATION STEPS (After Table) ---
        if (alertData.mitigation_steps && alertData.mitigation_steps.length > 0) {
            let tableFinalY = (doc as any).lastAutoTable.finalY + 15;
            
            // Check for page break
            const estHeight = (alertData.mitigation_steps.length * 7) + 20;
            if (tableFinalY + estHeight > pageHeight - 20) {
                doc.addPage();
                drawBackground(doc);
                drawHeader(doc);
                tableFinalY = 55;
            }

            // Page overflow check for new section (avoid starting in bottom 10% of page)
            if (tableFinalY > 260) {
                doc.addPage();
                drawBackground(doc);
                drawHeader(doc);
                tableFinalY = 55;
            }

            doc.setFont('times', 'bold');
            doc.setFontSize(20.8);
            doc.setTextColor(19, 83, 138);
            doc.text('•  Mitigation steps', 25, tableFinalY);

            tableFinalY += 10;
            doc.setFont('times', 'normal');
            doc.setFontSize(13);
            doc.setTextColor(0, 0, 0);

            // Calculate dynamic height for mitigation box
            let totalMitigationHeight = 0;
            const wrappedSteps = alertData.mitigation_steps.map(step => {
                const wrapped = doc.splitTextToSize(step, 150);
                totalMitigationHeight += (wrapped.length * 6) + 2;
                return wrapped;
            });

            const mitigationBoxHeight = totalMitigationHeight + 8;
            doc.setFillColor(232, 243, 255); // #e8f3ff
            doc.setDrawColor(19, 83, 138);
            doc.setLineWidth(0.4);
            doc.roundedRect(25, tableFinalY, 170, mitigationBoxHeight, 2, 2, 'FD');

            let currentMitigationY = tableFinalY + 9;
            wrappedSteps.forEach((wrappedStep) => {
                const stepHeight = (wrappedStep.length * 6);

                // Draw manual triangle (arrow) in Emerald Green
                doc.setFillColor(34, 197, 94);
                const triX = 30;
                const triY = currentMitigationY - 1.5; 
                doc.triangle(
                    triX, triY - 1.5,      // Top
                    triX, triY + 1.5,      // Bottom
                    triX + 2, triY,        // Tip
                    'F'
                );

                // Step Text
                doc.setTextColor(0, 0, 0);
                doc.text(wrappedStep, 35, currentMitigationY);
                
                currentMitigationY += stepHeight + 2; // Advance Y by step height + small gap
            });
        }

        // Footer Numbering
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(21, 58, 102); // #153a66
            doc.text(`${BRAND.fullName} | AI investigation report | Page ${i} of ${totalPages}`, pageWidth / 2 + 7.5, pageHeight - 3, { align: 'center' });
        }

        doc.save(`${BRAND.product}_Analysis_${alertData.id || 'export'}.pdf`);
    } catch (error) {
        console.error("Critical error in generateBlueSecReport:", error);
        throw error;
    }
};
