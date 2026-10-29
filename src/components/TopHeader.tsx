import React, { useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocAuth } from '../contexts/AuthContext';
import { User, Info, Webhook, Briefcase } from 'lucide-react';
import { BRAND } from '../brand';
import { soarInfo } from '../soar';
import type { AppTab } from '../types';

export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface TopHeaderProps {
    wazuhStatus: 'CONNECTED' | 'DISCONNECTED';
    thehiveStatus: 'CONNECTED' | 'DISCONNECTED';
    flowintelStatus?: 'CONNECTED' | 'DISCONNECTED';
    activeSoar?: string;
    /** Whether the active SOAR is usable (any SOAR type). Defaults to the TheHive/Flowintel statuses. */
    activeSoarOnline?: boolean;
    /** Overall alert intake status from the server (any SIEM). Defaults to the Wazuh status. */
    systemOnline?: boolean;
    /** SIEM shown in the status panel: Wazuh, or the webhook source when Wazuh is not used */
    siemId?: string;
    siemOnline?: boolean;
    activeTab: AppTab;
    subTab?: string | null;
    onNavigate?: (tab: AppTab) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ wazuhStatus, thehiveStatus, flowintelStatus = 'DISCONNECTED', activeSoar = 'thehive', activeSoarOnline, systemOnline, siemId = 'wazuh', siemOnline, activeTab, subTab, onNavigate }) => {
    const isWazuhOnline = wazuhStatus === 'CONNECTED';
    const isTheHiveOnline = thehiveStatus === 'CONNECTED';
    const isFlowintelOnline = flowintelStatus === 'CONNECTED';
    const isCoreOnline = systemOnline ?? isWazuhOnline;
    const isSiemOnline = siemOnline ?? isWazuhOnline;
    const isWazuhSiem = siemId === 'wazuh';
    const siemLabel = isWazuhSiem ? 'WAZUH' : 'WEBHOOK SOURCE';
    
    const { user, isSocAdmin, userTitle } = useSocAuth();
    const [isHovered, setIsHovered] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    // The SOAR escalations go to, as chosen by an admin under Integrations
    const effectiveSoar = activeSoar;
    const soar = soarInfo(effectiveSoar);

    // Choose active SOAR info for display
    const activeSoarName = soar.name.toUpperCase();
    const isActiveSoarOnline = activeSoarOnline ?? (effectiveSoar === 'thehive' ? isTheHiveOnline : isFlowintelOnline);
    const activeSoarLogo = soar.logo;
    // No case-management system chosen: a neutral state, not a failure
    const noSoar = effectiveSoar === 'none';
    const activeSoarDesc = effectiveSoar === 'none'
        ? "No case-management system is selected. Choose one under Integrations to enable escalation."
        : effectiveSoar === 'webhook'
        ? (isActiveSoarOnline ? "Escalations are delivered to the configured webhook." : "The escalation webhook is not configured.")
        : isActiveSoarOnline 
        ? (effectiveSoar === 'thehive' 
            ? "System is actively synced with TheHive, enabling direct alert escalation and case management."
            : "System is actively synced with Flowintel, enabling direct case management and malicious indicator tracking.")
        : (effectiveSoar === 'thehive'
            ? "Synchronisation with TheHive is lost. Escalation to cases and orchestration features are currently unavailable."
            : "Connection to Flowintel is inactive. External intelligence correlation and case creation are disabled.");

    const wazuhDesc = !isWazuhSiem
        ? (isSiemOnline ? "Alerts are received from the webhook source." : "No alerts received from the webhook source yet.")
        : isSiemOnline 
        ? "Real-time communication with Wazuh Manager for host security telemetry and active response."
        : "Wazuh Manager API is unreachable. Alert ingestion and agent synchronization are suspended.";

    // Dynamic greeting based on time of day
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const userName = user?.name || user?.preferred_username || 'OPERATOR';





    return (
        <header className="flex-none mx-6 mt-4 mb-1 relative z-[1000]">
            {/* THE CAPSULE CONTAINER */}
            <div className="relative flex items-center justify-between h-[52px] px-6 
                            bg-cyan-950/40 backdrop-blur-xl rounded-xl 
                            border-2 border-cyan-500/30 shadow-[0_4px_30px_rgba(0,0,0,0.5)]
                            transition-all duration-300">

                {/* DECORATION: Top Light Leak (The "Glass Edge") */}
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent opacity-50"></div>

                {/* LEFT: Breadcrumbs (Minimalist) */}
                <div className="flex items-center gap-2 text-[12.5px] font-mono tracking-wider">
                    <span 
                        onClick={() => onNavigate?.('MONITORING')}
                        className="text-cyan-400/60 font-black cursor-pointer hover:text-cyan-300 transition-colors drop-shadow-[0_0_8px_rgba(101,158,232,0.2)] uppercase"
                    >
                        {BRAND.product}
                    </span>
                    <span className="text-cyan-500/40 font-black scale-y-125 px-1 opacity-50">&gt;</span>
                    <span 
                        onClick={() => onNavigate?.(activeTab)}
                        className={cn(
                            "font-black cursor-pointer uppercase transition-all duration-300",
                            subTab 
                                ? "text-cyan-400/60 hover:text-cyan-300" 
                                : "text-cyan-100 pointer-events-none"
                        )}
                    >
                        {activeTab}
                    </span>
                    {subTab && (
                        <>
                            <span className="text-cyan-500/40 font-black scale-y-125 px-1 opacity-50">&gt;</span>
                            <span className="text-cyan-100 font-black drop-shadow-[0_0_8px_rgba(101,158,232,0.5)] uppercase">
                                {subTab}
                            </span>
                        </>
                    )}
                </div>

                {/* RIGHT: User & Status */}
                <div className="flex items-center gap-4">
                    
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[11px] font-medium text-cyan-400/80">
                            Good {greeting},
                        </span>
                        <span className="text-[13px] font-semibold text-cyan-50 leading-tight">
                            {userName}
                        </span>
                    </div>

                    {/* USER PROFILE DROPDOWN */}
                    <div 
                        className="relative"
                        onMouseEnter={() => setIsUserMenuOpen(true)}
                        onMouseLeave={() => setIsUserMenuOpen(false)}
                    >
                        <button
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-2 rounded-md border transition-all duration-300",
                                isUserMenuOpen 
                                    ? "bg-cyan-500/20 border-cyan-400 shadow-[0_0_15px_rgba(101,158,232,0.3)]" 
                                    : "bg-cyan-950/40 border-cyan-500/30 hover:border-cyan-400/60"
                            )}
                        >
                            <User size={13} className="text-cyan-400" />
                            <span className="text-[11.5px] font-mono font-bold text-cyan-100 tracking-widest uppercase leading-none">
                                 {userTitle || (isSocAdmin ? 'SOC MANAGER' : 'DETERMINING...') }
                            </span>
                        </button>

                        <AnimatePresence>
                            {isUserMenuOpen && (
                                <>
                                    {/* Overlay to close menu */}
                                    <div className="fixed inset-0 z-[-1]" onClick={() => setIsUserMenuOpen(false)} />
                                    
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute top-full right-0 pt-3 z-[1001] w-56"
                                    >
                                        <div className="bg-cyan-950/90 backdrop-blur-3xl border-2 border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-2 overflow-hidden relative">
                                            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                                            
                                            <div className="px-3 py-2 mb-1">
                                                <div className="text-[9px] font-mono text-cyan-500/60 uppercase tracking-widest">Signed in as</div>
                                                <div className="text-xs font-mono font-bold text-cyan-100 truncate">{user?.email || userName}</div>
                                            </div>



                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="h-5 w-[1px] bg-cyan-500/20" />

                    {/* HOLOGRAPHIC STATUS PILL */}
                    <div
                        className={cn(
                            "relative flex items-center gap-3.5 px-5 py-2 rounded-md backdrop-blur-md transition-all duration-300 cursor-pointer group border",
                            isCoreOnline
                                ? "bg-cyan-950/40 border-cyan-500/30 shadow-[0_0_15px_rgba(101,158,232,0.1)] hover:bg-cyan-950/60 hover:border-cyan-400/50"
                                : "bg-rose-950/40 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)] hover:bg-rose-950/60 hover:border-rose-400/50"
                        )}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                    >
                        {/* Pulsing Core */}
                        <div className="relative flex h-2 w-2">
                            <span className={cn(
                                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                isCoreOnline ? "bg-cyan-400" : "bg-rose-400"
                            )}></span>
                            <span className={cn(
                                "relative inline-flex rounded-full h-2 w-2 shadow-[0_0_8px_rgba(101,158,232,0.8)]",
                                isCoreOnline ? "bg-cyan-500" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                            )}></span>
                        </div>

                        {/* Glowing Text */}
                        <span className={cn(
                            "text-[12.5px] font-semibold transition-colors duration-300 leading-none",
                            isCoreOnline
                                ? "text-cyan-300 group-hover:text-cyan-100 drop-shadow-[0_0_5px_rgba(101,158,232,0.5)]"
                                : "text-rose-300 group-hover:text-rose-100 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"
                        )}>
                            {isCoreOnline ? 'System online' : 'System offline'}
                        </span>

                        {/* TACTICAL TOOLTIP */}
                        <AnimatePresence>
                            {isHovered && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                         className={cn(
                                        "absolute top-full right-0 mt-3 p-4 rounded-xl border backdrop-blur-3xl z-[1001] min-w-[280px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
                                        isCoreOnline
                                            ? "bg-cyan-950/90 border-cyan-500/40 shadow-cyan-500/10"
                                            : "bg-rose-950/90 border-rose-500/40 shadow-rose-500/10"
                                    )}
                                >
                                    <div className="flex flex-col gap-3">
                                        {/* Header */}
                                        <div className="flex items-center border-b border-white/10 pb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", isCoreOnline ? "bg-cyan-400" : "bg-rose-400")}></div>
                                                <span className={cn(
                                                    "text-[10px] font-mono font-bold tracking-[0.2em] uppercase",
                                                    isCoreOnline ? "text-cyan-400/80" : "text-rose-400/80"
                                                )}>
                                                    STATUS
                                                </span>
                                            </div>
                                        </div>
                                        {/* Status List */}
                                        <div className="flex flex-col gap-4 py-1">
                                            {/* WAZUH STATUS */}
                                             <div className="flex items-center justify-between gap-3 relative">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border overflow-hidden transition-all duration-300",
                                                        isSiemOnline ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_10px_rgba(101,158,232,0.2)]" : "bg-rose-500/10 border-rose-500/30"
                                                    )}>
                                                        {isWazuhSiem ? (
                                                            <img
                                                                src="/assets/Wazuh Logo.png"
                                                                alt="Wazuh"
                                                                className="w-[90%] h-[90%] object-contain"
                                                            />
                                                        ) : (
                                                            <Webhook size={16} className="text-cyan-300" />
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-xs font-mono font-bold uppercase tracking-wider leading-tight",
                                                        isSiemOnline ? "text-cyan-100 drop-shadow-[0_0_5px_rgba(101,158,232,0.5)]" : "text-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"
                                                    )}>
                                                        {siemLabel} {isSiemOnline ? "CONNECTED" : "DISCONNECTED"}
                                                    </span>
                                                </div>

                                                {/* WAZUH INFO ICON & TOOLTIP */}
                                                <div className="relative group/wazuh-info">
                                                    <div className="p-1 rounded-full hover:bg-cyan-500/10 transition-colors cursor-help">
                                                        <Info size={14} className="text-cyan-500/40 group-hover/wazuh-info:text-cyan-400 transition-colors" />
                                                    </div>
                                                    
                                                    <div className={cn(
                                                        "absolute bottom-full right-0 mb-2 w-56 p-2 backdrop-blur-xl border rounded-lg text-[9px] leading-relaxed opacity-0 group-hover/wazuh-info:opacity-100 pointer-events-none transition-all duration-200 translate-y-2 group-hover/wazuh-info:translate-y-0 z-[60] shadow-[0_4px_20px_rgba(0,0,0,0.5)] font-mono text-left bg-slate-950/90 text-cyan-100",
                                                        isSiemOnline ? "border-cyan-500/30" : "border-rose-500/30"
                                                    )}>
                                                        <div className={cn(
                                                            "font-bold mb-1 border-b pb-0.5 uppercase tracking-tighter",
                                                            isSiemOnline ? "text-cyan-400 border-cyan-500/20" : "text-rose-400 border-rose-500/20"
                                                        )}>
                                                            Current Status
                                                        </div>
                                                        {wazuhDesc}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ACTIVE SOAR STATUS */}
                                             <div className="flex items-center justify-between gap-3 relative">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border overflow-hidden",
                                                        noSoar
                                                            ? "bg-slate-500/10 border-slate-500/30"
                                                            : isActiveSoarOnline
                                                            ? (effectiveSoar === 'thehive' ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-violet-500/10 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.2)]")
                                                            : "bg-rose-500/10 border-rose-500/30"
                                                    )}>
                                                        {activeSoarLogo ? (
                                                            <img
                                                                src={activeSoarLogo}
                                                                alt={activeSoarName}
                                                                className={cn("object-contain", effectiveSoar === 'thehive' ? "w-[85%] h-[85%]" : "w-[90%] h-[90%] brightness-[2.5] contrast-[1.2]")}
                                                            />
                                                        ) : noSoar ? (
                                                            <Briefcase size={15} className="text-slate-400" />
                                                        ) : (
                                                            <Webhook size={16} className={isActiveSoarOnline ? "text-cyan-300" : "text-rose-400"} />
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-xs font-mono font-bold uppercase tracking-wider leading-tight",
                                                        noSoar
                                                            ? "text-slate-400"
                                                            : isActiveSoarOnline
                                                            ? (effectiveSoar === 'thehive' ? "text-amber-100 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]" : "text-violet-100 drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]")
                                                            : "text-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"
                                                    )}>
                                                        {noSoar ? "NO CASE MANAGEMENT" : `${activeSoarName} ${isActiveSoarOnline ? "CONNECTED" : "DISCONNECTED"}`}
                                                    </span>
                                                </div>

                                                {/* SOAR INFO ICON & TOOLTIP */}
                                                <div className="relative group/soar-info">
                                                    <div className={cn(
                                                        "p-1 rounded-full transition-colors cursor-help",
                                                        effectiveSoar === 'thehive' ? "hover:bg-amber-500/10" : "hover:bg-violet-500/10"
                                                    )}>
                                                        <Info size={14} className={cn(
                                                            "transition-colors",
                                                            effectiveSoar === 'thehive' ? "text-amber-500/40 group-hover/soar-info:text-amber-400" : "text-violet-500/40 group-hover/soar-info:text-violet-400"
                                                        )} />
                                                    </div>

                                                    <div className={cn(
                                                        "absolute bottom-full right-0 mb-2 w-56 p-2 backdrop-blur-xl border rounded-lg text-[9px] leading-relaxed opacity-0 group-hover/soar-info:opacity-100 pointer-events-none transition-all duration-200 translate-y-2 group-hover/soar-info:translate-y-0 z-[60] shadow-[0_4px_20px_rgba(0,0,0,0.5)] font-mono text-left bg-slate-950/90",
                                                        isActiveSoarOnline 
                                                            ? (effectiveSoar === 'thehive' ? "border-amber-500/30 text-amber-100" : "border-violet-500/30 text-violet-100")
                                                            : "border-rose-500/30 text-rose-100"
                                                    )}>
                                                        <div className={cn(
                                                            "font-bold mb-1 border-b pb-0.5 uppercase tracking-tighter",
                                                            isActiveSoarOnline 
                                                                ? (effectiveSoar === 'thehive' ? "text-amber-400 border-amber-500/20" : "text-violet-400 border-violet-500/20")
                                                                : "text-rose-400 border-rose-500/20"
                                                        )}>
                                                            Current Status
                                                        </div>
                                                        {activeSoarDesc}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </header >
    );
};
