import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Wifi, Cloud, X, Globe, Bot, ChevronDown, Save, Loader2, Check, Eye, EyeOff } from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import OrbLoader from './OrbLoader';
import { apiBase } from '../config';

const getProviderLogo = (model: string) => {
    const m = model.toLowerCase();
    if (m.includes('gpt') || m.startsWith('o1') || m.startsWith('o3')) return '/assets/Openai.png';
    if (m.includes('claude')) return '/assets/Anthropic.png';
    if (m.includes('gemini')) return '/assets/Gemini.png';
    return '/assets/Nebius AI.jpg';
};

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}



export const LLMSettings = ({ onSubTabChange }: { onSubTabChange?: (tab: string | null) => void }) => {
    const { token } = useSocAuth();
    const [activeSection] = useState<'PERSONAL' | 'STATS' | null>('PERSONAL');
    const [arch, setArch] = useState<'API' | 'LOCAL'>('API');
    const [, setStrategy] = useState<'OPTIMIZED' | 'AGGRESSIVE'>(
        () => (localStorage.getItem('ai_analysis_strategy') as 'OPTIMIZED' | 'AGGRESSIVE') || 'OPTIMIZED'
    );
    const [minThreshold, setMinThreshold] = useState<number>(
        () => parseInt(localStorage.getItem('ai_analysis_min_threshold') || '7')
    );
    const [maxThreshold, setMaxThreshold] = useState<number>(
        () => parseInt(localStorage.getItem('ai_analysis_max_threshold') || '15')
    );

    useEffect(() => {
        // Ensure breadcrumbs are reset if we're at top level on mount
        if (activeSection === null) onSubTabChange?.(null);
    }, [onSubTabChange, activeSection]);

    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [openAgentDropdown, setOpenAgentDropdown] = useState<string | null>(null);
    const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
    const [fetchingModels, setFetchingModels] = useState<string | null>(null);
    const [modelSearch, setModelSearch] = useState<Record<string, string>>({});
    const [savingProvider, setSavingProvider] = useState<string | null>(null);
    const [visibleProviders, setVisibleProviders] = useState<string[]>([]);
    const [savedProviders, setSavedProviders] = useState<string[]>([]);
    const [verifiedProviders, setVerifiedProviders] = useState<string[]>([]);
    const [failedProviders, setFailedProviders] = useState<string[]>([]);
    
    const [savingGateway, setSavingGateway] = useState(false);
    const [gatewayVerified, setGatewayVerified] = useState(false);
    const [gatewayFailed, setGatewayFailed] = useState(false);

    const [configData, setConfigData] = useState({
        nebiusKey: '',
        openaiKey: '',
        anthropicKey: '',
        geminiKey: '',
        customUrl: 'https://api.tokenfactory.nebius.com/v1/',
        agent1Model: 'deepseek-ai/DeepSeek-V4.1-Flash',
        agent1Prompt: '',
        agent3Model: 'deepseek-ai/DeepSeek-V4-Pro',
        agent3Prompt: '',
        localUrl: 'http://localhost:11434/v1/',
        localAgent1Model: 'llama3',
        localAgent3Model: 'llama3'
    });

    const handleSaveGateway = async () => {
        const url = arch === 'API' ? configData.customUrl : configData.localUrl;
        if (!url || !token) return;
        setSavingGateway(true);
        setGatewayFailed(false);
        setGatewayVerified(false);
        
        try {
            const resp = await fetch(`${apiBase()}/api/settings/verify-provider`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    provider: 'gateway', 
                    key: url 
                })
            });

            if (resp.ok) {
                const key = arch === 'API' ? 'nebius_base_url' : 'local_base_url';
                await fetch(`${apiBase()}/api/settings/`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ [key]: url })
                });
                setGatewayVerified(true);
            } else {
                setGatewayFailed(true);
            }
        } catch (err) {
            setGatewayFailed(true);
        } finally {
            setSavingGateway(false);
        }
    };

    const handleSaveProvider = async (provider: string) => {
        const key = configData[`${provider}Key` as keyof typeof configData];
        if (!key || !token) return;

        setSavingProvider(provider);
        try {
            const resp = await fetch(`${apiBase()}/api/settings/verify-provider`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ provider, key })
            });

            if (resp.ok) {
                // Persistent save in DB
                await fetch(`${apiBase()}/api/settings/`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ [`${provider}_api_key`]: key })
                });

                setVerifiedProviders(prev => Array.from(new Set([...prev, provider])));
                setSavedProviders(prev => [...prev, provider]);
            } else {
                setFailedProviders(prev => [...prev, provider]);
                setTimeout(() => setFailedProviders(prev => prev.filter(p => p !== provider)), 2000);
            }
        } catch (err) {
            console.error("❌ Handshake failure:", err);
            setFailedProviders(prev => [...prev, provider]);
            setTimeout(() => setFailedProviders(prev => prev.filter(p => p !== provider)), 2000);
        } finally {
            setSavingProvider(null);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            if (!token) return;
            try {
                const response = await fetch(`${apiBase()}/api/settings/`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.ai_analysis_strategy) {
                        setStrategy(data.ai_analysis_strategy);
                        localStorage.setItem('ai_analysis_strategy', data.ai_analysis_strategy);
                    }
                    if (data.ai_analysis_min_threshold) {
                        setMinThreshold(data.ai_analysis_min_threshold);
                        localStorage.setItem('ai_analysis_min_threshold', data.ai_analysis_min_threshold.toString());
                    }
                    if (data.ai_analysis_max_threshold) {
                        setMaxThreshold(data.ai_analysis_max_threshold);
                        localStorage.setItem('ai_analysis_max_threshold', data.ai_analysis_max_threshold.toString());
                    }
                    
                    // Sync configData with DB
                    setConfigData(prev => ({
                        ...prev,
                        nebiusKey: data.nebius_api_key || '',
                        openaiKey: data.openai_api_key || '',
                        anthropicKey: data.anthropic_api_key || '',
                        geminiKey: data.gemini_api_key || '',
                        customUrl: data.nebius_base_url || prev.customUrl,
                        agent1Model: data.agent1_model || prev.agent1Model,
                        agent1Prompt: data.agent1_prompt || prev.agent1Prompt,
                        agent3Model: data.agent3_model || prev.agent3Model,
                        agent3Prompt: data.agent3_prompt || prev.agent3Prompt,
                        localUrl: data.local_base_url || prev.localUrl,
                        localAgent1Model: data.local_agent1_model || prev.localAgent1Model,
                        localAgent3Model: data.local_agent3_model || prev.localAgent3Model
                    }));

                    if (data.ai_architecture) {
                        setArch(data.ai_architecture);
                    }

                    // Persist verified visual states upon recovery
                    const verified = [];
                    if (data.nebius_api_key) verified.push('nebius');
                    if (data.openai_api_key) verified.push('openai');
                    if (data.anthropic_api_key) verified.push('anthropic');
                    if (data.gemini_api_key) verified.push('gemini');
                    setVerifiedProviders(verified);
                    setSavedProviders(verified);
                    // We don't mark as verified automatically anymore. 
                    // User must click save/verify to confirm connectivity.
                    setGatewayVerified(false);
                }
            } catch (err) {
                console.error("❌ Error fetching detailed settings:", err);
            }
        };
        fetchSettings();
    }, [token]);

    const handleThresholdsChange = async (newMin: number, newMax: number) => {
        setMinThreshold(newMin);
        setMaxThreshold(newMax);
        localStorage.setItem('ai_analysis_min_threshold', newMin.toString());
        localStorage.setItem('ai_analysis_max_threshold', newMax.toString());
        if (!token) return;
        try {
            await fetch(`${apiBase()}/api/settings/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    ai_analysis_min_threshold: newMin,
                    ai_analysis_max_threshold: newMax 
                })
            });
        } catch (err) {
            console.error("❌ Network error persisting thresholds change:", err);
        }
    };
    
    const handleArchChange = async (newArch: 'API' | 'LOCAL') => {
        setArch(newArch);
        if (!token) return;
        try {
            await fetch(`${apiBase()}/api/settings/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ai_architecture: newArch })
            });
            // Also reload integrations to invalidate LLM clients
            await fetch(`${apiBase()}/api/settings/reload-integrations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error("Failed to save architecture preference", err);
        }
    };

    const handleSaveConfig = async () => {
        if (!token) return;
        const updates = [
            { key: 'nebius_api_key', value: configData.nebiusKey },
            { key: 'openai_api_key', value: configData.openaiKey },
            { key: 'anthropic_api_key', value: configData.anthropicKey },
            { key: 'gemini_api_key', value: configData.geminiKey },
            { key: 'nebius_base_url', value: configData.customUrl },
            { key: 'agent1_model', value: configData.agent1Model },
            { key: 'agent1_prompt', value: configData.agent1Prompt },
            { key: 'agent3_model', value: configData.agent3Model },
            { key: 'agent3_prompt', value: configData.agent3Prompt },
            { key: 'local_base_url', value: configData.localUrl },
            { key: 'local_agent1_model', value: configData.localAgent1Model },
            { key: 'local_agent3_model', value: configData.localAgent3Model },
            { key: 'ai_architecture', value: arch }
        ];

        try {
            await Promise.all(updates.map(update =>
                fetch(`${apiBase()}/api/settings/`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ [update.key]: update.value })
                })
            ));
            setIsConfigOpen(false);
        } catch (err) {
            console.error("❌ Failed to save neural config:", err);
        }
    };

    const handleOpenAgentDropdown = async (agId: string) => {
        if (openAgentDropdown === agId) { setOpenAgentDropdown(null); setModelSearch(prev => ({ ...prev, [agId]: '' })); return; }
        setOpenAgentDropdown(agId);
        if (fetchedModels[agId] || !configData.nebiusKey) return;
        setFetchingModels(agId);
        try {
            const provider = arch === 'LOCAL' ? 'gateway' : 'nebius';
            const key = arch === 'LOCAL' ? configData.localUrl : configData.nebiusKey;
            const base_url = arch === 'LOCAL' ? configData.localUrl : configData.customUrl;

            const resp = await fetch(`${apiBase()}/api/settings/get-provider-models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ provider, key, base_url })
            });
            if (resp.ok) {
                const data = await resp.json();
                setFetchedModels(prev => ({ ...prev, [agId]: data.models || [] }));
            }
        } catch (e) {
            console.error('Failed to fetch models', e);
        } finally {
            setFetchingModels(null);
        }
    };



    return (
        <div className="h-full w-full flex flex-col p-6 overflow-hidden relative">
            <div className="absolute inset-0 micro-grid-bg opacity-[0.03] pointer-events-none" />
            
            <AnimatePresence mode="wait">
                    <motion.div
                        key="section"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex-1 flex flex-col h-full min-h-0 pt-0"
                    >

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 flex flex-col justify-center pb-6">
                            {activeSection === 'PERSONAL' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-7xl mx-auto py-4">
                                    {/* ARCHITECTURE SELECTOR */}
                                    <div className="relative group">
                                        <div className="absolute -inset-4 bg-emerald-500/10 rounded-[60px] blur-[40px] opacity-100 transition-opacity duration-1000" />
                                        
                                        <motion.div 
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="relative bg-gradient-to-br from-slate-900/95 via-cyan-950/40 to-slate-900/95 backdrop-blur-[20px] border-[2px] border-cyan-500/60 rounded-[40px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] transition-all duration-700 overflow-hidden h-full flex flex-col min-h-[300px] group/card"
                                        >
                                            {/* BACKGROUND DECORATIONS - MATCHED TO LIVE ALERTS */}
                                            <div className="absolute inset-0 overflow-hidden rounded-[40px] pointer-events-none">
                                                <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
                                                <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-[80px]" />
                                            </div>

                                            {/* HEADER SECTION */}
                                            <div className="pt-12 pb-6 flex flex-col items-center text-center pointer-events-none z-10">
                                                <h3 className="text-lg font-mono font-black uppercase tracking-[0.4em] text-white bg-clip-text drop-shadow-[0_0_15px_rgba(138,162,238,0.4)]">LLM Gateway</h3>
                                                <div className="flex items-center gap-4 mt-2">
                                                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-cyan-400/60" />
                                                    <p className="text-[11px] text-slate-300 font-bold uppercase tracking-[0.3em] group-hover/card:text-cyan-400 transition-colors">Choose Environment</p>
                                                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-cyan-400/60" />
                                                </div>
                                            </div>

                                            {/* CENTERED CORE CONTROLS - INLINE ROW SYNCED WITH STRATEGY CARD */}
                                            <div className="flex-1 flex items-center justify-center w-full px-6 mb-8 group-hover:mb-10 transition-all duration-500">
                                                <div className="flex items-center justify-center gap-8 w-full overflow-visible">
                                                    
                                                    {/* CLOUD SIDE - INLINE */}
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <motion.div 
                                                                whileHover={{ scale: 1.1 }}
                                                                whileTap={{ scale: 0.9 }}
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    handleArchChange('API');
                                                                    setIsConfigOpen(true); 
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl cursor-pointer hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(138,162,238,0.2)] transition-all",
                                                                    arch === 'API' ? "text-cyan-400 border-cyan-400/50 shadow-[0_0_15px_rgba(138,162,238,0.3)]" : "text-white/20"
                                                                )}
                                                            >
                                                                <Settings size={16} className={cn(arch === 'API' && "animate-spin-slow")} />
                                                            </motion.div>
                                                            
                                                            <div className={cn(
                                                                "w-14 h-14 flex items-center justify-center rounded-2xl transition-all duration-500",
                                                                arch === 'API' ? "bg-cyan-400 text-slate-900 shadow-[0_0_25px_rgba(138,162,238,0.5)]" : "bg-white/10 text-white/20 opacity-50 shadow-none border border-white/5"
                                                            )}>
                                                                <Cloud size={28} />
                                                            </div>
                                                        </div>
                                                        <span className={cn(
                                                            "text-[10px] font-mono font-black uppercase tracking-widest transition-colors whitespace-nowrap",
                                                            arch === 'API' ? "text-cyan-100 premium-cyan-glow" : "text-white/20"
                                                        )}>Cloud</span>
                                                    </div>

                                                    {/* COSMIC TOGGLE - PERFECT CENTER AXIS */}
                                                    <div className="flex items-center justify-center min-w-[120px] z-20 relative">
                                                        <label className="cosmic-toggle flex-shrink-0 scale-[0.75] active:scale-[0.7]">
                                                            <input 
                                                                className="toggle" 
                                                                type="checkbox" 
                                                                checked={arch === 'LOCAL'}
                                                                onChange={(e) => handleArchChange(e.target.checked ? 'LOCAL' : 'API')}
                                                            />
                                                            <div className={cn(
                                                                "cosmic-slider border-2 duration-500 transition-colors",
                                                                arch === 'LOCAL' ? "border-cyan-500/50" : "border-cyan-500/50"
                                                            )}>
                                                                <div className="cosmos"></div>
                                                                <div className="energy-line"></div>
                                                                <div className="energy-line"></div>
                                                                <div className="energy-line"></div>
                                                                <div className="toggle-orb">
                                                                    <div className="inner-orb"></div>
                                                                    <div className="ring-fx"></div>
                                                                </div>
                                                                <div className="particles">
                                                                    {[...Array(6)].map((_, i) => (
                                                                        <div key={i} style={{ "--angle": `${i * 60}deg` } as any} className="particle"></div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    </div>

                                                    {/* LOCAL SIDE - INLINE */}
                                                    <div className="flex items-center gap-4">
                                                        <span className={cn(
                                                            "text-[10px] font-mono font-black uppercase tracking-widest transition-colors whitespace-nowrap",
                                                            arch === 'LOCAL' ? "text-cyan-100 premium-cyan-glow" : "text-white/20"
                                                        )}>Local</span>
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "w-14 h-14 flex items-center justify-center rounded-2xl transition-all duration-500 border border-white/5",
                                                                arch === 'LOCAL' ? "bg-cyan-400 text-slate-900 shadow-[0_0_25px_rgba(138,162,238,0.5)]" : "bg-white/10 text-white/20 opacity-50"
                                                            )}>
                                                                <Wifi size={28} />
                                                            </div>

                                                            <motion.div 
                                                                whileHover={{ scale: 1.1 }}
                                                                whileTap={{ scale: 0.9 }}
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    handleArchChange('LOCAL');
                                                                    setIsConfigOpen(true); 
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl cursor-pointer hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(138,162,238,0.2)] transition-all",
                                                                    arch === 'LOCAL' ? "text-cyan-400 border-cyan-400/50 shadow-[0_0_15px_rgba(138,162,238,0.3)]" : "text-white/20"
                                                                )}
                                                            >
                                                                <Settings size={16} className={cn(arch === 'LOCAL' && "animate-spin-slow")} />
                                                            </motion.div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* OPERATION MODE TOGGLE */}
                                    <div className="relative group z-10">
                                        <div className="absolute -inset-4 bg-cyan-500/5 rounded-[60px] blur-[40px] opacity-100 transition-opacity duration-1000" />
                                        
                                        <motion.div 
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 }}
                                            className="relative bg-gradient-to-br from-slate-900/95 via-cyan-950/40 to-slate-900/95 backdrop-blur-[20px] border-[2px] border-cyan-500/60 rounded-[40px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] transition-all duration-700 h-full flex flex-col min-h-[300px] group/card"
                                        >
                                            <div className="absolute inset-0 overflow-hidden rounded-[40px] pointer-events-none">
                                                <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
                                                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-[80px] transition-all duration-700" />
                                            </div>

                                            <div className="pt-12 pb-6 flex flex-col items-center text-center pointer-events-none z-10">
                                                <h3 className="text-lg font-mono font-black uppercase tracking-[0.4em] text-white drop-shadow-[0_0_15px_rgba(138,162,238,0.4)]">AI Analysis Strategy</h3>
                                                <div className="flex items-center gap-4 mt-2">
                                                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-cyan-400/60" />
                                                    <p className="text-[11px] text-slate-300 font-bold uppercase tracking-[0.3em] group-hover/card:text-cyan-400 transition-colors">Select a range</p>
                                                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-cyan-400/60" />
                                                </div>
                                            </div>

                                            <div className="flex-1 flex flex-col items-center justify-center w-full px-12 mb-6 mt-2">
                                                <div className="w-full relative">
                                                    {/* Custom Dual Cyber Slider */}
                                                    <div className="relative w-full h-2 bg-slate-900 border border-cyan-500/30 rounded-full">
                                                        <div 
                                                            className="absolute w-full h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 rounded-full shadow-[0_0_10px_rgba(138,162,238,0.5)]"
                                                            style={{ 
                                                                clipPath: `inset(0% ${100 - ((maxThreshold - 1) / 14) * 100}% 0% ${((minThreshold - 1) / 14) * 100}% round 9999px)`
                                                            }}
                                                        />
                                                        <input 
                                                            type="range" 
                                                            min="1" 
                                                            max="15" 
                                                            value={minThreshold} 
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                if (val <= maxThreshold) handleThresholdsChange(val, maxThreshold);
                                                            }}
                                                            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none custom-dual-range -top-[1px] left-0 m-0"
                                                        />
                                                        <input 
                                                            type="range" 
                                                            min="1" 
                                                            max="15" 
                                                            value={maxThreshold} 
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                if (val >= minThreshold) handleThresholdsChange(minThreshold, val);
                                                            }}
                                                            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none custom-dual-range -top-[1px] left-0 m-0"
                                                        />
                                                    </div>
                                                    
                                                    {/* Labels */}
                                                    <div className="flex justify-between items-center w-full mt-4 text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 relative">
                                                        <span className={cn(minThreshold <= 3 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "text-white/20")}>
                                                            LOW
                                                        </span>
                                                        <span className="text-cyan-400 premium-cyan-glow absolute left-1/2 -translate-x-1/2 text-center w-32">
                                                            LEVEL {minThreshold} - {maxThreshold}
                                                        </span>
                                                        <span className={cn(maxThreshold >= 12 ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" : "text-white/20")}>
                                                            CRITICAL
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-12 flex items-center justify-center gap-3 w-full">
                                                    <div className="tactical-tooltip-trigger flex-shrink-0">
                                                        <div className="tactical-tooltip-icon text-cyan-400 border-cyan-400 shadow-[0_0_10px_rgba(138,162,238,0.4)]">
                                                            <svg viewBox="0 0 320 512" className="w-3.5 h-3.5 fill-current">
                                                                <path d="M80 160c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64v3.6c0 21.8-11.1 42.1-29.4 53.8l-42.2 27.1c-25.2 16.2-40.4 44.1-40.4 74V320c0 17.7 14.3 32 32 32s32-14.3 32-32v-1.4c0-8.2 4.2-15.8 11-20.2l42.2-27.1c36.6-23.6 58.8-64.1 58.8-107.7V160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 17.7 14.3 32 32 32s32-14.3 32-32zm80 320a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"></path>
                                                            </svg>
                                                        </div>
                                                        <div className="tactical-tooltip-content">
                                                            Alerts with a severity level between {minThreshold} and {maxThreshold} will be automatically sent to the AI triage pipeline.
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap text-left leading-relaxed">
                                                        Automatic AI triage triggers on severity <span className="text-cyan-400">[{minThreshold} - {maxThreshold}]</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>
                                </div>
                            )}

                            {activeSection === 'STATS' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto py-4">
                                    {[
                                        { label: 'Alert Exposure', value: '1,424', sub: 'TOTAL INSPECTIONS', color: 'text-cyan-400' },
                                        { label: 'Compute Time', value: '18h 42m', sub: 'TOTAL SYSTEM HANDSHAKE', color: 'text-emerald-400' },
                                        { label: 'Intelligence cost', value: '$0.008', sub: 'SESSION UNIT VALUE', color: 'text-amber-400' }
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-slate-900/50 border border-white/5 rounded-[32px] p-8 backdrop-blur-xl relative overflow-hidden text-center flex flex-col justify-center gap-4 group hover:border-white/10 transition-all ring-1 ring-white/5">
                                            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
                                            <p className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-[0.3em]">{stat.label}</p>
                                            <h4 className={cn("text-4xl font-mono font-black premium-cyan-glow", stat.color)}>{stat.value}</h4>
                                            <p className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-[0.2em]">{stat.sub}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
            </AnimatePresence>

            <AnimatePresence>
                {isConfigOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/20 backdrop-blur-md transform-gpu backface-hidden"
                    >
                        <motion.div 
                            initial={{ scale: 0.98, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.98, opacity: 0, y: 10 }}
                            className="max-w-3xl w-full max-h-[90vh] bg-cyan-950/40 backdrop-blur-xl border-2 border-cyan-500/30 rounded-[32px] shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col relative transform-gpu overscroll-contain"
                        >
                            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent opacity-50 z-20"></div>

                            <div className="px-10 py-7 flex items-center justify-between relative z-10 bg-transparent">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-xl font-mono font-black text-white uppercase tracking-[0.3em] drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                                        {arch === 'API' ? 'Cloud API Settings' : 'Local LLM Settings'}
                                    </h2>
                                </div>
                                <button 
                                    onClick={() => setIsConfigOpen(false)}
                                    className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all font-mono font-black text-lg"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar px-10 py-6 space-y-8 relative z-10 isolate" style={{ transform: 'translateZ(0)' }}>
                                {arch === 'API' && (
                                    <section className="space-y-4">
                                        <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(138,162,238,0.8)]">1. LLM Providers</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            {[
                                                { id: 'nebius', label: 'Nebius AI', value: configData.nebiusKey, logo: '/assets/Nebius AI.jpg' },
                                                { id: 'openai', label: 'OpenAI', value: configData.openaiKey, logo: '/assets/Openai.png' },
                                                { id: 'anthropic', label: 'Anthropic', value: configData.anthropicKey, logo: '/assets/Anthropic.png' },
                                                { id: 'gemini', label: 'Gemini', value: configData.geminiKey, logo: '/assets/Gemini.png' }
                                            ].map((prov) => (
                                                <div key={prov.id} className={cn(
                                                    "bg-cyan-500/[0.05] border rounded-2xl p-6 flex flex-col items-center gap-4 group transition-all duration-300 shadow-[0_0_30px_rgba(138,162,238,0.1)] ring-1 ring-cyan-500/10",
                                                    failedProviders.includes(prov.id) ? "border-red-500/60 bg-red-500/5 animate-[shake_0.4s_ease-in-out_infinite]" : "border-cyan-400/30 hover:border-cyan-400/60"
                                                )}>
                                                    <div className="h-16 w-full flex items-center justify-center relative">
                                                        <div className={cn(
                                                            "transition-all duration-300",
                                                            prov.id === 'openai' ? "w-20 h-20 brightness-0 invert" : 
                                                            prov.id === 'nebius' ? "w-14 h-14 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(205,255,50,0.2)]" : "w-14 h-14",
                                                            verifiedProviders.includes(prov.id) ? "drop-shadow-[0_0_25px_rgba(138,162,238,0.6)] scale-110" : "opacity-100"
                                                        )}>
                                                            <img src={prov.logo} alt={prov.label} className={cn("w-full h-full object-contain", prov.id === 'nebius' && "rounded-2xl")} />
                                                        </div>
                                                        
                                                        {verifiedProviders.includes(prov.id) && (
                                                            <div className="absolute -bottom-[14px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(138,162,238,0.8)] animate-pulse z-10" />
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col items-center gap-2 w-full pt-3">
                                                        <span className={cn("text-[11px] font-mono font-black uppercase tracking-[0.2em] transition-colors duration-300", prov.value ? "text-white" : "text-slate-100/90")}>
                                                            {prov.label}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setVisibleProviders(prev => prev.includes(prov.id) ? prev.filter(p => p !== prov.id) : [...prev, prov.id])}
                                                            className="text-cyan-400/50 hover:text-cyan-400 transition-colors"
                                                        >
                                                            {visibleProviders.includes(prov.id) ? <Eye size={13} /> : <EyeOff size={13} />}
                                                        </button>
                                                    </div>

                                                    <div className="w-full flex flex-col gap-2">
                                                        <input
                                                            type={visibleProviders.includes(prov.id) ? "text" : "password"}
                                                            value={prov.value}
                                                            onChange={(e) => {
                                                                setConfigData({...configData, [`${prov.id}Key`]: e.target.value});
                                                                setVerifiedProviders(prev => prev.filter(p => p !== prov.id));
                                                                setSavedProviders(prev => prev.filter(p => p !== prov.id));
                                                                setFailedProviders(prev => prev.filter(p => p !== prov.id));
                                                            }}
                                                            className="w-full bg-cyan-950/80 border border-cyan-500/40 rounded-xl px-3 py-3 text-[11px] font-mono font-black text-white placeholder:text-cyan-400/30 focus:outline-none focus:border-cyan-400 transition-all text-center tracking-[0.1em]"
                                                            placeholder="API KEY"
                                                        />
                                                        <button 
                                                            onClick={() => handleSaveProvider(prov.id)}
                                                            disabled={savingProvider === prov.id}
                                                            className={cn(
                                                                "w-full py-2 border rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm",
                                                                savedProviders.includes(prov.id) ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : 
                                                                failedProviders.includes(prov.id) ? "text-red-400 border-red-500/40 bg-red-500/10" : "bg-cyan-500/5 hover:bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-400/60 text-cyan-400/60 hover:text-cyan-400"
                                                            )}
                                                        >
                                                            {savingProvider === prov.id ? (
                                                                <Loader2 size={14} className="animate-spin" />
                                                            ) : savedProviders.includes(prov.id) ? (
                                                                <Check size={14} className="text-emerald-400" />
                                                            ) : failedProviders.includes(prov.id) ? (
                                                                <X size={14} className="text-red-400" />
                                                            ) : (
                                                                <Save size={14} />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className="space-y-4">
                                    <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(138,162,238,0.8)]">
                                        2. {arch === 'API' ? 'Cloud Gateway' : 'Local Gateway'}
                                    </h3>
                                    <div className={cn(
                                        "bg-indigo-500/[0.05] border rounded-2xl p-8 ring-1 transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.05)]",
                                        gatewayVerified ? "border-emerald-500/50 bg-emerald-500/5 ring-emerald-500/20" : 
                                        gatewayFailed ? "border-red-500/50 bg-red-500/5 ring-red-500/20 animate-shake" : "border-indigo-400/30 ring-indigo-500/10 hover:border-indigo-400/60"
                                    )}>
                                        <div className="flex items-center gap-4 bg-indigo-950/80 border border-indigo-500/40 rounded-xl px-6 py-5 focus-within:border-indigo-400 transition-all">
                                            {savingGateway ? (
                                                <Loader2 size={18} className="text-cyan-400 animate-spin" />
                                            ) : gatewayVerified ? (
                                                <Check size={18} className="text-emerald-400" />
                                            ) : gatewayFailed ? (
                                                <X size={18} className="text-red-400" />
                                            ) : (
                                                <Globe size={18} className="text-indigo-400/60" />
                                            )}
                                            
                                            <input 
                                                type="text"
                                                value={arch === 'API' ? configData.customUrl : configData.localUrl}
                                                onChange={(e) => {
                                                    if (arch === 'API') {
                                                        setConfigData({...configData, customUrl: e.target.value});
                                                    } else {
                                                        setConfigData({...configData, localUrl: e.target.value});
                                                    }
                                                    setGatewayVerified(false);
                                                    setGatewayFailed(false);
                                                }}
                                                className="w-full bg-transparent text-sm font-mono text-indigo-400 focus:outline-none tracking-wider font-bold"
                                                placeholder={arch === 'API' ? "NEBIUS API URL" : "LOCAL OLLAMA/VLLM URL"}
                                            />

                                            <button 
                                                onClick={handleSaveGateway}
                                                disabled={savingGateway || (arch === 'API' ? !configData.customUrl : !configData.localUrl)}
                                                className={cn(
                                                    "p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl transition-all",
                                                    gatewayVerified ? "text-emerald-400 border-emerald-400/50" : 
                                                    gatewayFailed ? "text-red-400 border-red-500/40" : "text-indigo-400/60 hover:text-indigo-400 hover:border-indigo-400/50"
                                                )}
                                            >
                                                <Save size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(138,162,238,0.8)]">3. AI Agents Configuration</h3>
                                    <div className="space-y-8">
                                        {[
                                            { id: 'agent1', label: 'Agent-01', sub: 'IoC Extraction' },
                                            { id: 'agent3', label: 'Agent-03', sub: 'Analysis & Final Verdict' }
                                        ].map((ag) => {
                                            const currentModelValue = arch === 'API' 
                                                ? configData[`${ag.id}Model` as keyof typeof configData]
                                                : configData[`local${ag.id.charAt(0).toUpperCase() + ag.id.slice(1)}Model` as keyof typeof configData];
                                            
                                            const fallbackModels = arch === 'API' ? [
                                                { value: "deepseek-ai/DeepSeek-V4.1-Flash", label: "DeepSeek-V4.1-Flash" },
                                                { value: "deepseek-ai/DeepSeek-V4-Pro", label: "DeepSeek-V4-Pro" },
                                                { value: "Qwen/Qwen3-235B-A22B-Instruct-2507", label: "Qwen3-235B-A22B-Instruct" },
                                                { value: "Qwen/Qwen3-30B-A3B-Instruct-2507", label: "Qwen3-30B-A3B-Instruct" }
                                            ] : [
                                                { value: "llama3", label: "Llama 3 (Ollama)" },
                                                { value: "mistral", label: "Mistral (Ollama)" },
                                                { value: "codellama", label: "CodeLlama (Ollama)" }
                                            ];
                                            const isFetchingThis = fetchingModels === ag.id;
                                            const dynamicModels = fetchedModels[ag.id]?.map(m => ({ value: m, label: m.split('/').pop() || m }));
                                            const allModels = isFetchingThis ? [] : (dynamicModels?.length ? dynamicModels : fallbackModels);
                                            const searchTerm = (modelSearch[ag.id] || '').toLowerCase();
                                            const models = searchTerm ? allModels.filter(m => m.label.toLowerCase().includes(searchTerm)) : allModels;
                                            const currentModel = allModels.find(m => m.value === currentModelValue) || (currentModelValue ? { value: currentModelValue as string, label: (currentModelValue as string).split('/').pop() || currentModelValue as string } : null);

                                            return (
                                                <div key={ag.id} className="bg-emerald-500/[0.05] border border-emerald-400/30 rounded-[32px] p-8 space-y-6 ring-1 ring-emerald-500/10 group hover:border-emerald-400/60 transition-all duration-300 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <OrbLoader size={0.55} maskId={`orb-${ag.id}`} />
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-base font-mono font-black text-white uppercase tracking-[0.15em] leading-none">{ag.label}</span>
                                                                <span className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-[0.25em]">{ag.sub}</span>
                                                            </div>
                                                        </div>
                                                        {arch === 'API' && (
                                                            <img
                                                                src={getProviderLogo(currentModelValue as string || '')}
                                                                alt="provider"
                                                                className="w-10 h-10 rounded-xl object-contain"
                                                            />
                                                        )}
                                                        {arch === 'LOCAL' && (
                                                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(138,162,238,0.2)]">
                                                                <Wifi size={20} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-4">
                                                        <p className="text-[9px] font-mono font-black text-emerald-500/60 uppercase tracking-[0.3em] px-1">Model Selection</p>
                                                        <div className="relative">
                                                            {arch === 'LOCAL' ? (
                                                                <div className="w-full flex items-center gap-4 px-6 py-4 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl focus-within:border-emerald-400/60 transition-all font-mono group/input">
                                                                    <span className="text-emerald-400">
                                                                        <Bot size={14} />
                                                                    </span>
                                                                    <input 
                                                                        type="text"
                                                                        value={currentModelValue as string}
                                                                        onChange={(e) => {
                                                                            const localKey = `local${ag.id.charAt(0).toUpperCase() + ag.id.slice(1)}Model`;
                                                                            setConfigData({...configData, [localKey]: e.target.value});
                                                                        }}
                                                                        className="bg-transparent text-[11px] font-black text-white uppercase tracking-widest outline-none placeholder:text-white/20 flex-1"
                                                                        placeholder="ENTER MODEL NAME (e.g. llama3)..."
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {openAgentDropdown === ag.id ? (
                                                                        <div className="w-full flex items-center justify-between px-6 py-4 bg-emerald-950/80 border border-emerald-400/60 rounded-2xl font-mono">
                                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                                <span className="text-emerald-400 flex-shrink-0">
                                                                                    {fetchingModels === ag.id ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                                                                                </span>
                                                                                <input
                                                                                    autoFocus
                                                                                    value={modelSearch[ag.id] || ''}
                                                                                    onChange={(e) => setModelSearch(prev => ({ ...prev, [ag.id]: e.target.value }))}
                                                                                    className="bg-transparent text-[11px] font-black text-white uppercase tracking-widest outline-none placeholder:text-white/30 flex-1 min-w-0"
                                                                                    placeholder="SEARCH MODEL..."
                                                                                />
                                                                            </div>
                                                                            <ChevronDown className="text-emerald-500 rotate-180 flex-shrink-0 cursor-pointer" size={16} onClick={() => handleOpenAgentDropdown(ag.id)} />
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleOpenAgentDropdown(ag.id)}
                                                                            className="w-full flex items-center justify-between px-6 py-4 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl hover:border-emerald-400/60 transition-all font-mono"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <span className="text-emerald-400">
                                                                                    {fetchingModels === ag.id ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                                                                                </span>
                                                                                <span className="text-[11px] font-black text-white uppercase tracking-widest">
                                                                                    {currentModel?.label || "Select Model"}
                                                                                </span>
                                                                            </div>
                                                                            <ChevronDown className="text-emerald-500 transition-transform duration-300" size={16} />
                                                                        </button>
                                                                    )}

                                                                    <AnimatePresence>
                                                                        {openAgentDropdown === ag.id && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, y: -6 }}
                                                                                animate={{ opacity: 1, y: 0 }}
                                                                                exit={{ opacity: 0, y: -6 }}
                                                                                className="absolute left-0 right-0 top-[calc(100%+4px)] bg-emerald-950/90 border border-emerald-500/40 rounded-2xl overflow-hidden group/options shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50"
                                                                            >
                                                                                <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col p-2 gap-1">
                                                                                    {isFetchingThis ? (
                                                                                        <div className="flex items-center justify-center gap-2 py-6 text-emerald-400/60">
                                                                                            <Loader2 size={14} className="animate-spin" />
                                                                                            <span className="text-[10px] font-mono font-black uppercase tracking-widest">Fetching Models...</span>
                                                                                        </div>
                                                                                    ) : models.map((opt) => (
                                                                                        <button
                                                                                            key={opt.value}
                                                                                            onClick={() => {
                                                                                                if (arch === 'API') {
                                                                                                    setConfigData({...configData, [`${ag.id}Model`]: opt.value});
                                                                                                } else {
                                                                                                    const localKey = `local${ag.id.charAt(0).toUpperCase() + ag.id.slice(1)}Model`;
                                                                                                    setConfigData({...configData, [localKey]: opt.value});
                                                                                                }
                                                                                                setOpenAgentDropdown(null);
                                                                                                setModelSearch(prev => ({ ...prev, [ag.id]: '' }));
                                                                                            }}
                                                                                            className={cn(
                                                                                                "relative flex items-center gap-3 px-4 py-3 rounded-lg text-[10px] font-mono font-bold transition-all duration-300 text-left",
                                                                                                currentModelValue === opt.value 
                                                                                                    ? "bg-emerald-500/20 text-white translate-x-1" 
                                                                                                    : "bg-transparent text-emerald-100/60 hover:bg-emerald-500/10 hover:text-emerald-100"
                                                                                            )}
                                                                                        >
                                                                                            {currentModelValue === opt.value && (
                                                                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                                                                            )}
                                                                                            <span className={cn(currentModelValue === opt.value ? "text-emerald-400" : "text-emerald-900")}>
                                                                                                <Bot size={14} />
                                                                                            </span>
                                                                                            {opt.label}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </>
                                                            )}
                                                        </div>

                                                        <p className="text-[9px] font-mono font-black text-emerald-500/60 uppercase tracking-[0.3em] px-1">Mission Parameters</p>
                                                        <textarea
                                                            value={configData[`${ag.id}Prompt` as keyof typeof configData] || ''}
                                                            onChange={(e) => setConfigData({...configData, [`${ag.id}Prompt`]: e.target.value})}
                                                            placeholder="Provide additional context or instructions for this agent to use in its system prompt."
                                                            className="w-full h-40 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-6 text-xs font-mono text-emerald-100/70 focus:outline-none focus:border-emerald-400 custom-scrollbar resize-none leading-relaxed transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>

                            <div className="px-10 pb-10 pt-6 flex items-center justify-end relative z-10 border-t border-white/5">
                                <button
                                    onClick={handleSaveConfig}
                                    className="group relative px-10 py-3.5 rounded-xl font-mono font-black text-[10px] uppercase tracking-[0.25em] text-white flex items-center gap-3 overflow-hidden transition-all duration-300 active:scale-[0.97] shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:shadow-[0_0_40px_rgba(16,185,129,0.35)]"
                                    style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 50%, #047857 100%)', border: '1px solid rgba(52,211,153,0.35)' }}
                                >
                                    {/* Shine sweep */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />
                                    {/* Top rim */}
                                    <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent pointer-events-none" />
                                    <Save size={13} className="text-emerald-300 flex-shrink-0 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                                    Save Configuration
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LLMSettings;
