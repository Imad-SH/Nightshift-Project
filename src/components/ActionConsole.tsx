import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import {
    Bot,
    ExternalLink,
    Download,
    Play,
    Square,
    RotateCcw,
    Loader2,
    TriangleAlert,
    FileText,
    X,
    Tag,
    AlignLeft,
    Shield
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from './DashboardLayout';
import { useSocket } from '../hooks/useSocket';
import { AnimatePresence } from 'framer-motion';
import { generateBlueSecReport } from '../utils/pdfGenerator';
import type { BlueSecReportData } from '../utils/pdfGenerator';
import { useSocAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { apiBase } from '../config';

interface ActionConsoleProps {
    alert: {
        rule?: {
            level: number;
            description?: string;
            mitre?: {
                id?: string[];
                [key: string]: any;
            };
            [key: string]: any;
        };
        title?: string;
        description?: string;
        level?: number;
        id?: string;
        agent?: {
            name: string;
            [key: string]: any;
        } | string;
        [key: string]: any;
    };
    isScanning?: boolean;
}

// === REUSABLE "CYBER-CARD" COMPONENT ===
interface CyberCardProps {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    color: 'cyan' | 'amber' | 'red' | 'slate' | 'violet';
    onClick?: () => void;
    hasPlaceholder?: boolean;
    imageSrc?: string;
    centralIcon?: LucideIcon;
    hideCornerIcon?: boolean;
    isScanning?: boolean;
    noAnimation?: boolean;
}

function CyberCard({ icon: Icon, title, subtitle, color, onClick, hasPlaceholder, imageSrc, centralIcon: CentralIcon, hideCornerIcon, isScanning, noAnimation }: CyberCardProps) {
    const colorMap: Record<CyberCardProps['color'], string> = {
        cyan: 'border-cyan-500/50 text-cyan-400 hover:border-cyan-300 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] bg-cyan-950/20',
        amber: 'border-amber-500/50 text-amber-400 hover:border-amber-300 hover:text-amber-200 hover:shadow-[0_0_20px_rgba(251,191,36,0.3)] bg-amber-950/20',
        red: 'border-rose-500/50 text-rose-400 hover:border-rose-300 hover:text-rose-200 hover:shadow-[0_0_25px_rgba(244,63,94,0.4)] bg-rose-950/20',
        slate: 'border-slate-500/50 text-slate-400 hover:border-slate-300 hover:text-white hover:shadow-[0_0_15px_rgba(148,163,184,0.1)] bg-slate-900/40',
        violet: 'border-violet-500/50 text-violet-400 hover:border-violet-300 hover:text-violet-200 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] bg-violet-950/20'
    };

    return (
        <motion.button
            onClick={onClick}
            whileHover={noAnimation ? {} : { scale: 1.02, y: -2 }}
            whileTap={noAnimation ? {} : { scale: 0.98 }}
            className={cn(
                "relative group overflow-hidden flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border min-h-[85px] w-full shadow-lg",
                !noAnimation && "transition-all duration-300 ease-out",
                colorMap[color]
            )}
        >
            <div className={cn("absolute inset-0 opacity-10 bg-current", !noAnimation && "group-hover:opacity-20 transition-opacity")} />
            {hasPlaceholder && !hideCornerIcon && (
                <div className={cn("absolute top-2 right-2 p-1.5 z-20", isScanning ? "opacity-100" : "opacity-40", !noAnimation && "group-hover:opacity-100 transition-opacity duration-300")}>
                    {isScanning ? (
                        <Loader2 size={18} className="animate-spin text-current" />
                    ) : (
                        <Icon size={18} strokeWidth={2} className={cn(!noAnimation && "transition-colors duration-300")} />
                    )}
                </div>
            )}
            <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                {hasPlaceholder ? (
                    <div className={cn("w-10 h-10 flex items-center justify-center p-1 relative", !noAnimation && "transition-all duration-300")}>
                        {imageSrc ? (
                            <div
                                className={cn("w-full h-full bg-current", !noAnimation && "transition-transform duration-300 group-hover:scale-110", isScanning && "scale-75 opacity-50")}
                                style={{
                                    WebkitMaskImage: `url("${imageSrc}")`,
                                    maskImage: `url("${imageSrc}")`,
                                    WebkitMaskSize: 'contain',
                                    maskSize: 'contain',
                                    WebkitMaskRepeat: 'no-repeat',
                                    maskRepeat: 'no-repeat',
                                    WebkitMaskPosition: 'center',
                                    maskPosition: 'center',
                                    filter: `drop-shadow(0 0 10px ${color === 'amber' ? 'rgba(251,191,36,0.8)' :
                                        color === 'red' ? 'rgba(244,63,94,0.8)' :
                                            color === 'cyan' ? 'rgba(34,211,238,0.8)' :
                                                'rgba(148,163,184,0.4)'
                                        })`
                                }}
                            />
                        ) : (
                            <div className="opacity-100 filter drop-shadow-[0_0_12px_currentColor] relative flex items-center justify-center">
                                {isScanning && (
                                    <div className="absolute inset-[-8px] border-2 border-current border-t-transparent rounded-full animate-spin opacity-80" />
                                )}
                                {CentralIcon ? (
                                    <CentralIcon size={isScanning ? 24 : 32} className={cn("transition-all duration-300", isScanning && "scale-90 animate-pulse text-rose-400")} />
                                ) : (
                                    <Bot size={28} />
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={cn("p-2 rounded-lg bg-black/40 border border-white/10 transition-all", !noAnimation && "group-hover:scale-110 group-hover:border-current/50 duration-300")}>
                        <Icon size={22} strokeWidth={2} className="transition-colors duration-300" />
                    </div>
                )}
                <div className="space-y-1">
                    <h3 className="text-[11px] sm:text-[13px] font-bold uppercase tracking-widest drop-shadow-md">
                        {title}
                    </h3>
                    <p className={cn("text-[9px] sm:text-[10px] font-mono opacity-80 uppercase tracking-tight", !noAnimation && "group-hover:opacity-100 transition-opacity")}>
                        {subtitle}
                    </p>
                </div>
            </div>
        </motion.button>
    );
}

// === STANDBY "NO-SELECTION" STATE ===
function StandbyState() {
    return (
        <div className="flex-1 flex flex-col h-full min-h-0 items-center justify-center select-none relative">
            <div className="flex items-center gap-2 opacity-100">
                <span className="text-cyan-600 text-lg font-light animate-pulse">[</span>
                <p className="font-mono text-xs text-cyan-500 tracking-[0.2em] uppercase pl-[0.2em] text-center relative top-[1px]">
                    SELECT AN ALERT
                </p>
                <span className="text-cyan-600 text-lg font-light animate-pulse">]</span>
            </div>
        </div>
    );
}

export const ActionConsole: React.FC<ActionConsoleProps> = ({ alert, isScanning }) => {
    const { socket, resetEvent, events, serviceStatus } = useSocket();
    const [localActiveSoar, setLocalActiveSoar] = React.useState<'thehive' | 'flowintel' | null>(() => {
        return (localStorage.getItem('local_active_soar') as any) || null;
    });

    // Listen for local switch events for absolute zero-latency
    React.useEffect(() => {
        const handleSwitch = (e: any) => setLocalActiveSoar(e.detail);
        window.addEventListener('soar_switch', handleSwitch);
        return () => window.removeEventListener('soar_switch', handleSwitch);
    }, []);

    const effectiveSoar = localActiveSoar || (serviceStatus as any).active_soar || 'thehive';
    const activeSoar = effectiveSoar; // Map for ease of use in existing logic

    const { token, user } = useSocAuth();
    const currentUsername = (user as any)?.preferred_username || (user as any)?.name || 'Analyst';
    const { customLogo } = useSettings();
    const [showError, setShowError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (showError) {
            const timer = setTimeout(() => setShowError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [showError]);

    const [isStopping, setIsStopping] = React.useState(false);

    // Reset isStopping when isScanning becomes false
    React.useEffect(() => {
        if (!isScanning) {
            setIsStopping(false);
        }
    }, [isScanning]);

    const handleInitiateScan = () => {
        if (!alert?.id) return;

        if (isScanning || isStopping) {
            console.log(`🛑 [ActionConsole] Requesting Stop for: ${alert.id}`);
            setIsStopping(true);
            if (socket) {
                socket.emit('stop_scan', { alert_id: alert.id });
                // Immediate local Feedback to clear UI state
                window.dispatchEvent(new CustomEvent('agent_update', {
                    detail: {
                        alert_id: alert.id,
                        node: 'error',
                        pipeline_status: 'failed',
                        log: '🛑 Manual stop initiated...'
                    }
                }));
            }
            return;
        }

        // NEW: Reset isStopping when starting a new scan
        setIsStopping(false);

        // ALWAYS force reset state when starting/re-starting to ensure clean UI
        console.log(`♻️ [ActionConsole] Forcing fresh graph state: ${alert.id}`);
        resetEvent(alert.id);
        
        // CRITICAL: Wipe local cache instantly to prevent 'ghosting' after refresh
        // We use the new unified cache key handled by GraphVisualizer
        window.dispatchEvent(new CustomEvent('clear-graph-cache', { detail: { alert_id: alert.id } }));

        console.log(`🚀 [ActionConsole] AI Scan triggered for: ${alert.id}`);
        // Dispatch event after local state update to ensure components catch the clean state
        setTimeout(() => window.dispatchEvent(new CustomEvent('switch-to-ai-graph')), 50);

        if (socket) {
            // CRITICAL: Create a clean copy of the alert for the scan
            // We must strip any previous AI artifacts/logs so the AI doesn't 
            // "scan itself" if a previous attempt failed.
            const cleanAlert = { ...alert };
            const rawData = (cleanAlert as any).rawData || cleanAlert;
            
            // If rawData is an object, strip AI pollution
            if (typeof rawData === 'object' && rawData !== null) {
                delete rawData.ai_status;
                delete rawData.verdict;
                delete rawData.ai_analysis_results;
                delete rawData.graph_layout;
                delete rawData.last_updated;
                delete rawData.log; // Remove any internal AI processing logs
            }

            socket.emit('initiate_scan', {
                alert_id: alert.id,
                alert_data: cleanAlert
            });

            // OPTIMISTIC UPDATE: Trigger local loaders immediately
            window.dispatchEvent(new CustomEvent('agent_update', {
                detail: {
                    alert_id: alert.id,
                    node: 'reset',
                    pipeline_status: 'running',
                    log: '🚀 Cognitive investigation pipeline initiated...'
                }
            }));
        }
    };
    const [isGenerating, setIsGenerating] = React.useState(false);

    // Safety timeout for generation
    React.useEffect(() => {
        let timeoutTimer: any;

        if (isGenerating) {
            timeoutTimer = setTimeout(() => {
                if (isGenerating) {
                    console.warn("⚠️ [ActionConsole] PDF generation timed out after 30s.");
                    setIsGenerating(false);
                    setShowError("REPORT GENERATION TIMED OUT");
                }
            }, 30000);
        }
        return () => {
            clearTimeout(timeoutTimer);
        };
    }, [isGenerating]);

    // Watch for report generation event (New Optimized Flow)
    const activeEvent = events[alert?.id || ''];

    React.useEffect(() => {
        if (!socket) return;

        // Note: Socket report listeners removed in favor of direct HTTP/HTML flow
        return () => { { } };
    }, [socket, alert?.id]);

    const handleExportReport = async () => {
        if (!alert?.id || isGenerating) return;

        // USABILITY SYNC: Ensure we use the robust completion check
        const hasVerdict = !!(activeEvent?.verdict || alert?.verdict || activeEvent?.node_results?.agent_judge?.verdict);
        const isCompletedEffective = activeEvent?.pipeline_status === 'completed' || alert?.status === 'completed' || hasVerdict;

        if (!isCompletedEffective) {
            setShowError("INVESTIGATION INCOMPLETE: PLEASE SCAN ALERT BEFORE EXPORTING");
            return;
        }

        // GATHER INTELLIGENCE: Priority 1 (Active Event Stream) -> Priority 2 (Hydrated Alert DB Object)
        const nodeResults = activeEvent?.node_results || (alert as any)?.rawData?.ai_analysis_results || (alert as any)?.results || {};
        const judgeResults = nodeResults?.agent_judge || {};

        // IMPORTANT FIX: If it was auto-scanned in the background, the UI's local memory won't have the node data needed to build the PDF!
        if (isCompletedEffective && Object.keys(judgeResults).length === 0) {
            setShowError("AUTO-SCANNED ALERT DETECTED: PLEASE CLICK 'RE-SCAN ALERT' TO LOAD AI EVIDENCE REQUIRED FOR PDF EXPORT");
            return;
        }

        setIsGenerating(true);
        setShowError(null);

        try {
            console.log(`📄 [ActionConsole] Generating BlueSec PDF Report: ${alert.id}`);

            // Gather intelligence from agent results with robust DB fallback
            const iocResults = nodeResults?.agent_screener || {};
            const investigatorResults = nodeResults?.agent_investigator || {};
            const localJudgeResults = judgeResults; // Already fetched above

            // Pass the raw monologue; the generator will handle sophisticated filtering
            const reasoning = activeEvent?.log_monologue?.join('\n') || localJudgeResults.analysis_reasoning || '';

            // Map available IoCs from flat keys (agent_extractor backend format)
            const iocs_list: any[] = [];

            // Log Source from extraction results - Strictly enforce new branding
            let iocSource = iocResults.log_source || 'Wazuh Alert Data';
            if (iocSource === 'Security Logs' || iocSource === 'Unknown') {
                iocSource = 'Wazuh Alert Data';
            }
            const iocStatus = iocResults.status || 'Extracted';

            // Iterate through possible IoC types
            const iocTypes = ['identities', 'network', 'system', 'files'];
            iocTypes.forEach(catKey => {
                const categoryItems = (iocResults as any)[catKey];
                if (Array.isArray(categoryItems)) {
                    categoryItems.forEach((item: any) => {
                        // REFINED: Prioritize descriptive label (e.g. "Process ID", "File Path") over generic category
                        let technicalType = catKey;
                        if (typeof item === 'object') {
                            technicalType = item.label || (item.type && item.type !== 'LEGACY_WRAP' ? item.type : catKey);
                        }
                        
                        const value = typeof item === 'object' ? item.value : item;

                        iocs_list.push({
                            type: technicalType.toUpperCase(),
                            value: value,
                            source: iocSource,
                            status: iocStatus
                        });
                    });
                }
            });

            let rawDataObj = alert.rawData || alert;
            if (typeof rawDataObj === 'string') {
                try { rawDataObj = JSON.parse(rawDataObj); } catch (e) { }
            }

            const ruleData = rawDataObj?.rule || alert.rule || {};
            const extractedMitreId = ruleData?.mitre?.id?.[0] || 'N/A';

            const reportData: BlueSecReportData = {
                id: alert.id || 'Unknown',
                title: alert.title || ruleData?.description || 'SECURITY_ALERT',
                verdict: activeEvent?.verdict || localJudgeResults.verdict || 'SUSPICIOUS',
                confidence: Number(localJudgeResults.confidence || 85),
                reasoning: reasoning,
                attack_category: localJudgeResults.category || 'Threat Analysis',
                ai_summary: iocResults.summary || 'No summary available.',
                ai_reasoning: localJudgeResults.analysis_reasoning || 'No analysis available.',
                source: investigatorResults.source || null,
                burst_global: investigatorResults.burst_global ?? 0,
                burst_source: investigatorResults.burst_source ?? 0,
                is_burst: investigatorResults.is_burst ?? false,
                cooc_distinct: investigatorResults.cooc_distinct ?? 0,
                is_suspicious_cooc: investigatorResults.is_suspicious_cooc ?? false,
                current_hour: investigatorResults.current_hour ?? 0,
                hour_pct: investigatorResults.hour_pct ?? 0,
                is_unusual_timing: investigatorResults.is_unusual_timing ?? false,
                total_historical: investigatorResults.rule_count ?? 0,
                alert_time_utc: investigatorResults.alert_time_utc,
                first_seen: investigatorResults.first_seen,
                iocs_list: iocs_list,
                raw_log: JSON.stringify(rawDataObj, null, 2),
                severity: Number(ruleData?.level || alert?.level || 0),
                agent_name: (typeof alert.agent === 'object' && alert.agent !== null ? (alert.agent as any).name : (alert.agent || 'Localhost')).split(' (')[0],
                mitre_id: extractedMitreId,
                rule_id: ruleData?.id || 'Unknown',
                description: iocResults.summary || ruleData?.description || alert.description || 'No description provided',
                mitigation_steps: localJudgeResults.mitigation_steps || []
            };

            console.log("📊 [ActionConsole] Prepared Report Data:", reportData);

            await generateBlueSecReport(reportData, customLogo);

            console.log("✅ PDF Report Generated Successfully");
            setIsGenerating(false);

        } catch (err) {
            console.error("❌ PDF Export Failed:", err);
            setShowError("GENERATION FAILED");
            setIsGenerating(false);
        }
    };

    const [isEscalating, setIsEscalating] = React.useState(false);
    const [showEscalateConfirm, setShowEscalateConfirm] = React.useState(false);
    const [showPreEscalateModal, setShowPreEscalateModal] = React.useState(false);
    const [preEscalatePath, setPreEscalatePath] = React.useState<'manual' | 'ai' | null>(null);
    const [manualForm, setManualForm] = React.useState({ title: '', description: '', severity: 1, tlp: 'AMBER', tags: '' });

    const onSoarClick = () => {
        const existingId = (activeEvent as any)?.thehive_id || (alert as any)?.thehive_id ||
                           (activeEvent as any)?.flowintel_id || (alert as any)?.flowintel_id;
        if (existingId) {
            setShowEscalateConfirm(true);
        } else if (!isCompleted) {
            const level = alert?.rule?.level || alert?.level || 0;
            setManualForm({
                title: alert?.title || alert?.rule?.description || 'Unknown Alert',
                description: '',
                severity: level >= 12 ? 3 : level >= 8 ? 2 : 1,
                tlp: 'AMBER',
                tags: ''
            });
            setPreEscalatePath(null);
            setShowPreEscalateModal(true);
        } else {
            handleEscalateToSoar();
        }
    };

    const handleManualEscalate = async () => {
        if (!alert?.id || isEscalating) return;
        const soarPath = activeSoar === 'thehive' ? 'thehive' : 'flowintel';
        const soarName = activeSoar === 'thehive' ? 'TheHive' : 'Flowintel';
        setIsEscalating(true);
        setShowPreEscalateModal(false);
        setShowError(null);
        try {
            const levelFromSeverity = manualForm.severity === 3 ? 13 : manualForm.severity === 2 ? 8 : 3;
            const extraTags = [`Escalated by ${currentUsername}`, `TLP:${manualForm.tlp}`, ...(manualForm.tags ? manualForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [])];
            const response = await fetch(`${apiBase()}/api/v1/${soarPath}/escalate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    alert_id: alert.id,
                    alert_title: manualForm.title,
                    alert_agent: typeof alert.agent === 'string' ? alert.agent : (alert.agent as any)?.name || 'Unknown Agent',
                    rule_level: levelFromSeverity,
                    manual_description: manualForm.description || undefined,
                    manual_tags: extraTags,
                    event_data: { alert_id: alert.id, pipeline_status: 'manual', node_results: {} },
                    force: false
                })
            });
            const data = await response.json();
            if (data.already_exists && !data.force) { setShowEscalateConfirm(true); setIsEscalating(false); return; }
            if (!response.ok) throw new Error(data.detail || 'Escalation failed');
            console.log(`✅ [Manual] ${soarName} Result:`, data);
            setShowError('Case created successfully');
        } catch (err: any) {
            console.error(`❌ [Manual] Escalation Failed:`, err);
            setShowError(err.message || 'ESCALATION FAILED');
        } finally {
            setIsEscalating(false);
        }
    };

    const handleEscalateToSoar = async (force: boolean = false) => {
        if (!alert?.id || isEscalating) return;

        // Dynamic target configuration
        const soarPath = activeSoar === 'thehive' ? 'thehive' : 'flowintel';
        const soarName = activeSoar === 'thehive' ? 'TheHive' : 'Flowintel';

        // USABILITY SYNC: Robust check same as UI display
        const hasVerdict = !!(activeEvent?.verdict || alert?.verdict || activeEvent?.node_results?.agent_judge?.verdict);
        const isCompleted = activeEvent?.pipeline_status === 'completed' || (alert as any)?.status === 'completed' || hasVerdict;
        
        if (!isCompleted && !force) {
            setShowError("INVESTIGATION INCOMPLETE: PLEASE SCAN ALERT BEFORE ESCALATING");
            return;
        }

        setIsEscalating(true);
        setShowError(null);

        try {
            console.log(`📤 [ActionConsole] Escalating to ${soarName}: ${alert.id}`);

            const response = await fetch(`${apiBase()}/api/v1/${soarPath}/escalate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    alert_id: alert.id,
                    alert_title: alert.title,
                    alert_agent: alert.agent || "Unknown Agent",
                    rule_level: alert.rule?.level || alert.level || 0,
                    is_ai_analyzed: isCompleted,
                    event_data: {
                        alert_id: alert.id,
                        pipeline_status: activeEvent?.pipeline_status || (alert as any)?.status || 'completed',
                        node_results: isCompleted ? {
                            ...((alert as any)?.rawData?.ai_analysis_results || {}),
                            ...(activeEvent?.node_results || {})
                        } : {},
                        verdict: isCompleted ? (activeEvent?.verdict || (alert as any)?.verdict) : null,
                        graph_state: activeEvent?.graph_state || (alert as any)?.graph_state
                    },
                    force: force
                })
            });

            const data = await response.json();

            if (data.already_exists && !force) {
                setShowEscalateConfirm(true);
                setIsEscalating(false);
                return;
            }

            if (!response.ok) throw new Error(data.detail || "Escalation failed");

            console.log(`✅ ${soarName} Result:`, data);
            setShowError("Case created successfully");

        } catch (err: any) {
            console.error(`❌ ${soarName} Escalation Failed:`, err);
            setShowError(err.message || "ESCALATION FAILED");
        } finally {
            setIsEscalating(false);
        }
    };

    // Severity logic
    const level = alert?.rule?.level || alert?.level || 0;
    const isHighSeverity = level >= 7;
    
    // Resolve derived pipeline status from either real-time event or hydrated alert object
    const alertAIStatus = (alert as any)?.status || (alert as any)?.pipeline_status;
    const pipelineStatus = activeEvent?.pipeline_status || alertAIStatus || 'waiting';
    
    // REFRESH PERSISTENCE: Treat granular backend phases as "active scanning"
    const ACTIVE_PHASES = ['running', 'extracting', 'investigating', 'judging'];
    
    // Safety Force: If there is a verdict, it must be finished!
    const hasVerdict = !!(activeEvent?.verdict || alert?.verdict || activeEvent?.node_results?.agent_judge?.verdict);
    const activeIsScanning = ACTIVE_PHASES.includes(pipelineStatus) && !hasVerdict;
    const isCompleted = pipelineStatus === 'completed' || hasVerdict;

    // State to remember if we ever completed, to prevent layout flashing back to A during re-scan
    const soarId = (activeEvent as any)?.thehive_id || (alert as any)?.thehive_id || 
                   (activeEvent as any)?.flowintel_id || (alert as any)?.flowintel_id;
    const [hasCompletedOnce, setHasCompletedOnce] = React.useState(isCompleted);

    // 1. Reset state when switching to a different alert
    React.useEffect(() => {
        setHasCompletedOnce(isCompleted);
    }, [alert?.id, isCompleted]);

    // 2. Lock state to true once completed (persists during re-scan of SAME alert)
    React.useEffect(() => {
        if (isCompleted) setHasCompletedOnce(true);
    }, [isCompleted]);

    if (!alert) {
        return <StandbyState />;
    }

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 relative">
            {/* TACTICAL ERROR OVERLAY */}
            <AnimatePresence>
                {showError && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-x-0 -top-12 z-50 flex justify-center pointer-events-none"
                    >
                        <div className={cn(
                            "px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 border",
                            showError.toLowerCase().includes("successfully") || showError.includes("SYNCED")
                                ? "bg-emerald-950/90 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                                : "bg-rose-950/90 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                        )}>
                            <div className={cn(
                                "w-2 h-2 rounded-full animate-pulse",
                                showError.toLowerCase().includes("successfully") || showError.includes("SYNCED") ? "bg-emerald-500" : "bg-rose-500"
                            )} />
                            <span className={cn(
                                "text-[10px] font-mono font-bold tracking-tighter",
                                showError.toLowerCase().includes("successfully") || showError.includes("SYNCED") ? "text-emerald-100" : "text-rose-100"
                            )}>
                                {showError}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* DUPLICATE ESCALATION MODAL (PORTALED TO FULL SCREEN) */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {showEscalateConfirm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
                            onClick={() => setShowEscalateConfirm(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="bg-amber-950/50 p-4 border-b border-amber-500/30 flex items-center gap-3">
                                    <TriangleAlert className="text-amber-400" size={24} strokeWidth={2.5} />
                                    <div>
                                        <h3 className="text-amber-400 font-bold font-mono tracking-tight text-sm">CASE ALREADY EXISTS</h3>
                                        <p className="text-amber-200/70 text-[10px] uppercase font-mono tracking-wider">Duplicate Prevention</p>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    <p className="text-slate-300 text-sm leading-relaxed">
                                        This alert has already been successfully pushed to {activeSoar === 'thehive' ? 'TheHive' : 'Flowintel'}. Creating it again will result in a <span className="text-amber-400 font-bold">duplicate case</span> in your instance.
                                    </p>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setShowEscalateConfirm(false)}
                                            className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all text-xs font-bold uppercase tracking-wider"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowEscalateConfirm(false);
                                                handleEscalateToSoar(true);
                                            }}
                                            className="flex-1 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-lg hover:bg-amber-500/30 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all text-xs font-bold uppercase tracking-wider shadow-lg"
                                        >
                                            Create Duplicate
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* PRE-ESCALATE MODAL — unanalyzed alert path chooser */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {showPreEscalateModal && (() => {
                        const isHive = activeSoar === 'thehive';
                        const soarName = isHive ? 'TheHive' : 'Flowintel';
                        const soarLogo = isHive ? '/assets/TheHive Logo.png' : '/assets/flowintel_logo.png';
                        const C = isHive
                            ? { border: 'border-amber-500/30', headerBg: 'bg-amber-950/50', headerBorder: 'border-b border-amber-500/30', accent: 'text-amber-400', sub: 'text-amber-200/70', cardActive: 'bg-amber-500/15 border-amber-400/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]', cardHover: 'hover:border-amber-500/40', dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]', formBorder: 'border-amber-500/20', formFocus: 'focus:border-amber-400/60', btn: 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]', shadow: 'shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(251,191,36,0.05)]' }
                            : { border: 'border-violet-500/30', headerBg: 'bg-violet-950/50', headerBorder: 'border-b border-violet-500/30', accent: 'text-violet-400', sub: 'text-violet-200/70', cardActive: 'bg-violet-500/15 border-violet-400/60 shadow-[0_0_20px_rgba(139,92,246,0.15)]', cardHover: 'hover:border-violet-500/40', dot: 'bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]', formBorder: 'border-violet-500/20', formFocus: 'focus:border-violet-400/60', btn: 'bg-violet-500/20 text-violet-400 border-violet-500/50 hover:bg-violet-500/30 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]', shadow: 'shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(139,92,246,0.05)]' };
                        return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
                            onClick={() => setShowPreEscalateModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className={cn("w-full max-w-md bg-slate-900 rounded-xl overflow-hidden border", C.border, C.shadow)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Header — matches duplicate modal style with SOAR branding */}
                                <div className={cn("p-4 flex items-center justify-between", C.headerBg, C.headerBorder)}>
                                    <div className="flex items-center gap-3">
                                        <img src={soarLogo} alt={soarName} className="h-6 object-contain" />
                                        <div>
                                            <h3 className={cn("font-bold font-mono tracking-tight text-sm", C.accent)}>CREATE CASE — {soarName}</h3>
                                            <p className={cn("text-[10px] uppercase font-mono tracking-wider", C.sub)}>This alert has no AI verdict yet — pick a path below</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowPreEscalateModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="p-5 space-y-4">
                                    {/* Path selector cards */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Manual Entry — always SOAR color */}
                                        <button
                                            onClick={() => setPreEscalatePath('manual')}
                                            className={cn(
                                                "relative p-4 rounded-xl border text-left transition-all duration-200",
                                                preEscalatePath === 'manual'
                                                    ? C.cardActive
                                                    : cn(C.cardActive, "opacity-60 hover:opacity-100")
                                            )}
                                        >
                                            {preEscalatePath === 'manual' && <div className={cn("absolute top-2.5 right-2.5 w-2 h-2 rounded-full animate-pulse", C.dot)} />}
                                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3 border", C.cardActive)}>
                                                <FileText size={16} className={C.accent} />
                                            </div>
                                            <p className={cn("text-xs font-black font-mono uppercase tracking-wider", C.accent)}>Manual Entry</p>
                                            <p className="text-[9px] text-slate-400 font-mono mt-1.5 leading-relaxed">Write a title, description, severity & tags manually. The case will be pushed to {soarName} right away without AI enrichment.</p>
                                        </button>

                                        {/* AI Analysis — always cyan */}
                                        <button
                                            onClick={() => { setShowPreEscalateModal(false); handleInitiateScan(); }}
                                            className="relative p-4 rounded-xl border text-left transition-all duration-200 bg-cyan-500/5 border-cyan-500/25 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)] group"
                                        >
                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-cyan-500/10 border border-cyan-500/30 group-hover:bg-cyan-500/20 transition-colors">
                                                <Play size={16} className="text-cyan-400 fill-cyan-400" />
                                            </div>
                                            <p className="text-xs font-black font-mono uppercase tracking-wider text-cyan-300">AI Analysis First</p>
                                            <p className="text-[9px] text-slate-400 font-mono mt-1.5 leading-relaxed">Starts the 3-agent AI pipeline on this alert. Once complete, click Create Case again to escalate with the full AI report & IOCs.</p>
                                        </button>
                                    </div>

                                    {/* Manual form */}
                                    <AnimatePresence>
                                        {preEscalatePath === 'manual' && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className={cn("space-y-3 pt-3 border-t", C.formBorder)}>
                                                    <div className="space-y-1.5">
                                                        <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-mono flex items-center gap-1.5", C.sub)}>
                                                            <AlignLeft size={10} /> Case Title
                                                        </label>
                                                        <input type="text" value={manualForm.title}
                                                            onChange={e => setManualForm({ ...manualForm, title: e.target.value })}
                                                            className={cn("w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white font-mono outline-none transition-all placeholder:text-slate-600", C.formBorder, C.formFocus)} />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-mono flex items-center gap-1.5", C.sub)}>
                                                            <FileText size={10} /> Description
                                                        </label>
                                                        <textarea rows={3} placeholder="Describe what was observed, context, initial findings..."
                                                            value={manualForm.description}
                                                            onChange={e => setManualForm({ ...manualForm, description: e.target.value })}
                                                            className={cn("w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white font-mono outline-none transition-all resize-none placeholder:text-slate-600", C.formBorder, C.formFocus)} />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1.5">
                                                            <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-mono flex items-center gap-1.5", C.sub)}>
                                                                <Shield size={10} /> Severity
                                                            </label>
                                                            <div className="flex gap-1.5">
                                                                {[{ v: 1, l: 'Low', c: 'text-cyan-400 border-cyan-500/50 bg-cyan-500/15' }, { v: 2, l: 'Med', c: 'text-orange-400 border-orange-500/50 bg-orange-500/15' }, { v: 3, l: 'High', c: 'text-rose-400 border-rose-500/50 bg-rose-500/15' }].map(s => (
                                                                    <button key={s.v} onClick={() => setManualForm({ ...manualForm, severity: s.v })}
                                                                        className={cn("flex-1 py-1.5 rounded-lg border text-[9px] font-black font-mono uppercase transition-all", manualForm.severity === s.v ? s.c : "border-slate-700/50 text-slate-500 hover:border-slate-600")}>
                                                                        {s.l}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-mono flex items-center gap-1.5", C.sub)}>
                                                                <Shield size={10} /> TLP
                                                            </label>
                                                            <div className="flex gap-1.5">
                                                                {[
                                                                    { v: 'WHITE', c: 'text-white border-white/50 bg-white/10' },
                                                                    { v: 'GREEN', c: 'text-green-400 border-green-500/50 bg-green-500/15' },
                                                                    { v: 'AMBER', c: 'text-amber-400 border-amber-500/50 bg-amber-500/15' },
                                                                    { v: 'RED', c: 'text-rose-400 border-rose-500/50 bg-rose-500/15' },
                                                                ].map(t => (
                                                                    <button key={t.v} onClick={() => setManualForm({ ...manualForm, tlp: t.v })}
                                                                        className={cn("flex-1 py-1.5 rounded-lg border text-[9px] font-black font-mono uppercase transition-all", manualForm.tlp === t.v ? t.c : "border-slate-700/50 text-slate-500 hover:border-slate-600")}>
                                                                        {t.v}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-mono flex items-center gap-1.5", C.sub)}>
                                                                <Tag size={10} /> Tags <span className="text-slate-600 normal-case tracking-normal font-normal">(comma-sep.)</span>
                                                            </label>
                                                            <input type="text" placeholder="e.g. windows, lateral-movement"
                                                                value={manualForm.tags}
                                                                onChange={e => setManualForm({ ...manualForm, tags: e.target.value })}
                                                                className={cn("w-full bg-black/40 border rounded-lg px-3 py-2 text-[10px] text-white font-mono outline-none transition-all placeholder:text-slate-600", C.formBorder, C.formFocus)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Footer */}
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => setShowPreEscalateModal(false)}
                                            className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all text-xs font-bold uppercase tracking-wider">
                                            Cancel
                                        </button>
                                        {preEscalatePath === 'manual' && (
                                            <button onClick={handleManualEscalate} disabled={!manualForm.title.trim()}
                                                className={cn("flex-1 px-4 py-2 border rounded-lg transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed", C.btn)}>
                                                Create Case
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                        );
                    })()}
                </AnimatePresence>,
                document.body
            )}

            {isHighSeverity || isCompleted || hasCompletedOnce ? (
                /* === SCENARIO B: COMMANDER MODE (Level ≥ 7) OR COMPLETED SCAN === */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
                    <CyberCard
                        icon={isStopping ? RotateCcw : (activeIsScanning ? Square : RotateCcw)}
                        title={isStopping ? "STOPPING..." : (activeIsScanning ? "STOP AI SCAN" : (hasCompletedOnce ? "RE-SCAN ALERT" : "SCAN ALERT"))}
                        subtitle={isStopping ? "TERMINATING TASK" : (activeIsScanning ? "ACTIVE INVESTIGATION" : (hasCompletedOnce ? "RE-RUN INVESTIGATION" : "START INVESTIGATION"))}
                        color={isStopping ? "slate" : (activeIsScanning ? "red" : "cyan")}
                        hasPlaceholder
                        centralIcon={isStopping ? RotateCcw : (activeIsScanning ? Square : RotateCcw)}
                        onClick={isStopping ? undefined : handleInitiateScan}
                        hideCornerIcon
                        isScanning={activeIsScanning}
                    />
                    <CyberCard
                        icon={soarId ? Bot : ExternalLink}
                        title={soarId ? "CASE CREATED" : "CREATE CASE"}
                        subtitle={isEscalating ? "PROCESSING..." : (soarId ? "(Case Created)" : `Escalate to ${activeSoar === 'thehive' ? 'TheHive' : 'Flowintel'}`)}
                        color={soarId ? "slate" : (activeSoar === 'thehive' ? "amber" : "violet")}
                        hasPlaceholder
                        imageSrc={activeSoar === 'thehive' ? "/assets/TheHive Logo.png" : "/assets/flowintel_logo.png"}
                        onClick={onSoarClick}
                        isScanning={isEscalating}
                    />
                    <CyberCard
                        icon={Download}
                        title="EXPORT PDF REPORT"
                        subtitle="GENERATE DOCUMENTATION"
                        color="red"
                        hasPlaceholder
                        imageSrc="/assets/PDF Icon.png"
                        onClick={handleExportReport}
                        isScanning={isGenerating}
                    />
                </div>
            ) : (
                /* === SCENARIO A: ANALYST MODE (Level < 7 & Not Completed) === */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
                    <CyberCard
                        icon={isStopping ? RotateCcw : (activeIsScanning ? Square : Bot)}
                        title={isStopping ? "STOPPING..." : (activeIsScanning ? "STOP AI SCAN" : "Scan with AI")}
                        subtitle={isStopping ? "TERMINATING TASK" : (activeIsScanning ? "ACTIVE INVESTIGATION" : "INITIATE INVESTIGATION")}
                        color={isStopping ? "slate" : (activeIsScanning ? "red" : "cyan")}
                        hasPlaceholder
                        centralIcon={isStopping ? RotateCcw : (activeIsScanning ? Square : Play)}
                        onClick={isStopping ? undefined : handleInitiateScan}
                        hideCornerIcon
                        isScanning={activeIsScanning}
                    />
                    <CyberCard
                        icon={soarId ? Bot : ExternalLink}
                        title={soarId ? "CASE CREATED" : "CREATE CASE"}
                        subtitle={isEscalating ? "PROCESSING..." : (soarId ? `SUCCESS (ID: ${soarId})` : `Escalate to ${activeSoar === 'thehive' ? 'TheHive' : 'Flowintel'}`)}
                        color={soarId ? "slate" : (activeSoar === 'thehive' ? "amber" : "cyan")}
                        hasPlaceholder
                        imageSrc={activeSoar === 'thehive' ? "/assets/TheHive Logo.png" : "/assets/flowintel_logo.png"}
                        onClick={onSoarClick}
                        isScanning={isEscalating}
                    />
                </div>
            )}
        </div>
    );
};


