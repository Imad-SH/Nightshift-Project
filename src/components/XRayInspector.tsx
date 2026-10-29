import React from 'react';
import { useSocket } from '../hooks/useSocket';
import { ActionConsole } from './ActionConsole';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface XRayInspectorProps {
    selectedAlertId?: string;
}

export const XRayInspector: React.FC<XRayInspectorProps> = ({ selectedAlertId }) => {
    const { alerts, events } = useSocket();
    
    const activeEvent = events[selectedAlertId || ''];
    const staticAlert = alerts.find(a => a.id === selectedAlertId);

    // Strict selection check: Alert must exist in the current active list
    const isSelected = !!staticAlert;

    // Derived states for robust UI
    const hasVerdict = !!(activeEvent?.verdict || staticAlert?.verdict || activeEvent?.node_results?.agent_judge?.verdict);
    const isScanning = ['running', 'extracting', 'investigating', 'judging'].includes(activeEvent?.pipeline_status || '');
    const isReallyScanning = isScanning && !hasVerdict;

    // Merge data safely
    const fullAlertData = {
        ...staticAlert,
        ...activeEvent,
        level: staticAlert?.level ?? 0 // Fallback logic
    };

    return (
        <div className="glass-panel h-full flex flex-col font-mono text-xs overflow-hidden">
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
                            ACTIONS
                        </h2>
                    </div>
                </div>

                {/* Status Indicator (Extreme Right) */}
                <AnimatePresence>
                    {selectedAlertId && isSelected && (
                        <>
                            {isReallyScanning && (
                                <motion.div
                                    key="running"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    className="text-cyan-400"
                                >
                                    <Loader2 size={14} className="animate-spin" />
                                </motion.div>
                            )}
                            {(activeEvent?.pipeline_status === 'completed' || hasVerdict || (!activeEvent && (staticAlert?.level ?? 0) >= 7)) && (
                                <motion.div
                                    key="completed"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3 }}
                                    className="text-emerald-400 font-sans font-medium text-[12px] flex items-center gap-2"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    <span>Scan complete</span>
                                </motion.div>
                            )}
                        </>
                    )}
                </AnimatePresence>
            </div>

            {/* ACTION CONSOLE (Main Content) */}
            <div className="flex-1 min-h-0 flex flex-col p-4 relative">
                <ActionConsole
                    alert={isSelected ? (fullAlertData as any) : null}
                    isScanning={isReallyScanning}
                />
            </div>
        </div>
    );
};
