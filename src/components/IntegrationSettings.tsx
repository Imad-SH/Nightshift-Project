import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
    Server, Lock, Save, Check, Loader2, Plug, Eye, EyeOff, X
} from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface IntegrationCardState {
    url: string;
    api_key?: string;
    user?: string;
    password?: string;
    status: 'idle' | 'testing' | 'connected' | 'failed';
    dirty: boolean;
    showSecret: boolean;
}

export const IntegrationSettings: React.FC<{ 
    onSubTabChange?: (tab: string | null) => void;
}> = ({ onSubTabChange }) => {
    const { token } = useSocAuth();
    const { serviceStatus } = useSocket();

    useEffect(() => {
        onSubTabChange?.(null);
    }, [onSubTabChange]);

    const [soarMode, setSoarMode] = useState<'thehive' | 'flowintel'>('thehive');
    
    const [wazuh, setWazuh] = useState<IntegrationCardState>({ url: '', user: '', password: '', status: 'idle', dirty: false, showSecret: false });
    const [thehive, setTheHive] = useState<IntegrationCardState>({ url: '', api_key: '', status: 'idle', dirty: false, showSecret: false });
    const [flowintel, setFlowintel] = useState<IntegrationCardState>({ url: '', api_key: '', status: 'idle', dirty: false, showSecret: false });
    
    const [localLive, setLocalLive] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState<'wazuh' | 'thehive' | 'flowintel' | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<'wazuh' | 'thehive' | 'flowintel' | null>(null);
    const [confirmModal, setConfirmModal] = useState<'thehive' | 'flowintel' | null>(null);

    // Sync live status from socket with local optimistic overrides
    const isWazuhLive = localLive.wazuh ?? (serviceStatus.wazuh === 'CONNECTED');
    const isTheHiveLive = localLive.thehive ?? (serviceStatus.thehive === 'CONNECTED');
    const isFlowintelLive = localLive.flowintel ?? ((serviceStatus as any).flowintel === 'CONNECTED');
    useEffect(() => {
        const fetchSettings = async () => {
            if (!token) return;
            try {
                const response = await fetch(`http://${window.location.hostname}:8000/api/settings/`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setWazuh(prev => ({
                        ...prev,
                        url: data.wazuh_url || prev.url,
                        user: data.wazuh_user || prev.user,
                        password: data.wazuh_password || prev.password,
                        status: 'idle',
                        dirty: false,
                    }));
                    setTheHive({ 
                        url: data.thehive_url || '', 
                        api_key: data.thehive_api_key || '', 
                        status: 'idle', 
                        dirty: false,
                        showSecret: false
                    });
                    setFlowintel({
                        url: data.flowintel_url || '',
                        api_key: data.flowintel_api_key || '',
                        status: 'idle',
                        dirty: false,
                        showSecret: false
                    });
                    if (data.active_soar) {
                        setSoarMode(data.active_soar);
                    }
                }
            } catch (err) {
                console.error("❌ Error fetching integration settings:", err);
            }
        };
        fetchSettings();
    }, [token]);

    const handleTestConnection = async (service: 'wazuh' | 'thehive' | 'flowintel') => {
        if (!token) return;
        const target = service === 'wazuh' ? wazuh : service === 'thehive' ? thehive : flowintel;
        const setter = service === 'wazuh' ? setWazuh : service === 'thehive' ? setTheHive : setFlowintel;
        
        setter(prev => ({ ...prev, status: 'testing' }));

        try {
            const resp = await fetch(`http://${window.location.hostname}:8000/api/settings/verify-integration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    service,
                    url: target.url,
                    user: service === 'wazuh' ? target.user : undefined,
                    password: service === 'wazuh' ? target.password : undefined,
                    api_key: service !== 'wazuh' ? target.api_key : undefined
                })
            });

            if (resp.ok) {
                setter(prev => ({ ...prev, status: 'connected' }));
            } else {
                setter(prev => ({ ...prev, status: 'failed' }));
                setTimeout(() => setter(prev => ({ ...prev, status: 'idle' })), 4000);
            }
        } catch {
            setter(prev => ({ ...prev, status: 'failed' }));
            setTimeout(() => setter(prev => ({ ...prev, status: 'idle' })), 4000);
        }
    };

    const handleSaveIntegration = async (service: 'wazuh' | 'thehive' | 'flowintel') => {
        if (!token) return;
        const target = service === 'wazuh' ? wazuh : service === 'thehive' ? thehive : flowintel;
        
        // 1. Initial State: Force disconnect visually while we work
        setSaving(service);
        setLocalLive(prev => ({ ...prev, [service]: false }));

        try {
            const payload = service === 'wazuh' ? {
                wazuh_url: target.url,
                wazuh_user: target.user,
                wazuh_password: target.password
            } : service === 'thehive' ? {
                thehive_url: target.url,
                thehive_api_key: target.api_key,
                active_soar: 'thehive'
            } : {
                flowintel_url: target.url,
                flowintel_api_key: target.api_key,
                active_soar: 'flowintel'
            };

            // 1. Verify the integration (for status reporting)
            const verifyResp = await fetch(`http://${window.location.hostname}:8000/api/settings/verify-integration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    service,
                    url: target.url,
                    user: service === 'wazuh' ? target.user : undefined,
                    password: service === 'wazuh' ? target.password : undefined,
                    api_key: service !== 'wazuh' ? target.api_key : undefined
                })
            });

            const isVerified = verifyResp.ok;

            // 2. ALWAYS Save to the database as requested by the user
            await fetch(`http://${window.location.hostname}:8000/api/settings/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            // 3. Inform backend to reload and trigger immediate global status update
            await fetch(`http://${window.location.hostname}:8000/api/settings/reload-integrations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            const setter = service === 'wazuh' ? setWazuh : service === 'thehive' ? setTheHive : setFlowintel;
            
            // 4. Update UI State
            setLocalLive(prev => ({ ...prev, [service]: isVerified }));
            setSaveSuccess(service);
            
            setter(prev => ({ 
                ...prev, 
                dirty: false, 
                status: isVerified ? 'idle' : 'failed' 
            }));
            
            console.log(`💾 [Integrations] Save complete for ${service}. Verified: ${isVerified}`);
            setTimeout(() => setSaveSuccess(null), 3000);
        } catch (err) {
            console.error(`❌ Failed to save ${service} settings:`, err);
        } finally {
            setSaving(null);
        }
    };

    const handleSoarToggle = async (mode: 'thehive' | 'flowintel') => {
        if (mode === soarMode) return;
        setConfirmModal(mode); // Trigger confirmation modal
    };

    const confirmSoarSwitch = async () => {
        if (!confirmModal || !token) return;
        const mode = confirmModal;
        setSoarMode(mode);
        setConfirmModal(null);
        
        try {
            // 1. Immediately inform the backend of the switch
            await fetch(`http://${window.location.hostname}:8000/api/settings/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ active_soar: mode })
            });

            // 2. Trigger an immediate refresh of the App's socket status
            await fetch(`http://${window.location.hostname}:8000/api/settings/reload-integrations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log(`📡 [Integrations] Switched App-Wide SOAR to: ${mode}`);
            
            // NEW: Dispatch local event for zero-latency header update
            localStorage.setItem('local_active_soar', mode);
            window.dispatchEvent(new CustomEvent('soar_switch', { detail: mode }));
        } catch (err) {
            console.error("❌ Failed to broadcast SOAR switch:", err);
        }
    };


    return (
        <div className="h-full w-full flex flex-col p-6 overflow-y-auto custom-scrollbar relative">
            <div className="absolute inset-0 micro-grid-bg opacity-[0.03] pointer-events-none" />
            
            <div className="flex-1 overflow-hidden flex flex-col items-center justify-center">
                <div className="max-w-6xl w-full px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* ===== WAZUH CARD ===== */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="relative group flex flex-col"
                        >
                            <div className="flex flex-col items-center mb-4">
                                <div className="text-3xl font-black text-white tracking-[0.2em] uppercase pl-[0.2em]">
                                    SIEM Link
                                </div>
                                <div className="w-10 h-0.5 bg-cyan-500/50 mt-1" />
                            </div>

                            <div className="relative bg-gradient-to-br from-slate-900/95 via-cyan-950/30 to-slate-900/95 backdrop-blur-[20px] border-[2px] border-cyan-500/40 rounded-[32px] shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] overflow-hidden h-full flex flex-col">
                                <div className="px-8 h-24 relative flex items-center justify-center pt-6">
                                    <div className="absolute w-56 h-24 bg-cyan-500/30 blur-[60px] rounded-full" />
                                    <div className="w-48 h-20 flex items-center justify-center overflow-hidden relative z-10 brightness-110 drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                        <img src="/assets/wazuh-logo-full.png" alt="Wazuh" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="absolute right-8 top-10">
                                        <div className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-mono font-black uppercase tracking-[0.2em] transition-all duration-500",
                                            isWazuhLive
                                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                                : "bg-red-500/10 border-red-500/40 text-red-400"
                                        )}>
                                            <div className={cn("w-1.5 h-1.5 rounded-full", isWazuhLive ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                                            {isWazuhLive ? 'CONNECTED' : 'DISCONNECTED'}
                                        </div>
                                    </div>
                                </div>

                                <div className="px-8 pb-6 space-y-4 flex-1 flex flex-col justify-between min-h-[320px]">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-mono font-black text-cyan-400/60 uppercase tracking-[0.25em] flex items-center gap-2">
                                                <Server size={12} />
                                                API ENDPOINT
                                            </label>
                                            <input
                                                type="text"
                                                value={wazuh.url}
                                                autoComplete="off"
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    setWazuh(prev => ({ ...prev, url: newVal, dirty: true }));
                                                }}
                                                placeholder="https://wazuh-manager:55000"
                                                className="w-full bg-cyan-950/60 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-[11px] font-mono font-bold text-cyan-100 placeholder:text-cyan-500/20 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all tracking-wider"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-mono font-black text-cyan-400/60 uppercase tracking-[0.25em] flex items-center gap-2">
                                                <Lock size={12} />
                                                USERNAME
                                            </label>
                                            <input
                                                type="text"
                                                value={wazuh.user}
                                                autoComplete="new-username"
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    setWazuh(prev => ({ ...prev, user: newVal, dirty: true }));
                                                }}
                                                placeholder="wazuh"
                                                className="w-full bg-cyan-950/60 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-[11px] font-mono font-bold text-cyan-100 placeholder:text-cyan-500/20 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all tracking-wider"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-mono font-black text-cyan-400/60 uppercase tracking-[0.25em] flex items-center gap-2">
                                                <Lock size={12} />
                                                PASSWORD
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={wazuh.showSecret ? 'text' : 'password'}
                                                    value={wazuh.password}
                                                    autoComplete="new-password"
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        setWazuh(prev => ({ ...prev, password: newVal, dirty: true }));
                                                    }}
                                                    placeholder="••••••••"
                                                    className="w-full bg-cyan-950/60 border border-cyan-500/30 rounded-xl px-4 py-2.5 pr-12 text-[11px] font-mono font-bold text-cyan-100 placeholder:text-cyan-500/20 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all tracking-wider"
                                                />
                                                <button
                                                    onClick={() => setWazuh(prev => ({ ...prev, showSecret: !prev.showSecret }))}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-500/40 hover:text-cyan-400 transition-colors"
                                                >
                                                    {wazuh.showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 pt-2">
                                        <motion.button
                                            whileHover={{ y: -1, backgroundColor: 'rgba(6, 182, 212, 0.12)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleTestConnection('wazuh')}
                                            disabled={wazuh.status === 'testing' || !wazuh.url}
                                            className={cn(
                                                "flex-1 py-3 rounded-xl border text-[10px] font-mono font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-300",
                                                wazuh.status === 'connected'
                                                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                                                    : wazuh.status === 'failed'
                                                    ? "bg-red-500/10 border-red-500/40 text-red-400"
                                                    : "bg-cyan-500/5 border-cyan-500/20 text-cyan-400/60 hover:border-cyan-400/50 hover:text-cyan-400"
                                            )}
                                        >
                                            <AnimatePresence mode="wait">
                                                {wazuh.status === 'testing' ? (
                                                    <motion.div key="testing" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
                                                        <Loader2 size={14} className="animate-spin text-amber-400" /> 
                                                        <span>Testing...</span>
                                                    </motion.div>
                                                ) : wazuh.status === 'connected' ? (
                                                    <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                                                        <Check size={14} /> 
                                                        <span>Connected</span>
                                                    </motion.div>
                                                ) : wazuh.status === 'failed' ? (
                                                    <motion.div key="failed" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                                                        <X size={14} /> 
                                                        <span>Failed</span>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                                                        <Plug size={14} /> 
                                                        <span>Test Connection</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>

                                        <motion.button
                                            whileHover={{ y: -1, backgroundColor: 'rgba(6, 182, 212, 0.12)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleSaveIntegration('wazuh')}
                                            disabled={saving === 'wazuh' || !wazuh.url}
                                            className={cn(
                                                "flex-1 py-3 rounded-xl border text-[10px] font-mono font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-300",
                                                saveSuccess === 'wazuh'
                                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                                    : "bg-cyan-500/5 border-cyan-500/30 text-cyan-400/60 hover:border-cyan-400/60 hover:text-cyan-400"
                                            )}
                                        >
                                            <AnimatePresence mode="wait">
                                                {saving === 'wazuh' ? (
                                                    <motion.div key="saving" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
                                                        <Loader2 size={14} className="animate-spin" /> 
                                                        <span>Saving...</span>
                                                    </motion.div>
                                                ) : saveSuccess === 'wazuh' ? (
                                                    <motion.div key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                                                        <Check size={14} /> 
                                                        <span>Saved</span>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="save-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                                                        <Save size={14} /> 
                                                        <span>Save & Apply</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* ===== SOAR / RESPONSE CARD ===== */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2 }}
                            className="relative group flex flex-col"
                        >
                            <div className="flex flex-col items-center mb-4">
                                <div className="text-3xl font-black text-white tracking-[0.2em] uppercase pl-[0.2em]">
                                    SOAR Link
                                </div>
                                <div className={cn(
                                    "w-10 h-0.5 mt-1 transition-colors duration-500",
                                    soarMode === 'thehive' ? "bg-amber-500/50" : "bg-violet-500/50"
                                )} />
                            </div>

                            <div className={cn(
                                "relative backdrop-blur-[20px] border-[2px] rounded-[32px] shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] overflow-hidden h-full flex flex-col transition-all duration-700",
                                soarMode === 'thehive' 
                                    ? "bg-gradient-to-br from-slate-900/95 via-amber-950/15 to-slate-900/95 border-amber-500/30" 
                                    : "bg-gradient-to-br from-slate-900/95 via-violet-950/20 to-slate-900/95 border-violet-500/30"
                            )}>
                                <div className="px-8 h-24 relative flex items-center justify-center pt-6">
                                    <AnimatePresence mode="wait">
                                        {soarMode === 'thehive' ? (
                                            <motion.div 
                                                key="thehive-logo"
                                                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                                exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                                                className="relative flex flex-col items-center"
                                            >
                                                <div className="absolute inset-0 bg-amber-500/30 blur-[60px] rounded-full" />
                                                <div className="w-24 h-24 flex items-center justify-center overflow-hidden relative z-10 drop-shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                                                    <img src="/assets/login-logo-thehive.svg" alt="TheHive" className="w-full h-full object-contain" />
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div 
                                                key="flowintel-logo"
                                                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                                exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                                                className="relative flex flex-col items-center"
                                            >
                                                <div className="absolute inset-0 bg-violet-500/40 blur-[70px] rounded-full" />
                                                <div className="w-32 h-20 flex items-center justify-center overflow-hidden relative z-10 brightness-[2.5] contrast-[1.2] drop-shadow-[0_0_25px_rgba(139,92,246,0.5)]">
                                                    <img src="/assets/flowintel_logo.png" alt="Flowintel" className="w-full h-full object-contain" />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="absolute right-8 top-10">
                                        <div className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-mono font-black uppercase tracking-[0.2em] transition-all duration-500",
                                            (soarMode === 'thehive' ? isTheHiveLive : isFlowintelLive)
                                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                                : "bg-red-500/10 border-red-500/40 text-red-400"
                                        )}>
                                            <div className={cn("w-1.5 h-1.5 rounded-full", (soarMode === 'thehive' ? isTheHiveLive : isFlowintelLive) ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                                            {(soarMode === 'thehive' ? isTheHiveLive : isFlowintelLive) ? 'CONNECTED' : 'DISCONNECTED'}
                                        </div>
                                    </div>
                                </div>

                                <div className="px-8 pb-6 space-y-4 flex-1 flex flex-col justify-between min-h-[320px]">
                                    <div className="space-y-4">
                                        <AnimatePresence mode="wait">
                                            <motion.div 
                                                key={soarMode}
                                                initial={{ opacity: 0, x: soarMode === 'thehive' ? -10 : 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: soarMode === 'thehive' ? 10 : -10 }}
                                                transition={{ duration: 0.3 }}
                                                className="space-y-4"
                                            >
                                                <div className="space-y-2">
                                                    <label className={cn(
                                                        "text-[10px] font-mono font-black uppercase tracking-[0.25em] flex items-center gap-2 transition-colors duration-500",
                                                        soarMode === 'thehive' ? "text-amber-500/60" : "text-violet-400/60"
                                                    )}>
                                                        <Server size={12} />
                                                        API ENDPOINT
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={soarMode === 'thehive' ? thehive.url : flowintel.url}
                                                        autoComplete="off"
                                                        onChange={(e) => {
                                                            const newVal = e.target.value;
                                                            if (soarMode === 'thehive') {
                                                                setTheHive(prev => ({ ...prev, url: newVal, dirty: true }));
                                                            } else {
                                                                setFlowintel(prev => ({ ...prev, url: newVal, dirty: true }));
                                                            }
                                                        }}
                                                        placeholder={soarMode === 'thehive' ? "http://thehive:9000" : "http://flowintel:8080"}
                                                        className={cn(
                                                            "w-full border rounded-xl px-4 py-2.5 text-[11px] font-mono font-bold placeholder:opacity-20 focus:outline-none transition-all tracking-wider",
                                                            soarMode === 'thehive' 
                                                                ? "bg-amber-950/40 border-amber-500/20 text-amber-100 focus:border-amber-400 focus:shadow-[0_0_20px_rgba(245,158,11,0.1)]" 
                                                                : "bg-violet-950/40 border-violet-500/20 text-violet-100 focus:border-violet-400 focus:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                                                        )}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className={cn(
                                                        "text-[10px] font-mono font-black uppercase tracking-[0.25em] flex items-center gap-2 transition-colors duration-500",
                                                        soarMode === 'thehive' ? "text-amber-500/60" : "text-violet-400/60"
                                                    )}>
                                                        <Lock size={12} />
                                                        API KEY
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type={(soarMode === 'thehive' ? thehive.showSecret : flowintel.showSecret) ? 'text' : 'password'}
                                                            value={soarMode === 'thehive' ? thehive.api_key : flowintel.api_key}
                                                            autoComplete="new-password"
                                                            onChange={(e) => {
                                                                const newVal = e.target.value;
                                                                if (soarMode === 'thehive') {
                                                                    setTheHive(prev => ({ ...prev, api_key: newVal, dirty: true }));
                                                                } else {
                                                                    setFlowintel(prev => ({ ...prev, api_key: newVal, dirty: true }));
                                                                }
                                                            }}
                                                            placeholder="••••••••••••••••"
                                                            className={cn(
                                                                "w-full border rounded-xl px-4 py-2.5 pr-12 text-[11px] font-mono font-bold placeholder:opacity-20 focus:outline-none transition-all tracking-wider",
                                                                soarMode === 'thehive' 
                                                                    ? "bg-amber-950/40 border-amber-500/20 text-amber-100 focus:border-amber-400 focus:shadow-[0_0_20px_rgba(245,158,11,0.1)]" 
                                                                    : "bg-violet-950/40 border-violet-500/20 text-violet-100 focus:border-violet-400 focus:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                                                            )}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                if (soarMode === 'thehive') setTheHive(prev => ({ ...prev, showSecret: !prev.showSecret }));
                                                                else setFlowintel(prev => ({ ...prev, showSecret: !prev.showSecret }));
                                                            }}
                                                            className={cn(
                                                                "absolute right-3 top-1/2 -translate-y-1/2 transition-colors",
                                                                soarMode === 'thehive' ? "text-amber-500/40 hover:text-amber-400" : "text-violet-500/40 hover:text-violet-400"
                                                            )}
                                                        >
                                                            {(soarMode === 'thehive' ? thehive.showSecret : flowintel.showSecret) ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </AnimatePresence>

                                        {/* Mode Toggle Switch */}
                                        <div className="flex justify-center pt-8 pb-1">
                                            <div className="bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/5 flex items-center gap-1 relative z-20">
                                                <button 
                                                    onClick={() => handleSoarToggle('thehive')}
                                                    className={cn(
                                                        "px-5 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-[0.1em] transition-all duration-500",
                                                        soarMode === 'thehive' 
                                                            ? "bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]" 
                                                            : "text-white/40 hover:text-white/60"
                                                    )}
                                                >
                                                    TheHive
                                                </button>
                                                <button 
                                                    onClick={() => handleSoarToggle('flowintel')}
                                                    className={cn(
                                                        "px-5 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-[0.1em] transition-all duration-500",
                                                        soarMode === 'flowintel' 
                                                            ? "bg-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]" 
                                                            : "text-white/40 hover:text-white/60"
                                                    )}
                                                >
                                                    Flowintel
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 pt-2">
                                        <motion.button
                                            whileHover={{ y: -1, backgroundColor: soarMode === 'thehive' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(139, 92, 246, 0.12)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleTestConnection(soarMode)}
                                            disabled={(soarMode === 'thehive' ? thehive.status : flowintel.status) === 'testing' || !(soarMode === 'thehive' ? thehive.url : flowintel.url)}
                                            className={cn(
                                                "flex-1 py-3 rounded-xl border text-[10px] font-mono font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-500",
                                                (soarMode === 'thehive' ? thehive.status : flowintel.status) === 'connected'
                                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                                                    : (soarMode === 'thehive' ? thehive.status : flowintel.status) === 'failed'
                                                    ? "bg-red-500/20 border-red-500/40 text-red-400"
                                                    : soarMode === 'thehive'
                                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:border-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                                                        : "bg-violet-500/10 border-violet-500/30 text-violet-500 hover:border-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
                                            )}
                                        >
                                            <AnimatePresence mode="wait">
                                                {(soarMode === 'thehive' ? thehive.status : flowintel.status) === 'testing' ? (
                                                    <motion.div key="testing" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
                                                        <Loader2 size={14} className={cn("animate-spin", soarMode === 'thehive' ? "text-cyan-400" : "text-amber-400")} /> 
                                                        <span>Testing...</span>
                                                    </motion.div>
                                                ) : (soarMode === 'thehive' ? thehive.status : flowintel.status) === 'connected' ? (
                                                    <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                                                        <Check size={14} /> 
                                                        <span>Connected</span>
                                                    </motion.div>
                                                ) : (soarMode === 'thehive' ? thehive.status : flowintel.status) === 'failed' ? (
                                                    <motion.div key="failed" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                                                        <X size={14} /> 
                                                        <span>Failed</span>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                                                        <Plug size={14} /> 
                                                        <span>Test Connection</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>

                                        <motion.button
                                            whileHover={{ y: -1, backgroundColor: soarMode === 'thehive' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(139, 92, 246, 0.12)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleSaveIntegration(soarMode)}
                                            disabled={saving === soarMode || !(soarMode === 'thehive' ? thehive.url : flowintel.url)}
                                            className={cn(
                                                "flex-1 py-3 rounded-xl border text-[10px] font-mono font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-500",
                                                saveSuccess === soarMode
                                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                                    : soarMode === 'thehive'
                                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:border-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                                                        : "bg-violet-500/10 border-violet-500/30 text-violet-500 hover:border-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
                                            )}
                                        >
                                            <AnimatePresence mode="wait">
                                                {saving === soarMode ? (
                                                    <motion.div key="saving" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
                                                        <Loader2 size={14} className="animate-spin" /> 
                                                        <span>Saving...</span>
                                                    </motion.div>
                                                ) : saveSuccess === soarMode ? (
                                                    <motion.div key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                                                        <Check size={14} /> 
                                                        <span>Saved</span>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="save-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                                                        <Save size={14} /> 
                                                        <span>Save & Apply</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="max-w-md w-full bg-slate-900/90 border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
                        >
                            <div className="flex flex-col items-center text-center space-y-6">
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden border",
                                    confirmModal === 'thehive' ? "bg-amber-500/10 border-amber-500/20" : "bg-violet-500/10 border-violet-500/20"
                                )}>
                                    <img 
                                        src={confirmModal === 'thehive' ? "/assets/TheHive Logo.png" : "/assets/flowintel_logo.png"} 
                                        alt="SOAR Logo" 
                                        className={cn(
                                            "object-contain transition-all duration-500",
                                            confirmModal === 'thehive' ? "w-[85%] h-[85%]" : "w-[80%] h-[80%] brightness-[2.5] contrast-[1.2]"
                                        )}
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-white tracking-wider uppercase">
                                        Shift SOAR Engine?
                                    </h3>
                                    <p className="text-sm text-slate-400 font-medium leading-relaxed">
                                        You are about to switch the primary orchestration engine to <span className={cn("font-bold", confirmModal === 'thehive' ? "text-amber-400" : "text-violet-400")}>{confirmModal.toUpperCase()}</span>. All active cases and escalation routes will pivot immediately.
                                    </p>
                                </div>
                                
                                <div className="flex gap-4 w-full pt-2">
                                    <button 
                                        onClick={() => setConfirmModal(null)}
                                        className="flex-1 px-6 py-3 rounded-xl border border-white/5 bg-white/5 text-xs font-mono font-black text-white/40 hover:text-white/60 hover:bg-white/10 transition-all uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={confirmSoarSwitch}
                                        className={cn(
                                            "flex-1 px-6 py-3 rounded-xl text-xs font-mono font-black text-white transition-all uppercase tracking-widest shadow-lg",
                                            confirmModal === 'thehive' ? "bg-amber-500 hover:bg-amber-400" : "bg-violet-500 hover:bg-violet-400"
                                        )}
                                    >
                                        Confirm Shift
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IntegrationSettings;
