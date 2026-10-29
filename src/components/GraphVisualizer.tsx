import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, useNodesState, useEdgesState } from '@xyflow/react';
 
import { type Node, type Edge, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSocket } from '../hooks/useSocket';
import { cn } from './DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Loader2, Link as LinkIcon, Undo2, ExternalLink, Server, Database, AlertTriangle } from 'lucide-react';
import type { Alert, SocketEvent } from '../types';
import { AlertDetails } from './AlertDetails';
import { StandbyState } from './StandbyState';

// Graph line colour. Saved graphs keep the colour of the version that drew them, so older accent
// colours are shown as the current one (the saved data is left as is).
const ACCENT_STROKE = '#06b6d4';
// Blues tried as the accent on 2026-10-29, which graphs saved that day may hold
const OLD_ACCENT_STROKES = new Set(['#6f8be6', '#5a8de6', '#6789c6', '#4a86dc', '#8aa2ee', '#74a3ee', '#83a2d4', '#659ee8']);

import { createPortal } from 'react-dom';
import { BRAND } from '../brand';
import { useSettings } from '../contexts/SettingsContext';
import { soarInfo } from '../soar';

const getIocTypeStyle = (ioc: string): { label: string; badge: string; rowIdle: string; rowSelected: string; glow: string } => {
    const c = String(ioc).trim();
    if (/^CVE-\d{4}-\d{4,7}$/i.test(c))
        return { label: 'CVE',    badge: 'bg-rose-500/20 border-rose-500/50 text-rose-300',     rowIdle: 'bg-rose-500/[0.06] border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/10',     rowSelected: 'bg-rose-500/10 border-rose-500/50 shadow-[0_0_24px_rgba(244,63,94,0.15)]',    glow: 'bg-rose-500' };
    if (/^[a-fA-F0-9]{128}$/.test(c))
        return { label: 'SHA512', badge: 'bg-violet-500/20 border-violet-500/50 text-violet-300', rowIdle: 'bg-violet-500/[0.06] border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/10', rowSelected: 'bg-violet-500/10 border-violet-500/50 shadow-[0_0_24px_rgba(139,92,246,0.15)]', glow: 'bg-violet-500' };
    if (/^[a-fA-F0-9]{64}$/.test(c))
        return { label: 'SHA256', badge: 'bg-violet-500/20 border-violet-500/50 text-violet-300', rowIdle: 'bg-violet-500/[0.06] border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/10', rowSelected: 'bg-violet-500/10 border-violet-500/50 shadow-[0_0_24px_rgba(139,92,246,0.15)]', glow: 'bg-violet-500' };
    if (/^[a-fA-F0-9]{40}$/.test(c))
        return { label: 'SHA1',   badge: 'bg-violet-500/20 border-violet-500/50 text-violet-300', rowIdle: 'bg-violet-500/[0.06] border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/10', rowSelected: 'bg-violet-500/10 border-violet-500/50 shadow-[0_0_24px_rgba(139,92,246,0.15)]', glow: 'bg-violet-500' };
    if (/^[a-fA-F0-9]{32}$/.test(c))
        return { label: 'MD5',    badge: 'bg-violet-500/20 border-violet-500/50 text-violet-300', rowIdle: 'bg-violet-500/[0.06] border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/10', rowSelected: 'bg-violet-500/10 border-violet-500/50 shadow-[0_0_24px_rgba(139,92,246,0.15)]', glow: 'bg-violet-500' };
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(c))
        return { label: 'IP',     badge: 'bg-sky-500/20 border-sky-500/50 text-sky-300',         rowIdle: 'bg-sky-500/[0.06] border-sky-500/20 hover:border-sky-500/40 hover:bg-sky-500/10',         rowSelected: 'bg-sky-500/10 border-sky-400/60 shadow-[0_0_24px_rgba(14,165,233,0.2)]',     glow: 'bg-sky-400' };
    if (c.startsWith('http'))
        return { label: 'URL',    badge: 'bg-orange-500/20 border-orange-500/50 text-orange-300', rowIdle: 'bg-orange-500/[0.06] border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-500/10', rowSelected: 'bg-orange-500/10 border-orange-400/60 shadow-[0_0_24px_rgba(249,115,22,0.15)]', glow: 'bg-orange-400' };
    if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,8}$/.test(c))
        return { label: 'EMAIL',  badge: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300', rowIdle: 'bg-yellow-500/[0.06] border-yellow-500/20 hover:border-yellow-500/40 hover:bg-yellow-500/10', rowSelected: 'bg-yellow-500/10 border-yellow-400/60 shadow-[0_0_24px_rgba(234,179,8,0.15)]',  glow: 'bg-yellow-400' };
    if (/^HK(EY_[A-Z_]+|LM|CU|U|CR|CC)\\/i.test(c))
        return { label: 'REG',    badge: 'bg-pink-500/20 border-pink-500/50 text-pink-300',       rowIdle: 'bg-pink-500/[0.06] border-pink-500/20 hover:border-pink-500/40 hover:bg-pink-500/10',       rowSelected: 'bg-pink-500/10 border-pink-400/60 shadow-[0_0_24px_rgba(236,72,153,0.15)]',   glow: 'bg-pink-400' };
    if (c.includes('\\') || (c.startsWith('/') && c.includes('/')))
        return { label: 'PATH',   badge: 'bg-slate-400/15 border-slate-400/30 text-slate-300',   rowIdle: 'bg-slate-700/20 border-slate-500/20 hover:border-slate-400/40',                         rowSelected: 'bg-slate-700/30 border-slate-400/40 shadow-[0_0_16px_rgba(148,163,184,0.08)]', glow: 'bg-slate-400' };
    if (c.includes('.') && !c.includes(' '))
        return { label: 'DOMAIN', badge: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300', rowIdle: 'bg-emerald-500/[0.06] border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10', rowSelected: 'bg-emerald-500/10 border-emerald-400/60 shadow-[0_0_24px_rgba(16,185,129,0.15)]', glow: 'bg-emerald-400' };
    return { label: 'IOC', badge: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300', rowIdle: 'bg-cyan-500/[0.06] border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/10', rowSelected: 'bg-cyan-500/10 border-cyan-400/60 shadow-[0_0_24px_rgba(34,211,238,0.15)]', glow: 'bg-cyan-400' };
};

const getFileTypeLabel = (filePath: string): string => {
    const ext = (filePath?.split('.').pop() || '').toLowerCase();
    if (['exe', 'dll', 'msi', 'scr', 'com', 'pif', 'ps1', 'vbs', 'js', 'py', 'sh', 'bat', 'cmd', 'wsf', 'hta'].includes(ext)) return 'EXECUTABLE';
    if (['sys', 'drv', 'ocx'].includes(ext)) return 'DRIVER';
    if (['doc', 'docx', 'xls', 'xlsx', 'pdf', 'ppt', 'pptx'].includes(ext)) return 'DOCUMENT';
    if (['zip', 'tar', 'gz', 'rar', '7z', 'cab'].includes(ext)) return 'ARCHIVE';
    if (['log', 'tmp', 'ini', 'cfg', 'conf', 'dat'].includes(ext)) return 'SYSTEM FILE';
    return 'FILE PATH';
};

const getProviderLogo = (modelName: string) => {
    const lower = modelName?.toLowerCase() || '';
    if (lower.includes('openai') || lower.startsWith('gpt-')) return '/assets/Openai.png';
    if (lower.includes('anthropic') || lower.startsWith('claude-')) return '/assets/Anthropic.png';
    if (lower.includes('gemini') || lower.startsWith('gemini-')) return '/assets/Gemini.png';
    if (lower.includes('moonshot')) return '/assets/Nebius AI.jpg';
    if (lower.includes('llama') || lower.includes('mistral') || lower.includes('deepseek')) return '/assets/Nebius AI.jpg';
    return '/assets/Nebius AI.jpg';
};

// The error a failed agent stopped on, as saved with its results (without the pipeline's log prefix)
const getFailureReason = (results: any): string | null => {
    const status = String(results?.status || results?.Status || '').toLowerCase();
    if (!status.includes('failed') || !results?.error) return null;
    return String(results.error).replace(/^🛑\s*Investigation halted:\s*/, '').trim() || null;
};

const CyberNode = ({ data }: any) => {
    const isActive = data.isActive;

    const verdictColor = (() => {
        const v = (data.results?.verdict || data.verdict || '').toLowerCase();
        if (v === 'malicious') return 'text-rose-500';
        if (v === 'suspicious' || v === 'error') return 'text-amber-400';
        if (v === 'already blocked' || v === 'blocked') return 'text-sky-400';
        if (v === 'clean' || v === 'complete') return 'text-emerald-400';
        return 'text-cyan-400';
    })();

    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const nodeRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nestedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Determine if node is currently working
    const status = data.results?.status || data.results?.Status;
    const isWorking = isActive && (!status || (status !== 'Complete' && status !== 'Failed'));
    const failureReason = getFailureReason(data.results);

    const [nestedTooltip, setNestedTooltip] = useState<{ label: string, items: string[], x: number, y: number } | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowTooltip(true);
        setNestedTooltip(null); // Clear any open nested tooltip when returning to the source node
        
        if (nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            // Heuristic heights based on node type - matching the CSS max-height formula
            const estimatedHeight = Math.min(650, viewportHeight * 0.85);

            let top = rect.bottom + 10;

            // SMART POSITIONING: If it would overflow the bottom, shift it up
            if (top + estimatedHeight > viewportHeight - 20) {
                // Try showing it above the node first
                const spaceAbove = rect.top - 10;
                if (spaceAbove > estimatedHeight) {
                    top = rect.top - estimatedHeight - 10;
                } else {
                    // Otherwise, just clamp it to the bottom of the viewport (top of screen)
                    top = Math.max(20, viewportHeight - estimatedHeight - 20);
                }
            }

            setTooltipPos({
                x: rect.right - 20,
                y: top
            });
            setShowTooltip(true);
        }
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setShowTooltip(false);
            setNestedTooltip(null);
        }, 200); // Reduced from 300ms for snappier response
    };

    const handleNestedTrigger = (e: React.MouseEvent, label: string, items: any[]) => {
        try {
            const target = e.currentTarget as HTMLElement;
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let x = rect.left;
            let y = rect.bottom + 5;

            // Smart positioning for nested portal
            const safeItems = Array.isArray(items) ? items : [];
            const estimatedHeight = Math.min(safeItems.length * 40 + 60, viewportHeight * 0.6);

            if (x + 330 > viewportWidth) x = viewportWidth - 330;
            
            if (y + estimatedHeight > viewportHeight - 20) {
                const spaceAbove = rect.top - 10;
                if (spaceAbove > estimatedHeight) {
                    y = rect.top - estimatedHeight - 10;
                } else {
                    y = Math.max(10, viewportHeight - estimatedHeight - 20);
                }
            }

            setNestedTooltip({ label, items: safeItems, x, y });
        } catch (err) {
            console.error('[NestedTooltip] Trigger failed', err);
        }
    };

    const handleNestedLeave = () => {
        nestedTimeoutRef.current = setTimeout(() => {
            setNestedTooltip(null);
        }, 150);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
        };
    }, []);

    return (
        <>
            <div
                ref={nodeRef}
                className="relative group"
                onMouseLeave={handleMouseLeave}
            >
                {/* Pulsing Aura Background (Always Cyan for unified look) */}
                {isWorking && (
                    <div
                        className="absolute inset-[-4px] rounded-lg blur-md animate-pulse z-0 transition-opacity duration-300 bg-cyan-400/40"
                    />
                )}

                {/* ... Node Content ... */}
                <div
                    className={cn(
                        "w-52 p-3 rounded-md border bg-slate-900/90 backdrop-blur-md font-mono transition-all duration-300 relative z-10",
                        (isActive || status === 'Complete' || data.results?.status === 'Complete')
                            ? "border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] border-2"
                            : "border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.05)]"
                    )}
                >
                    <Handle type="target" position={Position.Left} id="left" className="!bg-cyan-500/50" />
                    <Handle type="source" position={Position.Right} id="right" className="!bg-cyan-500/50" />
                    <Handle type="source" position={Position.Top} id="top-source" className="!bg-cyan-500/50" />
                    <Handle type="target" position={Position.Top} id="top-target" className="!bg-cyan-500/50" />

                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            {isActive && (
                                <div className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-cyan-400"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
                                </div>
                            )}
                            <span className={cn("text-[11px] uppercase font-bold tracking-wider font-mono truncate max-w-[120px]", (isActive || status === 'Complete' || data.results?.status === 'Complete') ? "text-white" : "text-cyan-100/70")}>
                                {data.label}
                            </span>
                        </div>

                        {/* Info Icon / Loading Trigger */}
                        <div
                            onMouseEnter={handleMouseEnter}
                            className="cursor-help p-1 rounded hover:bg-cyan-900/30 text-cyan-500/50 hover:text-cyan-400 transition-colors"
                        >
                            {isWorking ? (
                                <Loader2 className="animate-spin text-cyan-400" size={14} />
                            ) : (
                                <Info size={14} />
                            )}
                        </div>
                    </div>

                    {/* Role Label */}
                    <div className="text-[9px] text-cyan-400/60 uppercase tracking-[0.2em] font-mono font-bold">
                        {data.role}
                    </div>

                    {/* Status Summary (Persistent visibility for premium feel) */}
                    {(isActive || status === 'Complete' || data.results?.status === 'Complete') && (
                        <div className="mt-2 pt-1 border-t border-cyan-500/10 flex items-center justify-between">
                            <span className="text-[8px] text-slate-500 uppercase tracking-tighter">Summary:</span>
                            <span className={cn(
                                "text-[8px] font-bold truncate max-w-[100px]",
                                data.label === 'Verdict Judge' && data.results?.verdict ? verdictColor : (
                                    status === 'Complete' ? "text-emerald-400" :
                                        status === 'Failed' ? "text-amber-400" : "text-cyan-400 animate-pulse"
                                )
                            )}>
                                {(() => {
                                    if (data.label === 'IOC Extractor') {
                                        const details = data.results?.details;
                                        if (details) {
                                            const total = Object.values(details).reduce((acc: number, items: any) => acc + (items?.length || 0), 0);
                                            if (total > 0) return `${total} Observable${total !== 1 ? 's' : ''} Found !`;
                                        }
                                        return (data.results?.breakdown || "Analyzing...");
                                    }
                                    if (data.label === 'Investigator') {
                                        const validSources = (data.results?.sources_queried || []).filter((s: string) => {
                                            const lower = s?.toLowerCase() || '';
                                            return s && lower !== 'none' && lower !== 'local analysis';
                                        });
                                        if (validSources.length > 0) {
                                            return `${validSources.length} Source${validSources.length > 1 ? 's' : ''}`;
                                        }
                                        if (status === 'Complete' || data.results?.status === 'Complete') return "No CTI";
                                        return "Searching CTI...";
                                    }
                                    if (data.label === 'Verdict Judge') {
                                        if (data.results?.status === 'Failed') return "Execution Halted";
                                        const v = data.results?.verdict || data.verdict;
                                        if (v) return v;
                                        if (status === 'Complete' || data.results?.status === 'Complete') return "Case Closed";
                                        return "Evaluating...";
                                    }
                                    return status === 'Complete' ? "Complete" : (status || "Active");
                                })()}
                            </span>
                        </div>
                    )}
                </div>

                {/* Tactical Tooltip via Portal */}
                {createPortal(
                    <AnimatePresence>
                        {showTooltip && (
                            <motion.div
                                key="main-tooltip"
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                style={{
                                    position: 'fixed',
                                    left: tooltipPos.x,
                                    top: tooltipPos.y,
                                    zIndex: 99999
                                }}
                                className={cn("pointer-events-auto", data.label === 'Verdict Judge' ? "w-[450px]" : "w-80")}
                                onMouseEnter={() => {
                                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                    setShowTooltip(true);
                                    setNestedTooltip(null);
                                }}
                                onMouseLeave={handleMouseLeave}
                            >
                                <div className="bg-slate-950/98 border border-cyan-500/40 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(6,182,212,0.15)] backdrop-blur-2xl text-left transform -translate-x-full overflow-hidden flex flex-col max-h-[min(650px,85vh)]">
                                    {/* Header (Fixed) */}
                                    <div className="flex items-center justify-between border-b border-cyan-900/50 p-3 bg-cyan-950/20">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em] font-mono">
                                                {data.label === 'IOC Extractor' ? 'Agent 1 Results' :
                                                    data.label === 'Investigator' ? 'Agent 2 Results' :
                                                        data.label === 'Verdict Judge' ? 'Agent 3 Analysis Output' :
                                                            data.label}
                                            </span>
                                            {(data.results?.model || data.model) && data.label !== 'Investigator' && (
                                                <div className="text-[10.5px] mt-1 font-mono">
                                                    <span className="font-bold text-purple-400 uppercase">MODEL</span>
                                                    <span className="text-white uppercase"> : {data.results?.model || data.model}</span>
                                                </div>
                                            )}
                                        </div>
                                        {data.label !== 'Investigator' && (
                                            <div className="flex items-center">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-lg overflow-hidden transition-all duration-300 border border-white/10 shadow-lg",
                                                    getProviderLogo(data.results?.model || data.model).includes('Nebius') 
                                                        ? "shadow-[0_0_15px_rgba(205,255,50,0.3)] border-lime-500/20" 
                                                        : "shadow-[0_0_15px_rgba(34,211,238,0.3)] border-cyan-500/20"
                                                )}>
                                                    <img 
                                                        src={getProviderLogo(data.results?.model || data.model)} 
                                                        alt="Provider" 
                                                        className={cn(
                                                            "w-full h-full object-cover",
                                                            getProviderLogo(data.results?.model || data.model).includes('Openai') && "brightness-0 invert p-1.5"
                                                        )} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content (Scrollable) */}
                                    <div className="p-4 space-y-4 text-[11px] font-mono text-cyan-100/90 overflow-y-auto cyber-scrollbar flex-1">
                                        {!isWorking && failureReason && (
                                            <div className="rounded-md border border-rose-500/25 bg-rose-500/[0.07] px-3 py-2.5">
                                                <div className="flex items-center gap-1.5 text-rose-400 uppercase font-bold text-[9px] tracking-wider mb-1">
                                                    <AlertTriangle size={11} strokeWidth={2.4} />
                                                    Reason
                                                </div>
                                                <div className="font-sans text-[12px] leading-relaxed text-rose-100/90 whitespace-pre-wrap break-words">{failureReason}</div>
                                            </div>
                                        )}
                                        {isWorking ? (
                                            <div className="flex items-center gap-2 py-2 text-cyan-300 animate-pulse">
                                                <Loader2 size={12} className="animate-spin" />
                                                <span>Waiting for LLM response...</span>
                                            </div>
                                        ) : data.results ? (
                                            data.label === 'IOC Extractor' ? (
                                                /* Agent 1 - IOC Extractor */
                                                <div className="flex flex-col gap-3 pt-1">
                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">EXTRACTED OBSERVABLES</div>
                                                        <div className="font-mono text-cyan-50 text-[10px] font-medium border-l-2 border-cyan-500/30 pl-2 break-words flex flex-wrap gap-x-1">
                                                            {data.results.details ? (
                                                                Object.entries(data.results.details).map(([label, items]: [string, any], idx, arr) => (
                                                                    <div key={label} className="relative group cursor-help inline-block">
                                                                        <span
                                                                            onMouseEnter={(e) => {
                                                                                if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                                handleNestedTrigger(e, label, items);
                                                                            }}
                                                                            onMouseLeave={handleNestedLeave}
                                                                            className="hover:text-cyan-400 p-0.5 rounded transition-colors decoration-dashed underline decoration-cyan-500/50 underline-offset-2"
                                                                        >
                                                                            {items.length} {label.replace(/\sIdentifiers$/i, '')}
                                                                        </span>
                                                                        {idx < arr.length - 1 && <span className="text-cyan-500/40 ml-1 mr-1">/</span>}
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className="text-slate-500 italic">{data.results.breakdown || "No data extracted"}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {data.results.source && (
                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">LOG SOURCE</div>
                                                        <div className="font-mono text-cyan-200/90 text-[10px] truncate border-l-2 border-purple-500/30 pl-2">
                                                            {data.results.source}
                                                        </div>
                                                    </div>
                                                    )}
                                                    {/* The "Analyzing telemetry..." placeholder means nothing once the agent failed */}
                                                    {data.results.summary && !(failureReason && data.results.summary === 'Analyzing telemetry...') && (
                                                        <div>
                                                            <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">AI SUMMARY</div>
                                                            <div className="font-mono text-cyan-100/90 text-[10px] leading-relaxed border-l-2 border-cyan-500/30 pl-2 italic">
                                                                "{data.results.summary}"
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between border-t border-cyan-500/10 pt-2 mt-1">
                                                        <span className="text-cyan-600/80 uppercase font-bold text-[9px] tracking-wider">STATUS</span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold font-mono px-2 py-0.5 rounded border capitalize",
                                                            (data.results.status || data.results.Status) === 'Complete' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                                (data.results.status || data.results.Status)?.toLowerCase().includes('failed') ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                                                    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse"
                                                        )}>
                                                            {data.results.status || 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : data.label === 'Investigator' ? (
                                                /* Agent 2 - Investigator */
                                                <div className="flex flex-col gap-3 py-1">
                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">CTI SOURCES QUERIED</div>
                                                        <div className="font-mono text-cyan-50 text-[10px] break-words flex flex-wrap gap-1">
                                                            {(data.results.sources_queried as string[] || []).filter(s => s !== 'Local Analysis').map((source, i) => {
                                                                const sourceData = data.results.external_intel?.find((intel: any) => intel.tool === source);
                                                                const items = sourceData ? [
                                                                    { label: 'IoC', value: sourceData.ioc },
                                                                    { label: 'Verdict', value: sourceData.verdict },
                                                                    sourceData.risk_score > 0 ? { label: 'Risk Score', value: sourceData.risk_score } : null,
                                                                    (sourceData.category_tags && sourceData.category_tags.length > 0) 
                                                                        ? { label: 'Tags', value: sourceData.category_tags.join(', ') } 
                                                                        : null
                                                                ].filter(Boolean) : ['No detailed data available'];
                                                                return (
                                                                    <span
                                                                        key={i}
                                                                        className="bg-cyan-950/50 border border-cyan-800/50 px-1 rounded cursor-help transition-colors hover:bg-cyan-900/50 hover:border-cyan-400/50"
                                                                        onMouseEnter={(e) => {
                                                                            if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                            handleNestedTrigger(e, source, items);
                                                                        }}
                                                                        onMouseLeave={handleNestedLeave}
                                                                    >
                                                                        {source}
                                                                    </span>
                                                                );
                                                            })}
                                                            {((data.results.sources_queried as string[] || []).filter(s => s !== 'Local Analysis').length === 0) &&
                                                                <span className="text-slate-500 italic">None</span>
                                                            }
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-1 tracking-wider">TAGS & ANALYSIS</div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {data.results.sources_queried?.includes('Local Analysis') && (() => {
                                                                const sourceData = data.results.external_intel?.find((intel: any) => intel.tool === 'Local Analysis');
                                                                const label = getFileTypeLabel(sourceData?.ioc || '');
                                                                return (
                                                                    <span
                                                                        className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-1.5 py-0.5 rounded text-[9px] font-bold cursor-help transition-all hover:bg-cyan-500/20 hover:border-cyan-400"
                                                                        onMouseEnter={(e) => {
                                                                            if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                            const items = sourceData ? [
                                                                                { label: 'IoC', value: sourceData.ioc },
                                                                                { label: 'Verdict', value: sourceData.verdict },
                                                                                sourceData.risk_score > 0 ? { label: 'Risk Score', value: sourceData.risk_score } : null,
                                                                                (sourceData.category_tags && sourceData.category_tags.length > 0)
                                                                                    ? { label: 'Tags', value: sourceData.category_tags.join(', ') }
                                                                                    : null
                                                                            ].filter(Boolean) : ['No local analysis details'];
                                                                            handleNestedTrigger(e, 'Local File', items);
                                                                        }}
                                                                        onMouseLeave={handleNestedLeave}
                                                                    >
                                                                        {label}
                                                                    </span>
                                                                );
                                                            })()}
                                                            {(data.results.critical_tags as string[] || []).map((tag, i) => (
                                                                <div key={i} className="flex items-center gap-1 text-[9px] text-rose-300 font-bold bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-900/30 uppercase">
                                                                    <span>{tag}</span>
                                                                </div>
                                                            ))}
                                                            {(!data.results.critical_tags?.length && !data.results.sources_queried?.includes('Local Analysis')) && (
                                                                <div className="text-cyan-50/50 italic text-[10px] py-0.5">No Tags Detected</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* BEHAVIORAL CONTEXT */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[8px] tracking-wider">Behavioral Context</div>
                                                        <div className="grid grid-cols-2 gap-1.5">
                                                            {/* Card 1 - Rule Presence */}
                                                            <div className={cn(
                                                                "relative rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-500 group/card",
                                                                data.results.is_burst
                                                                    ? "bg-rose-500/[0.03] border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.1),inset_0_0_20px_rgba(244,63,94,0.05)]"
                                                                    : "bg-slate-900/40 border-white/5 shadow-xl backdrop-blur-md"
                                                            )}>
                                                                <div className="flex justify-between items-start">
                                                                    <div className="text-[10px] font-black text-cyan-500/60 uppercase tracking-[0.2em] font-mono">Rule Presence</div>
                                                                </div>
                                                                <div className="flex items-baseline gap-2 mt-0.5">
                                                                    <span className={cn("font-mono text-[24px] font-black leading-none tracking-tighter", data.results.is_burst ? "text-rose-400" : "text-white")}>
                                                                        {data.results.rule_count ?? 0}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Triggers</span>
                                                                </div>
                                                                <div className="text-slate-400/80 text-[8px] leading-tight pr-1">
                                                                    Count of this specific rule triggering across all sources (30d).
                                                                </div>
                                                                
                                                                {/* Burst Badge */}
                                                                <div 
                                                                    className={cn(
                                                                        "mt-1 py-1.5 px-2 rounded-lg border flex flex-col gap-1 cursor-help transition-colors",
                                                                        data.results.is_burst ? "bg-rose-500/10 border-rose-500/30" : "bg-white/[0.03] border-white/5 hover:bg-white/[0.05]"
                                                                    )}
                                                                    onMouseEnter={(e) => {
                                                                        if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                        const source = data.results.source || 'Current Agent';
                                                                        const hits = data.results.burst_source ?? 0;
                                                                        const global = data.results.burst_global ?? 0;
                                                                        const isBurst = data.results.is_burst;

                                                                        const summary = `This host (${source}) has triggered ${hits} hits of this rule in the last 15 minutes, which ${isBurst ? 'indicates a significant activity burst' : 'is currently within normal volume limits'} compared to the ${global} total network-wide triggers.`;
                                                                        
                                                                        handleNestedTrigger(e, 'Burst Activity Summary', [summary]);
                                                                    }}
                                                                    onMouseLeave={handleNestedLeave}
                                                                >
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <span className={cn("text-[8px] uppercase tracking-widest font-black", data.results.is_burst ? "text-rose-400" : "text-slate-500")}>Burst check (15min)</span>
                                                                    </div>
                                                                    <div className="flex items-baseline gap-1.5">
                                                                        <span className={cn("font-mono font-black text-[13px] leading-none", data.results.is_burst ? "text-rose-300" : "text-white")}>{data.results.burst_global ?? 0}</span>
                                                                        <span className={cn("text-[7px] uppercase font-bold tracking-tighter", data.results.is_burst ? "text-rose-300/60" : "text-slate-600")}>Recent Hits</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Card 2 - Source History */}
                                                            <div className={cn(
                                                                "relative rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-500",
                                                                data.results.is_suspicious_cooc
                                                                    ? "bg-amber-500/[0.03] border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.1),inset_0_0_20px_rgba(245,158,11,0.05)]"
                                                                    : "bg-slate-900/40 border-white/5 shadow-xl backdrop-blur-md"
                                                            )}>
                                                                <div className="flex justify-between items-start">
                                                                    <div className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.2em] font-mono">Source History</div>
                                                                </div>
                                                                <div className="flex items-baseline gap-2 mt-0.5">
                                                                    <span className={cn("font-mono text-[24px] font-black leading-none tracking-tighter", data.results.is_suspicious_cooc ? "text-amber-400" : "text-white")}>
                                                                        {data.results.rule_on_host ?? 0}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Hits</span>
                                                                </div>
                                                                <div className="text-slate-400/80 text-[8px] leading-tight pr-1">
                                                                    Historical triggers of this rule on this specific host (30d).
                                                                </div>

                                                                <div 
                                                                    className={cn(
                                                                        "mt-1 py-1.5 px-2 rounded-lg border flex flex-col gap-1 cursor-help transition-colors",
                                                                        data.results.is_suspicious_cooc ? "bg-amber-500/10 border-amber-500/30" : "bg-white/[0.03] border-white/5 hover:bg-white/[0.05]"
                                                                    )}
                                                                    onMouseEnter={(e) => {
                                                                        if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                        const source = data.results.source || 'Current Agent';
                                                                        const rules = data.results.cooc_distinct ?? 0;
                                                                        const isSusp = data.results.is_suspicious_cooc;

                                                                        const summary = `This host (${source}) has triggered ${rules} different security rules within the last 1 hour, which ${isSusp ? 'could be a strong indicator of a multi-stage attack' : 'currently shows no suspicious rule correlation'}.`;
                                                                        
                                                                        handleNestedTrigger(e, 'Multi-Rule Correlation Summary', [summary]);
                                                                    }}
                                                                    onMouseLeave={handleNestedLeave}
                                                                >
                                                                    <span className={cn("text-[8px] uppercase tracking-widest font-black", data.results.is_suspicious_cooc ? "text-amber-400" : "text-slate-500")}>Co-Occurrence</span>
                                                                    <div className="flex items-baseline gap-1.5">
                                                                        <span className={cn("font-mono font-black text-[13px] leading-none", data.results.is_suspicious_cooc ? "text-amber-300" : "text-white")}>{data.results.cooc_distinct ?? 0}</span>
                                                                        <span className={cn("text-[7px] uppercase font-bold tracking-tighter", data.results.is_suspicious_cooc ? "text-amber-300/60" : "text-slate-600")}>Distinct Rules</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Unusual Timing Strip */}
                                                        <div className={cn(
                                                            "relative rounded-xl border px-4 py-2.5 flex items-center gap-4 cursor-help group transition-all duration-500 overflow-hidden",
                                                            data.results.is_unusual_timing ? "bg-purple-500/[0.04] border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]" : "bg-slate-900/40 border-white/5 shadow-xl backdrop-blur-md"
                                                        )}>
                                                            <div className={cn("absolute left-0 top-0 bottom-0 w-1", data.results.is_unusual_timing ? "bg-purple-500/80" : "bg-cyan-500/20")} />
                                                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={cn("text-[9px] uppercase tracking-[0.2em] font-black font-mono", data.results.is_unusual_timing ? "text-purple-400" : "text-cyan-500/60")}>Timing Analysis</span>
                                                                    {data.results.is_unusual_timing && <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse" />}
                                                                </div>
                                                                <div className="flex items-center gap-5">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[7px] text-slate-600 uppercase font-bold tracking-widest mb-0.5">Timestamp</span>
                                                                        <span className={cn("font-mono font-black text-[15px] leading-none", data.results.is_unusual_timing ? "text-purple-300" : "text-white")}>
                                                                            {data.results.alert_time_utc
                                                                                ? new Date(data.results.alert_time_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                                                                                : data.results.current_hour !== undefined
                                                                                    ? `${String(data.results.current_hour).padStart(2, '0')}:00`
                                                                                    : '00:00'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-[1px] h-5 bg-white/5" />
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-[7px] text-slate-600 uppercase font-bold tracking-widest mb-0.5">Density</span>
                                                                        <div className="flex items-baseline gap-1">
                                                                            <span className={cn("font-mono font-black text-[15px] leading-none", data.results.is_unusual_timing ? "text-purple-200" : "text-emerald-400")}>{data.results.hour_pct ?? 0}%</span>
                                                                            <span className="text-[7px] text-slate-500 font-bold uppercase tracking-tighter">Avg</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div 
                                                                className={cn(
                                                                    "shrink-0 text-[7px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border transition-colors cursor-help",
                                                                    data.results.is_unusual_timing ? "bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30" : "bg-emerald-500/10 text-emerald-500/60 border-emerald-500/20 hover:bg-emerald-500/20"
                                                                )}
                                                                onMouseEnter={(e) => {
                                                                    if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                                                    const hour = data.results.alert_time_utc ? new Date(data.results.alert_time_utc).getHours() : (data.results.current_hour ?? 0);
                                                                    const nextHour = (hour + 1) % 24;
                                                                    const range = `${String(hour).padStart(2, '0')}:00 and ${String(nextHour).padStart(2, '0')}:00`;
                                                                    const total = data.results.rule_count ?? 0;
                                                                    const pct = data.results.hour_pct ?? 0;
                                                                    const isAnom = data.results.is_unusual_timing;
                                                                    const timeStr = data.results.alert_time_utc ? new Date(data.results.alert_time_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : `${String(hour).padStart(2, '0')}:00:00`;
                                                                    const summary = total >= 10 
                                                                        ? `Out of all these ${total} alerts spanning a 30-day window, ${pct}% of them are usually triggered between ${range}, which is why this is ${isAnom ? 'an anomaly' : 'an expected behavior'} since it ${isAnom ? 'deviates significantly from' : 'matches'} established historical patterns.`
                                                                        : `This alert was triggered at ${timeStr}. Insufficient 30-day history available for baseline timing comparison.`;
                                                                    
                                                                    handleNestedTrigger(e, 'Forensic Timing Summary', [summary]);
                                                                }}
                                                                onMouseLeave={handleNestedLeave}
                                                            >
                                                                {data.results.is_unusual_timing ? "ANOMALY" : "NORMAL"}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* IOC CROSS-ALERT FINGERPRINT — only shown when correlation exists */}
                                                    {(() => {
                                                        const fps: any[] = data.results.ioc_fingerprint || [];
                                                        const recurring = fps.filter((f: any) => f.is_recurring);
                                                        if (recurring.length === 0) return null;
                                                        return (
                                                            <div className="flex flex-col gap-1.5">
                                                                <div className="text-rose-400/80 uppercase font-bold text-[8px] tracking-wider">
                                                                    Alert Correlated by the following IoCs :
                                                                </div>
                                                                <div className="flex flex-col gap-1.5">
                                                                    {recurring.map((fp: any, i: number) => {
                                                                        const verdictCounts: Record<string, number> = {};
                                                                        fp.verdict_history.forEach((v: string) => { verdictCounts[v] = (verdictCounts[v] || 0) + 1; });
                                                                        const uniqueVerdicts = Object.keys(verdictCounts);
                                                                        const hostCount = fp.affected_hosts.length;
                                                                        const firstSeen = new Date(fp.first_seen).toLocaleString();
                                                                        const lastSeen = new Date(fp.last_seen).toLocaleString();
                                                                        const first = fp.verdict_history[0];
                                                                        const last = fp.verdict_history[fp.verdict_history.length - 1];
                                                                        const severityOrder = ['unknown', 'safe', 'info', 'suspicious', 'malicious'];
                                                                        const isEscalating = severityOrder.indexOf(last) > severityOrder.indexOf(first);
                                                                        const isConsistent = uniqueVerdicts.length === 1;

                                                                        let verdictSentence: string;
                                                                        if (isConsistent) {
                                                                            verdictSentence = `Every recorded sighting was flagged as ${last} — no verdict variation across alerts.`;
                                                                        } else if (isEscalating) {
                                                                            verdictSentence = `Threat level is escalating: started as ${first} and progressed to ${last} over ${fp.sighting_count} sightings — ${Object.entries(verdictCounts).map(([v, c]) => `${v} (${c}×)`).join(', ')}.`;
                                                                        } else {
                                                                            verdictSentence = `Verdicts are inconsistent across sightings: ${Object.entries(verdictCounts).map(([v, c]) => `${v} (${c}×)`).join(', ')}. Most recent classification: ${last}.`;
                                                                        }

                                                                        const iocNoun = fp.type?.toLowerCase() === 'ip' ? 'IP' : fp.type?.toLowerCase() === 'domain' ? 'domain' : fp.type?.toLowerCase() === 'hash' ? 'hash' : fp.type?.toLowerCase() === 'url' ? 'URL' : 'IOC';
                                                                        const paragraph = `This ${iocNoun} has been observed ${fp.sighting_count} time${fp.sighting_count !== 1 ? 's' : ''} across ${hostCount} host${hostCount !== 1 ? 's' : ''} — ${fp.affected_hosts.slice(0, 3).join(', ')}${hostCount > 3 ? ` and ${hostCount - 3} more` : ''}. ${verdictSentence} First observed: ${firstSeen}. Most recent: ${lastSeen}.`;
                                                                        return (
                                                                            <div key={i} className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-3 py-2.5 flex flex-col gap-2">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <span className="font-mono text-[10px] font-bold text-rose-300 truncate">{fp.ioc}</span>
                                                                                    <span className="shrink-0 text-[8px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">{fp.type}</span>
                                                                                </div>
                                                                                <p className="text-[10px] text-slate-300 leading-relaxed">{paragraph}</p>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* STATUS */}
                                                    <div className="flex items-center justify-between border-t border-cyan-500/10 pt-2 mt-1">
                                                        <span className="text-cyan-600/80 uppercase font-bold text-[9px] tracking-wider">STATUS</span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold font-mono px-2 py-0.5 rounded border capitalize",
                                                            (data.results.status || 'Pending') === 'Complete' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                                (data.results.status || 'Pending')?.toLowerCase().includes('failed') ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                                                    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse"
                                                        )}>
                                                            {data.results.status || 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : data.label === 'Verdict Judge' ? (
                                                /* Agent 3 - Verdict Judge */
                                                <div className="flex flex-col gap-3 py-1">
                                                    <div className="grid grid-cols-2 gap-3 border-b border-cyan-500/10 pb-2">
                                                        <div>
                                                            <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">VERDICT</div>
                                                            <div className={cn("text-xs font-bold font-mono tracking-tight", data.results.verdict === 'Malicious' ? "text-rose-500" : data.results.verdict === 'Suspicious' ? "text-amber-400" : ['Already Blocked', 'Blocked'].includes(data.results.verdict) ? "text-sky-400" : "text-emerald-500")}>{data.results.verdict === 'Blocked' ? 'Already Blocked' : (data.results.verdict || 'Evaluating...')}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-0.5 tracking-wider">SEVERITY</div>
                                                            <div className={cn("text-xs font-bold font-mono", ['High', 'Critical'].includes(data.results.severity) ? "text-rose-500" : "text-emerald-500")}>{data.results.severity || 'TBD'}</div>
                                                        </div>
                                                    </div>

                                                    {/* MITRE ATT&CK */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <div>
                                                            <div className="text-cyan-600/80 uppercase font-bold text-[8px] mb-1 tracking-wider">MITRE TACTICS</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(data.results.mitre_tactics as string[] || []).map((t, i) => (
                                                                    <span key={i} className="text-[8px] font-bold bg-cyan-950/40 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded uppercase">{t}</span>
                                                                ))}
                                                                {(!data.results.mitre_tactics?.length) && <span className="text-slate-600 italic text-[9px]">None Identified</span>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-cyan-600/80 uppercase font-bold text-[8px] mb-1 tracking-wider">MITRE TECHNIQUES</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(data.results.mitre_techniques as string[] || []).map((t, i) => (
                                                                    <span key={i} className="text-[8px] font-bold bg-slate-900/40 text-slate-300 border border-white/10 px-1.5 py-0.5 rounded">{t}</span>
                                                                ))}
                                                                {(!data.results.mitre_techniques?.length) && <span className="text-slate-600 italic text-[9px]">None Identified</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-1 tracking-wider">ANALYSIS_REASONING</div>
                                                        <div className="font-mono text-cyan-50 text-[10px] leading-relaxed border-l-2 border-cyan-500/30 pl-3 whitespace-pre-wrap">{data.results.analysis_reasoning || "Analyzing..."}</div>
                                                    </div>

                                                    <div>
                                                        <div className="text-cyan-600/80 uppercase font-bold text-[9px] mb-1 tracking-wider text-emerald-500/80">MITIGATION_STEPS</div>
                                                        <div className="flex flex-col gap-1 pl-2">
                                                            {(data.results.mitigation_steps as string[] || []).map((step, i) => (
                                                                <div key={i} className="flex gap-2 text-[10px] text-emerald-100/90 leading-snug">
                                                                    <span className="text-emerald-500 font-bold shrink-0">→</span>
                                                                    <span>{step}</span>
                                                                </div>
                                                            ))}
                                                            {(!data.results.mitigation_steps?.length) && <span className="text-slate-600 italic text-[9px]">Generating plan...</span>}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between border-t border-cyan-500/10 pt-2 mt-1">
                                                        <span className="text-cyan-600/80 uppercase font-bold text-[9px] tracking-wider">STATUS</span>
                                                        <span className={cn("text-[10px] font-bold font-mono px-2 py-0.5 rounded border capitalize", (data.results.status || 'Pending') === 'Complete' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20")}>{data.results.status || 'Pending'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Generic */
                                                <div className="flex flex-col gap-2">
                                                    {Object.entries(data.results).map(([key, value]: [string, any]) => (
                                                        <div key={key} className="flex flex-col gap-1">
                                                            <span className="text-cyan-600 uppercase font-bold text-[9px]">{key}</span>
                                                            <div className="pl-2 border-l border-cyan-500/20 text-[10px]">{String(value)}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-4 text-cyan-500/40 gap-2">
                                                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                                                <span>AWAITING STREAM...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

                {/* Nested Tooltip Portal */}
                {createPortal(
                    <AnimatePresence>
                        {nestedTooltip && (
                            <motion.div
                                key="nested-tooltip"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                style={{ position: 'fixed', left: nestedTooltip.x, top: nestedTooltip.y, zIndex: 100001 }}
                                className="pointer-events-auto"
                                onMouseEnter={() => {
                                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                    if (nestedTimeoutRef.current) clearTimeout(nestedTimeoutRef.current);
                                    setShowTooltip(true);
                                }}
                                onMouseLeave={() => {
                                    timeoutRef.current = setTimeout(() => { setNestedTooltip(null); }, 100);
                                }}
                            >
                                <div className="w-80 bg-slate-900/98 border border-cyan-500/60 p-3 rounded shadow-[0_0_40px_rgba(0,0,0,0.9)] backdrop-blur-xl flex flex-col max-h-[min(500px,60vh)]">
                                    <div className="text-[10px] uppercase text-cyan-400 mb-2 font-bold tracking-widest border-b border-cyan-500/30 pb-1.5 shrink-0">
                                        {nestedTooltip.label}
                                    </div>
                                    <div className="flex-1 overflow-y-auto cyber-scrollbar pr-1.5">
                                        {nestedTooltip.items.map((item: any, i: number) => (
                                            <div key={i} className="text-[10px] text-cyan-100 mb-1 last:mb-0 border-l-2 border-cyan-500/30 pl-2 py-0.5">
                                                {typeof item === 'object' && item.label ? (
                                                    <>
                                                        <span className="text-purple-400 font-bold uppercase tracking-tighter mr-1">{item.label}:</span>
                                                        <span className="text-white opacity-90 break-words">{String(item.value)}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-white opacity-90 break-words">{String(item)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </div>
        </>
    );
};

const nodeTypes = { cyberNode: CyberNode };

interface GraphVisualizerProps {
    selectedAlertId?: string;
}

interface CyberNodeData extends Record<string, unknown> {
    label: string;
    role: string;
    isActive: boolean;
    verdict?: string;
    results?: Record<string, any> | null;
}

type ScanPhase = 'idle' | 'extracting' | 'investigating' | 'sprawling' | 'judging' | 'complete' | 'rehydrate';

type GraphState = {
    nodes: Node<CyberNodeData>[];
    edges: Edge[];
    scanPhase: ScanPhase;
    ctiNodes: Set<string>;
};

export const GraphVisualizer = ({ selectedAlertId }: GraphVisualizerProps) => {
    const { socket, alerts, events, saveGraphState } = useSocket();

    const currentEvent = events[selectedAlertId || ''];
    const selectedAlert = alerts.find(a => a.id === selectedAlertId);

    const thehiveId = (currentEvent as any)?.thehive_id || (selectedAlert as any)?.thehive_id;
    const flowintelId = (currentEvent as any)?.flowintel_id || (selectedAlert as any)?.flowintel_id;
    // Generic case reference first (any SOAR), then the legacy TheHive/Flowintel ids
    const caseId = (currentEvent as any)?.case_id || (selectedAlert as any)?.case_id;
    const caseSystem: string | null = (currentEvent as any)?.case_system || (selectedAlert as any)?.case_system
        || (thehiveId ? 'thehive' : flowintelId ? 'flowintel' : null);
    const soarId = caseId || thehiveId || flowintelId;
    const caseSoar = soarInfo(caseSystem);
    const rawCaseUrl: string | null = (currentEvent as any)?.case_url || (selectedAlert as any)?.case_url || null;
    const caseUrl: string | null = rawCaseUrl
        ? rawCaseUrl.replace(/host\.docker\.internal/g, window.location.hostname)
        : null;

    // --- 1. STATE MANAGEMENT ---
    const [viewMode, setViewMode] = useState<'details' | 'graph'>('details');
    const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
    const [ctiNodes, setCtiNodes] = useState<Set<string>>(new Set());
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    const [showCtiOverlay, setShowCtiOverlay] = useState(false);
    const [selectedCtiIoc, setSelectedCtiIoc] = useState<string | null>(null);
    const [ctiTooltip, setCtiTooltip] = useState<{ ioc: string, x: number, y: number } | null>(null);

    // Node & Edge State
    const [nodes, setNodes, onNodesChange] = useNodesState<Node<CyberNodeData>>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const displayEdges = useMemo(() => edges.map((edge) => {
        const stroke = String(edge.style?.stroke || '').replace(/\s/g, '').toLowerCase();
        return OLD_ACCENT_STROKES.has(stroke) ? { ...edge, style: { ...edge.style, stroke: ACCENT_STROKE } } : edge;
    }), [edges]);

    const stateRef = useRef<GraphState>({ nodes, edges, scanPhase, ctiNodes });
    const prevAlertIdRef = useRef<string | undefined>(undefined);
    const lastHydratedEventRef = useRef<string | undefined>(undefined);
    // Model names to show when a pipeline event does not carry one (from the shared settings)
    const { settings } = useSettings();
    const isLocalLlm = settings.ai_architecture === 'LOCAL';
    const llmConfig = {
        agent1Model: isLocalLlm ? settings.local_agent1_model : settings.agent1_model,
        agent3Model: isLocalLlm ? settings.local_agent3_model : settings.agent3_model,
    };

    // Update stateRef whenever visual state changes
    useEffect(() => {
        stateRef.current = { nodes, edges, scanPhase, ctiNodes };
    }, [nodes, edges, scanPhase, ctiNodes]);

    // --- 2. HELPER FUNCTIONS ---
    const getCtiUrl = (toolName: string, ioc: string) => {
        const tool = toolName.toLowerCase();
        let queryIoc = ioc;
        if (queryIoc.startsWith('http')) {
            try { queryIoc = new URL(queryIoc).hostname; } catch { /* invalid URL, use as-is */ }
        }
        const enc = encodeURIComponent(queryIoc);
        if (tool.includes('virustotal'))   return `https://www.virustotal.com/gui/search/${enc}`;
        if (tool.includes('hybrid'))       return `https://www.hybrid-analysis.com/search?query=${enc}`;
        if (tool.includes('threatfox'))    return `https://threatfox.abuse.ch/browse.php?search=ioc%3A${enc}`;
        if (tool.includes('urlscan'))      return `https://urlscan.io/search/#${enc}`;
        if (tool.includes('abuseipdb'))    return `https://www.abuseipdb.com/check/${enc}`;
        if (tool.includes('urlhaus'))      return `https://urlhaus.abuse.ch/host/${enc}/`;
        if (tool.includes('malwarebazaar'))return `https://bazaar.abuse.ch/sample/${enc}/`;
        if (tool.includes('greynoise'))    return `https://viz.greynoise.io/ip/${enc}`;
        if (tool.includes('shodan'))       return `https://www.shodan.io/host/${enc}`;
        if (tool.includes('alienvault') || tool.includes('otx')) return `https://otx.alienvault.com/indicator/ip/${enc}`;
        if (tool.includes('mxtoolbox'))    return `https://mxtoolbox.com/SuperTool.aspx?action=dns%3a${enc}`;
        if (tool.includes('nvd') || tool.includes('nist')) return `https://nvd.nist.gov/vuln/detail/${enc}`;
        if (tool.includes('emailrep'))     return `https://emailrep.io/${enc}`;
        return '#';
    };



    const getCtiData = () => {
        const invNode = nodes.find(n => n.id === 'agent_investigator');
        return invNode?.data.results?.external_intel?.filter((i: any) => !i.is_local && i.tool !== 'Local Analysis') || [];
    };

    const CACHE_KEY_GRAPH = `${BRAND.storagePrefix}graph_cache_v1`;

    const loadGraphCache = useCallback((): Record<string, GraphState> => {
        try {
            const cached = localStorage.getItem(CACHE_KEY_GRAPH);
            if (!cached) return {};
            const parsed = JSON.parse(cached);
            Object.values(parsed).forEach((state: any) => {
                state.ctiNodes = state.ctiNodes && Array.isArray(state.ctiNodes) ? new Set(state.ctiNodes) : new Set();
            });
            return parsed;
        } catch (e) {
            console.warn('[Graph Cache] Load failed', e);
            return {};
        }
    }, [CACHE_KEY_GRAPH]);

    const graphCache = useRef<Record<string, GraphState>>(loadGraphCache());

    const saveGraphCache = useCallback(() => {
        try {
            const toSave: Record<string, any> = {};
            Object.entries(graphCache.current).forEach(([id, state]) => {
                toSave[id] = { ...state, ctiNodes: Array.from(state.ctiNodes) };
            });
            localStorage.setItem(CACHE_KEY_GRAPH, JSON.stringify(toSave));

            if (selectedAlertId && graphCache.current[selectedAlertId]) {
                const state = graphCache.current[selectedAlertId];
                saveGraphState(selectedAlertId, state.nodes, state.edges);
            }
        } catch (e) {
            console.error('[Graph Cache] Save failed', e);
        }
    }, [selectedAlertId, saveGraphState]);

    // NEW: Synchronize cache clearing with ActionConsole
    useEffect(() => {
        const handleClearCache = (e: any) => {
            const { alert_id } = e.detail;
            if (alert_id) {
                console.log(`🧹 [GraphVisualizer] Clearing cache for ${alert_id}`);
                delete graphCache.current[alert_id];
                saveGraphCache();
            }
        };
        window.addEventListener('clear-graph-cache', handleClearCache);
        return () => window.removeEventListener('clear-graph-cache', handleClearCache);
    }, [saveGraphCache]);

    const applyUpdate = (state: GraphState, event: SocketEvent | any, alertData?: Alert | null | undefined): GraphState => {
        if (!event || !state) return state;
        const node = event.node;
        const log = event.log || "";
        const data = event.data;
        
        // CRITICAL: Ensure nodes exists
        if (!state.nodes || !Array.isArray(state.nodes)) {
            state = { ...state, nodes: [] };
        }
        
        // CRITICAL: Clone arrays into NEW references so React detects mutations
        let n = state.nodes.map(item => ({ ...item, data: { ...item.data } }));
        let e = [...state.edges];
        let s = state.scanPhase;
        const c = new Set(state.ctiNodes);

        if (!event.log && !event.pipeline_status) return state;
        if (node === 'reset') return { nodes: [], edges: [], scanPhase: 'idle', ctiNodes: new Set() };

        // Agent 1 logic
        if (node === 'agent_screener') {
            s = 'extracting';
            if (log.toLowerCase().includes('starting extraction') ||
                log.toLowerCase().includes('in progress') ||
                log.toLowerCase().includes('triggered') ||
                log.toLowerCase().includes('cognitive pipeline')) {
                return { nodes: [{ id: 'agent_screener', type: 'cyberNode', position: { x: 100, y: 150 }, data: { label: 'IOC Extractor', role: 'Agent 1', isActive: true, results: { status: "Pending", summary: "Analyzing telemetry...", model: data?.model || event.model || llmConfig?.agent1Model } } }], edges: [], scanPhase: 'extracting', ctiNodes: new Set() };
            }
            let res = null;
            if (log.includes('[IOC Extractor] Extracted') || data) {
                if (data) {
                    const parts: string[] = [];
                    const details: any = {};
                    const metadataFilter = ['Alert ID', 'Rule ID', 'Severity Level', 'Timestamp', 'Status', 'Pipeline', 'Wazuh', 'Agent ID'];
                    
                    const process = (f: any, l: string) => { 
                        if (f && Array.isArray(f) && f.length > 0) { 
                            const filtered = f.filter(item => {
                                if (typeof item === 'object' && item !== null) {
                                    const lbl = (item.label || item.type || '').toLowerCase();
                                    return !metadataFilter.some(m => lbl.includes(m.toLowerCase()));
                                }
                                return true;
                            });
                            if (filtered.length > 0) {
                                parts.push(`${filtered.length} ${l}`); 
                                details[l] = filtered; 
                            }
                        } 
                    };
                    process(data.identities, 'Users'); process(data.system, 'Systems'); process(data.files, 'Files'); process(data.network, 'Network');
                    res = { breakdown: parts.join(' / '), details, source: data.log_source || alertData?.agent, status: data.status || "Complete", summary: data.summary, model: data.model };
                }
            } else if (log.toLowerCase().includes('no technical iocs')) {
                res = { breakdown: "Zero indicators", status: "Complete", summary: data?.summary || "Behavioral assessment.", model: data?.model };
            }
            const idx = n.findIndex((item: any) => item.id === 'agent_screener');
            if (idx === -1) n.push({ id: 'agent_screener', type: 'cyberNode', position: { x: 100, y: 150 }, data: { label: 'IOC Extractor', role: 'Agent 1', isActive: true, results: res || { status: "Pending", model: data?.model || event.model || llmConfig?.agent1Model } } });
            else n[idx] = { ...n[idx], data: { ...n[idx].data, results: { ...n[idx].data.results, ...res, model: res?.model || n[idx].data.results?.model || data?.model || event.model || llmConfig?.agent1Model } } };
        }

        // Agent 2 logic
        if (node === 'agent_investigator') {
            s = 'investigating';
            // Mark Agent 1 as Complete when Agent 2 starts (mirrors the pattern Agent 3 uses for Agent 2)
            n = n.map((item: any) => item.id === 'agent_screener' && item.data.results?.status !== 'Complete' ? { ...item, data: { ...item.data, results: { ...item.data.results, status: "Complete" } } } : item);
            let res = null;
            if (data && (log.includes('Investigation complete') || !event.log)) {
                // Read directly from the new flat payload (no more internal_context nesting)
                const ruleCount    = data.rule_count    ?? data.frequency ?? 0;
                const ruleOnHost   = data.rule_on_host  ?? 0;
                const burstGlobal  = data.burst_global  ?? 0;
                const burstSource  = data.burst_source  ?? 0;
                const isBurst      = data.is_burst      ?? false;
                const coocDistinct = data.cooc_distinct ?? 0;
                const isSuspiciousCooc = data.is_suspicious_cooc ?? false;
                const currentHour  = data.current_hour  ?? 0;
                const alertTimeUtc = data.alert_time_utc ?? null;
                const hourPct      = data.hour_pct      ?? 0;
                const isUnusualTiming = data.is_unusual_timing ?? false;
                const source       = data.source        ?? null;
                const intel = Array.isArray(data.external_intel) ? data.external_intel : [];
                const externalIntel = intel.filter((i: any) => !i.is_local);
                const tags = new Set<string>();
                externalIntel.forEach((i: any) => { if (i.verdict === 'malicious' || i.risk_score > 50) (i.category_tags || []).forEach((t: string) => tags.add(t)); });
                const iocFingerprint = Array.isArray(data.ioc_fingerprint) ? data.ioc_fingerprint : [];
                res = { sources_queried: Array.from(new Set(externalIntel.map((i: any) => i.tool))).filter(Boolean), external_intel: externalIntel, critical_tags: Array.from(tags), status: "Complete", verdict: externalIntel.some((i: any) => i.verdict === 'malicious') ? "Malicious" : "Clean", source, rule_count: ruleCount, rule_on_host: ruleOnHost, burst_global: burstGlobal, burst_source: burstSource, is_burst: isBurst, cooc_distinct: coocDistinct, is_suspicious_cooc: isSuspiciousCooc, current_hour: currentHour, alert_time_utc: alertTimeUtc, hour_pct: hourPct, is_unusual_timing: isUnusualTiming, ioc_fingerprint: iocFingerprint };
            }
            const idx = n.findIndex((item: any) => item.id === 'agent_investigator');
            if (idx === -1) n.push({ id: 'agent_investigator', type: 'cyberNode', position: { x: 400, y: 150 }, data: { label: 'Investigator', role: 'Agent 2', isActive: true, results: res || { status: "Working..." } } });
            else n[idx] = { ...n[idx], data: { ...n[idx].data, results: { ...n[idx].data.results, ...res } } };
            if (!e.some((item: any) => item.id === 'e1-2')) e.push({ id: 'e1-2', source: 'agent_screener', sourceHandle: 'right', target: 'agent_investigator', targetHandle: 'left', animated: true, style: { stroke: '#06b6d4' } });

            const tools = log.match(/(AbuseIPDB|VirusTotal|URLScan|GreyNoise|Shodan|OTX|ThreatFox|MxToolbox|Hybrid Analysis)/gi);
            if (tools) tools.forEach((tool: string) => {
                const tid = `cti_${tool.toLowerCase().replace(/\s/g, '_')}`;
                if (!c.has(tid)) {
                    c.add(tid);
                    const angle = ((c.size - 1) / 6) * 2 * Math.PI;
                    n.push({ id: tid, type: 'cyberNode', position: { x: 400 + 220 * Math.cos(angle - Math.PI / 2), y: 150 + 220 * Math.sin(angle - Math.PI / 2) }, data: { label: tool, role: 'CTI Source', isActive: true, results: { status: "Querying..." } } });
                    e.push({ id: `e_inv_${tid}`, source: 'agent_investigator', sourceHandle: 'right', target: tid, targetHandle: 'left', animated: true });
                }
            });
        }

        if (node === 'agent_judge') {
            s = 'judging';
            // Deactivate others
            n = n.map(item => ({ ...item, data: { ...item.data, isActive: false } }));
            
            // Ensure predecessors exist
            if (!n.some(item => item.id === 'agent_screener')) {
                n.push({ id: 'agent_screener', type: 'cyberNode', position: { x: 100, y: 150 }, data: { label: 'IOC Extractor', role: 'Agent 1', isActive: false, results: { status: "Complete" } } });
            }
            if (!n.some(item => item.id === 'agent_investigator')) {
                n.push({ id: 'agent_investigator', type: 'cyberNode', position: { x: 400, y: 150 }, data: { label: 'Investigator', role: 'Agent 2', isActive: false, results: { status: "Complete" } } });
                if (!e.some((item: any) => item.id === 'e1-2')) e.push({ id: 'e1-2', source: 'agent_screener', sourceHandle: 'right', target: 'agent_investigator', targetHandle: 'left', animated: true });
            }

            const activeVerdict = data?.verdict || event?.verdict || alertData?.verdict;
            const isCompleteFromUpdate = data?.status === 'Complete' || log.includes('Case Closed') || !!activeVerdict;
            const hasVerdictData = !!(activeVerdict || isCompleteFromUpdate);
            
            // Build result ensuring we don't use stale global state
            const resData = hasVerdictData 
                ? { ...data, status: "Complete", verdict: activeVerdict } 
                : null;
            
            // Mark predecessors as Complete
            n = n.map((item: any) => (item.id === 'agent_investigator' || item.id === 'agent_screener') && item.data.results?.status !== 'Complete' ? { ...item, data: { ...item.data, results: { ...item.data.results, status: "Complete" } } } : item);
            
            const idx = n.findIndex((item: any) => item.id === 'agent_judge');
            if (idx === -1) n.push({ id: 'agent_judge', type: 'cyberNode', position: { x: 750, y: 150 }, data: { label: 'Verdict Judge', role: 'Agent 3', isActive: true, results: resData || { status: "Judging...", model: data?.model || event.model || llmConfig?.agent3Model } } });
            else n[idx] = { ...n[idx], data: { ...n[idx].data, isActive: true, results: { ...n[idx].data.results, ...resData, model: resData?.model || n[idx].data.results?.model || data?.model || event.model || llmConfig?.agent3Model } } };
            
            if (!e.some((item: any) => item.id === 'e1-3')) (e as any).push({ id: 'e1-3', source: 'agent_screener', sourceHandle: 'top-source', target: 'agent_judge', targetHandle: 'top-target', animated: true });
            if (!e.some((item: any) => item.id === 'e2-3')) e.push({ id: 'e2-3', source: 'agent_investigator', sourceHandle: 'right', target: 'agent_judge', targetHandle: 'left', animated: true });
        }

        if (node === 'error' || event.pipeline_status === 'failed') {
            s = 'idle';
            n = n.map((item: any) => (item.data.results?.status === 'Complete') ? item : { ...item, data: { ...item.data, results: { ...item.data.results, status: "Failed", error: log || 'Pipeline failed' } } });
        }

        // Global Completion Handler
        if (event.pipeline_status === 'completed' || event.pipeline_status === 'failed') {
            const isComp = event.pipeline_status === 'completed';
            s = isComp ? 'complete' : 'idle';
            console.log(`🏁 [GraphVisualizer] Scan finalized via pipeline_status: ${event.pipeline_status}`);
            
            // Force all nodes to complete/final state and deactivate them
            n = n.map((item: any) => {
                const currentStatus = item.data.results?.status || item.data.results?.Status;
                const newStatus = isComp ? "Complete" : (currentStatus === 'Complete' ? "Complete" : "Failed");
                return { 
                    ...item, 
                    data: { 
                        ...item.data, 
                        isActive: false,
                        results: { ...item.data.results, status: newStatus } 
                    } 
                };
            });
            
            // Keep animations active as requested by user
            e = e.map((edge: any) => ({ ...edge, animated: true }));
        }

        return { nodes: n, edges: e, scanPhase: s, ctiNodes: c };
    };

    const rehydrateFromEvent = (event: SocketEvent, alertData?: Alert | null | undefined) => {
        // PRIORITIZE EXPLICIT GRAPH STATE
        if (event?.graph_state?.nodes && Array.isArray(event.graph_state.nodes)) {
            console.log(`📡 [GraphVisualizer] Restoring full graph state from backend for ${event.alert_id}`);
            const isRunning = event.pipeline_status === 'running' || event.pipeline_status === 'extracting' || event.pipeline_status === 'investigating' || event.pipeline_status === 'judging';
            
            setNodes(event.graph_state.nodes.map((node: any) => ({
                ...node,
                data: {
                    ...node.data,
                    isActive: node.data.isActive && isRunning 
                }
            })));
            
            if (event.graph_state.edges && Array.isArray(event.graph_state.edges)) {
                setEdges(event.graph_state.edges.map((edge: any) => ({
                    ...edge,
                    animated: true 
                })));
            }
            
            // Derive more accurate scan phase from current_node if available
            let derivedPhase: ScanPhase = event.pipeline_status === 'running' ? 'investigating' : 'complete';
            if (event.pipeline_status === 'running') {
                if (event.current_node === 'agent_screener' || event.current_node === 'listener') derivedPhase = 'extracting';
                else if (event.current_node === 'agent_investigator') derivedPhase = 'investigating';
                else if (event.current_node === 'agent_judge') derivedPhase = 'judging';
            }
            
            setScanPhase(derivedPhase);
            return true;
        }

        // FALLBACK TO UPDATE SEQUENCE
        if (event?.updates && event.updates.length > 0) {
            console.log(`📡 [GraphVisualizer] Replaying update sequence for ${event.alert_id}`);
            let s: GraphState = { nodes: [], edges: [], scanPhase: 'idle', ctiNodes: new Set() };
            
            const isCurrentlyActive = ['running', 'extracting', 'investigating', 'judging'].includes(event.pipeline_status || '');
            
            event.updates.forEach((u: any) => { 
                // STALE DATA PROTECTION: If the scan is currently ACTIVE, ignore any "Complete" updates from a previous run
                if (isCurrentlyActive && u.node === 'agent_judge' && (u.data?.verdict || u.data?.status === 'Complete')) {
                    console.warn("⚠️ [GraphVisualizer] Ignoring stale Judge update during active scan rehydration");
                    return;
                }
                s = applyUpdate(s, u, alertData); 
            });
            
            if (s.nodes.length > 0) {
                setNodes(s.nodes); setEdges(s.edges); setScanPhase(s.scanPhase); setCtiNodes(s.ctiNodes);
                graphCache.current[event.alert_id] = s;
                saveGraphCache();
                return true;
            }
        }

        // LAST RESORT: RECONSTRUCT FROM NODE RESULTS IF UPDATES ARE MISSING
        if (event?.node_results && Object.keys(event.node_results).length > 0) {
            console.log(`📡 [GraphVisualizer] Reconstructing from node results for ${event.alert_id}`);
            let s: GraphState = { nodes: [], edges: [], scanPhase: 'idle', ctiNodes: new Set() };
            // Simulate events for each result
            Object.entries(event.node_results).forEach(([nodeId, data]) => {
                // IMPORTANT: Pass the full event status so applyUpdate can handle completion
                s = applyUpdate(s, { node: nodeId, data, pipeline_status: event.pipeline_status }, alertData);
            });
            
            if (s.nodes.length > 0) {
                // Force a final pass with the pipeline status to ensure all nodes are deactivated if completed
                s = applyUpdate(s, { node: 'finalizer', pipeline_status: event.pipeline_status }, alertData);
                
                setNodes(s.nodes); setEdges(s.edges); setScanPhase(event.pipeline_status === 'running' ? 'investigating' : 'complete');
                graphCache.current[event.alert_id] = s;
                saveGraphCache();
                return true;
            }
        }

        // FINAL FALLBACK: alert has a verdict but no stored graph data — synthesize a minimal complete graph
        const verdict = event.verdict || alertData?.verdict;
        if (verdict && event.pipeline_status !== 'running') {
            const synthNodes = [
                { id: 'agent_screener',     type: 'cyberNode', position: { x: 100, y: 150 }, data: { label: 'IOC Extractor', role: 'Agent 1', isActive: false, results: { status: 'Complete' } } },
                { id: 'agent_investigator', type: 'cyberNode', position: { x: 400, y: 150 }, data: { label: 'Investigator',  role: 'Agent 2', isActive: false, results: { status: 'Complete' } } },
                { id: 'agent_judge',        type: 'cyberNode', position: { x: 700, y: 150 }, data: { label: 'Verdict Judge', role: 'Agent 3', isActive: false, results: { status: 'Complete', verdict } } },
            ];
            const synthEdges = [
                { id: 'e1-2', source: 'agent_screener',     sourceHandle: 'right',      target: 'agent_investigator', targetHandle: 'left',       animated: true, style: { stroke: '#06b6d4' } },
                { id: 'e1-3', source: 'agent_screener',     sourceHandle: 'top-source', target: 'agent_judge',        targetHandle: 'top-target', animated: true },
                { id: 'e2-3', source: 'agent_investigator', sourceHandle: 'right',      target: 'agent_judge',        targetHandle: 'left',       animated: true },
            ];
            setNodes(synthNodes as any);
            setEdges(synthEdges as any);
            setScanPhase('complete');
            return true;
        }

        return false;
    };

    // --- NEW: ROBUST UPDATE QUEUE ---
    const updateQueue = useRef<any[]>([]);
    const isProcessingQueue = useRef(false);
    const processQueueRef = useRef<(() => void) | null>(null);

    const processQueue = useCallback(() => {
        if (isProcessingQueue.current || updateQueue.current.length === 0) return;
        isProcessingQueue.current = true;

        const event = updateQueue.current.shift();
        if (!event) {
            isProcessingQueue.current = false;
            return;
        }
        
        // Pacing: Use functional updates to avoid stale state issues
        setNodes(currNodes => {
            const prevState: GraphState = {
                nodes: currNodes || [],
                edges: stateRef.current.edges || [],
                scanPhase: stateRef.current.scanPhase || 'idle',
                ctiNodes: stateRef.current.ctiNodes || new Set()
            };

            const nextState = applyUpdate(prevState, event, selectedAlert);
            
            // Sync other states sequentially
            setEdges(nextState.edges);
            setScanPhase(nextState.scanPhase);
            setCtiNodes(nextState.ctiNodes);

            return nextState.nodes;
        });

        // Artificial delay for theatrical pacing
        setTimeout(() => {
            isProcessingQueue.current = false;
            processQueueRef.current?.();
        }, 350); // Slightly faster pacing for better feel
    }, [selectedAlert, setNodes, setEdges]);
    processQueueRef.current = processQueue;

    useEffect(() => {
        if (updateQueue.current.length > 0 && !isProcessingQueue.current) {
            processQueue();
        }
    }, [processQueue]);



    // --- 3. EFFECTS ---

    useEffect(() => {
        setShowCtiOverlay(false);
        setViewMode('details');
        setCtiTooltip(null);
    }, [selectedAlertId]);

    useEffect(() => {
        if (rfInstance && nodes.length > 0) rfInstance.fitView({ padding: 0.2, duration: 800 });
    }, [rfInstance, nodes.length, scanPhase]);

    // --- RE-INITIALIZATION: ALERT SWITCH ---
    // Runs ONLY when selectedAlertId changes. Instantly restores from local cache for zero-latency display.
    useEffect(() => {
        if (!selectedAlertId) {
            setNodes([]); setEdges([]); setScanPhase('idle');
            prevAlertIdRef.current = undefined;
            return;
        }

        if (prevAlertIdRef.current === selectedAlertId) return;

        console.log(`🔄 [GraphVisualizer] Alert switched: ${prevAlertIdRef.current} → ${selectedAlertId}`);
        updateQueue.current = [];
        prevAlertIdRef.current = selectedAlertId;
        lastHydratedEventRef.current = undefined; // Reset so backend rehydration can fire for new alert

        // 1. Instant restore from local cache (survives refreshes)
        const cached = graphCache.current[selectedAlertId];
        if (cached?.nodes?.length > 0) {
            console.log(`⚡ [GraphVisualizer] Instant restore from local cache for ${selectedAlertId}`);
            setNodes(cached.nodes);
            setEdges(cached.edges);
            setScanPhase(cached.scanPhase || 'complete');
            setCtiNodes(cached.ctiNodes || new Set());
            return;
        }

        // 2. No cache — start clean
        setNodes([]); setEdges([]); setScanPhase('idle');

        return () => { updateQueue.current = []; };
    }, [selectedAlertId, setNodes, setEdges]);

    // --- RE-INITIALIZATION: BACKEND DATA ARRIVAL ---
    // Watches for currentEvent changes. When the backend sends history (after refresh/reconnect),
    // this effect rehydrates the graph from the authoritative backend data.
    // lastHydratedEventRef is declared with other refs near line 565

    useEffect(() => {
        if (!selectedAlertId || !currentEvent) return;

        // Build a fingerprint to avoid re-processing the same event data repeatedly
        const eventFingerprint = `${currentEvent.alert_id}_${currentEvent.pipeline_status}_${currentEvent.current_node}_${(currentEvent.updates || []).length}_${Object.keys(currentEvent.node_results || {}).length}`;
        
        if (lastHydratedEventRef.current === eventFingerprint) return;

        // DB is the source of truth — always rehydrate from backend when data is available.
        // localStorage is only used as a fast initial preview (restored in the alert-switch effect above).
        const isActivePhase = ['running', 'extracting', 'investigating', 'judging'].includes(currentEvent.pipeline_status || '');

        // Only rehydrate if we have meaningful data from the backend
        const hasGraphState = currentEvent.graph_state && currentEvent.graph_state.nodes?.length > 0;
        const hasUpdates = currentEvent.updates && currentEvent.updates.length > 0;
        const hasNodeResults = currentEvent.node_results && Object.keys(currentEvent.node_results).length > 0;
        const hasVerdictOnly = !!(currentEvent.verdict || selectedAlert?.verdict) && currentEvent.pipeline_status !== 'running';

        if (hasGraphState || hasUpdates || hasNodeResults || hasVerdictOnly) {
            console.log(`📡 [GraphVisualizer] Backend data arrived for ${selectedAlertId}, rehydrating...`);
            const success = rehydrateFromEvent(currentEvent, selectedAlert);
            if (success) {
                lastHydratedEventRef.current = eventFingerprint;
            }
        } else if (isActivePhase && nodes.length === 0) {
            // Active scan but no data yet — show placeholder
            console.log(`🔗 [GraphVisualizer] Active scan placeholder for ${selectedAlertId}`);
            setNodes([{
                id: 'agent_screener', type: 'cyberNode',
                position: { x: 100, y: 150 },
                data: { label: 'IOC Extractor', role: 'Agent 1', isActive: true, results: null }
            }]);
            setScanPhase('extracting');
            lastHydratedEventRef.current = eventFingerprint;
        }
    }, [selectedAlertId, currentEvent, selectedAlert, setNodes, setEdges, nodes.length]);

    // AUTO-SAVE LAYOUT CHANGES
    useEffect(() => {
        if (nodes.length > 0 && selectedAlertId) {
            const timer = setTimeout(() => {
                const currentCache = graphCache.current[selectedAlertId] || { nodes: [], edges: [], scanPhase: 'idle', ctiNodes: new Set() };
                
                // Compare to avoid redundant saves (simplified check)
                const hasChanged = JSON.stringify(currentCache.nodes) !== JSON.stringify(nodes);
                
                if (hasChanged) {
                    graphCache.current[selectedAlertId] = {
                        ...currentCache,
                        nodes: nodes,
                        edges: edges,
                    };
                    saveGraphCache();
                }
            }, 2000); // 2s debounce for layout saves
            return () => clearTimeout(timer);
        }
    }, [nodes, edges, selectedAlertId, saveGraphCache]);

    // Event listener for tab switching from ActionConsole
    useEffect(() => {
        const handleSwitch = () => {
            console.log('📊 [GraphVisualizer] Switching to AI Graph view');
            setViewMode('graph');

            // Only initialize new graph if we don't already have one for this alert
            // OR if we are explicitly in a reset/running state (Re-scan case)
            const isRestarting = currentEvent?.current_node === 'reset' || currentEvent?.pipeline_status === 'running';

            // Check cache first — if we have a saved graph, restore it instead of setting placeholder
            const hasCachedGraph = selectedAlertId && (graphCache.current[selectedAlertId]?.nodes?.length ?? 0) > 0;

            if (hasCachedGraph && !isRestarting) {
                const cached = graphCache.current[selectedAlertId!];
                console.log(`⚡ [GraphVisualizer] Tab switch: restoring ${cached.nodes.length} nodes from cache`);
                setNodes(cached.nodes);
                setEdges(cached.edges);
                setScanPhase(cached.scanPhase || 'complete');
                setCtiNodes(cached.ctiNodes || new Set());
            } else if (selectedAlertId && (nodes.length === 0 || isRestarting)) {
                console.log('♻️ [GraphVisualizer] Initializing clean graph state for new scan');
                setScanPhase('idle');
                setNodes([
                    {
                        id: 'agent_screener',
                        type: 'cyberNode',
                        position: { x: 100, y: 150 },
                        data: { label: 'IOC Extractor', role: 'Agent 1', isActive: true, results: null }
                    }
                ]);
                setEdges([]);
            }
        };

        window.addEventListener('switch-to-ai-graph', handleSwitch);
        console.log('✅ [GraphVisualizer] Event listener registered');

        return () => window.removeEventListener('switch-to-ai-graph', handleSwitch);
    }, [selectedAlertId, nodes, setNodes, setEdges, setCtiNodes]);

    // Listen for manual resets (Re-scan)
    useEffect(() => {
        if (!selectedAlertId) return;

        if (currentEvent?.current_node === 'reset') {
            console.log(`♻️ [GraphVisualizer] Manual reset detected for ${selectedAlertId}`);

            // Clear visual state and cache locally
            setScanPhase('idle');
            setNodes([]);
            setEdges([]);
            setCtiNodes(new Set());
            setShowCtiOverlay(false);
            setCtiTooltip(null);
            updateQueue.current = [];

            if (graphCache.current[selectedAlertId]) {
                delete graphCache.current[selectedAlertId];
                saveGraphCache();
            }
        }
    }, [currentEvent?.current_node, selectedAlertId]);

    // Backend socket event listener for AI agent updates
    useEffect(() => {
        if (!socket) return;

        const handleAgentUpdate = (event: any) => {
            const { alert_id } = event;

            // ALWAYS Update Global Cache for background alerts
            const existingCache = graphCache.current[alert_id];

            // We apply the update to get the NEW state
            const prevState: GraphState = existingCache || {
                nodes: [],
                edges: [],
                scanPhase: 'idle',
                ctiNodes: new Set()
            };

            // INTERCEPT RESET SIGNAL TO WIPE CACHE
            if (event.node === 'reset') {
                console.log(`🧹 [GraphVisualizer] Explicit Reset Event Received for ${alert_id}`);
                delete graphCache.current[alert_id];
                saveGraphCache();

                if (alert_id === selectedAlertId) {
                    setNodes([]);
                    setEdges([]);
                    setScanPhase('idle');
                    setCtiNodes(new Set());
                    updateQueue.current = []; // Clear queue on reset
                }
                return;
            }

            const nextState = applyUpdate(prevState, event, (selectedAlertId === alert_id ? selectedAlert : null));

            // 1. Save to cache (even if not selected)
            graphCache.current[alert_id] = nextState;
            saveGraphCache();

            // 2. If it's the SELECTED alert, PUSH TO PACING QUEUE instead of immediate render
            if (alert_id === selectedAlertId) {
                console.log(`🎯 [GraphVisualizer] Queueing update for ${alert_id}`);
                updateQueue.current.push(event);
                processQueue();
            }
        };

        socket.on('agent_update', handleAgentUpdate);
        // NEW: Listen for local events (e.g. Stop button) to keep graph in sync
        const handleLocalUpdate = (e: any) => handleAgentUpdate(e.detail);
        window.addEventListener('agent_update', handleLocalUpdate);

        const handleClearCache = (e: any) => {
            const { alert_id } = e.detail;
            if (graphCache.current[alert_id]) {
                delete graphCache.current[alert_id];
                saveGraphCache();
                if (selectedAlertId === alert_id) {
                    setNodes([]); setEdges([]); setScanPhase('idle');
                    updateQueue.current = [];
                }
            }
        };
        window.addEventListener('clear-graph-cache', handleClearCache);

        return () => {
            socket.off('agent_update', handleAgentUpdate);
            window.removeEventListener('agent_update', handleLocalUpdate);
            window.removeEventListener('clear-graph-cache', handleClearCache);
        };
    }, [socket, selectedAlertId, setNodes, setEdges, selectedAlert]);


    const ctiData = getCtiData();
    const hasCTIQueries = ctiData.length > 0;

    // Group CTI data by IoC for the split view
    const groupedCti = ctiData.reduce((acc: any, item: any) => {
        if (!acc[item.ioc]) acc[item.ioc] = [];
        acc[item.ioc].push(item);
        return acc;
    }, {});

    const uniqueIocs = Object.keys(groupedCti);

    // Auto-select first IoC when opening overlay
    useEffect(() => {
        if (showCtiOverlay && !selectedCtiIoc && uniqueIocs.length > 0) {
            setSelectedCtiIoc(uniqueIocs[0]);
        }
    }, [showCtiOverlay, uniqueIocs, selectedCtiIoc]);

    return (
        <div className="glass-panel h-full flex flex-col overflow-hidden relative">

            {/* == AWARD-WINNING CYBER HEADER == */}
            <div className="flex-none h-[52px] flex items-center justify-between px-6 relative bg-gradient-to-r from-slate-900/90 via-cyan-950/40 to-slate-900/90 border-b border-cyan-500/20 group overflow-hidden">

                {/* Dynamic Glowing Top Edge */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"></div>
                {/* Scanline Pattern */}
                <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(0deg,transparent_24%,#22d3ee_25%,#22d3ee_26%,transparent_27%,transparent_74%,#22d3ee_75%,#22d3ee_76%,transparent_77%,transparent)] bg-[length:4px_4px]"></div>
                {/* Side Bracket / Light Bar */}
                <div className="absolute top-0 left-0 w-[3px] h-full bg-cyan-500/70"></div>

                {/* Decorative corner cutouts / UI noise */}
                <div className="absolute right-0 top-0 w-16 h-full bg-gradient-to-l from-cyan-500/5 to-transparent pointer-events-none"></div>

                {/* Left Side: Title & Status */}
                <div className="flex items-center gap-4 relative z-10">
                    {/* Cyber Core Indicator (Static) */}
                    <div className="relative flex h-3 w-3 items-center justify-center">
                        <div className="relative inline-flex h-1.5 w-1.5 bg-cyan-400 transform rotate-45"></div>
                    </div>

                    {/* Text */}
                    <div className="flex flex-col justify-center">
                        <h2 className="text-[13px] font-semibold text-slate-100 uppercase tracking-[0.14em]">
                            {viewMode === 'details' ? "Alert Details" : "AI Analysis"}
                        </h2>
                    </div>
                </div>

                {/* Right Side: SOAR badge + View Toggle */}
                <div className="flex items-center gap-2">

                {soarId && (() => {
                    const colorCls = caseSystem === 'thehive'
                        ? "bg-amber-950/60 border-amber-500/40 text-amber-400 hover:bg-amber-900/80 hover:text-amber-200 hover:border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:shadow-[0_0_18px_rgba(245,158,11,0.4)]"
                        : caseSystem === 'webhook'
                        ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-400 hover:bg-cyan-900/80 hover:text-cyan-200 hover:border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.2)] hover:shadow-[0_0_18px_rgba(34,211,238,0.4)]"
                        : "bg-violet-950/60 border-violet-500/40 text-violet-400 hover:bg-violet-900/80 hover:text-violet-200 hover:border-violet-400/60 shadow-[0_0_12px_rgba(139,92,246,0.2)] hover:shadow-[0_0_18px_rgba(139,92,246,0.4)]";
                    const baseCls = cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-black font-mono uppercase tracking-wider backdrop-blur-md transition-all cursor-pointer hover:scale-105 group focus:outline-none", colorCls);
                    const inner = <>
                        {caseSoar.logo && (
                            <img
                                src={caseSoar.logo}
                                alt={caseSoar.name}
                                className="h-3.5 w-3.5 object-contain"
                            />
                        )}
                        <span>Case Created</span>
                        <ExternalLink size={9} className="group-hover:drop-shadow-[0_0_4px_rgba(245,158,11,0.8)] transition-all" />
                    </>;
                    return caseUrl
                        ? <a href={caseUrl} target="_blank" rel="noopener noreferrer" title={`Open in ${caseSoar.name}`} className={baseCls}>{inner}</a>
                        : <span className={baseCls} title="Case URL not available">{inner}</span>;
                })()}

                <div className="flex items-center bg-slate-950/50 rounded-lg p-0.5 border border-white/5 shadow-inner">
                    <button
                        onClick={() => setViewMode('details')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-[12px] font-semibold transition-all relative overflow-hidden group",
                            viewMode === 'details' ? "text-cyan-100" : "text-slate-500 hover:text-cyan-400"
                        )}
                    >
                        {viewMode === 'details' && (
                            <motion.div
                                layoutId="viewToggle"
                                className="absolute inset-0 bg-cyan-500/20 rounded-md border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10">Alert Details</span>
                    </button>
                    <button
                        onClick={() => setViewMode('graph')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-[12px] font-semibold transition-all relative overflow-hidden group",
                            viewMode === 'graph' ? "text-cyan-100" : "text-slate-500 hover:text-cyan-400"
                        )}
                    >
                        {viewMode === 'graph' && (
                            <motion.div
                                layoutId="viewToggle"
                                className="absolute inset-0 bg-cyan-500/20 rounded-md border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10">AI Analysis</span>
                    </button>
                </div>

                </div>
            </div>

            <div className="flex-1 min-h-0 relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {!selectedAlert ? (
                        <motion.div
                            key="standby"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="h-full overflow-hidden"
                        >
                            <StandbyState />
                        </motion.div>
                    ) : viewMode === 'details' ? (
                        <motion.div
                            key="details"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="h-full overflow-hidden"
                        >
                            <AlertDetails alert={{ ...selectedAlert, ...currentEvent }} />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="graph"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full"
                        >
                            {/* Always show graph when in graph view mode */}
                            <ReactFlow
                                nodes={nodes}
                                edges={displayEdges}
                                nodeTypes={nodeTypes}
                                onNodesChange={onNodesChange as any}
                                onEdgesChange={onEdgesChange}
                                onInit={setRfInstance}
                                defaultEdgeOptions={{
                                    animated: true,
                                    style: {
                                        stroke: '#06b6d4',
                                        strokeWidth: 2,
                                        filter: 'drop-shadow(0 0 3px rgba(6,182,212,0.5))'
                                    },
                                    type: 'smoothstep',
                                }}
                                fitView
                                proOptions={{ hideAttribution: true }}
                                className="bg-transparent"
                            >
                                <Background color="#1e293b" gap={20} size={1} />
                                <Controls className="cyber-controls" />
                            </ReactFlow>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* CTI Sources Overlay View */}
                <AnimatePresence>
                    {showCtiOverlay && viewMode === 'graph' && selectedAlert && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-40 overflow-hidden flex items-center justify-center p-10"
                        >
                            {/* ═══ PREMIUM CYBER BACKGROUND ═══ */}
                            <div className="absolute inset-0 z-[-1] overflow-hidden" style={{ background: '#020c18' }}>

                                {/* Layer 1 — Deep navy base gradient */}
                                <div className="absolute inset-0 bg-gradient-to-br from-[#020c18] via-[#041424] to-[#020c18]" />

                                {/* Layer 2 — Primary aurora: large teal bloom, left-center */}
                                <div className="absolute -left-[20%] top-[10%] w-[70%] h-[80%] rounded-full opacity-[0.18]"
                                    style={{ background: 'radial-gradient(ellipse at center, #06b6d4 0%, #0e7490 30%, transparent 70%)', filter: 'blur(80px)' }} />

                                {/* Layer 3 — Secondary aurora: indigo/violet bloom, top-right */}
                                <div className="absolute right-[-10%] top-[-20%] w-[55%] h-[60%] rounded-full opacity-[0.14]"
                                    style={{ background: 'radial-gradient(ellipse at center, #6366f1 0%, #4338ca 40%, transparent 70%)', filter: 'blur(90px)' }} />

                                {/* Layer 4 — Accent aurora: emerald glow, bottom-right */}
                                <div className="absolute right-[5%] bottom-[-10%] w-[35%] h-[40%] rounded-full opacity-[0.10]"
                                    style={{ background: 'radial-gradient(ellipse at center, #10b981 0%, #065f46 40%, transparent 70%)', filter: 'blur(70px)' }} />

                                {/* Layer 5 — Subtle cyan core highlight, dead center */}
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[40%] rounded-full opacity-[0.07]"
                                    style={{ background: 'radial-gradient(ellipse at center, #22d3ee 0%, transparent 65%)', filter: 'blur(60px)' }} />

                                {/* Layer 6 — Fine cyber grid */}
                                <div className="absolute inset-0"
                                    style={{
                                        backgroundImage: 'linear-gradient(rgba(6,182,212,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.07) 1px, transparent 1px)',
                                        backgroundSize: '48px 48px',
                                        maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 30%, transparent 100%)'
                                    }} />

                                {/* Layer 7 — Micro dot grid overlay */}
                                <div className="absolute inset-0 opacity-[0.25]"
                                    style={{
                                        backgroundImage: 'radial-gradient(circle, rgba(6,182,212,0.5) 1px, transparent 1px)',
                                        backgroundSize: '24px 24px',
                                        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 80%)'
                                    }} />

                                {/* Layer 8 — Horizontal scanlines */}
                                <div className="absolute inset-0 opacity-[0.025]"
                                    style={{
                                        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)'
                                    }} />

                                {/* Layer 9 — Edge vignette */}
                                <div className="absolute inset-0"
                                    style={{ background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgba(2,12,24,0.7) 100%)' }} />

                                {/* Layer 10 — Top border glow line */}
                                <div className="absolute top-0 left-0 right-0 h-[1px]"
                                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.4) 30%, rgba(99,102,241,0.4) 70%, transparent 100%)' }} />

                                {/* Layer 11 — Bottom border glow line */}
                                <div className="absolute bottom-0 left-0 right-0 h-[1px]"
                                    style={{ background: 'linear-gradient(90deg, transparent 10%, rgba(6,182,212,0.2) 50%, transparent 90%)' }} />
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 40, scale: 0.98 }}
                                className="w-full max-w-[1600px] h-full flex gap-12 relative z-10"
                            >
                            {/* Left Side: Observables (40%) */}
                            <div className="w-[40%] flex flex-col min-h-0 relative z-10">
                                {/* Sidebar Header */}
                                    <div className="mb-5 flex justify-center w-full -mt-6">
                                        <h3 className="text-[11px] font-mono font-black text-cyan-400 uppercase tracking-[0.4em] drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">Identified IoCs</h3>
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto cyber-scrollbar pr-2 pt-2 pb-4 flex flex-col gap-2">
                                    {uniqueIocs.map((ioc) => {
                                        const sources = groupedCti[ioc] || [];
                                        const ts = getIocTypeStyle(ioc);
                                        const isSelected = selectedCtiIoc === ioc;

                                        return (
                                            <motion.div
                                                key={ioc}
                                                layout
                                                onClick={() => setSelectedCtiIoc(ioc)}
                                                className={cn(
                                                    "group transition-all duration-300 cursor-pointer border rounded-xl px-4 py-3 flex items-center justify-between relative shrink-0 mx-1.5 backdrop-blur-sm",
                                                    isSelected ? ts.rowSelected : ts.rowIdle
                                                )}
                                            >
                                                {/* Ambient glow on selection */}
                                                {isSelected && (
                                                    <div className={cn("absolute inset-0 rounded-xl opacity-[0.06] pointer-events-none", ts.glow)} />
                                                )}

                                                {/* === TACTICAL TARGETING BRACES === */}
                                                <span className={cn(
                                                    "absolute -top-[1.5px] -left-[1.5px] w-4 h-4 border-l-[1.5px] border-t-[1.5px] rounded-tl-xl opacity-0 transition-all duration-300 translate-x-2 translate-y-2 z-30",
                                                    ts.badge.includes('sky') ? 'border-sky-400' : ts.badge.includes('orange') ? 'border-orange-400' : ts.badge.includes('emerald') ? 'border-emerald-400' : ts.badge.includes('violet') ? 'border-violet-400' : ts.badge.includes('rose') ? 'border-rose-400' : ts.badge.includes('yellow') ? 'border-yellow-400' : ts.badge.includes('pink') ? 'border-pink-400' : 'border-cyan-400',
                                                    isSelected && "opacity-100 translate-x-0 translate-y-0"
                                                )}></span>
                                                <span className={cn(
                                                    "absolute -top-[1.5px] -right-[1.5px] w-4 h-4 border-r-[1.5px] border-t-[1.5px] rounded-tr-xl opacity-0 transition-all duration-300 -translate-x-2 translate-y-2 z-30",
                                                    ts.badge.includes('sky') ? 'border-sky-400' : ts.badge.includes('orange') ? 'border-orange-400' : ts.badge.includes('emerald') ? 'border-emerald-400' : ts.badge.includes('violet') ? 'border-violet-400' : ts.badge.includes('rose') ? 'border-rose-400' : ts.badge.includes('yellow') ? 'border-yellow-400' : ts.badge.includes('pink') ? 'border-pink-400' : 'border-cyan-400',
                                                    isSelected && "opacity-100 translate-x-0 translate-y-0"
                                                )}></span>
                                                <span className={cn(
                                                    "absolute -bottom-[1.5px] -right-[1.5px] w-4 h-4 border-r-[1.5px] border-b-[1.5px] rounded-br-xl opacity-0 transition-all duration-300 -translate-x-2 -translate-y-2 z-30",
                                                    ts.badge.includes('sky') ? 'border-sky-400' : ts.badge.includes('orange') ? 'border-orange-400' : ts.badge.includes('emerald') ? 'border-emerald-400' : ts.badge.includes('violet') ? 'border-violet-400' : ts.badge.includes('rose') ? 'border-rose-400' : ts.badge.includes('yellow') ? 'border-yellow-400' : ts.badge.includes('pink') ? 'border-pink-400' : 'border-cyan-400',
                                                    isSelected && "opacity-100 translate-x-0 translate-y-0"
                                                )}></span>
                                                <span className={cn(
                                                    "absolute -bottom-[1.5px] -left-[1.5px] w-4 h-4 border-l-[1.5px] border-b-[1.5px] rounded-bl-xl opacity-0 transition-all duration-300 translate-x-2 -translate-y-2 z-30",
                                                    ts.badge.includes('sky') ? 'border-sky-400' : ts.badge.includes('orange') ? 'border-orange-400' : ts.badge.includes('emerald') ? 'border-emerald-400' : ts.badge.includes('violet') ? 'border-violet-400' : ts.badge.includes('rose') ? 'border-rose-400' : ts.badge.includes('yellow') ? 'border-yellow-400' : ts.badge.includes('pink') ? 'border-pink-400' : 'border-cyan-400',
                                                    isSelected && "opacity-100 translate-x-0 translate-y-0"
                                                )}></span>

                                                <div className="flex items-center gap-3 relative z-10 flex-1 min-w-0">
                                                    {/* IoC Type Badge — always colored */}
                                                    <div className={cn(
                                                        "px-2 py-0.5 rounded-md text-[9px] font-black font-mono uppercase tracking-tighter border shrink-0",
                                                        ts.badge
                                                    )}>
                                                        {ts.label}
                                                    </div>

                                                    <span className={cn(
                                                        "text-[12px] font-mono font-bold truncate tracking-tight transition-all",
                                                        isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-100"
                                                    )}>
                                                        {ioc}
                                                    </span>
                                                </div>

                                                {/* Source Count Badge */}
                                                <div className={cn(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black font-mono transition-all ml-4 shrink-0",
                                                    isSelected ? `${ts.badge} opacity-80` : "bg-slate-900/60 border-white/5 text-slate-500"
                                                )}>
                                                    <Database size={10} />
                                                    <span>{sources.length}</span>
                                                    <span className="text-[7px] opacity-60">SRC</span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Right Side: Details (60%) */}
                            <div className="w-[60%] flex flex-col min-h-0 relative z-10">
                                {/* Details Header */}
                                <div className="mb-5 flex justify-center w-full -mt-6">
                                    <h3 className="text-[11px] font-mono font-black text-cyan-400 uppercase tracking-[0.3em] drop-shadow-[0_0_8px_rgba(34,211,238,0.2)]">CTI Results</h3>
                                </div>

                                {selectedCtiIoc && groupedCti[selectedCtiIoc] ? (
                                    <div className="flex flex-col h-full min-h-0">
                                        <div className="flex-1 overflow-y-auto cyber-scrollbar pr-2 space-y-3">
                                            {groupedCti[selectedCtiIoc].map((item: any, idx: number) => {
                                                const sourceUrl = getCtiUrl(item.tool, item.ioc);
                                                const risk = item.risk_score || 0;
                                                const verdictLower = (item.verdict || '').toLowerCase();
                                                const isMalicious = verdictLower === 'malicious' || risk > 70;
                                                const isSuspicious = verdictLower === 'suspicious' || (risk > 20 && risk <= 70);
                                                const isUnknown = verdictLower.includes('unknown') || verdictLower.includes('inconclusive') || verdictLower.includes('error') || (risk === 0 && !item.verdict);
                                                
                                                const primaryIntel = item.description || item.comment || item.details || item.summary || item.tactical_summary || item.verdict_summary;
                                                const blacklistedKeys = ['tool', 'ioc', 'risk_score', 'verdict', 'description', 'comment', 'details', 'summary', 'tactical_summary', 'verdict_summary', 'tags', 'category_tags', 'categories', 'reference_link', 'type'];
                                                const rawAttributes = Object.entries(item)
                                                    .filter(([key, val]) => !blacklistedKeys.includes(key) && val !== null && val !== undefined && val !== '')
                                                    .map(([key, val]) => ({
                                                        label: key.replace(/_/g, ' ').toUpperCase(),
                                                        value: String(val)
                                                    }));

                                                const rawTags = item.tags || item.category_tags || item.categories || [];
                                                const tags = Array.isArray(rawTags) ? rawTags : [];

                                                return (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        transition={{ delay: idx * 0.05 }}
                                                        className={cn(
                                                            "group/card relative flex flex-col p-5 rounded-2xl border transition-all duration-500 overflow-hidden backdrop-blur-2xl",
                                                            isMalicious
                                                                ? "bg-gradient-to-br from-rose-950/50 via-slate-900/70 to-slate-950 border-rose-500/30 hover:border-rose-400/70 shadow-[0_8px_40px_rgba(244,63,94,0.2),inset_0_0_0_1px_rgba(244,63,94,0.05)]"
                                                                : isSuspicious
                                                                    ? "bg-gradient-to-br from-amber-950/40 via-slate-900/70 to-slate-950 border-amber-500/25 hover:border-amber-400/60 shadow-[0_8px_40px_rgba(245,158,11,0.15),inset_0_0_0_1px_rgba(245,158,11,0.05)]"
                                                                    : isUnknown
                                                                        ? "bg-gradient-to-br from-slate-800/50 via-slate-900/70 to-slate-950 border-slate-600/20 hover:border-slate-500/40 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                                                                        : "bg-gradient-to-br from-emerald-950/40 via-slate-900/70 to-slate-950 border-emerald-500/25 hover:border-emerald-400/60 shadow-[0_8px_40px_rgba(16,185,129,0.12),inset_0_0_0_1px_rgba(16,185,129,0.05)]"
                                                        )}
                                                    >
                                                        {/* Light Sweep Animation */}
                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -translate-x-full group-hover/card:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

                                                        {/* Top Rim Light */}
                                                        <div className={cn(
                                                            "absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent to-transparent",
                                                            isMalicious ? "via-rose-400/60" : isSuspicious ? "via-amber-400/50" : isUnknown ? "via-slate-400/20" : "via-emerald-400/50"
                                                        )} />

                                                        {/* Bottom ambient glow */}
                                                        <div className={cn(
                                                            "absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 blur-3xl opacity-20 pointer-events-none rounded-full",
                                                            isMalicious ? "bg-rose-500" : isSuspicious ? "bg-amber-500" : isUnknown ? "bg-slate-500" : "bg-emerald-500"
                                                        )} />
                                                        {/* Header: Compact Row */}
                                                        <div className="flex justify-between items-center mb-3 relative z-10">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center transition-transform group-hover/card:scale-110 duration-500 relative">
                                                                    <div className="absolute inset-0 blur-xl opacity-20 bg-white" />
                                                                    <div className="w-full h-full flex items-center justify-center relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
                                                                        {item.tool.toLowerCase().includes('virustotal') ? (
                                                                            <img src="/assets/VT Icon.PNG" alt="VT" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('urlscan') ? (
                                                                            <img src="/assets/Urlscan logo.png" alt="URL" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('greynoise') ? (
                                                                            <img src="/assets/GreyNoise Logo.png" alt="GN" className="w-full h-full object-contain brightness-0 invert" />
                                                                        ) : item.tool.toLowerCase().includes('abuseipdb') || item.tool.toLowerCase().includes('ab') ? (
                                                                            <img src="/assets/abuseipdb-logo.png" alt="AB" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('threatfox') || item.tool.toLowerCase().includes('urlhaus') || item.tool.toLowerCase().includes('malwarebazaar') ? (
                                                                            <img src="/assets/abuse_ch-icon.avif" alt="ABUSE_CH" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('shodan') ? (
                                                                            <img src="/assets/Shodan Logo.png" alt="SH" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('otx') || item.tool.toLowerCase().includes('alienvault') ? (
                                                                            <img src="/assets/OTX Logo.png" alt="OTX" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('mxtoolbox') ? (
                                                                            <img src="/assets/MxToolBox Logo.png" alt="MX" className="w-full h-full object-contain" />
                                                                        ) : item.tool.toLowerCase().includes('hybrid') ? (
                                                                            <img src="/assets/Hybrid Analysis logo.png" alt="HA" className="w-full h-full object-contain" />
                                                                        ) : (
                                                                            <Server className="text-cyan-400" size={16} />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold font-mono text-white text-[11px] uppercase tracking-wider">{item.tool}</span>
                                                                    <div className={cn(
                                                                        "flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-[0.1em] leading-none mt-0.5 w-fit",
                                                                        isMalicious 
                                                                            ? "bg-rose-500/10 border-rose-500/40 text-rose-400" 
                                                                            : isSuspicious 
                                                                                ? "bg-amber-500/10 border-amber-500/40 text-amber-400" 
                                                                                : isUnknown
                                                                                    ? "bg-slate-500/10 border-slate-500/40 text-slate-400"
                                                                                    : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                                                                    )}>
                                                                        <div className={cn(
                                                                            "w-1 h-1 rounded-full",
                                                                            isMalicious ? "bg-rose-500" : isSuspicious ? "bg-amber-500" : isUnknown ? "bg-slate-500" : "bg-emerald-500"
                                                                        )} />
                                                                        {item.verdict || (risk === 0 ? 'Unknown' : 'Clean')}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <a href={item.reference_link || sourceUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-cyan-400 hover:text-white hover:border-cyan-400/50 hover:bg-cyan-500/20 transition-all shadow-[0_0_15px_rgba(34,211,238,0.1)] group/link">
                                                                <ExternalLink size={14} className="drop-shadow-[0_0_5px_rgba(34,211,238,0.4)] group-hover/link:scale-110 transition-transform" />
                                                            </a>
                                                        </div>

                                                        {/* Body: Side-by-Side Content */}
                                                        <div className="grid grid-cols-[1fr_90px] gap-4 relative z-10">
                                                            {/* Left: Info Stack */}
                                                            <div className="space-y-3 min-w-0">
                                                                {primaryIntel && (
                                                                    <p className={cn(
                                                                        "text-[11px] font-medium leading-snug border-l-2 pl-3 line-clamp-3",
                                                                        isMalicious ? "border-rose-500/50 text-rose-100/80" : isSuspicious ? "border-amber-500/50 text-amber-100/80" : isUnknown ? "border-slate-500/30 text-slate-400" : "border-emerald-500/40 text-emerald-50/80"
                                                                    )}>
                                                                        {primaryIntel}
                                                                    </p>
                                                                )}

                                                                {rawAttributes.length > 0 && (
                                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                                        {rawAttributes.slice(0, 4).map((attr, aIdx) => (
                                                                            <div key={aIdx} className="flex flex-col min-w-0">
                                                                                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest truncate">{attr.label}</span>
                                                                                <span className="text-[10px] font-mono font-semibold text-white/90 truncate">{attr.value}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {tags.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {tags.slice(0, 5).map((tag: string, tIdx: number) => (
                                                                            <span key={tIdx} className={cn(
                                                                                "px-1.5 py-0.5 rounded-md border text-[7px] font-black uppercase tracking-tighter",
                                                                                isMalicious ? "bg-rose-500/10 border-rose-500/20 text-rose-300" : isSuspicious ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                                                                            )}>
                                                                                #{tag.replace(/\s+/g, '')}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Right: Compact Premium Gauge */}
                                                            <div className="flex items-center justify-center">
                                                                <div className="relative w-20 h-20 flex items-center justify-center group/gauge">
                                                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                                                        {/* Outer Ring */}
                                                                        <circle
                                                                            cx="50" cy="50" r="42"
                                                                            fill="none"
                                                                            stroke="currentColor"
                                                                            strokeWidth="2"
                                                                            className="text-slate-800"
                                                                        />
                                                                        {/* Progress Path */}
                                                                        <motion.circle
                                                                            cx="50" cy="50" r="42"
                                                                            fill="none"
                                                                            stroke="currentColor"
                                                                            strokeWidth="3"
                                                                            strokeLinecap="round"
                                                                            strokeDasharray="264"
                                                                            initial={{ strokeDashoffset: 264 }}
                                                                            animate={{ strokeDashoffset: 264 - (risk / 100) * 264 }}
                                                                            transition={{ duration: 1.5, ease: "easeInOut" }}
                                                                            className={cn(
                                                                                "drop-shadow-[0_0_8px_rgba(var(--glow-rgb),0.6)]",
                                                                                isMalicious ? "text-rose-500 [--glow-rgb:244,63,94]" : 
                                                                                isSuspicious ? "text-amber-500 [--glow-rgb:245,158,11]" : 
                                                                                isUnknown ? "text-slate-500 [--glow-rgb:100,116,139]" :
                                                                                "text-emerald-500 [--glow-rgb:16,185,129]"
                                                                            )}
                                                                        />
                                                                        {/* Internal Glow Circle */}
                                                                        <circle
                                                                            cx="50" cy="50" r="32"
                                                                            fill="currentColor"
                                                                            className={cn(
                                                                                "opacity-[0.03]",
                                                                                isMalicious ? "text-rose-500" : isSuspicious ? "text-amber-500" : isUnknown ? "text-slate-500" : "text-emerald-500"
                                                                            )}
                                                                        />
                                                                    </svg>
                                                                    
                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                        <div className="flex items-baseline gap-0.5">
                                                                            <span className="text-[18px] font-black font-mono text-white leading-none tracking-tighter">{risk}</span>
                                                                            <span className="text-slate-500 text-[8px] font-bold">%</span>
                                                                        </div>
                                                                        <span className="text-[6px] font-black font-mono text-slate-500 uppercase tracking-widest mt-0.5">Risk Score</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 font-mono gap-4 opacity-40">
                                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-800 animate-[spin_15s_linear_infinite] flex items-center justify-center">
                                            <Info size={24} />
                                        </div>
                                        <p className="uppercase tracking-[0.2em] text-[10px] font-black">Select an observable</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>

                {/* CTI Sources Overlay Toggler */}
                {hasCTIQueries && viewMode === 'graph' && selectedAlert && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute bottom-6 right-6 z-50"
                    >
                        <button
                            onClick={() => setShowCtiOverlay(!showCtiOverlay)}
                            className="p-2.5 bg-cyan-900/60 border border-cyan-500/40 text-cyan-400 rounded-lg backdrop-blur-md hover:bg-cyan-800 hover:text-cyan-100 hover:scale-105 transition-all cursor-pointer flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)] group focus:outline-none"
                            title={showCtiOverlay ? "Return to Graph" : "Verify IoC"}
                        >
                            {showCtiOverlay ? (
                                <Undo2 size={20} className="group-hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.6)]" />
                            ) : (
                                <LinkIcon size={20} className="group-hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.6)]" />
                            )}
                        </button>
                    </motion.div>
                )}

                {/* CTI Tooltip Portal */}
                {ctiTooltip && createPortal(
                    <AnimatePresence>
                        <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            style={{
                                position: 'fixed',
                                left: ctiTooltip.x,
                                top: ctiTooltip.y,
                                zIndex: 100002
                            }}
                            className="pointer-events-none w-max max-w-md"
                        >
                            <div className="bg-slate-950/98 backdrop-blur-2xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(6,182,212,0.15)] text-cyan-100/90 text-[11px] font-mono p-4 rounded-lg break-all">
                                <div className="flex items-center gap-2 border-b border-cyan-900/50 pb-2 mb-2 bg-cyan-950/20 -mx-4 -mt-4 px-4 pt-3 rounded-t-lg">
                                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em]">Target Value</span>
                                    <div className="flex gap-1 ml-auto">
                                        <div className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full" />
                                        <div className="w-1.5 h-1.5 bg-cyan-500/20 rounded-full" />
                                    </div>
                                </div>
                                <div className="pt-1">
                                    {ctiTooltip.ioc}
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>,
                    document.body
                )}
            </div>
        </div>
    );
};
