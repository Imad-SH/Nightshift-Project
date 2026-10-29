import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../hooks/useSocket';
import { useSocAuth } from '../contexts/AuthContext';
import { cn } from './DashboardLayout';
import { 
    Info,
    ChevronLeft,
    ChevronRight,
    Maximize2
} from 'lucide-react';

import { startOfDay, startOfMonth, endOfMonth, addMonths, format } from 'date-fns';
import { MitreMatrix } from './MitreMatrix';
import { TimeFilterControl } from './TimeFilterControl';
import { apiBase } from '../config';

const MITRE_TACTICS = [
    'Reconnaissance',
    'Resource Development',
    'Initial Access',
    'Execution',
    'Persistence',
    'Privilege Escalation',
    'Defense Evasion',
    'Credential Access',
    'Discovery',
    'Lateral Movement',
    'Collection',
    'Command and Control',
    'Exfiltration',
    'Impact'
];

const MITREBarChart = ({ timeframe, startDate, endDate, monthlyNavigator }: any) => {
    const { token } = useSocAuth();
    const [stats, setStats] = useState<{ tactic: string; count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    // Tactics of the ATT&CK version the backend uses (kept up to date with MITRE); the list
    // above is only the fallback when it cannot be loaded
    const [tactics, setTactics] = useState<string[]>(MITRE_TACTICS);

    useEffect(() => {
        if (!token) return;
        fetch(`${apiBase()}/api/mitre/tactics`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => (r.ok ? r.json() : []))
            .then((list: { name: string }[]) => { if (Array.isArray(list) && list.length) setTactics(list.map(t => t.name)); })
            .catch(() => {});
    }, [token]);

    // One bar per tactic, in MITRE's order; tactic names outside it still show when they have alerts
    const data = useMemo(() => {
        const extra = stats.filter(s => s.count > 0 && !tactics.includes(s.tactic)).map(s => s.tactic);
        return [...tactics, ...extra].map(t => ({ tactic: t, count: stats.find(s => s.tactic === t)?.count || 0 }));
    }, [stats, tactics]);

    useEffect(() => {
        const fetchStats = async () => {
            if (!token) return;
            try {
                const baseUrl = apiBase();
                let url = `${baseUrl}/api/alerts/stats/mitre?timeframe=${timeframe}`;
                
                if (timeframe === 'THIS_MONTH' && monthlyNavigator) {
                    const monthStart = startOfMonth(monthlyNavigator);
                    const monthEnd = endOfMonth(monthlyNavigator);
                    url = `${baseUrl}/api/alerts/stats/mitre?start_date=${monthStart.toISOString()}&end_date=${monthEnd.toISOString()}`;
                } else if (timeframe === 'CUSTOM' && startDate && endDate) {
                    try {
                        const sDate = new Date(startDate);
                        const eDate = new Date(endDate);
                        if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                            url += `&start_date=${sDate.toISOString()}&end_date=${eDate.toISOString()}`;
                        }
                    } catch (e) {
                        console.error("Invalid custom date range", e);
                    }
                }
                const resp = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await resp.json();
                setStats(Array.isArray(result) ? result : []);
            } catch (err) {
                console.error("Error fetching MITRE stats:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [timeframe, startDate, endDate, monthlyNavigator, token]);

    if (loading) return <div className="h-[260px] flex items-center justify-center font-mono text-[10px] text-cyan-500 uppercase tracking-widest animate-pulse">Mapping Tactics...</div>;

    const maxCount = Math.max(...data.map(d => d.count), 1);

    return (
        <div className="w-full flex items-stretch gap-1 mt-4 pl-6 h-[270px] xl:h-[310px]">
            {data.map((item, i) => {
                const height = item.count > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                    <div key={item.tactic} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex-1 flex items-end justify-center border-b border-white/10 relative group pt-6">
                            <motion.div 
                                initial={{ height: 0 }}
                                animate={{ height: `${height}%` }}
                                transition={{ duration: 1, delay: i * 0.02 }}
                                className={cn(
                                    "w-[90%] rounded-t-[4px] transition-all duration-300 group-hover:brightness-125 relative",
                                    item.count > 0 
                                        ? "bg-gradient-to-t from-cyan-600/80 to-cyan-400 shadow-[0_0_10px_rgba(101,158,232,0.2)]" 
                                        : "bg-transparent"
                                )}
                            >
                                 {item.count > 0 && (
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[8px] font-mono font-black text-cyan-400 whitespace-nowrap bg-slate-900/90 px-1.5 py-0.5 rounded-sm border border-cyan-500/30 z-10 shadow-[0_0_10px_rgba(101,158,232,0.15)] flex flex-col items-center justify-center">
                                        <span>{item.count}</span>
                                        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-[1px] h-2.5 bg-cyan-500/40" />
                                    </div>
                                 )}
                            </motion.div>
                        </div>
                        <div className="w-full relative h-[100px] xl:h-[120px] mt-3 shrink-0">
                            <div className="absolute top-0 right-1/2 -translate-x-1.5 text-[6.5px] xl:text-[7.5px] font-mono font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(101,158,232,0.4)] uppercase tracking-[0.2em] pointer-events-none whitespace-nowrap origin-top-right -rotate-[60deg]">
                                {item.tactic}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


const SeverityDonutChart = ({ alerts, timeFilter, monthlyNavigator, startDate, endDate }: any) => {
    const { token } = useSocAuth();
    const [serverStats, setServerStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!token) return;
            
            try {
                const baseUrl = apiBase();
                let url = `${baseUrl}/api/alerts/stats/severity?timeframe=${timeFilter}`;
                
                // Monthly Navigation Logic: If we are in 'MONTH' view, use the monthlyNavigator state to build a range
                if (timeFilter === 'THIS_MONTH') {
                    const monthStart = startOfMonth(monthlyNavigator);
                    const monthEnd = endOfMonth(monthlyNavigator);
                    url = `${baseUrl}/api/alerts/stats/severity?start_date=${monthStart.toISOString()}&end_date=${monthEnd.toISOString()}`;
                } else if (timeFilter === 'CUSTOM' && startDate && endDate) {
                    try {
                        const sDate = new Date(startDate);
                        const eDate = new Date(endDate);
                        if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                            url += `&start_date=${sDate.toISOString()}&end_date=${eDate.toISOString()}`;
                        }
                    } catch (e) {
                        console.error("Invalid custom date range", e);
                    }
                }
                const resp = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await resp.json();
                setServerStats(data);
            } catch (err) {
                console.error("Error fetching severity stats:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [timeFilter, startDate, endDate, alerts.length, token, monthlyNavigator]);

    const severityStats = useMemo(() => {
        if (!serverStats) return { total: 0, data: [] };
        
        return {
            total: serverStats.total,
            data: [
                { id: 'critical', label: 'Critical (13+)', count: serverStats.critical, color: '#c084fc', fillClass: 'fill-purple-500', bgClass: 'bg-purple-500' },
                { id: 'high', label: 'High (10-12)', count: serverStats.high, color: '#fb7185', fillClass: 'fill-rose-500', bgClass: 'bg-rose-500' },
                { id: 'medium', label: 'Medium (7-9)', count: serverStats.medium, color: '#f97316', fillClass: 'fill-orange-500', bgClass: 'bg-orange-500' },
                { id: 'low', label: 'Low (4-6)', count: serverStats.low, color: '#eab308', fillClass: 'fill-yellow-500', bgClass: 'bg-yellow-500' },
                { id: 'info', label: 'Info (0-3)', count: serverStats.info, color: '#659ee8', fillClass: 'fill-cyan-400', bgClass: 'bg-cyan-400' }
            ]
        };
    }, [serverStats]);

    const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

    let currentAngle = 0;
    const radius = 129;
    const innerRadius = 94;
    const center = 150;
    
    return (
        <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-mono font-black text-white uppercase tracking-[0.3em] flex items-center gap-3">
                            Severity Distribution
                        </h3>
                        <p className="text-[9px] text-slate-500 font-mono mt-1 tracking-widest uppercase">Current Alerts By Severity</p>
                    </div>
                </div>






            <div className="flex-1 relative min-h-[260px] w-full text-white">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-cyan-500 uppercase tracking-widest animate-pulse">Syncing Database...</div>
                ) : severityStats.total === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate-500 uppercase tracking-widest">No Alerts in Period</div>
                ) : (
                    <>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pr-32">
                            <div className="relative w-[304px] h-[304px] flex-shrink-0 pointer-events-auto">
                                {/* Dynamic Hover Count directly above the circle wheel */}
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none h-6 flex items-center justify-center whitespace-nowrap z-50">
                                    <AnimatePresence mode="wait">
                                        {hoveredSlice && (
                                            severityStats.data.filter((d:any) => d.id === hoveredSlice).map((slice:any) => (
                                                <motion.div 
                                                    key={slice.id} 
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="text-[13.5px] font-mono font-black uppercase tracking-[0.25em] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]"
                                                    style={{ color: slice.color }}
                                                >
                                                    {slice.count} {slice.count === 1 ? 'Alert' : 'Alerts'}
                                                </motion.div>
                                            ))
                                        )}
                                    </AnimatePresence>
                                </div>

                                <svg viewBox="0 0 300 300" className="w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(0,0,0,0.4)]">
                                {severityStats.data.filter((d:any) => d.count > 0).map((slice: any) => {
                                    const slicePercentage = slice.count / severityStats.total;
                                    const angle = slicePercentage * Math.PI * 2;
                                    
                                    if (slicePercentage === 1) {
                                        return (
                                            <circle
                                                key={slice.id}
                                                cx={center}
                                                cy={center}
                                                r={radius - (radius - innerRadius) / 2}
                                                fill="transparent"
                                                stroke={slice.color}
                                                strokeWidth={radius - innerRadius}
                                                className={`transition-all duration-300 cursor-pointer ${hoveredSlice && hoveredSlice !== slice.id ? 'opacity-30' : 'opacity-90 hover:opacity-100 outline-none'}`}
                                                onMouseEnter={() => setHoveredSlice(slice.id)}
                                                onMouseLeave={() => setHoveredSlice(null)}
                                            />
                                        )
                                    }

                                    const x1 = center + radius * Math.cos(currentAngle);
                                    const y1 = center + radius * Math.sin(currentAngle);
                                    const nextAngle = currentAngle + angle;
                                    const x2 = center + radius * Math.cos(nextAngle);
                                    const y2 = center + radius * Math.sin(nextAngle);
                                    
                                    const ix1 = center + innerRadius * Math.cos(currentAngle);
                                    const iy1 = center + innerRadius * Math.sin(currentAngle);
                                    const ix2 = center + innerRadius * Math.cos(nextAngle);
                                    const iy2 = center + innerRadius * Math.sin(nextAngle);
                                    
                                    const largeArcFlag = slicePercentage > 0.5 ? 1 : 0;
                                    const pathData = [
                                        `M ${x1} ${y1}`, `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                                        `L ${ix2} ${iy2}`, `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix1} ${iy1}`, 'Z'
                                    ].join(' ');

                                    const isHovered = hoveredSlice === slice.id;
                                    const transformAngle = currentAngle + angle / 2;
                                    const mx = Math.cos(transformAngle) * 4;
                                    const my = Math.sin(transformAngle) * 4;

                                    const path = (
                                        <motion.path
                                            key={slice.id}
                                            d={pathData}
                                            fill={slice.color}
                                            className={`transition-all duration-300 cursor-pointer outline-none ${hoveredSlice && !isHovered ? 'opacity-30' : 'opacity-100 hover:brightness-110'}`}
                                            animate={{ x: isHovered ? mx : 0, y: isHovered ? my : 0 }}
                                            onMouseEnter={() => setHoveredSlice(slice.id)}
                                            onMouseLeave={() => setHoveredSlice(null)}
                                        />
                                    );
                                    
                                    currentAngle = nextAngle;
                                    return path;
                                })}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none drop-shadow-md">
                                <AnimatePresence mode="wait">
                                    {hoveredSlice ? (
                                        severityStats.data.filter((d:any) => d.id === hoveredSlice).map((slice:any) => (
                                             <motion.div key={slice.id} initial={{ scale: 0.8, opacity: 0}} animate={{ scale: 1, opacity: 1}} exit={{ scale: 0.8, opacity: 0}} transition={{ duration: 0.15 }} className="flex flex-col items-center min-w-[90px]">
                                                <span className="text-[30px] font-mono font-black text-white leading-none">
                                                    {((slice.count / severityStats.total) * 100).toFixed(1)}%
                                                </span>
                                                 <span className="text-[8px] font-mono text-slate-400 tracking-[0.2em] uppercase mt-2 text-center w-32 leading-tight">{slice.label}</span>
                                            </motion.div>
                                        ))
                                    ) : (
                                        <motion.div key="total" initial={{ scale: 0.8, opacity: 0}} animate={{ scale: 1, opacity: 1}} exit={{ scale: 0.8, opacity: 0}} transition={{ duration: 0.15 }} className="flex flex-col items-center min-w-[90px]">
                                                <span className="text-[30px] font-mono font-black text-slate-200 leading-none">{severityStats.total}</span>
                                                <span className="text-[8.5px] font-mono text-slate-300 tracking-[0.3em] uppercase mt-1.5">TOTAL INCIDENTS</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                        
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-3 justify-center z-10 pointer-events-auto">
                            {severityStats.data.map((slice:any) => {
                                const isHovered = hoveredSlice === slice.id;
                                const isFaded = hoveredSlice && !isHovered;
                                
                                return (
                                    <div 
                                        key={slice.id}
                                        className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-300 cursor-pointer min-w-[130px] border border-transparent ${isHovered ? 'bg-slate-800/50 border-white/5 shadow-inner' : ''} ${isFaded ? 'opacity-30' : 'opacity-100'}`}
                                        onMouseEnter={() => setHoveredSlice(slice.id)}
                                        onMouseLeave={() => setHoveredSlice(null)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full ${slice.bgClass}`} style={{ boxShadow: `0 0 8px ${slice.color}60` }} />
                                            <div>
                                                <div className="text-[10px] font-mono font-bold text-slate-200 uppercase tracking-widest">{slice.label.split(' ')[0]}</div>
                                                <div className="text-[8.5px] font-mono text-slate-300 mt-0.5">{slice.count} Events</div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};


const StatCard = ({ label, value, sub, color, tooltip, isLoading }: any) => (
    <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group/card h-full hover:z-[100]"
    >
        <div className="absolute -inset-1 bg-cyan-500/5 rounded-[20px] blur-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-700" />
        <div className="relative h-full bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-[12px] border border-cyan-500/30 rounded-[20px] p-3.5 flex flex-col justify-between shadow-[0_15px_35px_-12px_rgba(0,0,0,0.4)] transition-all duration-500 group-hover/card:border-cyan-400/50">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-mono font-black text-slate-300 uppercase tracking-[0.3em]">{label}</span>
                <div className="relative group/tooltip flex items-center justify-center">
                    <Info size={14} className="text-slate-500 cursor-help transition-all duration-300 group-hover/tooltip:text-cyan-400 group-hover/tooltip:drop-shadow-[0_0_10px_rgba(101,158,232,0.8)]" />
                    
                    <div className="absolute top-full right-[-4px] mt-3 w-56 opacity-0 group-hover/tooltip:opacity-100 -translate-y-2 group-hover/tooltip:translate-y-0 pointer-events-none transition-all duration-300 z-50">
                        <div className="bg-slate-900 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(101,158,232,0.2)] p-3.5 text-[9.5px] font-mono text-cyan-50 leading-relaxed text-left relative">
                            <div className="absolute -top-1.5 right-[9px] w-3 h-3 bg-slate-900 border-t border-l border-cyan-500/50 rotate-45 rounded-[1px]" />
                            <div className="relative z-10">{tooltip}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div>
                {isLoading ? (
                    <div className="h-6 w-24 bg-slate-700/50 rounded animate-pulse mt-1 mb-1" />
                ) : (
                    <h4 className={cn("text-xl 2xl:text-2xl font-mono font-black tracking-tighter drop-shadow-[0_0_12px_rgba(101,158,232,0.3)] leading-tight line-clamp-2", color === 'text-cyan-400' ? 'text-white' : color)}>{value}</h4>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-[1px] w-3 bg-cyan-500/30" />
                    <p className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">{sub}</p>
                </div>
            </div>
        </div>
    </motion.div>
);




export const SOCStatistics: React.FC = () => {
    const { alerts } = useSocket();
    // REMOVED activeView state as we only have STATISTICS now
    
    // Global Time State
    const [timeFilter, setTimeFilter] = useState<'TODAY' | 'THIS_MONTH' | 'ALL' | 'CUSTOM'>('TODAY');
    const [customRange, setCustomRange] = useState({ 
        start: startOfDay(new Date()).toISOString().slice(0, 16), 
        end: new Date().toISOString().slice(0, 16) 
    });
    const [relativeTime, setRelativeTime] = useState({ d: '', h: '', m: '' });
    const [monthlyNavigator, setMonthlyNavigator] = useState(new Date());
    const [serverKpis, setServerKpis] = useState<any>(null);
    const [loadingKpis, setLoadingKpis] = useState(false);
    const { token } = useSocAuth();
    const matrixSectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchKpis = async () => {
            if (!token) return;
            setLoadingKpis(true);
            try {
                const baseUrl = apiBase();
                let url = `${baseUrl}/api/alerts/stats/kpis?timeframe=${timeFilter}`;
                
                if (timeFilter === 'THIS_MONTH') {
                    const monthStart = startOfMonth(monthlyNavigator);
                    const monthEnd = endOfMonth(monthlyNavigator);
                    url = `${baseUrl}/api/alerts/stats/kpis?start_date=${monthStart.toISOString()}&end_date=${monthEnd.toISOString()}`;
                } else if (timeFilter === 'CUSTOM' && customRange.start && customRange.end) {
                    try {
                        const sDate = new Date(customRange.start);
                        const eDate = new Date(customRange.end);
                        if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                            url += `&start_date=${sDate.toISOString()}&end_date=${eDate.toISOString()}`;
                        }
                    } catch (e) {
                        console.error("Invalid custom date range", e);
                    }
                }
                const resp = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await resp.json();
                setServerKpis(data);
            } catch (err) {
                console.error("Error fetching KPI stats:", err);
            } finally {
                setLoadingKpis(false);
            }
        };
        fetchKpis();
    }, [timeFilter, monthlyNavigator, customRange, token]);

    // Sync sub-tab from parent (breadcrumbs)

    // REMOVED sub-tab syncing as we only have STATISTICS now

    // REMOVED handleViewChange as we only have STATISTICS now

    // Global Filtered Alerts Array
    const filteredAlerts = useMemo(() => {
        const now = new Date();
        const startOfTodayDt = startOfDay(now).getTime();
        
        return alerts.filter(a => {
            if (timeFilter === 'ALL') return true;
            
            const aTime = new Date(a.timestamp).getTime();
            
            if (timeFilter === 'TODAY') {
                return aTime >= startOfTodayDt;
            }
            
            if (timeFilter === 'THIS_MONTH') {
                const monthStart = startOfMonth(monthlyNavigator).getTime();
                const monthEnd = endOfMonth(monthlyNavigator).getTime();
                return aTime >= monthStart && aTime <= monthEnd;
            }
            
            if (timeFilter === 'CUSTOM' && customRange.start && customRange.end) {
                const customStart = new Date(customRange.start).getTime();
                const customEnd = new Date(customRange.end).getTime();
                return aTime >= customStart && aTime <= customEnd;
            }
            
            return true;
        });
    }, [alerts, timeFilter, customRange, monthlyNavigator]);





    return (
        <div className="h-full w-full relative overflow-hidden flex flex-col">
            <motion.div 
                key="stats"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 overflow-y-auto custom-scrollbar snap-y snap-mandatory scroll-smooth"
            >
                {/* SECTION 1: Standard Dashboard View */}
                        <section className="h-full min-h-full snap-start flex flex-col gap-4 p-5">
                            <div className="flex items-center justify-between mb-2 relative z-[70] shrink-0">
                            <div className="flex items-center gap-3 py-1">
                                <h1 className="text-[16px] font-outfit font-black text-white uppercase tracking-[0.2em]">
                                    Statistics Overview
                                </h1>
                            </div>

                            {/* GLOBAL MONTH NAVIGATOR (Locked to horizontal center) */}
                            <AnimatePresence>
                                {timeFilter === 'THIS_MONTH' && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.9, x: '-50%', y: -5 }}
                                        animate={{ opacity: 1, scale: 1, x: '-50%', y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, x: '-50%', y: -5 }}
                                        className="absolute left-1/2 flex items-center gap-8 z-50 pointer-events-auto"
                                    >
                                        <button 
                                            onClick={() => setMonthlyNavigator(prev => addMonths(prev, -1))}
                                            className="text-cyan-600/60 hover:text-cyan-400 transition-all hover:scale-125 active:scale-95"
                                        >
                                            <ChevronLeft size={18} strokeWidth={3} />
                                        </button>
                                        
                                        <div className="flex flex-col items-center min-w-[124px]">
                                            <span className="text-[13px] font-mono font-black text-white uppercase tracking-[0.4em] drop-shadow-[0_0_10px_rgba(101,158,232,0.3)]">
                                                {format(monthlyNavigator, 'MMMM')}
                                            </span>
                                            <span className="text-[8px] font-mono font-bold text-cyan-500/50 uppercase tracking-[0.2em] mt-0.5">
                                                {format(monthlyNavigator, 'yyyy')}
                                            </span>
                                        </div>

                                        <button 
                                            onClick={() => setMonthlyNavigator(prev => addMonths(prev, 1))}
                                            disabled={monthlyNavigator >= startOfMonth(new Date())}
                                            className="text-cyan-600/60 hover:text-cyan-400 transition-all hover:scale-125 active:scale-95 disabled:opacity-0 disabled:pointer-events-none"
                                        >
                                            <ChevronRight size={18} strokeWidth={3} />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex items-center gap-4 ml-auto">
                                {/* RELATIVE TIME INPUTS (VISIBLE) */}
                                <div className="flex items-center bg-cyan-950/20 backdrop-blur-md border border-cyan-500/20 rounded-xl overflow-hidden h-7 px-0.5 shadow-inner">
                                    {[
                                        { k: 'd', label: 'DAYS' },
                                        { k: 'h', label: 'HRS' },
                                        { k: 'm', label: 'MIN' }
                                    ].map((unit, i, arr) => (
                                        <React.Fragment key={unit.k}>
                                            <div className="flex items-center justify-center gap-1 px-2 group/unit hover:bg-cyan-400/5 transition-all h-full">
                                                <input
                                                    type="text"
                                                    placeholder="0"
                                                    value={relativeTime[unit.k as keyof typeof relativeTime]}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const newRel = { ...relativeTime, [unit.k]: val };
                                                        setRelativeTime(newRel);

                                                        const d = parseInt(newRel.d || '0') || 0;
                                                        const h = parseInt(newRel.h || '0') || 0;
                                                        const m = parseInt(newRel.m || '0') || 0;

                                                        if (d > 0 || h > 0 || m > 0) {
                                                            const now = new Date();
                                                            const start = new Date(now);
                                                            start.setDate(start.getDate() - d);
                                                            start.setHours(start.getHours() - h);
                                                            start.setMinutes(start.getMinutes() - m);
                                                            
                                                            const getLocalISO = (date: Date) => {
                                                                const offset = date.getTimezoneOffset() * 60000;
                                                                return new Date(date.getTime() - offset).toISOString().slice(0, 16);
                                                            };

                                                            setCustomRange({
                                                                start: getLocalISO(start),
                                                                end: getLocalISO(now)
                                                            });
                                                            if (timeFilter !== 'CUSTOM') {
                                                                setTimeFilter('CUSTOM');
                                                            }
                                                        }
                                                    }}
                                                    className="w-6 bg-transparent text-[10px] text-white font-mono text-center outline-none placeholder:text-cyan-500/20 group-focus-within/unit:scale-110 transition-transform"
                                                />
                                                <span className="text-[7.5px] font-black text-cyan-400/40 font-mono uppercase tracking-tighter group-focus-within/unit:text-cyan-400 transition-colors">
                                                    {unit.label}
                                                </span>
                                            </div>
                                            {i < arr.length - 1 && <div className="w-[1px] h-3 bg-cyan-500/10 shrink-0" />}
                                        </React.Fragment>
                                    ))}
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

                        {/* TOP KPI ROW */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                            <StatCard 
                                label={timeFilter === 'TODAY' ? "Active Investigations" : "Total AI Analysis"}
                                value={timeFilter === 'TODAY' ? (serverKpis?.investigating ?? 0) : (serverKpis?.total_analyzed ?? 0)} 
                                sub={timeFilter === 'TODAY' ? "CURRENT PIPELINE LOAD" : "CUMULATIVE PROCESSED"}
                                color="text-cyan-400" 
                                tooltip={timeFilter === 'TODAY' 
                                    ? "Total alerts pending AI triage or verification in the active pipeline over the selected period." 
                                    : "Total number of alerts that have undergone AI forensic analysis over the selected period."}
                                isLoading={loadingKpis}
                            />
                            <StatCard 
                                label="Critical Threats" 
                                value={serverKpis?.critical ?? 0} 
                                sub="HIGH SEVERITY DETECTED" 
                                color="text-rose-500" 
                                tooltip="A count for alerts with a wazuh severity Level 12+ critical severity rating over the selected period." 
                                isLoading={loadingKpis}
                            />
                            <StatCard 
                                label="False Positive Rate" 
                                value={`${serverKpis?.fp_rate ?? 0}%`} 
                                sub={`${serverKpis?.total_analyzed ?? 0} ANALYZED EVENTS`} 
                                color="text-emerald-400" 
                                tooltip="Percentage of AI-Analyzed events that are classified as false positive over the selected period." 
                                isLoading={loadingKpis}
                            />
                            <StatCard 
                                label="Dominant Attack Vector" 
                                value={serverKpis?.dominant_vector?.name || (serverKpis?.total_analyzed > 0 ? 'No Tactics Detected' : 'No Threats Detected')} 
                                sub={`${serverKpis?.dominant_vector?.percentage ?? 0}% OF DETECTED THREATS`} 
                                color="text-cyan-300" 
                                tooltip="Out of all detected alerts that are mapped to the MITRE framework, the system identifies the primary tactical alignment over the selected period." 
                                isLoading={loadingKpis}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-[12px] border border-cyan-500/30 rounded-[20px] p-4 flex flex-col relative group transition-all hover:border-cyan-400/40 shadow-[0_15px_35px_-12px_rgba(0,0,0,0.4)]">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <img src="/assets/mitre_attack_logo.png" alt="MITRE ATT&CK" className="h-3.5 object-contain mt-1" />
                                            <div className="relative group/tooltip flex items-center justify-center">
                                                <Info size={13} className="text-slate-500 cursor-help transition-all duration-300 group-hover/tooltip:text-cyan-400 group-hover/tooltip:drop-shadow-[0_0_10px_rgba(101,158,232,0.8)]" />
                                                <div className="absolute top-full left-0 mt-3 w-64 opacity-0 group-hover/tooltip:opacity-100 -translate-y-2 group-hover/tooltip:translate-y-0 pointer-events-none transition-all duration-300 z-50">
                                                    <div className="bg-slate-900 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(101,158,232,0.2)] p-3.5 text-[9.5px] font-mono text-cyan-50 leading-relaxed text-left relative">
                                                        <div className="absolute -top-1.5 left-[9px] w-3 h-3 bg-slate-900 border-t border-l border-cyan-500/50 rotate-45 rounded-[1px]" />
                                                        <div className="relative z-10">Maps detected alerts to the MITRE ATT&CK® framework — a globally recognized knowledge base of adversary tactics and techniques. Each bar represents a tactical phase of the ATT&CK version in use (e.g. Initial Access, Credential Access) and shows how many alerts were classified under it over the selected period.</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-mono mt-1.5 tracking-widest uppercase">Tactics & Techniques Mapping</p>
                                    </div>
                                    <button 
                                        onClick={() => matrixSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                                        className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all group/scroll"
                                        title="Focus Full Matrix"
                                    >
                                        <Maximize2 size={14} className="group-hover/scroll:scale-110 transition-transform" />
                                    </button>
                                </div>
                                <div className="flex-1 flex flex-col justify-end min-h-0">
                                    <MITREBarChart timeframe={timeFilter} startDate={customRange.start} endDate={customRange.end} monthlyNavigator={monthlyNavigator} />
                                </div>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-[12px] border border-cyan-500/30 rounded-[20px] p-5 flex flex-col relative transition-all hover:border-cyan-400/40 shadow-[0_15px_35px_-12px_rgba(0,0,0,0.4)]">
                                <SeverityDonutChart alerts={filteredAlerts} timeFilter={timeFilter} monthlyNavigator={monthlyNavigator} setMonthlyNavigator={setMonthlyNavigator} startDate={customRange.start} endDate={customRange.end} />
                            </motion.div>
                        </div>
                    </section>

                    {/* SECTION 2: Full MITRE Framework View */}
                    <section ref={matrixSectionRef} className="h-full min-h-full snap-start flex flex-col p-6 pt-0">
                            <MitreMatrix 
                                alerts={filteredAlerts} 
                                timeFilter={timeFilter}
                                setTimeFilter={setTimeFilter}
                                customRange={customRange}
                                setCustomRange={setCustomRange}
                                relativeTime={relativeTime}
                                setRelativeTime={setRelativeTime}
                            />
                        </section>
                    </motion.div>
        </div>
    );
};
