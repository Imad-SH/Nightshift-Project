import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Search, RotateCcw, AlertCircle, Download } from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { apiBase } from '../config';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const LogEntryCard = ({ event, formatError }: { event: any, formatError: (s: string) => string }) => {
    const isError = event.type === 'LOGIN_ERROR';
    const isSuccess = event.type === 'LOGIN';
    const isLogout = event.type === 'LOGOUT';
    const timestamp = new Date(event.time);
    const username = event.username || event.details?.username || 'UNKNOWN';

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group transition-all duration-300 cursor-pointer bg-white/[0.02] backdrop-blur-md border border-cyan-500/20 rounded-xl px-8 py-2 grid grid-cols-[20%_25%_15%_15%_auto] items-center hover:shadow-[0_0_20px_rgba(111,139,230,0.1)] hover:border-cyan-500/40 relative overflow-hidden shrink-0"
        >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            
            {/* Timestamp */}
            <div className="flex flex-col gap-0.5 relative z-10">
                <span className="text-[11px] font-mono font-black text-white/90 tracking-tighter uppercase whitespace-nowrap">
                    {timestamp.toLocaleDateString()}
                </span>
                <span className="text-[9px] font-mono text-slate-300 font-bold uppercase tracking-widest">
                    {timestamp.toLocaleTimeString([], { hour12: false })}
                </span>
            </div>

            {/* Operator */}
            <div className="relative z-10 pr-4">
                <div className="relative group/name inline-block max-w-full">
                    <span className="text-[12px] font-mono font-black text-white/90 truncate block tracking-tight transition-all duration-200">
                        {username}
                    </span>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 bg-slate-900 border border-cyan-500/50 px-2 py-1 rounded shadow-2xl opacity-0 invisible group-hover/name:opacity-100 group-hover/name:visible transition-all whitespace-nowrap z-[100] font-mono text-[12px] text-cyan-300 pointer-events-auto select-all">
                        {username}
                    </div>
                </div>
            </div>

            {/* IP Address */}
            <div className="relative z-10">
                <span className="text-[11px] font-mono font-bold text-slate-300 group-hover:text-cyan-300 transition-colors">
                    {event.ipAddress || '0.0.0.0'}
                </span>
            </div>

            {/* Type */}
            <div className="relative z-10">
                 <span className={cn(
                    "px-3 py-0.5 rounded-lg border text-[9px] font-mono font-black tracking-[0.2em] transition-all uppercase",
                    isError ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : 
                    isSuccess ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                    "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                )}>
                    {isError ? 'FAILED LOGIN' : event.type}
                </span>
            </div>

            {/* Details */}
            <div className="flex items-center justify-end relative z-10 gap-4 overflow-hidden">
                {isError ? (
                    <span className="text-[10px] font-mono font-black text-rose-400 tracking-widest uppercase truncate">
                        {formatError(event.error || event.details?.reason)}
                    </span>
                ) : (
                    <div className="flex items-center gap-3">
                        <span className={cn(
                            "text-[10px] font-mono font-black tracking-widest uppercase",
                            isLogout ? "text-cyan-400" : "text-emerald-400"
                        )}>
                            {isLogout ? 'AUTH TERMINATED' : 'AUTH SUCCESSFUL'}
                        </span>
                        {event.details?.auth_method && (
                            <span className="text-[8px] font-mono font-bold text-slate-200 border border-white/10 px-2 py-0.5 rounded-md uppercase tracking-widest bg-white/5">
                                via {event.details.auth_method}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export const LoginActivity = () => {
    const { token } = useSocAuth();
    const [events, setEvents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (token) {
            fetchEvents();
        }
    }, [token]);

    const fetchEvents = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`${apiBase()}/api/admin/audit/login-activity?max_events=200`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setEvents(data);
            }
        } catch (error) {
            console.error('Failed to fetch login activity:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatError = (errorStr: string) => {
        if (!errorStr) return '';
        const errorMap: Record<string, string> = {
            'invalid_user_credentials': 'Invalid Password Provided',
            'user_not_found': 'Unknown User Account Targeted',
            'user_temporarily_locked_out': 'Account Locked (Brute Force Protection)',
            'invalid_signature': 'Invalid Token Signature',
            'client_not_found': 'Unknown Client/Application',
        };
        return errorMap[errorStr] || errorStr.replace(/_/g, ' ').toUpperCase();
    };

    const downloadAuditLogs = () => {
        if (events.length === 0) return;
        
        const headers = ["Timestamp", "Username", "IP Address", "Event Type", "Details"];
        const rows = events.map(e => [
            new Date(e.time).toISOString(),
            e.username || e.details?.username || 'UNKNOWN',
            e.ipAddress || '0.0.0.0',
            e.type === 'LOGIN_ERROR' ? 'FAILED LOGIN' : e.type,
            e.type === 'LOGIN_ERROR' ? formatError(e.error || e.details?.reason) : (e.type === 'LOGOUT' ? 'AUTH TERMINATED' : 'AUTH SUCCESSFUL')
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.map(val => `"${val}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `login_activity_audit_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredEvents = events.filter(e => {
        const term = searchTerm.toLowerCase();
        return (
            (e.details?.username || '').toLowerCase().includes(term) ||
            (e.ipAddress || '').toLowerCase().includes(term) ||
            (e.type || '').toLowerCase().includes(term)
        );
    });

    return (
        <div className="h-full flex flex-col p-6 overflow-hidden relative">
            {/* Background elements */}
            <div className="absolute inset-0 micro-grid-bg opacity-[0.03] pointer-events-none" />
            
            <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4 h-full min-h-0"
            >
                {/* HEADER SECTION */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-6">
                        <h2 className="text-2xl font-bold text-white tracking-[0.2em] font-mono flex items-center gap-3">
                            <Fingerprint className="text-cyan-400 w-6 h-6" />
                            Login Activity
                        </h2>
                    </div>

                    {/* DOWNLOAD ACTION */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={downloadAuditLogs}
                            disabled={events.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="text-cyan-400 w-4 h-4 group-hover:animate-bounce" />
                            <span className="text-cyan-100 font-mono text-[10px] font-bold tracking-[0.2em] uppercase whitespace-nowrap">Export Logs</span>
                        </button>
                    </div>
                </div>

                {/* MAIN TABLE SECTION */}
                <div className="flex flex-col flex-1 min-h-0">
                    {/* SEARCH TOOLBAR */}
                    <div className="p-2 border border-cyan-500/40 shadow-[0_0_20px_rgba(111,139,230,0.15)] flex items-center justify-between bg-white/[0.02] backdrop-blur-md rounded-[32px] mb-4 relative overflow-hidden group/controls">
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 opacity-0 group-hover/controls:opacity-100 transition-opacity pointer-events-none" />
                        <div className="flex items-center gap-6 w-full px-2">
                            <div className="relative group/search flex-1 max-w-sm">
                                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400/50 group-focus-within/search:text-cyan-400 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="SEARCH AUDIT LOGS..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent border-none focus:outline-none py-2.5 pl-10 pr-5 text-[11px] font-mono text-cyan-100 tracking-[0.1em] w-full transition-all placeholder:text-slate-600"
                                />
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                                <button onClick={fetchEvents} className="p-2.5 text-slate-500 hover:text-cyan-400 transition-colors mr-2">
                                    <RotateCcw size={14} className={isLoading ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* LIST HEADERS */}
                    <div className="grid grid-cols-[20%_25%_15%_15%_auto] px-8 py-2 mb-1 text-[10px] font-mono font-black text-cyan-400 tracking-[0.3em] relative">
                        <div className="drop-shadow-[0_0_8px_rgba(138,162,238,0.4)]">TIMESTAMP</div>
                        <div className="drop-shadow-[0_0_8px_rgba(138,162,238,0.4)]">USERNAME</div>
                        <div className="drop-shadow-[0_0_8px_rgba(138,162,238,0.4)]">IP ADDRESS</div>
                        <div className="drop-shadow-[0_0_8px_rgba(138,162,238,0.4)]">TYPE</div>
                        <div className="text-right drop-shadow-[0_0_8px_rgba(138,162,238,0.4)]">DETAILS</div>
                    </div>

                    {/* CONTENT LIST */}
                    <div className="overflow-auto custom-scrollbar flex-1 flex flex-col gap-1.5 pb-2">
                        <AnimatePresence mode="popLayout">
                            {!isLoading && filteredEvents.length === 0 ? (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-32 text-center flex flex-col items-center gap-4">
                                    <AlertCircle className="w-10 h-10 text-cyan-500/20" />
                                </motion.div>
                            ) : (
                                filteredEvents.map((evt, i) => (
                                    <LogEntryCard key={evt.id || i} event={evt} formatError={formatError} />
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
