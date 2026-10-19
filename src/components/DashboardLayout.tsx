import React from 'react';
import { useSocket } from '../hooks/useSocket';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

import { motion } from 'framer-motion';
import type { AppTab } from '../types';

export const cn = (...inputs: (string | undefined | null | false)[]) => {
    return twMerge(clsx(inputs));
};

interface DashboardLayoutProps {
    children?: React.ReactNode;
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
    subTab?: string | null;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activeTab, setActiveTab, subTab }) => {
    const { serviceStatus } = useSocket();
    const connectors = serviceStatus.connectors || {};
    const activeSoarId = serviceStatus.active_soar || 'thehive';
    const activeSoarState = connectors.soar?.[activeSoarId]?.state;
    // The header shows Wazuh, or the webhook source when Wazuh is not set up at all
    const siem = connectors.siem || {};
    const siemId = siem.wazuh?.state === 'not_configured' && siem.webhook && siem.webhook.state !== 'not_configured' ? 'webhook' : 'wazuh';
    const siemState = siem[siemId]?.state;

    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(true);
    // Removed redundant local polling to reduce network noise

    return (
        <div className="min-h-screen w-full font-sans text-slate-200 selection:bg-cyan-500/30">
            {/* === THE ATMOSPHERIC BACKGROUND (FIXED) === */}
            <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-slate-900">
                {/* 1. The Radial Gradient (The "Spotlight") */}
                <div className="absolute top-[-50%] left-[-50%] right-[-50%] bottom-[-50%] 
                                bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] 
                                from-[#00f2ea]/15 via-slate-900/40 to-slate-900 
                                opacity-70"></div>
                {/* 2. The Grid Pattern (With Fade Mask) */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,242,234,0.2)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,242,234,0.2)_1px,transparent_1px)] 
                                bg-[size:4rem_4rem] 
                                [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]
                                filter drop-shadow-[0_0_2px_rgba(0,242,234,0.3)]">
                </div>
                {/* 3. The "Stars" / Noise Texture */}
            </div>

            {/* === THE CONTENT === */}
            <div className="relative z-10 flex h-screen overflow-hidden">
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    setIsCollapsed={setIsSidebarCollapsed}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />

                <motion.div
                    layout
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="flex-1 flex flex-col min-w-0 relative h-full"
                >
                    <TopHeader
                        wazuhStatus={serviceStatus.wazuh === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED'}
                        thehiveStatus={serviceStatus.thehive === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED'}
                        flowintelStatus={serviceStatus.flowintel === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED'}
                        activeSoar={activeSoarId}
                        activeSoarOnline={activeSoarState ? ['connected', 'configured'].includes(activeSoarState) : undefined}
                        systemOnline={serviceStatus.system ? serviceStatus.system === 'ONLINE' : undefined}
                        siemId={siemId}
                        siemOnline={siemState ? ['connected', 'receiving', 'ready'].includes(siemState) : undefined}
                        activeTab={activeTab}
                        subTab={subTab}
                        onNavigate={setActiveTab}
                    />

                    <main className="flex-1 min-h-0 pt-4 px-6 pb-6 scrollbar-thin scrollbar-thumb-cyan-900/50 cyber-scrollbar relative overflow-visible">
                        <div className="w-full h-full grid grid-cols-10 gap-6">
                            {children}
                        </div>
                    </main>


                </motion.div>
            </div>

        </div>
    );
};
