import { useState } from 'react';
import {
    Clock,
    Server,
    Globe,
    Activity,
    FileText,
    Download,
    Wifi,
    Terminal,
    Layers,
    ChevronDown
} from 'lucide-react';
import { cn } from './DashboardLayout';

/** Uppercase field label — shared so label styling stays consistent across panels. */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[9px] uppercase tracking-wider text-cyan-400 font-mono mb-1 [text-shadow:0_0_4px_rgba(34,211,238,0.4)]">
        {children}
    </div>
);

/**
 * Sub-group inside a panel: a labelled block separated by a rule rather than a nested box.
 *
 * FieldGroup owns the entire vertical rhythm — the parent must NOT add its own gap, or the two
 * compound and the spacing drifts. One value (3 / 12px) is used on both sides of the divider so
 * every peer group sits on the same rhythm regardless of how tall its content is.
 */
const FieldGroup = ({ label, children, divided = true }: { label: string; children: React.ReactNode; divided?: boolean }) => (
    <div className={cn(divided && "mt-3 border-t border-cyan-500/10 pt-3")}>
        <FieldLabel>{label}</FieldLabel>
        {children}
    </div>
);

/**
 * Placeholder for enrichment data that is not wired up yet.
 * Deliberately lighter than a populated panel: dashed border, no solid fill, dimmer header —
 * but the empty state itself is a composed icon + label so it reads as reserved, not broken.
 */
const ReservedBlock = ({ icon: Icon, title, hint, sub, className }: { icon: any; title: string; hint: string; sub?: string; className?: string }) => (
    <div className={cn("flex-none min-h-[112px] overflow-hidden rounded-xl border border-dashed border-cyan-500/25 bg-slate-950/20 p-3 flex flex-col", className)}>
        <div className="flex-none flex items-center gap-2 pb-2 border-b border-cyan-500/10">
            <Icon size={13} className="text-cyan-400/70" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200/80">{title}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 py-2 px-3 text-center">
            <div className="flex-none w-7 h-7 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 flex items-center justify-center">
                <Icon size={13} className="text-cyan-400/70" />
            </div>
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">{hint}</span>
            {sub && (
                <span className="text-[9px] font-mono text-slate-400/90 leading-snug max-w-full">{sub}</span>
            )}
        </div>
    </div>
);

/**
 * Raw log line exactly as Wazuh delivered it. Only `full_log` is rendered — no derived or
 * reconstructed text — so what is shown is always the literal source line.
 * Collapsed to a few lines by default; click to expand when the log is long enough to need it.
 */
const RawLogPanel = ({ fullLog, className }: { fullLog: string | null; className?: string }) => {
    const [expanded, setExpanded] = useState(false);

    // Nothing to show: collapse to a single slim row instead of reserving a full-height box.
    // `className` is deliberately NOT applied here — the caller passes flex-1 to let a populated
    // log absorb slack, which would re-inflate this empty state into the box we just removed.
    if (!fullLog) {
        return (
            <div className="flex-none flex items-center gap-2 rounded-lg border border-dashed border-cyan-500/20 bg-slate-950/20 px-3 py-1.5">
                <Terminal size={11} className="shrink-0 text-cyan-400/60" />
                <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">Raw log unavailable</span>
                <span className="ml-auto text-[9px] font-mono text-slate-400/80 shrink-0">no full_log field</span>
            </div>
        );
    }

    // Only offer the toggle when there is genuinely more to reveal.
    const isLong = fullLog.length > 220 || fullLog.split('\n').length > 4;

    return (
        <div className={cn("flex-none min-h-[112px] rounded-xl border border-cyan-500/50 bg-transparent p-3 flex flex-col transition-all hover:border-cyan-400", className)}>
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-cyan-500/10">
                <div className="flex items-center gap-2">
                    <Terminal size={13} className="text-cyan-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200">Raw Log Preview</span>
                </div>
                {isLong && (
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                        {expanded ? 'Collapse' : 'Expand'}
                        <ChevronDown size={11} className={cn("transition-transform", expanded && "rotate-180")} />
                    </button>
                )}
            </div>

            <div
                onClick={() => isLong && setExpanded(v => !v)}
                className={cn(
                    "relative mt-2",
                    isLong && "cursor-pointer"
                )}
            >
                <pre className={cn(
                    "text-[10px] font-mono text-cyan-100 leading-relaxed whitespace-pre-wrap break-all",
                    expanded ? "max-h-[280px] overflow-y-auto cyber-scrollbar pr-1" : "max-h-[88px] overflow-hidden"
                )}>
                    {fullLog}
                </pre>
                {/* Fade cue that there is more below */}
                {isLong && !expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#0b1224] to-transparent pointer-events-none" />
                )}
            </div>
        </div>
    );
};

export const AlertDetails = ({ alert }: { alert: any }) => {
    if (!alert) return <div className="h-full flex items-center justify-center text-slate-400 font-mono">SELECT_SIGNAL</div>;

    // --- ROBUST DATA EXTRACTION ---
    let rawData = alert.rawData || alert;
    if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch (e) { console.error("Failed to parse rawData", e); }
    }

    if (!rawData.rule && !rawData.agent && rawData.raw_data) {
        rawData = rawData.raw_data;
    }

    const rule = rawData.rule || {};
    const agentData = rawData.agent || {};

    // "Real" agent = an endpoint agent, not the Wazuh manager node (id "000")
    const hasRealAgent = !!(
        (agentData.name || agentData.id || agentData.ip) &&
        agentData.id !== '000'
    );

    // managerName needed below — must be declared before sourcePairs
    const managerName = rawData.manager?.name || null;

    // Source fields for cloud / integration alerts (no endpoint agent)
    const dataBlock = rawData.data || {};
    const integrationName: string = dataBlock.integration || rawData.location || null;
    const integrationData: Record<string, any> = integrationName && dataBlock[integrationName]
        ? dataBlock[integrationName]
        : dataBlock;
    const sourcePairs: { label: string; value: string }[] = [];
    if (integrationName) sourcePairs.push({ label: 'Integration', value: integrationName });
    if (managerName)     sourcePairs.push({ label: 'Collector Node', value: managerName });
    const srcip  = integrationData.SenderIp || dataBlock.srcip  || integrationData.srcip  || null;
    const dstip  = dataBlock.dstip  || integrationData.dstip  || null;
    const proto  = dataBlock.protocol || integrationData.protocol || null;
    const sender = integrationData.P2Sender || integrationData.P1Sender || integrationData.sender || null;
    const recipient = Array.isArray(integrationData.Recipients)
        ? integrationData.Recipients[0]
        : integrationData.recipient || null;
    const delivery  = integrationData.DeliveryAction || null;
    const verdict2  = integrationData.Verdict || null;
    const detection = integrationData.DetectionMethod || integrationData.DetectionType || null;
    if (srcip)     sourcePairs.push({ label: 'Source IP',        value: srcip });
    if (dstip)     sourcePairs.push({ label: 'Destination IP',   value: dstip });
    if (proto)     sourcePairs.push({ label: 'Protocol',         value: proto });
    if (sender)    sourcePairs.push({ label: 'Sender',           value: sender });
    if (recipient) sourcePairs.push({ label: 'Recipient',        value: recipient });
    if (delivery)  sourcePairs.push({ label: 'Delivery Action',  value: delivery });
    if (verdict2)  sourcePairs.push({ label: 'Threat Verdict',   value: verdict2 });
    if (detection) sourcePairs.push({ label: 'Detection Method', value: detection });

    // Azure AD / identity provider fields (flat in data block, not nested)
    const ipAddress = integrationData.IPAddress || integrationData.ipAddress || null;
    const userUPN   = integrationData.UserPrincipalName || integrationData.userPrincipalName || null;
    const appName   = integrationData.AppDisplayName || integrationData.appDisplayName || null;
    const caStatus  = integrationData.ConditionalAccessStatus || null;
    const geoRegion = integrationData.Location || null;
    const clientApp = integrationData.ClientAppUsed || null;
    const resultSig = integrationData.ResultSignature || null;
    if (ipAddress && !srcip) sourcePairs.push({ label: 'IP Address',   value: ipAddress });
    if (userUPN)             sourcePairs.push({ label: 'User',         value: userUPN });
    if (appName)             sourcePairs.push({ label: 'Application',  value: appName });
    if (caStatus)            sourcePairs.push({ label: 'CA Status',    value: caStatus });
    if (geoRegion)           sourcePairs.push({ label: 'Region',       value: geoRegion });
    if (clientApp)           sourcePairs.push({ label: 'Client',       value: clientApp });
    if (resultSig)           sourcePairs.push({ label: 'Result',       value: resultSig });

    let rawIp: string | null = agentData.ip || (typeof rawData.source === 'string' && rawData.source.includes('(') ? rawData.source.split('(')[1].replace(')', '') : null);
    if (rawIp === '::1' || (rawIp && rawIp.includes('0000:0000:0000:0000:0000:0000:0000:0001'))) {
        rawIp = '127.0.0.1';
    }
    const isLocalhost = rawIp === '127.0.0.1' || rawIp === 'localhost';

    // AI summary (from completed scan)
    const aiResults = rawData.ai_analysis_results || {};
    const aiSummary: string | null = aiResults.agent_screener?.summary || null;
    const isAiScanned = !!(aiSummary || rawData.verdict || alert.verdict);

    // MITRE & enrichment
    const mitre = rule.mitre || {};
    const mitreTactics: string[] = mitre.tactic || [];
    const mitreIds: string[] = mitre.id || [];
    const hasMitre = mitreTactics.length > 0 || mitreIds.length > 0;

    // Compliance tags — shown as fallback when no MITRE mapping exists
    const complianceTags: { framework: string; ids: string[] }[] = [];
    if ((rule.hipaa || []).length > 0)       complianceTags.push({ framework: 'HIPAA',       ids: rule.hipaa });
    if ((rule.pci_dss || []).length > 0)     complianceTags.push({ framework: 'PCI DSS',     ids: rule.pci_dss });
    if ((rule.gdpr || []).length > 0)        complianceTags.push({ framework: 'GDPR',        ids: rule.gdpr });
    if ((rule.nist_800_53 || []).length > 0) complianceTags.push({ framework: 'NIST 800-53', ids: rule.nist_800_53 });
    const hasCompliance = complianceTags.length > 0;
    const ruleDescription = rule.description || '';
    // Raw log line as delivered by Wazuh. Absent on most alert types, so treat blank as missing.
    const fullLog: string | null =
        typeof rawData.full_log === 'string' && rawData.full_log.trim().length > 0
            ? rawData.full_log
            : null;
    const osInfo = agentData.os ? [agentData.os.name, agentData.os.version].filter(Boolean).join(' ') : null;
    const occurrenceCount = alert.occurrence_count ?? rawData.occurrence_count ?? null;
    const firstSeen = alert.first_seen ?? rawData.first_seen ?? null;
    const assignee = alert.assignee ?? rawData.assignee ?? null;

    const displayData = {
        title: alert.title || rule.description || rawData.title || 'UNDEFINED_SECURITY_EVENT',
        level: alert.level !== undefined ? alert.level : (rule.level || 0),
        timestamp: alert.timestamp || rawData.timestamp,
        agentName: agentData.name || alert.agent || rawData.source || null,
        agentId: agentData.id || null,
        agentIp: rawIp,
        location: rawData.location || 'Internal',
        groups: rule.groups || [],
        ruleId: rule.id || '---'
    };

    const getSeverityConfig = (level: number) => {
        if (level >= 13) return { bars: 5, label: 'CRITICAL', color: 'text-purple-400', bg: 'bg-purple-500', panelBg: 'bg-transparent' };
        if (level >= 10) return { bars: 4, label: 'HIGH',     color: 'text-rose-400',   bg: 'bg-rose-500',   panelBg: 'bg-transparent' };
        if (level >= 7)  return { bars: 3, label: 'MEDIUM',   color: 'text-orange-400', bg: 'bg-orange-500', panelBg: 'bg-transparent' };
        if (level >= 4)  return { bars: 2, label: 'LOW',      color: 'text-yellow-400', bg: 'bg-yellow-500', panelBg: 'bg-transparent' };
        return                 { bars: 1, label: 'INFO',      color: 'text-cyan-400',   bg: 'bg-cyan-500',   panelBg: 'bg-transparent' };
    };

    const config = getSeverityConfig(displayData.level);
    const timeString = new Date(displayData.timestamp).toLocaleTimeString();

    return (
        <div className="h-full flex flex-col gap-1.5 p-3 overflow-y-auto cyber-scrollbar relative bg-slate-950/30">
            {/* Background Texture */}

            {/* === 1. SEVERITY HEADER === */}
            <div className={cn("flex-none p-1 rounded-xl border border-cyan-500/50 backdrop-blur-md relative overflow-hidden transition-all duration-300 shadow-[0_0_15px_rgba(34,211,238,0.1)]", config.panelBg)}>
                <div className="flex justify-between items-center px-3 py-2 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="flex items-end gap-1 h-5 pb-0.5">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "w-1.5 rounded-sm transition-all duration-300",
                                        i <= config.bars ? config.bg : "bg-slate-700/50",
                                        i === 1 ? "h-1.5" : i === 2 ? "h-2" : i === 3 ? "h-2.5" : i === 4 ? "h-3" : "h-4"
                                    )}
                                />
                            ))}
                        </div>
                        <div className="flex flex-col">
                            <span className={cn("text-[8.5px] font-bold uppercase tracking-[0.2em] leading-none mb-0.5 opacity-70", config.color)}>
                                Severity Level {displayData.level}
                            </span>
                            <span className={cn("text-[13px] font-bold uppercase tracking-widest leading-none", config.color)}>
                                {config.label}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs px-2 py-1 rounded border border-cyan-500/50 bg-cyan-500/10">
                        <Clock size={12} className="text-cyan-400 opacity-80" />
                        <span className="text-cyan-400 font-bold">{timeString}</span>
                    </div>
                </div>
            </div>

            {/* === 2 & 3. TITLE + META === */}
            <div className="flex-none py-3 px-4 flex flex-col gap-2">
                {/* Title row */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                        {isAiScanned && aiSummary && (
                            <span className="self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest font-mono bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.2)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                AI Summary
                            </span>
                        )}
                        <h2 className="text-[17px] font-black leading-tight border-l-2 border-cyan-500 pl-3 text-white filter drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
                            {isAiScanned && aiSummary ? aiSummary : displayData.title}
                        </h2>
                    </div>
                    <button
                        onClick={() => {
                            const exportData = { ...rawData };
                            delete (exportData as any).ai_status;
                            delete (exportData as any).verdict;
                            delete (exportData as any).ai_analysis_results;
                            delete (exportData as any).graph_layout;
                            delete (exportData as any).last_updated;
                            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `wazuh-alert-${displayData.ruleId}-${alert.id || 'raw'}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }}
                        className="flex-none flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-wider transition-all hover:brightness-125 hover:scale-105 active:scale-95"
                    >
                        <Download size={14} />
                        <span>Full JSON</span>
                    </button>
                </div>
                {/* Meta strip (only if data present) */}
                {(occurrenceCount !== null || firstSeen !== null || assignee !== null) && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {occurrenceCount !== null && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/5">
                                <span className="text-cyan-400 uppercase tracking-wider">Occurrences</span>
                                <span className="text-white font-bold">{occurrenceCount}</span>
                            </div>
                        )}
                        {firstSeen !== null && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/5">
                                <span className="text-cyan-400 uppercase tracking-wider">First Seen</span>
                                <span className="text-white font-bold">{new Date(firstSeen).toLocaleDateString()}</span>
                            </div>
                        )}
                        {assignee !== null && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/5">
                                <span className="text-cyan-400 uppercase tracking-wider">Assignee</span>
                                <span className="text-white font-bold">{assignee}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* === 4. CONTEXT PANELS ===
                The row stretches to the taller column (normally the rule panel). On the left the
                agent block keeps its natural height and only the log preview flexes, so both
                columns land on the same bottom baseline without the fixed data being distorted. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch flex-none">

                {/* ---- LEFT: host facts (fixed), then the raw log line (absorbs the slack) ---- */}
                <div className="flex flex-col gap-3 h-full">

                {/* PANEL A: AGENT INFRASTRUCTURE (real endpoint) OR EVENT SOURCE (cloud/integration) */}
                <div className={cn(
                    "relative overflow-hidden rounded-xl border border-cyan-500/50 bg-transparent p-2.5 group transition-all hover:border-cyan-400",
                    // With a populated log below, that box absorbs the slack and this one keeps its
                    // natural height. With the log collapsed, this stretches instead so both columns
                    // still meet the same baseline — content stays top-aligned, the slack is empty.
                    fullLog ? "flex-none" : "flex-1"
                )}>
                    <div className="absolute -right-6 -top-6 text-cyan-400/10 group-hover:text-cyan-400/20 transition-colors pointer-events-none">
                        {hasRealAgent ? <Server size={80} strokeWidth={1} /> : <Wifi size={80} strokeWidth={1} />}
                    </div>
                    <div className="flex items-center gap-2 mb-2.5 border-b border-cyan-500/10 pb-2">
                        {hasRealAgent
                            ? <><Server size={14} className="text-cyan-400" /><span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200/70">Wazuh Agent</span></>
                            : <><Wifi size={14} className="text-cyan-400" /><span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200/70">Event Source</span></>
                        }
                    </div>
                    <div className="flex flex-col gap-2 relative z-10">
                        {hasRealAgent ? (
                            <>
                                {/* Name + ID */}
                                <div className="flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                        <FieldLabel>Agent Name</FieldLabel>
                                        <div className="text-xs font-medium text-white font-mono truncate">{displayData.agentName ?? '---'}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <FieldLabel>Agent ID</FieldLabel>
                                        <div className="text-xs font-bold text-cyan-400 font-mono bg-cyan-950/50 px-2 py-1 rounded border border-cyan-500/20">
                                            {displayData.agentId ?? '---'}
                                        </div>
                                    </div>
                                </div>
                                {/* Host facts — flat rows separated by a rule, not nested boxes */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-cyan-500/10 pt-2">
                                    {displayData.agentIp && (
                                        <div className="min-w-0">
                                            <FieldLabel>Agent IP Address</FieldLabel>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-cyan-100 tracking-wide truncate">{displayData.agentIp}</span>
                                                {!isLocalhost && <Globe size={12} className="text-cyan-400/80 shrink-0" />}
                                            </div>
                                        </div>
                                    )}
                                    {osInfo && (
                                        <div className="min-w-0">
                                            <FieldLabel>OS</FieldLabel>
                                            <div className="text-xs font-mono text-cyan-100 truncate" title={osInfo}>{osInfo}</div>
                                        </div>
                                    )}
                                    {managerName && (
                                        <div className="min-w-0">
                                            <FieldLabel>Manager</FieldLabel>
                                            <div className="text-xs font-mono text-cyan-100 truncate" title={managerName}>{managerName}</div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* No real endpoint agent — show integration / cloud source fields */
                            sourcePairs.length > 0 ? (
                                /* Looser rhythm than the agent grid — these events carry twice as
                                   many fields, and the tight gaps made them read as a wall. */
                                <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                                    {sourcePairs.map(({ label, value }) => (
                                        <div key={label} className="min-w-0 group/val">
                                            <FieldLabel>{label}</FieldLabel>
                                            {/* Truncated by default; hovering reveals the full value in place.
                                                An overlay tooltip would be clipped by the panel's overflow-hidden. */}
                                            <div
                                                className="text-xs font-mono text-cyan-100 truncate group-hover/val:whitespace-normal group-hover/val:break-all"
                                                title={value}
                                            >
                                                {value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-2">
                                    <span className="text-[10px] font-mono text-slate-400 italic">No source context available</span>
                                </div>
                            )
                        )}

                    </div>
                </div>

                {/* Raw log fills the vertical slack under the shorter agent panel */}
                <RawLogPanel fullLog={fullLog} className="flex-1" />
                </div>

                {/* ---- RIGHT: detection logic. No self-start — it stretches to the row baseline
                     too, so whichever column is naturally taller sets the height and the other
                     fills to meet it. Without this, only one direction ever aligned. ---- */}
                <div className="relative overflow-hidden rounded-xl border border-cyan-500/50 bg-transparent p-2.5 group transition-all hover:border-cyan-400">
                    <div className="absolute -right-6 -top-6 text-cyan-400/10 group-hover:text-cyan-400/20 transition-colors pointer-events-none">
                        <Activity size={80} strokeWidth={1} />
                    </div>
                    <div className="flex items-center gap-2 mb-2.5 border-b border-cyan-500/10 pb-2">
                        <FileText size={14} className="text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200/70">Triggered Rule</span>
                    </div>
                    {/* No gap here on purpose — FieldGroup supplies all inter-group spacing. */}
                    <div className="flex flex-col relative z-10">
                        {/* Log Source + Rule ID */}
                        <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0">
                                <FieldLabel>Log Source</FieldLabel>
                                <div className="text-xs font-medium text-white font-mono break-all">{displayData.location}</div>
                            </div>
                            <div className="text-right shrink-0">
                                <FieldLabel>Rule ID</FieldLabel>
                                <div className="text-xs font-bold text-cyan-400 font-mono bg-cyan-950/50 px-2 py-1 rounded border border-cyan-500/20 hover:bg-cyan-900/50 transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                                    {displayData.ruleId}
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        {ruleDescription && (
                            <FieldGroup label="Description">
                                <div className="text-[10px] text-slate-300 font-mono leading-relaxed line-clamp-2">{ruleDescription}</div>
                            </FieldGroup>
                        )}

                        {/* Classifications */}
                        {[...new Set(displayData.groups as string[])].length > 0 && (
                            <FieldGroup label="Classifications">
                                <div className="flex flex-wrap gap-1">
                                    {[...new Set(displayData.groups as string[])]?.map((g: string) => (
                                        <span key={g} className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-cyan-500/20 bg-cyan-500/10 text-cyan-200/80">
                                            #{g}
                                        </span>
                                    ))}
                                </div>
                            </FieldGroup>
                        )}

                        {/* MITRE ATT&CK — belongs to the rule, with compliance-tag fallback */}
                        <FieldGroup label={hasMitre ? 'MITRE ATT&CK' : hasCompliance ? 'Compliance Mapping' : 'MITRE ATT&CK'}>
                            {hasMitre ? (
                                <div className="flex flex-wrap gap-1">
                                    {mitreTactics.map((t: string) => (
                                        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-violet-500/30 bg-violet-500/10 text-violet-300 capitalize">{t}</span>
                                    ))}
                                    {mitreIds.map((id: string) => (
                                        <span key={id} className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border border-violet-400/40 bg-violet-500/20 text-violet-200">{id}</span>
                                    ))}
                                </div>
                            ) : hasCompliance ? (
                                <div className="flex flex-col gap-1.5">
                                    {complianceTags.map(({ framework, ids }) => (
                                        <div key={framework} className="flex flex-wrap items-center gap-1">
                                            <span className="text-[8px] font-bold font-mono text-emerald-400 uppercase tracking-wider mr-0.5">{framework}</span>
                                            {ids.map((id: string) => (
                                                <span key={id} className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{id}</span>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[10px] font-mono text-slate-400 italic">No mapping for this rule</span>
                            )}
                        </FieldGroup>
                    </div>
                </div>

            </div>

            {/* === 5. CROSS-CUTTING ENRICHMENT ===
                Correlation spans the whole alert rather than describing the rule, so it sits
                full-width beneath both columns instead of nested inside the detection panel. */}
            <ReservedBlock
                icon={Layers}
                title="Related Events"
                hint="No correlated events"
            />
        </div>
    );
};
