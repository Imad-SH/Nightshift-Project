import React from 'react';
import { useSocket } from '../hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './DashboardLayout';
import { Loader2, Filter, X, Plus, Upload, FileJson } from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import type { Alert, SocketEvent } from '../types';
import { apiBase } from '../config';

interface FilterState {
    searchTerm: string;
    severities: number[];
    showOnlyAnalyzed: boolean;
    selectedVerdicts: string[];
    startDate?: string;
    endDate?: string;
    relativeDays?: string;
    relativeHours?: string;
    relativeMinutes?: string;
}

const defaultFilter: FilterState = {
    searchTerm: '',
    severities: [],
    showOnlyAnalyzed: false,
    selectedVerdicts: [],
    startDate: '',
    endDate: '',
    relativeDays: '',
    relativeHours: '',
    relativeMinutes: ''
};

interface LiveAlertStreamProps {
    onSelectAlert: (alertId: string) => void;
    selectedAlertId?: string;
}

// --- OPTIMIZED SUB-COMPONENT ---
const AlertItem = React.memo(({ 
    alert, 
    isSelected, 
    onSelect, 
    getSeverityDetails, 
    event, 
    _tick 
}: { 
    alert: Alert, 
    isSelected: boolean, 
    onSelect: (id: string) => void,
    getSeverityDetails: (level: number) => { 
        bg: string; 
        border: string; 
        hover: string; 
        selected: string; 
        time: string; 
        dot: string; 
        badge: string; 
        bracket: string; 
        label: string; 
    },
    event: SocketEvent | null,
    _tick: number
}) => {
    const sev = getSeverityDetails(alert.level);
    const [isCopied, setIsCopied] = React.useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(alert.id);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };
    
    return (
        <motion.div
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            whileHover={{ scale: 1.01 }}
            onClick={() => onSelect(alert.id)}
            data-alert-id={alert.id}
            className={cn(
                "group relative h-full pt-2 pb-3 px-4 rounded-xl cursor-pointer transition-all duration-300 ease-out",
                "backdrop-blur-2xl border flex flex-col shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_20px_-12px_rgba(0,0,0,0.6)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_30px_-14px_rgba(0,0,0,0.75)]",
                sev.bg,
                sev.border,
                sev.hover,
                isSelected && cn(sev.selected, "ring-1")
            )}
        >
            {/* === TACTICAL TARGETING BRACKETS === */}
            <span className={cn(
                "absolute -top-1.5 -left-1.5 w-6 h-6 border-l-2 border-t-2 rounded-tl-xl opacity-0 transition-all duration-300 translate-x-2 translate-y-2 z-20",
                sev.bracket,
                isSelected && "opacity-100 translate-x-0 translate-y-0"
            )}></span>
            <span className={cn(
                "absolute -top-1.5 -right-1.5 w-6 h-6 border-r-2 border-t-2 rounded-tr-xl opacity-0 transition-all duration-300 -translate-x-2 translate-y-2 z-20",
                sev.bracket,
                isSelected && "opacity-100 translate-x-0 translate-y-0"
            )}></span>
            <span className={cn(
                "absolute -bottom-1.5 -right-1.5 w-6 h-6 border-r-2 border-b-2 rounded-br-xl opacity-0 transition-all duration-300 -translate-x-2 -translate-y-2 z-20",
                sev.bracket,
                isSelected && "opacity-100 translate-x-0 translate-y-0"
            )}></span>
            <span className={cn(
                "absolute -bottom-1.5 -left-1.5 w-6 h-6 border-l-2 border-b-2 rounded-bl-xl opacity-0 transition-all duration-300 translate-x-2 -translate-y-2 z-20",
                sev.bracket,
                isSelected && "opacity-100 translate-x-0 translate-y-0"
            )}></span>

            {/* CONTENT HEADER */}
            <div className="flex justify-between items-center mb-1 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="relative group/time">
                        {(() => {
                            const injectedBy = (alert as any).rawData?._injected_by;
                            const injectedAt = (alert as any).rawData?._injected_at;
                            const baseDate = injectedAt ? new Date(injectedAt) : new Date(alert.timestamp);
                            const now = new Date();
                            void _tick;
                            const diffMs = now.getTime() - baseDate.getTime();
                            const diffSec = Math.floor(diffMs / 1000);
                            const diffMin = Math.floor(diffSec / 60);
                            const diffHr = Math.floor(diffMin / 60);
                            const diffDays = Math.floor(diffHr / 24);
                            const relative = diffSec < 60 ? `${diffSec}s ago`
                                : diffMin < 60 ? `${diffMin}m ago`
                                : diffHr < 24 ? `${diffHr}h ${diffMin % 60 > 0 ? `${diffMin % 60}m` : ''} ago`.trim()
                                : diffDays === 1 ? '1 day ago'
                                : `${diffDays} days ago`;

                            if (injectedBy) {
                                return (
                                    <span className="font-mono text-[10px] tracking-wider whitespace-nowrap text-violet-400 cursor-help">
                                        Added by <span className="font-bold">{injectedBy}</span> · {relative}
                                    </span>
                                );
                            }
                            return (
                                <span className={cn("font-mono text-[10.5px] tracking-wide opacity-90 transition-colors whitespace-nowrap cursor-help", sev.time)}>
                                    {diffSec < 60 ? `${diffSec}s ago`
                                        : diffMin < 60 ? `${diffMin} min${diffMin > 1 ? 's' : ''} ago`
                                        : diffHr < 24 ? `${diffHr}h${diffMin % 60 > 0 ? ` ${diffMin % 60}m` : ''} ago`
                                        : diffDays === 1 ? `1 day${diffHr % 24 > 0 ? ` ${diffHr % 24}h` : ''} ago`
                                        : `${diffDays} days${diffHr % 24 > 0 ? ` ${diffHr % 24}h` : ''} ago`}
                                </span>
                            );
                        })()}
                        {/* Custom Tooltip — renders downward to avoid header clipping */}
                        <div className="absolute left-0 top-full mt-2 pointer-events-none opacity-0 group-hover/time:opacity-100 transition-all duration-200 scale-95 origin-top-left z-50">
                            <div className="relative bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl px-3 py-2">
                                <p className="font-mono text-[11px] text-cyan-100 tracking-wider whitespace-nowrap">
                                    {new Date(alert.timestamp).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <span title={`Severity level ${alert.level}`} className={cn("text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-md border transition-colors flex items-center gap-1.5", sev.badge)}>
                    <span className="uppercase">{sev.label}</span>
                    <span className="opacity-40">·</span>
                    <span className="opacity-80">LVL {alert.level}</span>
                </span>
            </div>

            {/* CENTERED BODY: TITLE & AI STATUS */}
            <div className="flex-1 flex flex-col justify-center min-h-0">
                <div className="flex justify-between items-start gap-4">
                    <h3 className="font-semibold text-[14px] text-slate-50 leading-snug transition-colors">
                        {alert.title}
                    </h3>
                    {(() => {
                        // Priority mapping: If a verdict exists, always show it regardless of process status
                        const status = (event?.pipeline_status || alert.status || alert.pipeline_status || '').toLowerCase();
                        const vRaw = (event?.verdict || alert.verdict || event?.node_results?.agent_judge?.verdict || '').toLowerCase();
                        const vNormal = vRaw.replace('_', ' ');
                        
                        const hasRealVerdict = vNormal && vNormal !== 'unknown' && vNormal !== '' && !vNormal.includes('error') && vNormal !== 'failed';
                        const isProcessFailed = status === 'failed' || vNormal.includes('error') || vNormal === 'failed';
                        const isActive = ['running', 'extracting', 'investigating', 'judging'].includes(status);

                        if (hasRealVerdict) {
                            const verdictPill = vNormal === 'malicious' ? 'text-rose-300 bg-rose-500/15 border-rose-400/40' : vNormal === 'suspicious' ? 'text-amber-300 bg-amber-500/15 border-amber-400/40' : 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40';
                            return (
                                <div className="flex flex-col items-end gap-1 text-right shrink-0">
                                    <span className="flex-none text-[8.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        AI verdict
                                    </span>
                                    <span className={cn("flex-none text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border truncate max-w-[120px]", verdictPill)}>
                                        {vNormal === 'clean' ? 'CLEAN' : vNormal.toUpperCase()}
                                    </span>
                                </div>
                            );
                        }

                        if (isProcessFailed) {
                            return (
                                <div className="flex flex-col items-end gap-1 text-right shrink-0">
                                    <span className="flex-none text-[8.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        Analysis
                                    </span>
                                    <span className="flex-none text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border truncate max-w-[120px] text-amber-300 bg-amber-500/15 border-amber-400/40">
                                        FAILED
                                    </span>
                                </div>
                            );
                        }

                        if (isActive) {
                            return (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 shrink-0">
                                    <Loader2 size={10} className="animate-spin text-cyan-300" />
                                    <span className="flex-none text-[9.5px] font-bold text-cyan-300 uppercase tracking-wider">Analyzing</span>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            </div>

            {/* FOOTER DATA */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.07] transition-colors flex-none">
                <div className={cn("flex items-center gap-2 text-[10px] transition-colors", sev.time)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full transition-colors shrink-0", sev.dot)}></span>
                    <div className="relative group/agent">
                        <span className="font-mono truncate max-w-[120px] block group-hover/agent:hidden">
                            {alert.agent || 'Win-Agent-01'}
                        </span>
                        <span className="font-mono hidden group-hover/agent:block whitespace-nowrap">
                            {alert.agent || 'Win-Agent-01'}
                        </span>
                    </div>
                </div>

                <div className="relative group/id">
                    <motion.div
                        layout
                        onClick={handleCopy}
                        whileHover={{ scale: 1.05 }}
                        className={cn(
                            "font-mono font-medium text-[10px] tracking-tight transition-all duration-300",
                            "cursor-pointer bg-white/[0.03] hover:bg-cyan-500/15 px-2 py-0.5 rounded-md border border-white/10 hover:border-cyan-400/40",
                            "group-hover/id:shadow-[0_0_15px_rgba(103,137,198,0.3)]",
                            isCopied ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : sev.time
                        )}
                    >
                        <span className="group-hover/id:hidden">ID: {alert.id.slice(0, 8)}...</span>
                        <span className="hidden group-hover/id:inline">ID: {alert.id}</span>
                        
                        {/* Copy Indicator */}
                        <div className={cn(
                            "absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover/id:opacity-100 transition-all whitespace-nowrap z-50 font-black tracking-widest",
                            isCopied ? "bg-emerald-500 text-white" : "bg-black/80 text-cyan-400"
                        )}>
                            {isCopied ? 'COPIED' : 'COPY'}
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
});

// Dynamic virtualization constants
const MARGIN = 8;
const ESTIMATED_AVG_HEIGHT = 130; 

export const LiveAlertStream: React.FC<LiveAlertStreamProps> = ({ onSelectAlert, selectedAlertId }) => {
    const { alerts, events, getEventById, loadMoreHistory, injectAlert } = useSocket();
    const { token, user } = useSocAuth();
    const displayName = (user as any)?.name || (user as any)?.given_name || (user as any)?.preferred_username || 'Unknown';

    // Upload modal state — declared at top to maintain stable hook order
    const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
    const [uploadJson, setUploadJson] = React.useState('');
    const [uploadError, setUploadError] = React.useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [isFilterModalOpen, setIsFilterModalOpen] = React.useState(false);
    const [activeFilter, setActiveFilter] = React.useState<FilterState>(defaultFilter);
    const [draftFilter, setDraftFilter] = React.useState<FilterState>(defaultFilter);
    const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const getLocalISO = (date: Date) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    const handleRelativeTimeChange = (typeOrFull: 'd' | 'h' | 'm' | 'full', val: string | { d?: string, h?: string, m?: string }) => {
        const newDraft = { ...draftFilter };
        
        if (typeOrFull === 'full' && typeof val === 'object') {
            newDraft.relativeDays = val.d ?? '';
            newDraft.relativeHours = val.h ?? '';
            newDraft.relativeMinutes = val.m ?? '';
        } else if (typeof val === 'string') {
            if (typeOrFull === 'd') newDraft.relativeDays = val;
            if (typeOrFull === 'h') newDraft.relativeHours = val;
            if (typeOrFull === 'm') newDraft.relativeMinutes = val;
        }

        const d = parseInt(newDraft.relativeDays || '0') || 0;
        const h = parseInt(newDraft.relativeHours || '0') || 0;
        const m = parseInt(newDraft.relativeMinutes || '0') || 0;

        if (d > 0 || h > 0 || m > 0) {
            const now = new Date();
            const start = new Date(now);
            start.setDate(start.getDate() - d);
            start.setHours(start.getHours() - h);
            start.setMinutes(start.getMinutes() - m);
            
            newDraft.startDate = getLocalISO(start);
            newDraft.endDate = getLocalISO(now);
        } else {
            newDraft.startDate = '';
            newDraft.endDate = '';
        }
        setDraftFilter(newDraft);
    };

    // Filter Logic
    const filteredAlerts = React.useMemo(() => {
        return alerts.filter(alert => {
            const matchesSearch = activeFilter.searchTerm === '' ||
                (alert.title || '').toLowerCase().includes((activeFilter.searchTerm || '').toLowerCase()) ||
                (alert.agent || '').toLowerCase().includes((activeFilter.searchTerm || '').toLowerCase()) ||
                (alert.id || '').toLowerCase().includes((activeFilter.searchTerm || '').toLowerCase());

            const matchesSeverity = activeFilter.severities.length === 0 ||
                (activeFilter.severities.includes(5) && alert.level >= 13) ||
                (activeFilter.severities.includes(4) && alert.level >= 10 && alert.level < 13) ||
                (activeFilter.severities.includes(3) && alert.level >= 7 && alert.level < 10) ||
                (activeFilter.severities.includes(2) && alert.level >= 4 && alert.level < 7) ||
                (activeFilter.severities.includes(1) && alert.level < 4);

            const event = getEventById(alert.id);
            const status = event?.pipeline_status || alert.status || alert.pipeline_status;
            const v = (event?.verdict || alert.verdict || event?.node_results?.agent_judge?.verdict || '').toLowerCase();
            const isActive = ['running', 'extracting', 'investigating', 'judging'].includes(status || '') && (!v || v === 'unknown');
            const isAnalyzed = ['malicious', 'suspicious', 'false positive'].includes(v);
            
            let matchesVerdict = true;
            if (activeFilter.showOnlyAnalyzed && activeFilter.selectedVerdicts.length > 0) {
                matchesVerdict = activeFilter.selectedVerdicts.some(sv => {
                    if (sv === 'pending') return isActive;
                    if (sv === 'failed') return status === 'failed' || v === 'error' || v === 'failed';
                    if (sv === 'false positive') return v === 'false positive' || v === 'clean' || v === 'safe';
                    if (sv === 'malicious') return v === 'malicious';
                    if (sv === 'suspicious') return v === 'suspicious';
                    return v === sv;
                });
            } else if (activeFilter.showOnlyAnalyzed) {
                matchesVerdict = isAnalyzed || isActive || status === 'failed';
            }

            const alertTime = new Date(alert.timestamp).getTime();
            const matchesStartDate = !activeFilter.startDate || alertTime >= new Date(activeFilter.startDate).getTime();
            const matchesEndDate = !activeFilter.endDate || alertTime <= new Date(activeFilter.endDate).getTime();

            return matchesSearch && matchesSeverity && matchesVerdict && matchesStartDate && matchesEndDate;
        });
    }, [alerts, activeFilter, getEventById]);
    
    // --- DYNAMIC HEIGHT CALCULATION ---
    const { cardHeights, cardOffsets, totalScrollHeight } = React.useMemo(() => {
        const heights: number[] = [];
        const offsets: number[] = [];
        let currentOffset = 0;

        filteredAlerts.forEach(alert => {
            offsets.push(currentOffset);
            // Heuristic height calculation: Adjusted for p-3.5 and tighter spacing
            const charsPerLine = 38; 
            const titleLines = Math.ceil((alert.title?.length || 10) / charsPerLine);
            const height = 96 + (Math.max(1, titleLines) * 21); 
            heights.push(height);
            currentOffset += height + MARGIN;
        });

        return { cardHeights: heights, cardOffsets: offsets, totalScrollHeight: currentOffset };
    }, [filteredAlerts]);

    // Scroll state
    const [scrollRatio, setScrollRatio] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const [scrollTopState, setScrollTopState] = React.useState(0);

    const updateScrollState = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            setScrollTopState(scrollTop);
            const maxScroll = scrollHeight - clientHeight;
            setScrollRatio(maxScroll > 0 ? scrollTop / maxScroll : 0);
        }
    };

    const handleMarkerDrag = (e: React.MouseEvent) => {
        if (!scrollRef.current || !scrollRef.current.parentElement) return;
        e.preventDefault();
        setIsDragging(true);

        const container = scrollRef.current.parentElement;
        const rect = container.getBoundingClientRect();

        const onMouseMove = (moveEvent: MouseEvent) => {
            const y = Math.max(0, Math.min(rect.height, moveEvent.clientY - rect.top));
            const ratio = y / (rect.height || 1);
            const scrollTarget = ratio * (totalScrollHeight - scrollRef.current!.clientHeight);
            scrollRef.current!.scrollTop = scrollTarget;
            setScrollRatio(ratio);
            setScrollTopState(scrollTarget);
        };

        const onMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        updateScrollState();
        const target = e.currentTarget;
        if (target.scrollHeight - target.scrollTop <= target.clientHeight + 800) {
            loadMoreHistory(alerts.length);
        }
    };


    const prevFilterRef = React.useRef(activeFilter);
    React.useEffect(() => {
        if (prevFilterRef.current !== activeFilter) {
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
            prevFilterRef.current = activeFilter;
        }
    }, [activeFilter]);

    const hasInitialScrolled = React.useRef(false);
    React.useEffect(() => {
        if (!selectedAlertId || hasInitialScrolled.current || filteredAlerts.length === 0) return;
        
        const index = filteredAlerts.findIndex(a => a.id === selectedAlertId);
        if (index !== -1 && scrollRef.current) {
            const containerHeight = scrollRef.current.clientHeight || 800;
            const targetPos = cardOffsets[index] - (containerHeight / 2) + (ESTIMATED_AVG_HEIGHT / 2);
            
            const timer = setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: Math.max(0, targetPos), behavior: 'smooth' });
                    hasInitialScrolled.current = true;
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [selectedAlertId, filteredAlerts.length, cardOffsets]);

    // Tick state for relative timestamps
    const [_tick, setTick] = React.useState(0);
    React.useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(interval);
    }, []);

    const getSeverityDetails = React.useCallback((level: number) => {
        if (level >= 13) return {
            label: 'CRITICAL',
            badge: 'bg-purple-500/10 border-purple-500/50 text-purple-400',
            bg: 'bg-gradient-to-br from-purple-500/[0.13] via-purple-500/[0.05] to-slate-900/40',
            border: 'border-purple-400/30',
            hover: 'hover:border-purple-400/60',
            time: 'text-purple-400',
            dot: 'bg-purple-400',
            selected: 'border-purple-400/60 ring-purple-500/20 bg-purple-500/[0.08] shadow-[inset_0_0_30px_rgba(168,85,247,0.06)] border-l-2 border-l-purple-400',
            bracket: 'border-purple-400'
        };
        if (level >= 10) return {
            label: 'HIGH',
            badge: 'bg-rose-500/10 border-rose-500/50 text-rose-400',
            bg: 'bg-gradient-to-br from-rose-500/[0.13] via-rose-500/[0.05] to-slate-900/40',
            border: 'border-rose-400/30',
            hover: 'hover:border-rose-400/60',
            time: 'text-rose-400',
            dot: 'bg-rose-400',
            selected: 'border-rose-400/60 ring-rose-500/20 bg-rose-500/[0.08] shadow-[inset_0_0_30px_rgba(244,63,94,0.06)] border-l-2 border-l-rose-400',
            bracket: 'border-rose-400'
        };
        if (level >= 7) return {
            label: 'MEDIUM',
            badge: 'bg-orange-500/10 border-orange-500/50 text-orange-400',
            bg: 'bg-gradient-to-br from-orange-500/[0.13] via-orange-500/[0.05] to-slate-900/40',
            border: 'border-orange-400/30',
            hover: 'hover:border-orange-400/60',
            time: 'text-orange-400',
            dot: 'bg-orange-400',
            selected: 'border-orange-400/60 ring-orange-500/20 bg-orange-500/[0.08] shadow-[inset_0_0_30px_rgba(249,115,22,0.06)] border-l-2 border-l-orange-400',
            bracket: 'border-orange-400'
        };
        if (level >= 4) return {
            label: 'LOW',
            badge: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
            bg: 'bg-gradient-to-br from-yellow-500/[0.13] via-yellow-500/[0.05] to-slate-900/40',
            border: 'border-yellow-400/30',
            hover: 'hover:border-yellow-400/60',
            time: 'text-yellow-400',
            dot: 'bg-yellow-400',
            selected: 'border-yellow-400/60 ring-yellow-500/20 bg-yellow-500/[0.08] shadow-[inset_0_0_30px_rgba(234,179,8,0.06)] border-l-2 border-l-yellow-400',
            bracket: 'border-yellow-400'
        };
        return {
            label: 'INFO',
            badge: 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400',
            bg: 'bg-gradient-to-br from-cyan-500/[0.13] via-cyan-500/[0.05] to-slate-900/40',
            border: 'border-cyan-400/30',
            hover: 'hover:border-cyan-400/60',
            time: 'text-cyan-400',
            dot: 'bg-cyan-400',
            selected: 'border-cyan-400/60 ring-cyan-500/20 bg-cyan-500/[0.08] shadow-[inset_0_0_30px_rgba(103,137,198,0.06)] border-l-2 border-l-cyan-400',
            bracket: 'border-cyan-400'
        };
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            try {
                // Pretty-print to validate it's valid JSON
                setUploadJson(JSON.stringify(JSON.parse(text), null, 2));
                setUploadError(null);
            } catch {
                setUploadError('File is not valid JSON.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleUploadSubmit = async () => {
        setUploadError(null);
        let parsed: any;
        try {
            parsed = JSON.parse(uploadJson);
        } catch {
            setUploadError('Invalid JSON — please fix before submitting.');
            return;
        }
        // Reject if the ID already exists in the live stream
        // Check both top-level id and nested _source.id (OpenSearch envelope format)
        const rawId = parsed.id || parsed._source?.id || null;
        const existingId = rawId ? String(rawId) : null;
        if (existingId && alerts.some(a => a.id === existingId)) {
            setUploadError(`Alert with ID "${existingId}" already exists in the live stream.`);
            return;
        }

        // Stamp with uploader info — stored in raw_data, shown in the alert card
        parsed._injected_by = displayName;
        parsed._injected_at = new Date().toISOString();

        setIsUploading(true);
        try {
            const res = await fetch(`${apiBase()}/api/alerts/manual-upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(parsed)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            // Directly inject the returned alert into the live stream state
            // (avoids relying on the socket new_alert event which may race)
            if (data.alert) {
                injectAlert(data.alert);
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    setScrollTopState(0);
                }
            }
            setUploadSuccess(true);
            setUploadJson('');
            setTimeout(() => { setUploadSuccess(false); setIsUploadModalOpen(false); }, 1500);
        } catch (err: any) {
            setUploadError(err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="glass-panel h-full flex flex-col relative rounded-r-2xl group/stream">

            {/* INJECT ALERT BUTTON — top-left corner */}
            <button
                onClick={() => { setIsUploadModalOpen(!isUploadModalOpen); setIsFilterModalOpen(false); }}
                title="Inject Alert"
                className={cn(
                    "absolute -top-3 -left-3 z-[110] w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-200 shadow-lg",
                    isUploadModalOpen
                        ? "bg-cyan-500/40 border-cyan-300 text-cyan-100 shadow-[0_0_14px_rgba(131,162,212,0.6)]"
                        : "bg-slate-900 border-cyan-500/50 text-cyan-400 hover:bg-cyan-950 hover:border-cyan-300 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(131,162,212,0.4)]"
                )}
            >
                <Plus size={13} strokeWidth={2.5} />
            </button>

            {/* UPLOAD MODAL */}
            <AnimatePresence>
                {isUploadModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-x-0 top-[52px] bottom-0 z-[100] flex items-start justify-center bg-slate-950/60 backdrop-blur-[8px]"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-gradient-to-r from-slate-800/70 via-cyan-800/40 to-slate-800/70 backdrop-blur-3xl border-x border-b border-cyan-400/50 rounded-b-2xl shadow-[0_20px_60px_rgba(131,162,212,0.2),inset_0_0_40px_rgba(131,162,212,0.15)] overflow-hidden"
                        >
                            <div className="p-5 space-y-4">
                                {/* Header */}
                                <div className="flex items-center justify-between pb-2 border-b border-cyan-500/30">
                                    <div className="flex items-center gap-2">
                                        <FileJson size={10} className="text-cyan-400" />
                                        <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] font-mono drop-shadow-[0_0_8px_rgba(131,162,212,0.6)]">
                                            Inject Alert
                                        </h3>
                                    </div>
                                    <button onClick={() => { setIsUploadModalOpen(false); setUploadError(null); setUploadJson(''); }} className="text-slate-400 hover:text-cyan-400 transition-colors p-1">
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* File picker */}
                                <div>
                                    <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelect} />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-2 border border-dashed border-cyan-500/40 rounded-lg text-[9px] font-bold text-cyan-400/70 hover:border-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30 transition-all font-mono uppercase tracking-widest flex items-center justify-center gap-2"
                                    >
                                        <Upload size={12} />
                                        Load from .json file
                                    </button>
                                </div>

                                {/* JSON textarea */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-cyan-200/60 uppercase tracking-[0.2em] font-mono">Paste JSON Alert</label>
                                    <textarea
                                        value={uploadJson}
                                        onChange={(e) => { setUploadJson(e.target.value); setUploadError(null); }}
                                        placeholder={'{\n  "rule": { "level": 10, "description": "..." },\n  "agent": { "name": "workstation-1" }\n}'}
                                        rows={10}
                                        className="w-full bg-black/60 border border-cyan-500/30 rounded-lg px-3 py-2 text-[10px] text-cyan-100 font-mono outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(131,162,212,0.2)] transition-all placeholder:text-cyan-500/20 resize-none custom-scrollbar"
                                    />
                                </div>

                                {/* Error / Success */}
                                {uploadError && (
                                    <p className="text-[9px] font-bold text-rose-400 font-mono tracking-wide">{uploadError}</p>
                                )}
                                {uploadSuccess && (
                                    <p className="text-[9px] font-bold text-emerald-400 font-mono tracking-wide">Alert injected into live stream ✓</p>
                                )}

                                {/* Submit */}
                                <button
                                    onClick={handleUploadSubmit}
                                    disabled={isUploading || !uploadJson.trim()}
                                    className={cn(
                                        "w-full py-2 text-[9px] font-black rounded-lg border uppercase tracking-[0.25em] transition-all font-mono flex items-center justify-center gap-2",
                                        isUploading || !uploadJson.trim()
                                            ? "bg-slate-800/60 border-slate-600/40 text-slate-500 cursor-not-allowed"
                                            : "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/50 shadow-[0_0_20px_rgba(131,162,212,0.15)] hover:shadow-[0_0_30px_rgba(131,162,212,0.25)] active:scale-[0.98]"
                                    )}
                                >
                                    {isUploading ? <><Loader2 size={10} className="animate-spin" /> Injecting...</> : 'Inject into Live Stream'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-none h-[52px] flex items-center justify-between pl-6 pr-4 relative z-20 bg-gradient-to-r from-slate-900/90 via-cyan-950/40 to-slate-900/90 border-b border-cyan-500/20 group rounded-tr-2xl">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"></div>

                <div className="flex items-center gap-4 relative z-10">
                    <div className="relative flex h-3 w-3 items-center justify-center">
                        <div className="relative inline-flex h-1.5 w-1.5 bg-cyan-400 transform rotate-45"></div>
                    </div>
                    <h2 className="text-[13px] font-semibold text-slate-100 uppercase tracking-[0.14em]">
                        LIVE ALERTS
                    </h2>
                </div>

                <div className="relative z-10 flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => setIsFilterModalOpen(!isFilterModalOpen)}
                            className={cn(
                                "text-cyan-500 hover:text-cyan-300 transition-colors p-1 group relative",
                                (activeFilter.searchTerm !== '' || activeFilter.severities.length > 0 || activeFilter.showOnlyAnalyzed || activeFilter.selectedVerdicts.length > 0 || activeFilter.relativeDays !== '' || activeFilter.relativeHours !== '' || activeFilter.relativeMinutes !== '') && "text-cyan-300"
                            )}
                        >
                            <Filter size={14} />
                        </button>
                        {(activeFilter.searchTerm !== '' || activeFilter.severities.length > 0 || activeFilter.showOnlyAnalyzed || activeFilter.selectedVerdicts.length > 0 || activeFilter.relativeDays !== '' || activeFilter.relativeHours !== '' || activeFilter.relativeMinutes !== '') && (
                            <button
                                onClick={() => { setActiveFilter(defaultFilter); setDraftFilter(defaultFilter); }}
                                className="text-red-500/80 hover:text-red-400 transition-colors hover:scale-110 p-0.5"
                                title="Clear Filter"
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                    <div className="text-[11.5px] font-mono text-cyan-200 font-medium pl-3 pr-2 py-1 bg-cyan-950/30 rounded border border-cyan-500/20 backdrop-blur-md flex items-center gap-1.5 ml-2 mr-[-4px]">
                        <span>{filteredAlerts.length.toLocaleString('en-US')} events</span>
                        <div className="tactical-tooltip-trigger">
                            <div className="tactical-tooltip-icon !text-cyan-300 !border-cyan-500 !shadow-[0_0_10px_rgba(103,137,198,0.3)] scale-[0.60]">
                                <svg viewBox="0 0 320 512" className="w-3 h-3 fill-current">
                                    <path d="M80 160c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64v3.6c0 21.8-11.1 42.1-29.4 53.8l-42.2 27.1c-25.2 16.2-40.4 44.1-40.4 74V320c0 17.7 14.3 32 32 32s32-14.3 32-32v-1.4c0-8.2 4.2-15.8 11-20.2l42.2-27.1c36.6-23.6 58.8-64.1 58.8-107.7V160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 17.7 14.3 32 32 32s32-14.3 32-32zm80 320a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"></path>
                                </svg>
                            </div>
                            <div className="tactical-tooltip-content flex flex-col gap-1.5 text-center normal-case tracking-wide">
                                <span className="font-bold text-cyan-100 text-[11px] whitespace-nowrap uppercase">
                                    Monitoring Window : Since {(() => {
                                        if (alerts.length === 0) return 'Discovery';
                                        const timestamps = alerts.map(a => new Date(a.timestamp).getTime());
                                        const minTs = Math.min(...timestamps);
                                        return new Date(minTs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                    })()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isFilterModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-x-0 top-[52px] bottom-0 z-[100] flex items-start justify-center bg-slate-950/60 backdrop-blur-[8px] overflow-hidden"
                    >
                        {/* High-Contrast Scanline Overlay */}
                        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />

                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 350 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-gradient-to-r from-slate-800/70 via-cyan-800/40 to-slate-800/70 backdrop-blur-3xl border-x border-b border-cyan-400/50 rounded-b-2xl shadow-[0_20px_60px_rgba(131,162,212,0.2),inset_0_0_40px_rgba(131,162,212,0.15)] relative overflow-hidden group"
                        >
                            <div className="p-3.5 space-y-3">
                                {/* Matched Theme Header */}
                                <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/30">
                                    <div className="flex items-center gap-2">
                                        <Filter size={11} className="text-cyan-400 animate-pulse" />
                                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.25em] font-mono drop-shadow-[0_0_8px_rgba(131,162,212,0.6)]">
                                            Filter Configuration
                                        </h3>
                                    </div>
                                    <button 
                                        onClick={() => setIsFilterModalOpen(false)}
                                        className="text-slate-400 hover:text-cyan-400 transition-colors p-1"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* Keywords Search */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-cyan-200 uppercase tracking-[0.2em] font-mono opacity-80">Signature Patterns</label>
                                    <div className="relative group/input">
                                        <input
                                            type="text"
                                            placeholder="KEYWORDS..."
                                            value={draftFilter.searchTerm}
                                            onChange={(e) => setDraftFilter({ ...draftFilter, searchTerm: e.target.value })}
                                            className="w-full bg-black/60 border border-cyan-500/40 rounded-lg pl-8 pr-3 py-1.5 text-[10px] text-white font-mono outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(131,162,212,0.3)] transition-all placeholder:text-cyan-500/30 shadow-inner"
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400/60">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Time Filter */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <label className="text-[9px] font-black text-cyan-200 uppercase tracking-[0.2em] font-mono opacity-80">Chronological Window</label>
                                            <span className="text-[7px] text-cyan-500/40 font-mono uppercase tracking-widest">Relative Offset (T-Minus)</span>
                                        </div>
                                        <div className="flex items-center bg-black/40 backdrop-blur-md border border-cyan-500/30 rounded-lg overflow-hidden h-6 px-1 shadow-[inset_0_0_10px_rgba(0,0,0,0.4)]">
                                            {[
                                                { k: 'd', label: 'D' },
                                                { k: 'h', label: 'H' },
                                                { k: 'm', label: 'M' }
                                            ].map((unit, i, arr) => (
                                                <React.Fragment key={unit.k}>
                                                    <div className="flex items-center justify-center gap-1 px-1.5 group/unit transition-all h-full">
                                                        <input
                                                            type="text"
                                                            placeholder="00"
                                                            value={unit.k === 'd' ? draftFilter.relativeDays : unit.k === 'h' ? draftFilter.relativeHours : draftFilter.relativeMinutes}
                                                            onChange={(e) => { handleRelativeTimeChange(unit.k as 'd' | 'h' | 'm', e.target.value); setSelectedPreset(null); }}
                                                            className="w-5 bg-transparent text-[10px] text-white font-mono font-bold text-center outline-none placeholder:text-cyan-500/10 focus:text-cyan-400 transition-colors"
                                                        />
                                                        <span className="text-[8px] font-black text-cyan-400/30 font-mono uppercase group-focus-within/unit:text-cyan-400/60 transition-colors">
                                                            {unit.label}
                                                        </span>
                                                    </div>
                                                    {i < arr.length - 1 && <div className="w-[1px] h-3 bg-cyan-500/10 shrink-0" />}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Quick Presets */}
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { label: '1 HR', d: '0', h: '1', m: '0' },
                                            { label: '6 HR', d: '0', h: '6', m: '0' },
                                            { label: '24 HR', d: '1', h: '0', m: '0' },
                                            { label: '7 D', d: '7', h: '0', m: '0' }
                                        ].map(preset => {
                                            const isActive = selectedPreset === preset.label;
                                            return (
                                                <button
                                                    key={preset.label}
                                                    onClick={() => {
                                                        if (selectedPreset === preset.label) {
                                                            setSelectedPreset(null);
                                                            setDraftFilter({ ...draftFilter, relativeDays: '', relativeHours: '', relativeMinutes: '', startDate: '', endDate: '' });
                                                        } else {
                                                            handleRelativeTimeChange('full', { d: preset.d, h: preset.h, m: preset.m });
                                                            setSelectedPreset(preset.label);
                                                        }
                                                    }}
                                                    className={cn(
                                                        "relative py-1.5 rounded-lg text-[9px] font-bold font-mono tracking-widest overflow-hidden transition-all duration-150 active:scale-95",
                                                        isActive
                                                            ? "bg-cyan-500/20 border border-cyan-400/70 text-cyan-300 shadow-[0_0_14px_rgba(131,162,212,0.2),inset_0_1px_0_rgba(131,162,212,0.2)]"
                                                            : "bg-cyan-500/8 border border-cyan-500/25 text-cyan-400/70 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_12px_rgba(131,162,212,0.15)]"
                                                    )}
                                                >
                                                    <span className="relative z-10">{preset.label}</span>
                                                    {isActive && <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/10 to-transparent" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 ml-1">
                                                <div className="w-1 h-1 rounded-full bg-cyan-500/40" />
                                                <span className="text-[8px] font-black text-cyan-200/40 uppercase tracking-[0.15em]">Start Date</span>
                                            </div>
                                            <input
                                                type="datetime-local"
                                                value={draftFilter.startDate || ''}
                                                onChange={(e) => { setDraftFilter({ ...draftFilter, startDate: e.target.value, relativeDays: '', relativeHours: '', relativeMinutes: '' }); setSelectedPreset(null); }}
                                                className="w-full bg-black/40 border border-cyan-500/20 rounded-md px-2 py-1 text-[10px] text-cyan-100 font-mono outline-none focus:border-cyan-400/40 focus:bg-cyan-950/20 transition-all [color-scheme:dark] shadow-inner"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 ml-1">
                                                <div className="w-1 h-1 rounded-full bg-rose-500/40" />
                                                <span className="text-[8px] font-black text-cyan-200/40 uppercase tracking-[0.15em]">End Date</span>
                                            </div>
                                            <input
                                                type="datetime-local"
                                                value={draftFilter.endDate || ''}
                                                onChange={(e) => { setDraftFilter({ ...draftFilter, endDate: e.target.value, relativeDays: '', relativeHours: '', relativeMinutes: '' }); setSelectedPreset(null); }}
                                                className="w-full bg-black/40 border border-cyan-500/20 rounded-md px-2 py-1 text-[10px] text-cyan-100 font-mono outline-none focus:border-cyan-400/40 focus:bg-cyan-950/20 transition-all [color-scheme:dark] shadow-inner"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Severity Filter */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-cyan-200 uppercase tracking-[0.2em] font-mono opacity-80">Alert Severity</label>
                                    <div className="grid grid-cols-5 gap-1 p-1 bg-black/40 rounded-lg border border-cyan-500/40 shadow-inner">
                                        {[
                                            { l: 1, n: 'INFO', r: '0 - 3', c: 'text-cyan-400', active: 'bg-cyan-500/40 border-cyan-300 text-white shadow-[0_0_12px_rgba(103,137,198,0.4)]', base: 'bg-cyan-500/5 border-cyan-500/20' },
                                            { l: 2, n: 'LOW', r: '4 - 6', c: 'text-yellow-400', active: 'bg-yellow-500/40 border-yellow-300 text-white shadow-[0_0_12px_rgba(234,179,8,0.4)]', base: 'bg-yellow-500/5 border-yellow-500/20' },
                                            { l: 3, n: 'MED', r: '7 - 9', c: 'text-orange-400', active: 'bg-orange-500/40 border-orange-300 text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]', base: 'bg-orange-500/5 border-orange-500/20' },
                                            { l: 4, n: 'HIGH', r: '10 - 12', c: 'text-rose-400', active: 'bg-rose-500/40 border-rose-300 text-white shadow-[0_0_12px_rgba(244,63,94,0.4)]', base: 'bg-rose-500/5 border-rose-500/20' },
                                            { l: 5, n: 'CRIT', r: '13+', c: 'text-purple-400', active: 'bg-purple-500/40 border-purple-300 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]', base: 'bg-purple-500/5 border-purple-500/20' }
                                        ].map(sev => (
                                            <button
                                                key={sev.l}
                                                onClick={() => {
                                                    const newSevs = draftFilter.severities.includes(sev.l)
                                                        ? draftFilter.severities.filter(s => s !== sev.l)
                                                        : [...draftFilter.severities, sev.l];
                                                    setDraftFilter({ ...draftFilter, severities: newSevs });
                                                }}
                                                className={cn(
                                                    "h-7 rounded-md border text-[9px] font-black transition-all duration-200 flex flex-col items-center justify-center font-mono relative active:scale-95 group/sev overflow-hidden",
                                                    draftFilter.severities.includes(sev.l) 
                                                        ? sev.active 
                                                        : cn(sev.base, sev.c, "hover:bg-white/5 hover:border-white/20")
                                                )}
                                            >
                                                <span className="transition-transform duration-200 group-hover/sev:-translate-y-[150%]">{sev.n}</span>
                                                <span className="absolute transition-transform duration-200 translate-y-[150%] group-hover/sev:translate-y-0 text-[10px] tracking-widest">{sev.r}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Logic Options (AI Analysis) */}
                                <div className="space-y-1.5 pt-2 border-t border-cyan-500/30">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(131,162,212,1)] animate-pulse" />
                                            <span className="text-[9px] font-black text-cyan-200 uppercase tracking-[0.2em] font-mono">AI-ANALYZED ONLY</span>
                                        </div>
                                        <button
                                            onClick={() => setDraftFilter({ ...draftFilter, showOnlyAnalyzed: !draftFilter.showOnlyAnalyzed })}
                                            className={cn(
                                                "w-9 h-5 rounded-full relative transition-all duration-300 border p-0.5",
                                                draftFilter.showOnlyAnalyzed ? "bg-cyan-500/30 border-cyan-400 shadow-[0_0_12px_rgba(131,162,212,0.3)]" : "bg-black/40 border-cyan-500/30"
                                            )}
                                        >
                                            <motion.div 
                                                animate={{ x: draftFilter.showOnlyAnalyzed ? 16 : 0 }}
                                                className={cn("w-3.5 h-3.5 rounded-full shadow-lg transition-colors", draftFilter.showOnlyAnalyzed ? "bg-cyan-300" : "bg-slate-600")}
                                            />
                                        </button>
                                    </div>

                                    {/* Verdict Options */}
                                    <AnimatePresence>
                                        {draftFilter.showOnlyAnalyzed && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0, y: -10 }} 
                                                animate={{ opacity: 1, height: 'auto', y: 0 }} 
                                                exit={{ opacity: 0, height: 0, y: -10 }}
                                                className="grid grid-cols-2 gap-1.5 overflow-hidden items-start mt-1"
                                            >
                                                {[
                                                    { v: 'Malicious', label: 'malicious', bg: 'bg-red-500/20 border-red-500/60 text-red-100 shadow-[0_0_12px_rgba(239,68,68,0.2)]' },
                                                    { v: 'Suspicious', label: 'suspicious', bg: 'bg-orange-500/20 border-orange-500/60 text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.2)]' },
                                                    { v: 'False Positive', label: 'false positive', bg: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.2)]' },
                                                    { v: 'Failed', label: 'failed', bg: 'bg-amber-500/20 border-amber-500/60 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.2)]' },
                                                    { v: 'Pending', label: 'pending', bg: 'bg-cyan-500/20 border-cyan-500/60 text-cyan-100 shadow-[0_0_12px_rgba(103,137,198,0.2)]' }
                                                ].map(verdict => (
                                                    <button
                                                        key={verdict.v}
                                                        onClick={() => {
                                                            const newV = draftFilter.selectedVerdicts.includes(verdict.label)
                                                                ? draftFilter.selectedVerdicts.filter(item => item !== verdict.label)
                                                                 : [...draftFilter.selectedVerdicts, verdict.label];
                                                            setDraftFilter({ ...draftFilter, selectedVerdicts: newV });
                                                        }}
                                                        className={cn(
                                                            "py-1.5 rounded-lg border text-[9px] font-black uppercase transition-all duration-200 font-mono relative",
                                                            draftFilter.selectedVerdicts.includes(verdict.label) 
                                                                ? verdict.bg 
                                                                : "bg-black/40 border-cyan-500/20 text-cyan-600 hover:border-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40"
                                                        )}
                                                    >
                                                        {verdict.v}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Footer Actions */}
                                <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-cyan-500/20">
                                   <button
                                       onClick={() => { setActiveFilter(draftFilter); setIsFilterModalOpen(false); }}
                                       className="w-full py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-black rounded-lg border border-cyan-500/50 uppercase tracking-[0.25em] transition-all duration-300 shadow-[0_0_20px_rgba(131,162,212,0.15)] hover:shadow-[0_0_30px_rgba(131,162,212,0.25)] active:scale-[0.98] font-mono text-center"
                                   >
                                       APPLY
                                   </button>
                                   
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TACTICAL NAVIGATION MARKER TRACK */}
            <div
                className="absolute left-0 top-[52px] bottom-0 w-[14px] z-[100] cursor-ns-resize"
                onMouseDown={handleMarkerDrag}
            >
                <motion.div
                    className="absolute left-[-8px] cursor-ns-resize z-[101]"
                    style={{ top: `${scrollRatio * 98}%` }}
                    animate={{ scale: isDragging ? 1.25 : 1, x: isDragging ? 1 : 0 }}
                >
                    <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[12px] border-l-cyan-400" />
                    {isDragging && (
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950/90 border border-cyan-400/50 rounded text-cyan-400 text-[10px] font-black font-mono shadow-[0_0_15px_rgba(103,137,198,0.3)] backdrop-blur-md z-50 tracking-tighter uppercase whitespace-nowrap">
                            {Math.round(scrollRatio * 100)}%
                        </div>
                    )}
                </motion.div>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative cyber-scrollbar rounded-br-2xl"
            >
                {/* VIRTUALIZED SCROLL CONTENT */}
                <div style={{ height: `${totalScrollHeight}px`, width: '100%', position: 'relative' }}>
                    {(() => {
                        // Virtualization Logic: Calculate which items are visible using offsets
                        const CONTAINER_HEIGHT = scrollRef.current?.clientHeight || 800;
                        
                        // Simple linear search for starters (binary search is safer for large lists)
                        let startIndex = 0;
                        while (startIndex < cardOffsets.length && cardOffsets[startIndex] < scrollTopState - 400) {
                            startIndex++;
                        }
                        
                        let endIndex = startIndex;
                        while (endIndex < cardOffsets.length && cardOffsets[endIndex] < scrollTopState + CONTAINER_HEIGHT + 400) {
                            endIndex++;
                        }
                        
                        return filteredAlerts.slice(startIndex, endIndex).map((alert, i) => {
                            const index = startIndex + i;
                            return (
                                <div 
                                    key={alert.id}
                                    style={{ 
                                        position: 'absolute', 
                                        top: 0, 
                                        left: 0, 
                                        width: '100%', 
                                        height: `${cardHeights[index]}px`,
                                        transform: `translateY(${cardOffsets[index]}px)` 
                                    }}
                                >
                                    <AlertItem 
                                        alert={alert}
                                        isSelected={selectedAlertId === alert.id}
                                        onSelect={onSelectAlert}
                                        getSeverityDetails={getSeverityDetails}
                                        event={events[alert.id] || null}
                                        _tick={_tick}
                                    />
                                </div>
                            );
                        });
                    })()}
                </div>

                {filteredAlerts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                        {/* Empty state cleared as per request */}
                    </div>
                )}
            </div>
        </div>
    );
};
