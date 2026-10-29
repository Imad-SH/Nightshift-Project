import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useSocAuth } from '../contexts/AuthContext';
import { cn } from './DashboardLayout';
import { Loader2, ChevronRight, ChevronDown, RefreshCw, CheckCircle2, Sparkles, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimeFilterControl } from './TimeFilterControl';
import { apiBase } from '../config';

export const MitreMatrix = ({ 
    alerts, 
    timeFilter, 
    setTimeFilter, 
    customRange, 
    setCustomRange,
    relativeTime,
    setRelativeTime
}: { 
    alerts: any[],
    timeFilter: 'TODAY' | 'THIS_MONTH' | 'ALL' | 'CUSTOM',
    setTimeFilter: (f: any) => void,
    customRange: any,
    setCustomRange: (r: any) => void,
    relativeTime: any,
    setRelativeTime: (v: any) => void
}) => {
    const { token, isSocAdmin } = useSocAuth();
    const [matrix, setMatrix] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredTech, setHoveredTech] = useState<{ tech: any, rect: DOMRect, clientX: number, clientY: number, isSub: boolean } | null>(null);
    const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
    const [zoom, setZoom] = useState(1);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = (tech: any, e: React.MouseEvent, isSub: boolean) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        const rect = e.currentTarget.getBoundingClientRect();
        setHoveredTech({ tech, rect, clientX: e.clientX, clientY: e.clientY, isSub });
    };

    const handleMouseLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredTech(null);
        }, 50);
    };

    const handleTooltipMouseEnter = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };

    const toggleExpanded = (tacticId: string, t_code: string) => {
        const key = `${tacticId}-${t_code}`;
        setExpandedTechs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // ATT&CK version in use and the last update check (the backend follows MITRE's releases)
    const [attack, setAttack] = useState<any>(null);
    const [checking, setChecking] = useState(false);

    const fetchMatrix = async () => {
        if (!token) return;
        try {
            const baseUrl = apiBase();
            const resp = await fetch(`${baseUrl}/api/mitre/matrix`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                setMatrix(data);
            }
            const st = await fetch(`${baseUrl}/api/mitre/status`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (st.ok) setAttack(await st.json());
        } catch (e) {
            console.error("Failed to fetch MITRE matrix", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // Outcome of the last "Check for updates", shown briefly next to the button
    // The button keeps its normal width while it shows a result, so nothing around it moves
    const [buttonWidth, setButtonWidth] = useState<number | undefined>(undefined);
    const [checkResult, setCheckResult] = useState<{ kind: 'current' | 'updated' | 'failed'; text: string; detail?: string } | null>(null);
    const resultTimer = useRef<number | undefined>(undefined);
    const showResult = (result: { kind: 'current' | 'updated' | 'failed'; text: string; detail?: string }) => {
        setCheckResult(result);
        window.clearTimeout(resultTimer.current);
        resultTimer.current = window.setTimeout(() => setCheckResult(null), 6000);
    };
    useEffect(() => () => window.clearTimeout(resultTimer.current), []);

    const checkForUpdates = async () => {
        if (!token) return;
        setChecking(true);
        setCheckResult(null);
        const before = attack?.version;
        try {
            const resp = await fetch(`${apiBase()}/api/mitre/update`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const next = await resp.json();
            setAttack(next);
            if (next.version && next.version !== before) {
                await fetchMatrix();
                showResult({ kind: 'updated', text: `Updated to v${next.version}` });
            } else if (next.error) {
                showResult({ kind: 'failed', text: 'Check failed', detail: `${next.error} (keeping v${next.version})` });
            } else {
                showResult({ kind: 'current', text: 'Up to date' });
            }
        } catch (e: any) {
            console.error("MITRE update check failed", e);
            showResult({ kind: 'failed', text: 'Check failed', detail: e?.message });
        } finally {
            setChecking(false);
        }
    };

    const attackState = !attack?.version ? null
        : attack.error ? { dot: 'bg-amber-400', label: 'Last update check failed' }
        : attack.up_to_date ? { dot: 'bg-emerald-400', label: 'Up to date' }
        : attack.latest_version ? { dot: 'bg-amber-400', label: `v${attack.latest_version} available` }
        : !attack.auto_update ? { dot: 'bg-slate-400', label: 'Automatic updates off' }
        : { dot: 'bg-cyan-400', label: 'Checked daily' };
    const attackTitle = attack?.version
        ? [`MITRE ATT&CK Enterprise v${attack.version}`,
           attack.released ? `released ${String(attack.released).slice(0, 10)}` : '',
           attack.checked_at ? `last checked ${new Date(attack.checked_at).toLocaleString()}` : 'not checked yet',
           attack.error ? `error: ${attack.error}` : ''].filter(Boolean).join(' · ')
        : '';

    // Calculate technique frequencies + per-rule breakdown from alerts
    const frequencies = useMemo(() => {
        const data: Record<string, { total: number; rules: Record<string, { description: string; count: number }> }> = {};
        alerts.forEach(a => {
            const mitre = a.rawData?.rule?.mitre;
            const ruleId   = String(a.rawData?.rule?.id   || a.rule?.id   || '---');
            const ruleDesc =        a.rawData?.rule?.description || a.title || 'Unknown Rule';
            if (!mitre) return;
            const ids = Array.isArray(mitre.id) ? mitre.id : [mitre.id];
            ids.forEach((id: string) => {
                if (!id) return;
                if (!data[id]) data[id] = { total: 0, rules: {} };
                data[id].total++;
                if (!data[id].rules[ruleId]) data[id].rules[ruleId] = { description: ruleDesc, count: 0 };
                data[id].rules[ruleId].count++;
            });
        });
        return data;
    }, [alerts]);

    if (loading) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-slate-950/50 backdrop-blur-sm rounded-3xl border border-cyan-500/20">
                <Loader2 className="animate-spin text-cyan-400" size={32} />
                <div className="text-cyan-500 font-mono tracking-widest text-[10px] uppercase">Syncing MITRE ATT&CK® STIX Database...</div>
            </div>
        );
    }

    const renderTooltip = () => {
        if (!hoveredTech) return null;

        const tooltipWidth = hoveredTech.isSub ? 256 : 288;
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;

        const rect = hoveredTech.rect;
        // Use the bounding box center for reliable vertical alignment
        const cy = rect.top + rect.height / 2;

        // Horizontal: place to the right of element edge, flip left if no room
        const isFlipped = rect.right + tooltipWidth + 20 > windowWidth;
        const left = isFlipped
            ? Math.max(10, rect.left - tooltipWidth - 10)
            : rect.right + 15;

        // Vertical: smart anchoring based on screen half
        const isBottomHalf = cy > windowHeight / 2;
        let top: string | number = 'auto';
        let bottom: string | number = 'auto';
        let arrowStyle: React.CSSProperties = {};

        if (isBottomHalf) {
            bottom = windowHeight - cy - 30;
            bottom = Math.max(10, bottom);
            const arrowBottom = (windowHeight - bottom) - cy;
            arrowStyle = { bottom: Math.max(15, arrowBottom) };
        } else {
            top = cy - 30;
            top = Math.max(10, top);
            const arrowTop = cy - top;
            arrowStyle = { top: Math.max(15, arrowTop) };
        }

        return createPortal(
            <div
                className="fixed pointer-events-auto z-[99999]"
                style={{ top, bottom, left, width: tooltipWidth }}
                onMouseEnter={handleTooltipMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="bg-slate-900/98 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(138,162,238,0.2)] p-4 relative max-h-[85vh] flex flex-col">
                    <div 
                        className={cn(
                            "absolute w-3 h-3 bg-slate-800 rotate-45 rounded-[1px] transition-all duration-200 z-0",
                            isFlipped 
                                ? "-right-1.5 border-t border-r border-cyan-500/50" 
                                : "-left-1.5 border-b border-l border-cyan-500/50"
                        )} 
                        style={arrowStyle}
                    />
                    
                    <div className="relative z-10 flex flex-col min-h-0">
                        <div className="text-cyan-400 font-black mb-2 text-[11px] tracking-widest uppercase shrink-0">
                            {hoveredTech.tech.name}
                        </div>
                        <div className="text-slate-300 text-[9.5px] leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-y-auto cyber-scrollbar pr-2 shrink">
                            {hoveredTech.tech.description}
                        </div>
                        {/* Rule breakdown — aggregates subtechniques if hovering parent */}
                        {(() => {
                            let aggTotal = 0;
                            const aggRules: Record<string, { description: string; count: number }> = {};
                            
                            // 1. Add direct hits
                            const directFreq = frequencies[hoveredTech.tech.t_code];
                            if (directFreq) {
                                aggTotal += directFreq.total;
                                Object.entries(directFreq.rules).forEach(([rid, rdata]) => {
                                    if (!aggRules[rid]) aggRules[rid] = { description: rdata.description, count: 0 };
                                    aggRules[rid].count += rdata.count;
                                });
                            }
                            
                            // 2. Add sub-technique hits if it's a parent technique
                            if (!hoveredTech.isSub && hoveredTech.tech.subtechniques) {
                                hoveredTech.tech.subtechniques.forEach((sub: any) => {
                                    const subFreq = frequencies[sub.t_code];
                                    if (subFreq) {
                                        aggTotal += subFreq.total;
                                        Object.entries(subFreq.rules).forEach(([rid, rdata]) => {
                                            if (!aggRules[rid]) aggRules[rid] = { description: rdata.description, count: 0 };
                                            aggRules[rid].count += rdata.count;
                                        });
                                    }
                                });
                            }

                            if (aggTotal === 0) return null;
                            const ruleBreakdown = Object.entries(aggRules).sort((a, b) => b[1].count - a[1].count);
                            return (
                                <div className="mt-3 pt-2.5 border-t border-rose-500/20 shrink-0">
                                    <div className="text-[8px] uppercase tracking-widest text-rose-400/70 font-mono mb-1.5">Triggered by</div>
                                    <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto cyber-scrollbar pr-1">
                                        {ruleBreakdown.map(([ruleId, { description, count }]) => (
                                            <div key={ruleId} className="flex items-start justify-between gap-2 py-0.5">
                                                <span 
                                                    className="text-[8.5px] font-mono text-slate-300 flex-1 leading-relaxed"
                                                    title={`${description} (${ruleId})`}
                                                >
                                                    {description} <span className="text-cyan-500/60 whitespace-nowrap">({ruleId})</span>
                                                </span>
                                                <span className="text-[8.5px] font-bold font-mono text-rose-300 shrink-0 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30 mt-0.5">
                                                    ×{count}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="h-full w-full flex flex-col p-6 bg-gradient-to-br from-slate-900/80 via-cyan-950/20 to-slate-900/80 backdrop-blur-2xl border-[2px] border-cyan-500/30 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_0_30px_rgba(138,162,238,0.05)] relative overflow-hidden">
            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(138,162,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(138,162,238,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
            
            <div className="flex items-center justify-between mb-6 shrink-0 relative z-50">
                <div>
                    <h2 className="text-2xl font-mono font-black text-white uppercase tracking-[0.3em] flex items-center gap-3 drop-shadow-[0_0_15px_rgba(138,162,238,0.5)]">
                        MITRE ATT&CK® Matrix
                    </h2>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <p className="text-[10px] text-cyan-400/70 font-mono tracking-widest uppercase font-bold">Live Dynamic Mapping</p>
                        {attack?.version && attackState && (
                            <span title={attackTitle}
                                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-cyan-500/20 bg-slate-950/40 text-[9px] font-mono uppercase tracking-[0.15em] text-cyan-200/80">
                                <span className={cn("h-1.5 w-1.5 rounded-full", attackState.dot)} />
                                ATT&CK v{attack.version}
                                <span className="text-cyan-500/40">|</span>
                                {attack.techniques} techniques · {attack.subtechniques} sub-techniques
                                <span className="text-cyan-500/40">|</span>
                                <span className="text-cyan-300/60">{attackState.label}</span>
                            </span>
                        )}
                        {isSocAdmin && attack?.version && (
                            /* The button itself shows the outcome for a few seconds, then returns */
                            <motion.button onClick={checkForUpdates} disabled={checking}
                                ref={(el: HTMLButtonElement | null) => { if (el && buttonWidth === undefined && !checking && !checkResult) setButtonWidth(el.offsetWidth); }}
                                style={{ width: buttonWidth }}
                                title={checkResult?.detail}
                                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                                className={cn(
                                    "inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-[0.15em] whitespace-nowrap transition-colors duration-500 overflow-hidden",
                                    !checkResult && "border-cyan-500/30 text-cyan-300/80 hover:text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-500/10 disabled:opacity-60",
                                    checkResult?.kind === 'failed' && "border-amber-400/50 bg-amber-500/10 text-amber-200",
                                    checkResult && checkResult.kind !== 'failed' && "border-emerald-400/50 bg-emerald-500/10 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.25)]"
                                )}>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.span key={checkResult ? `result-${checkResult.text}` : checking ? 'checking' : 'idle'}
                                        role={checkResult ? 'status' : undefined}
                                        initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }}
                                        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                                        className="inline-flex items-center gap-1.5">
                                        {checkResult ? (
                                            <>
                                                <span className="relative flex h-3 w-3 items-center justify-center">
                                                    <span className={cn("absolute -inset-0.5 rounded-full animate-ping",
                                                        checkResult.kind === 'failed' ? "bg-amber-400/30" : "bg-emerald-400/30")} />
                                                    {checkResult.kind === 'failed' ? <AlertTriangle size={11} className="relative" />
                                                        : checkResult.kind === 'updated' ? <Sparkles size={11} className="relative" />
                                                        : <CheckCircle2 size={11} className="relative" />}
                                                </span>
                                                {checkResult.text}
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw size={11} className={cn(checking && "animate-spin")} />
                                                {checking ? 'Checking...' : 'Check for updates'}
                                            </>
                                        )}
                                    </motion.span>
                                </AnimatePresence>
                            </motion.button>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                    {/* ZOOM CONTROL */}
                    <div className="flex items-center gap-3.5 bg-slate-950/40 border border-cyan-500/20 px-3.5 py-1.5 rounded-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                                className="text-cyan-600/60 hover:text-cyan-400 transition-all hover:scale-110 active:scale-90"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                                </svg>
                            </button>
                            
                            <input 
                                type="range" 
                                min="0.5" 
                                max="1.5" 
                                step="0.01" 
                                value={zoom} 
                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                className="w-32 accent-cyan-500 bg-slate-800 h-1 rounded-full cursor-pointer appearance-none"
                            />
                            
                            <button 
                                onClick={() => setZoom(prev => Math.min(1.5, prev + 0.1))}
                                className="text-cyan-600/60 hover:text-cyan-400 transition-all hover:scale-110 active:scale-90"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                                </svg>
                            </button>
                        </div>
                        <div className="min-w-[45px] text-[10px] font-mono font-black text-white text-center tabular-nums bg-cyan-500/10 px-2 py-1 rounded-md border border-cyan-500/20 shadow-[0_0_10px_rgba(138,162,238,0.1)]">
                            {Math.round(zoom * 100)}%
                        </div>
                    </div>

                    <TimeFilterControl 
                        timeFilter={timeFilter}
                        setTimeFilter={setTimeFilter}
                        customRange={customRange}
                        setCustomRange={setCustomRange}
                        relativeTime={relativeTime}
                        setRelativeTime={setRelativeTime}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-auto cyber-scrollbar rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-cyan-500/30 shadow-[inset_0_0_30px_rgba(138,162,238,0.05)] relative z-10">
                <div className="flex w-max min-w-full" style={{ zoom: zoom }}>
                    {matrix.map((tactic) => (
                        <div key={tactic.id} className="flex flex-col w-[230px] border-r border-cyan-500/20 last:border-r-0 bg-transparent">
                            {/* Tactic Header */}
                            <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 p-4 border-b border-cyan-500/40 border-t-2 border-t-transparent hover:border-t-cyan-400 sticky top-0 z-20 shadow-[0_10px_20px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all duration-300">
                                <div className="text-[11px] font-mono font-black text-cyan-400 uppercase tracking-widest leading-tight drop-shadow-[0_0_8px_rgba(138,162,238,0.3)]">{tactic.name}</div>
                                <div className="text-[9px] font-mono font-bold text-slate-400 mt-1.5">{tactic.techniques.length} techniques</div>
                            </div>
                            
                            {/* Techniques */}
                            <div className="flex flex-col p-3 gap-3">
                                {tactic.techniques.map((tech: any) => {
                                    const count = frequencies[tech.t_code]?.total || 0;
                                    const hasSub = tech.subtechniques && tech.subtechniques.length > 0;
                                    const activeSubCount = hasSub ? tech.subtechniques.reduce((acc: number, sub: any) => acc + (frequencies[sub.t_code]?.total || 0), 0) : 0;
                                    const totalCount = count + activeSubCount;
                                    
                                    const isActive = totalCount > 0;
                                    const isExpanded = expandedTechs.has(`${tactic.id}-${tech.t_code}`);
                                    
                                    return (
                                        <div key={tech.t_code} className="flex flex-col gap-1.5">
                                            <div 
                                                className={cn(
                                                    "p-3 rounded-xl text-[10px] font-mono border transition-all duration-300 relative cursor-crosshair group/tech",
                                                    isActive 
                                                        ? "bg-gradient-to-br from-rose-500/20 to-rose-950/50 border-rose-500/60 text-white shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:shadow-[0_0_25px_rgba(244,63,94,0.3)] hover:border-rose-400" 
                                                        : "bg-slate-800/40 border-slate-600/40 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-100 hover:bg-slate-800/70 hover:shadow-[0_0_15px_rgba(138,162,238,0.2)]"
                                                )}
                                                onMouseEnter={(e) => handleMouseEnter(tech, e, false)}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className={cn("font-bold leading-snug tracking-wide", isActive && "drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]")}>{tech.name}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                                        <span className={cn("text-[8px] font-bold", isActive ? "text-rose-300" : "text-cyan-500/70")}>{tech.t_code}</span>
                                                        {hasSub && (
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleExpanded(tactic.id, tech.t_code);
                                                                }}
                                                                className={cn(
                                                                    "p-0.5 rounded-sm border transition-colors pointer-events-auto",
                                                                    isActive 
                                                                        ? "bg-rose-950/50 border-rose-500/40 hover:bg-rose-900/80 hover:text-white text-rose-300" 
                                                                        : "bg-slate-900/50 border-slate-700/50 hover:bg-slate-800 hover:text-cyan-400 hover:border-cyan-500/50"
                                                                )}
                                                            >
                                                                {isExpanded ? <ChevronDown size={10} strokeWidth={3} /> : <ChevronRight size={10} strokeWidth={3} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {totalCount > 0 && (
                                                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-rose-400 to-rose-600 text-white rounded-full flex items-center justify-center text-[9px] font-black shadow-[0_0_15px_rgba(244,63,94,0.8)] border border-rose-300/50 animate-pulse-gentle">
                                                        {totalCount}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Subtechniques */}
                                            {hasSub && isExpanded && (
                                                <div className="pl-3 flex flex-col gap-1.5 border-l-2 border-slate-700/30 ml-3">
                                                    {tech.subtechniques.map((sub: any) => {
                                                        const subCount = frequencies[sub.t_code]?.total || 0;
                                                        const isSubActive = subCount > 0;
                                                        return (
                                                            <div 
                                                                key={sub.t_code} 
                                                                className={cn(
                                                                    "p-2 rounded-lg text-[9px] font-mono border transition-all duration-300 relative cursor-crosshair group/sub",
                                                                    isSubActive 
                                                                        ? "bg-gradient-to-r from-rose-500/15 to-transparent border-rose-500/30 text-rose-100 hover:border-rose-400/50" 
                                                                        : "bg-slate-800/30 border-slate-700/40 text-slate-400 hover:text-cyan-100 hover:bg-slate-800/60 hover:border-cyan-500/30 hover:shadow-[0_0_10px_rgba(138,162,238,0.1)]"
                                                                )}
                                                                onMouseEnter={(e) => {
                                                                    e.stopPropagation();
                                                                    handleMouseEnter(sub, e, true);
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.stopPropagation();
                                                                    handleMouseLeave();
                                                                }}
                                                            >
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <span className={cn("leading-tight", isSubActive && "font-bold drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]")}>{sub.name}</span>
                                                                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                                                        <span className={cn("text-[7.5px] font-bold", isSubActive ? "text-rose-400/70" : "text-cyan-500/50")}>{sub.t_code}</span>
                                                                        {subCount > 0 && (
                                                                            <div className="text-white font-bold bg-rose-950/80 px-1.5 py-0.5 rounded text-[8px] border border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.4)]">
                                                                                {subCount}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {renderTooltip()}
        </div>
    );
};
