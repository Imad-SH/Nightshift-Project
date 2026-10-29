import React from 'react';
import { LayoutDashboard, Users, Fingerprint, BarChart3, Unplug, Settings, Crosshair } from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { BRAND } from '../brand';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AppTab } from '../types';

export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface NavItemProps {
    icon: any; // Using any for icon components to avoid Lucide type mismatch in some versions
    label: string;
    active?: boolean;
    isCollapsed?: boolean;
    onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, isCollapsed, onClick }) => (
    <button
        onClick={onClick}
        className={cn(
            "group relative flex items-center w-full px-4 py-3.5 mb-2 transition-all duration-300 outline-none isolate text-left",
            active ? "text-cyan-300" : "text-slate-500 hover:text-slate-200",
            isCollapsed && "justify-center px-0"
        )}
    >
        {/* ACTIVE STATE LAYER - Award Winning Cyber Design */}
        {active && (
            <>
                {/* Background base with clip-path for chopped top-right corner */}
                <div
                    className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-cyan-500/5 to-transparent z-[-2] overflow-hidden"
                    style={{
                        clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
                    }}
                >
                    {/* Inner glow */}
                    <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(111,139,230,0.15)] mix-blend-screen" />

                    {/* High-tech grid pattern */}
                    <div className="absolute inset-0 opacity-[0.15]"
                        style={{
                            backgroundImage: "linear-gradient(rgba(111, 139, 230, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(111, 139, 230, 1) 1px, transparent 1px)",
                            backgroundSize: "4px 4px"
                        }}
                    />
                </div>

                {/* --- TECH BORDERS --- */}
                {/* Top border extending towards the cut */}
                <div className="absolute left-0 top-0 w-[calc(100%-12px)] h-[1px] bg-gradient-to-r from-cyan-400/80 to-cyan-400/10 z-[-1]" />
                {/* Bottom border extending full width */}
                <div className="absolute left-0 bottom-0 w-full h-[1px] bg-gradient-to-r from-cyan-400/80 to-transparent z-[-1]" />
                {/* Angled top-right border (Pythagorean approx: 12*1.414 = 17px) */}
                <div className="absolute right-[-2.5px] top-[4.5px] w-[17px] h-[1px] bg-cyan-400/30 rotate-45 z-[-1]" />

                {/* --- LEFT INDICATOR --- */}
                {/* Main vertical line with strong glow */}
                <div className="absolute left-0 top-[15%] bottom-[15%] w-[3px] bg-cyan-400 shadow-[0_0_12px_rgba(138,162,238,0.9)] z-[-1] rounded-r-md" />
                {/* Technical tick marks */}
                <div className="absolute left-0 top-0 w-[6px] h-[2px] bg-cyan-300" />
                <div className="absolute left-0 bottom-0 w-[6px] h-[2px] bg-cyan-300" />

                {/* Decorative Dots */}
                <div className="absolute left-[8px] top-[6px] w-[2px] h-[2px] bg-cyan-300" />
                <div className="absolute left-[12px] top-[6px] w-[2px] h-[2px] bg-cyan-500" />
            </>
        )}

        {/* INACTIVE HOVER STATE LAYER */}
        {!active && (
            <>
                {/* Subtle gradient hover fill */}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-800/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[-2] rounded-md" />
                {/* Expanding left bar on hover */}
                <div className="absolute left-0 top-[30%] bottom-[30%] w-[2px] bg-slate-600 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:top-[20%] group-hover:bottom-[20%] z-[-1]" />
            </>
        )}

        {/* 1. ICON Container */}
        <div className={cn(
            "flex-shrink-0 transition-all duration-500 relative z-10",
            !isCollapsed && "mr-4",
            active ? "scale-110 drop-shadow-[0_0_8px_rgba(138,162,238,0.8)] text-cyan-200 translate-x-1" : "group-hover:scale-110 group-hover:text-cyan-400/70"
        )}>
            <Icon size={isCollapsed ? 22 : 18} strokeWidth={active ? 2.5 : 2} />
        </div>

        {/* 2. TEXT Content */}
        <span className={cn(
            "text-[12px] font-bold tracking-[0.25em] uppercase font-mono whitespace-nowrap transition-all duration-500 ease-out relative z-10",
            active ? "text-cyan-50 drop-shadow-[0_0_5px_rgba(138,162,238,0.6)] translate-x-2" : "group-hover:translate-x-1",
            isCollapsed ? "w-0 opacity-0 -translate-x-8 overflow-hidden" : "w-auto opacity-100 translate-x-0"
        )}>
            {label}
        </span>

        {/* TOOLTIP FOR COLLAPSED STATE */}
        {isCollapsed && (
            <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900/95 backdrop-blur-md text-[11px] font-bold tracking-widest text-cyan-100 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100] border border-cyan-500/40 shadow-[0_0_20px_rgba(111,139,230,0.3)] uppercase font-mono">
                <div className="absolute -left-[6px] top-1/2 -translate-y-1/2 border-y-[6px] border-y-transparent border-r-[6px] border-r-cyan-500/40" />
                {label}
            </div>
        )}
    </button>
);

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (collapsed: boolean) => void;
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed, activeTab, setActiveTab }) => {
    const { isSocAdmin, logout } = useSocAuth();
    // A logo saved earlier with the former "Change logo" control still replaces the Nightshift one
    const { customLogo } = useSettings();

    return (
        <div className="w-20 flex-shrink-0 relative h-screen z-[2000] transition-all duration-300">
            <aside
                className={cn(
                    "h-screen flex flex-col bg-cyan-950/40 backdrop-blur-md border-r-2 border-cyan-500/30 transition-all duration-300 absolute top-0 left-0 shadow-[5px_0_30px_rgba(0,0,0,0.5)]",
                    isCollapsed ? "w-20" : "w-64"
                )}
                onMouseEnter={() => setIsCollapsed(false)}
                onMouseLeave={() => setIsCollapsed(true)}
            >

            {/* Logo Area */}
            <div className={cn(
                "relative h-20 w-full transition-all duration-300 ease-in-out overflow-hidden z-20",
                "border-b border-cyan-500/50 shadow-[0_4px_15px_rgba(138,162,238,0.3)]"
            )}>
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-80" />

                <div className={cn(
                    "relative inset-0 w-full h-full flex items-center justify-center transition-all duration-500 cursor-default",
                    // Brightens an uploaded logo for the dark bar; the Nightshift logo is drawn for it already
                    customLogo ? "cyber-lighting" : "drop-shadow-[0_0_8px_rgba(111,139,230,0.3)]"
                )}>
                    {customLogo ? (
                        <div className={cn(
                            "absolute top-0 bottom-0 overflow-hidden transition-all duration-500 ease-in-out",
                            isCollapsed ? "w-[44px] left-[20px] opacity-90" : "w-[160px] left-[60px] opacity-100"
                        )}>
                            <img
                                src={customLogo}
                                alt={BRAND.fullName}
                                className="absolute top-1/2 -translate-y-1/2 left-0 h-12 object-left object-contain min-w-[160px] max-w-[160px]"
                            />
                        </div>
                    ) : (
                        // Collapsed: only the moon-and-hat mark shows; expanding reveals the name.
                        // The image is 1080x356 with the mark at x 96-352 and the name ending at x 989,
                        // drawn 61px high so the mark is 44px wide and the whole logo 154px.
                        <div className={cn(
                            "absolute top-0 bottom-0 overflow-hidden transition-all duration-500 ease-in-out",
                            isCollapsed ? "w-[44px] left-[18px] opacity-90" : "w-[154px] left-[51px] opacity-100"
                        )}>
                            <img
                                src={BRAND.productLogo}
                                alt={BRAND.fullName}
                                // Brighter so the blue end of "shift" stands out on the dark teal bar
                                className="absolute top-1/2 -translate-y-1/2 left-[-16.5px] h-[61px] w-auto max-w-none brightness-150 saturate-[1.2]"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 flex flex-col gap-1 overflow-hidden">
                <NavItem icon={LayoutDashboard} label="MONITORING" active={activeTab === 'MONITORING'} isCollapsed={isCollapsed} onClick={() => setActiveTab('MONITORING')} />
                <NavItem icon={BarChart3} label="STATISTICS" active={activeTab === 'STATISTICS'} isCollapsed={isCollapsed} onClick={() => setActiveTab('STATISTICS')} />
                {isSocAdmin && (
                    <>
                        <NavItem icon={Users} label="USERS MANAGEMENT" active={activeTab === 'USERS MANAGEMENT'} isCollapsed={isCollapsed} onClick={() => setActiveTab('USERS MANAGEMENT')} />
                        <NavItem icon={Fingerprint} label="LOGIN ACTIVITY" active={activeTab === 'LOGIN ACTIVITY'} isCollapsed={isCollapsed} onClick={() => setActiveTab('LOGIN ACTIVITY')} />
                        <NavItem icon={Unplug} label="INTEGRATIONS" active={activeTab === 'INTEGRATIONS'} isCollapsed={isCollapsed} onClick={() => setActiveTab('INTEGRATIONS')} />
                        <NavItem icon={Crosshair} label="CTI CONFIGURATION" active={activeTab === 'CTI CONFIGURATION'} isCollapsed={isCollapsed} onClick={() => setActiveTab('CTI CONFIGURATION')} />
                        <NavItem icon={Settings} label="LLM SETTINGS" active={activeTab === 'LLM SETTINGS'} isCollapsed={isCollapsed} onClick={() => setActiveTab('LLM SETTINGS')} />
                    </>
                )}
            </nav>

            {/* Logout Footer Section */}
            <div className="p-4 border-t border-cyan-500/10 bg-cyan-500/[0.02] flex items-center justify-center transition-all duration-300">
                <button 
                    onClick={() => logout()}
                    className={cn("Btn", !isCollapsed && "Btn-expanded")}
                    title={isCollapsed ? "Logout" : ""}
                >
                    <div className="sign">
                        <svg viewBox="0 0 512 512">
                            <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"></path>
                        </svg>
                    </div>
                    <div className="text text-[11px] font-mono tracking-widest font-bold">Logout</div>
                </button>
            </div>
        </aside>
    </div>
    );
};
