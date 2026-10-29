import { motion, AnimatePresence } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { cn } from './DashboardLayout';

interface RelativeTime {
    d: string;
    h: string;
    m: string;
}

export const TimeFilterControl = ({ 
    timeFilter, 
    setTimeFilter, 
    customRange, 
    setCustomRange,
    setRelativeTime
}: { 
    timeFilter: 'TODAY' | 'THIS_MONTH' | 'ALL' | 'CUSTOM',
    setTimeFilter: (v: 'TODAY' | 'THIS_MONTH' | 'ALL' | 'CUSTOM') => void,
    customRange: { start: string, end: string },
    setCustomRange: (v: { start: string, end: string }) => void,
    relativeTime: RelativeTime,
    setRelativeTime: (v: RelativeTime) => void
}) => {
    return (
        <div className="flex items-center gap-0.5 bg-cyan-950/10 backdrop-blur-md p-0.5 rounded-xl border border-cyan-500/10 shadow-lg relative">
            {[
                { label: 'TODAY', value: 'TODAY' as const },
                { label: 'MONTH', value: 'THIS_MONTH' as const },
                { label: 'ALL', value: 'ALL' as const }
            ].map(f => (
                <button 
                    key={f.value}
                    onClick={() => {
                        setTimeFilter(f.value);
                        setRelativeTime({ d: '', h: '', m: '' });
                    }}
                    className={cn(
                        "px-2.5 py-1 text-[8px] font-mono font-bold tracking-widest rounded-lg transition-all duration-300",
                        timeFilter === f.value 
                            ? "bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(131,162,212,0.15)] border border-cyan-500/30" 
                            : "text-cyan-100/40 hover:text-cyan-100 hover:bg-cyan-400/5 border border-transparent"
                    )}
                >
                    {f.label}
                </button>
            ))}
            <div className="w-[1px] h-3 bg-cyan-500/10 mx-0.5" />
            <button 
                onClick={() => setTimeFilter(timeFilter === 'CUSTOM' ? 'TODAY' : 'CUSTOM')}
                className={cn(
                    "p-1 rounded-lg transition-all duration-300 flex items-center justify-center",
                    timeFilter === 'CUSTOM'
                        ? "bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(131,162,212,0.15)] border border-cyan-500/30"
                        : "text-cyan-500/40 hover:text-cyan-400 hover:bg-cyan-400/5 border border-transparent"
                )}
            >
                <Calendar size={11} strokeWidth={2} />
            </button>

            {/* RANGE PICKER POPOVER */}
            <AnimatePresence>
                {timeFilter === 'CUSTOM' && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        className="absolute top-full right-0 mt-2 p-3 bg-slate-900/90 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_15px_rgba(131,162,212,0.1)] z-[100] flex flex-col gap-3 min-w-[220px]"
                    >
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(131,162,212,0.8)]" />
                                <span className="text-[7.5px] font-black text-cyan-400 uppercase tracking-[0.2em] font-mono">Start Date</span>
                            </div>
                            <input
                                type="datetime-local"
                                value={customRange.start}
                                onChange={(e) => {
                                    setCustomRange({ ...customRange, start: e.target.value });
                                    setRelativeTime({ d: '', h: '', m: '' });
                                }}
                                className="w-full bg-black/40 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-[10px] text-cyan-50 font-mono outline-none focus:border-cyan-400 transition-all [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(131,162,212,0.8)]" />
                                <span className="text-[7.5px] font-black text-cyan-400 uppercase tracking-[0.2em] font-mono">End Date</span>
                            </div>
                            <input
                                type="datetime-local"
                                value={customRange.end}
                                onChange={(e) => {
                                    setCustomRange({ ...customRange, end: e.target.value });
                                    setRelativeTime({ d: '', h: '', m: '' });
                                }}
                                className="w-full bg-black/40 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-[10px] text-cyan-50 font-mono outline-none focus:border-cyan-400 transition-all [color-scheme:dark]"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
