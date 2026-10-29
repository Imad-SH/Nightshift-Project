import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Eye, EyeOff, Check, Save, X, ExternalLink, Loader2, Crosshair, Trash2, Key, Settings, Plug, Upload, ImageOff } from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { apiBase } from '../config';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const IOC_COLORS: Record<string, string> = {
    IP:     'bg-blue-500/10 border-blue-500/30 text-blue-400',
    URL:    'bg-amber-500/10 border-amber-500/30 text-amber-400',
    Domain: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    File:   'bg-rose-500/10 border-rose-500/30 text-rose-400',
    Email:  'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    CVE:    'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
};

interface BuiltinSource {
    id: string;
    name: string;
    abbr: string;
    color: string;
    bg: string;
    description: string;
    settingsKey: string;
    iocTypes: string[];
    website: string;
    free: boolean;
    logo?: string;
    testEndpoint?: string;
    authType?: 'header' | 'bearer' | 'query_param';
    authParam?: string;
}

const BUILTIN_SOURCES: BuiltinSource[] = [
    {
        id: 'virustotal',
        name: 'VirusTotal',
        abbr: 'VT',
        color: '#4285f4',
        bg: 'rgba(66,133,244,0.12)',
        description: 'Multi-engine scanning across 70+ AV engines for IPs, URLs, domains, and files.',
        settingsKey: 'virustotal_api_key',
        iocTypes: ['IP', 'URL', 'Domain', 'File'],
        website: 'virustotal.com',
        free: true,
        logo: '/assets/VT Icon.PNG',
        testEndpoint: 'https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8',
        authType: 'header',
        authParam: 'x-apikey',
    },
    {
        id: 'abuseipdb',
        name: 'AbuseIPDB',
        abbr: 'AI',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
        description: 'Community-driven IP abuse reports database for tracking malicious hosts and botnets.',
        settingsKey: 'abuseipdb_api_key',
        iocTypes: ['IP'],
        website: 'abuseipdb.com',
        free: true,
        logo: '/assets/abuseipdb-logo.png',
        testEndpoint: 'https://api.abuseipdb.com/api/v2/check?ipAddress=8.8.8.8',
        authType: 'header',
        authParam: 'Key',
    },
    {
        id: 'urlscan',
        name: 'URLScan.io',
        abbr: 'US',
        color: '#f97316',
        bg: 'rgba(249,115,22,0.12)',
        description: 'URL and domain scanner capturing screenshots, DOM trees, and full request waterfall.',
        settingsKey: 'urlscan_api_key',
        iocTypes: ['URL', 'Domain'],
        website: 'urlscan.io',
        free: true,
        logo: '/assets/Urlscan logo.png',
        testEndpoint: 'https://urlscan.io/api/v1/search/?q=domain:google.com&size=1',
        authType: 'header',
        authParam: 'API-Key',
    },
    {
        id: 'greynoise',
        name: 'GreyNoise',
        abbr: 'GN',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.1)',
        description: 'Identifies benign internet scanners to reduce alert noise and focus on real threats.',
        settingsKey: 'greynoise_api_key',
        iocTypes: ['IP'],
        website: 'greynoise.io',
        free: true,
        logo: '/assets/GreyNoise Logo.png',
        testEndpoint: 'https://api.greynoise.io/v3/community/8.8.8.8',
        authType: 'header',
        authParam: 'key',
    },
    {
        id: 'shodan',
        name: 'Shodan',
        abbr: 'SH',
        color: '#dc2626',
        bg: 'rgba(220,38,38,0.12)',
        description: 'Search engine for internet-connected devices — exposes open ports, banners, and CVEs.',
        settingsKey: 'shodan_api_key',
        iocTypes: ['IP'],
        website: 'shodan.io',
        free: false,
        logo: '/assets/Shodan Logo.png',
        testEndpoint: 'https://api.shodan.io/api-info',
        authType: 'query_param',
        authParam: 'key',
    },
    {
        id: 'otx',
        name: 'AlienVault OTX',
        abbr: 'OTX',
        color: '#d97706',
        bg: 'rgba(217,119,6,0.12)',
        description: 'Open Threat Exchange — crowd-sourced IOC feeds with pulses and threat indicators.',
        settingsKey: 'alienvault_api_key',
        iocTypes: ['IP', 'Domain', 'URL', 'File'],
        website: 'otx.alienvault.com',
        free: true,
        logo: '/assets/OTX Logo.png',
        testEndpoint: 'https://otx.alienvault.com/api/v1/indicators/IPv4/8.8.8.8/general',
        authType: 'header',
        authParam: 'X-OTX-API-KEY',
    },
    {
        id: 'hybrid',
        name: 'Hybrid Analysis',
        abbr: 'HA',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.12)',
        description: 'Online sandbox with deep behavioral analysis for suspicious files and URLs.',
        settingsKey: 'hybrid_analysis_api_key',
        iocTypes: ['File', 'URL'],
        website: 'hybrid-analysis.com',
        free: true,
        logo: '/assets/Hybrid Analysis logo.png',
        testEndpoint: 'https://hybrid-analysis.com/api/v2/overview/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        authType: 'header',
        authParam: 'api-key',
    },
    {
        id: 'mxtoolbox',
        name: 'MxToolbox',
        abbr: 'MX',
        color: '#0ea5e9',
        bg: 'rgba(14,165,233,0.12)',
        description: 'DNS lookups, blacklist checks, and mail server health diagnostics for domains.',
        settingsKey: 'mxtoolbox_api_key',
        iocTypes: ['Domain'],
        website: 'mxtoolbox.com',
        free: false,
        logo: '/assets/MxToolBox Logo.png',
        testEndpoint: 'https://api.mxtoolbox.com/api/v1/lookup/mx/google.com',
        authType: 'header',
        authParam: 'Authorization',
    },
    {
        id: 'abusech',
        name: 'Abuse.ch Suite',
        abbr: 'AC',
        color: '#16a34a',
        bg: 'rgba(22,163,74,0.12)',
        description: 'ThreatFox, URLhaus & MalwareBazaar — free community threat intelligence from Abuse.ch.',
        settingsKey: 'threatfox_api_key',
        iocTypes: ['File', 'URL', 'Domain'],
        website: 'abuse.ch',
        free: true,
        logo: '/assets/abuse_ch-icon.avif',
        testEndpoint: 'https://threatfox-api.abuse.ch/api/v1/',
        authType: 'header',
        authParam: 'Auth-Key',
    },
    {
        id: 'emailrep',
        name: 'EmailRep',
        abbr: 'ER',
        color: '#7c3aed',
        bg: 'rgba(124,58,237,0.12)',
        description: 'Email address reputation scoring to detect phishing senders, spam, and fraud.',
        settingsKey: 'emailrep_api_key',
        iocTypes: ['Email'],
        website: 'emailrep.io',
        free: true,
        logo: '/assets/email_rep_logo.png',
        testEndpoint: 'https://emailrep.io/query/test@gmail.com',
        authType: 'header',
        authParam: 'Key',
    },
    {
        id: 'nvd',
        name: 'NIST NVD',
        abbr: 'NVD',
        color: '#1d4ed8',
        bg: 'rgba(29,78,216,0.12)',
        description: 'Official U.S. National Vulnerability Database for authoritative CVE lookups and CVSS scoring.',
        settingsKey: 'nvd_api_key',
        iocTypes: ['CVE'],
        website: 'nvd.nist.gov',
        free: true,
        logo: '/assets/nist-logo.png',
        testEndpoint: 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2021-44228',
        authType: 'header',
        authParam: 'apiKey',
    },
];

// ─── Source Logo Avatar ────────────────────────────────────────────────────────
const SourceAvatar = ({
    abbr, color, bg, logo,
}: { abbr: string; color: string; bg: string; logo?: string }) => {
    const [imgFailed, setImgFailed] = useState(false);

    return (
        <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: bg, border: `1px solid ${color}50` }}
        >
            {logo && !imgFailed ? (
                <img
                    src={logo}
                    alt={abbr}
                    className="w-7 h-7 object-contain"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <span className="text-[11px] font-bold" style={{ color }}>{abbr}</span>
            )}
        </div>
    );
};

// ─── Individual CTI Card ───────────────────────────────────────────────────────
const CTICard = ({
    source,
    currentKey,
    onSave,
    onDelete,
    onEdit,
    isCustom = false,
}: {
    source: BuiltinSource & { isCustom?: boolean };
    currentKey: string;
    onSave: (key: string) => Promise<void>;
    onDelete?: () => void;
    onEdit?: () => void;
    isCustom?: boolean;
}) => {
    const { token } = useSocAuth();
    const [localKey, setLocalKey] = useState(currentKey);
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    const baseUrl = apiBase();

    const handleTestKey = async () => {
        const keyToTest = localKey.trim() || currentKey.trim();
        if (!keyToTest) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${baseUrl}/api/settings/verify-cti`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    provider: source.id,
                    key: keyToTest,
                    // lets the backend test a saved key, which the UI only sees masked
                    settings_key: source.settingsKey,
                    ...(isCustom && {
                        test_url: (source as any).testEndpoint || undefined,
                        auth_type: (source as any).authType || 'header',
                        auth_param: (source as any).authParam || 'X-API-Key',
                    }),
                })
            });
            if (res.ok) {
                setTestResult('success');
            } else {
                setTestResult('failed');
            }
        } catch (err) {
            console.error('Failed to verify CTI key:', err);
            setTestResult('failed');
        } finally {
            setTesting(false);
            setTimeout(() => setTestResult(null), 3000);
        }
    };

    useEffect(() => { setLocalKey(currentKey); }, [currentKey]);

    const isConfigured = currentKey.trim() !== '';
    const hasChanges = localKey !== currentKey;
    const c = source.color;

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(localKey.trim());
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{
                boxShadow: '0 0 0 1px rgba(103,137,198,0.45), 0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(103,137,198,0.2)',
                y: -2,
                background: 'linear-gradient(145deg, rgba(103,137,198,0.13) 0%, rgba(86,121,187,0.06) 40%, rgba(2,6,23,0.6) 100%)',
            }}
            transition={{ duration: 0.2 }}
            className="relative rounded-2xl p-5 flex flex-col gap-4"
            style={{
                background: 'linear-gradient(145deg, rgba(103,137,198,0.08) 0%, rgba(86,121,187,0.04) 40%, rgba(2,6,23,0.6) 100%)',
                border: '1px solid rgba(103,137,198,0.25)',
                boxShadow: '0 0 0 1px rgba(103,137,198,0.06), 0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(103,137,198,0.12)',
                backdropFilter: 'blur(20px)',
            }}
        >

            {/* Header */}
            <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3.5 min-w-0">
                    {/* Logo */}
                    <div className="w-12 h-12 flex items-center justify-center shrink-0">
                        {source.logo && !logoFailed ? (
                            <img
                                src={source.logo}
                                alt={source.name}
                                className="w-10 h-10 object-contain"
                                style={{ filter: `drop-shadow(0 0 8px ${c}70)` }}
                                onError={() => setLogoFailed(true)}
                            />
                        ) : (
                            <span className="text-[13px] font-bold" style={{ color: c }}>{source.abbr}</span>
                        )}
                    </div>

                    {/* Name + website */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-bold text-white leading-tight">{source.name}</h3>
                        </div>
                        <a
                            href={`https://${source.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1 mt-0.5"
                        >
                            {source.website}
                            <ExternalLink size={9} />
                        </a>
                    </div>
                </div>

                {/* Badges / Action Trio */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {(localKey.trim() || currentKey.trim()) && (
                        <div className="relative inline-flex">
                            <button
                                onClick={handleTestKey}
                                disabled={testing}
                                className={cn(
                                    "p-1.5 rounded-lg transition-all active:scale-95 flex items-center justify-center border",
                                    testResult === 'success'
                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40"
                                        : testResult === 'failed'
                                        ? "bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40"
                                        : "bg-cyan-500/10 border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-300"
                                )}
                                title={testing ? 'Testing connection…' : testResult === 'success' ? 'Connection Valid' : testResult === 'failed' ? 'Connection Failed' : 'Test API Connection'}
                            >
                                <Plug size={14} />
                            </button>

                            {/* Floating Tooltip/Popover window for Test API Connection */}
                            <AnimatePresence>
                                {(testing || testResult) && (
                                    <motion.div
                                        initial={{ opacity: 0, x: "-50%", y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: "-50%", y: 8, scale: 0.95 }}
                                        className="absolute bottom-full mb-2.5 left-1/2 z-30 w-44 p-2.5 rounded-xl backdrop-blur-md border shadow-[0_12px_36px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center text-center gap-1.5"
                                        style={{
                                            background: 'rgba(15,23,42,0.95)',
                                            borderColor: testResult === 'success'
                                                ? 'rgba(16,185,129,0.35)'
                                                : testResult === 'failed'
                                                ? 'rgba(239,68,68,0.35)'
                                                : 'rgba(131,162,212,0.35)',
                                        }}
                                    >
                                        {/* Downward pointing arrow */}
                                        <div
                                            className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-[5px] w-2.5 h-2.5 rotate-45 border-r border-b"
                                            style={{
                                                background: 'rgba(15,23,42,0.95)',
                                                borderColor: testResult === 'success'
                                                    ? 'rgba(16,185,129,0.35)'
                                                    : testResult === 'failed'
                                                    ? 'rgba(239,68,68,0.35)'
                                                    : 'rgba(131,162,212,0.35)',
                                            }}
                                        />

                                        {testing ? (
                                            <div className="flex items-center gap-2 text-cyan-400 text-[10px] font-bold uppercase tracking-wider">
                                                <Loader2 size={12} className="animate-spin text-cyan-400" />
                                                <span>Testing API Key...</span>
                                            </div>
                                        ) : testResult === 'success' ? (
                                            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                                                <Check size={12} className="text-emerald-400" />
                                                <span>Connection Valid</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                                                <X size={12} className="text-rose-400" />
                                                <span>Connection Failed</span>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-300 transition-all active:scale-95 flex items-center justify-center"
                            title="Edit configuration"
                        >
                            <Settings size={14} />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => setShowConfirmDelete(true)}
                            className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 transition-all active:scale-95 flex items-center justify-center"
                            title="Remove source"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Description */}
            <p className="text-[12px] text-slate-400/80 leading-relaxed flex-1 relative z-10">{source.description}</p>

            {/* IOC badges */}
            <div className="flex flex-wrap gap-1.5 relative z-10">
                {source.iocTypes.map(type => (
                    <span key={type} className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-md border', IOC_COLORS[type] || IOC_COLORS.IP)}>
                        {type}
                    </span>
                ))}
            </div>

            {/* API Key */}
            <div className="space-y-1.5 relative z-10">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-400/70 flex items-center gap-1.5">
                    <Key size={11} className="text-cyan-400/60" />
                    API Key
                </label>
                <div className="relative">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={localKey}
                        onChange={(e) => setLocalKey(e.target.value)}
                        placeholder={isConfigured ? '••••••••••••••••••••' : 'Enter API key…'}
                        className="w-full bg-slate-950/70 focus:outline-none rounded-xl py-2.5 pl-3.5 pr-9 text-[12px] text-slate-300 placeholder:text-slate-700 font-mono transition-all"
                        style={{ border: `1px solid ${c}20` }}
                        onFocus={e => { e.currentTarget.style.borderColor = `${c}55`; e.currentTarget.style.boxShadow = `0 0 0 3px ${c}10`; }}
                        onBlur={e => { e.currentTarget.style.borderColor = `${c}20`; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                    >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                </div>
            </div>

            {/* Save button */}
            <button
                onClick={handleSave}
                disabled={(!hasChanges && !saved) || saving}
                className="relative z-10 w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                style={saved ? {
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.35)',
                    color: '#34d399',
                    boxShadow: '0 0 16px rgba(16,185,129,0.12)',
                } : hasChanges ? {
                    background: `${c}15`,
                    border: `1px solid ${c}45`,
                    color: c,
                    boxShadow: `0 0 16px ${c}12`,
                } : {
                    background: 'rgba(15,23,42,0.6)',
                    border: '1px solid rgba(30,41,59,0.5)',
                    color: '#334155',
                    cursor: 'not-allowed',
                }}
            >
                {saving ? (
                    <><Loader2 size={12} className="animate-spin" />Saving…</>
                ) : saved ? (
                    <><Check size={12} />Saved</>
                ) : (
                    <><Save size={12} />Save</>
                )}
            </button>

            <AnimatePresence>
                {showConfirmDelete && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center p-4 text-center backdrop-blur-md bg-slate-950/90 border border-rose-500/30"
                    >
                        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-3 text-rose-400 animate-pulse">
                            <Trash2 size={20} />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">Remove {source.name}?</h4>
                        <p className="text-[11px] text-slate-400 max-w-[220px] mb-4">
                            This will disable the integration and remove the active key.
                        </p>
                        <div className="flex gap-2 w-full max-w-[200px]">
                            <button
                                onClick={() => setShowConfirmDelete(false)}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowConfirmDelete(false);
                                    if (onDelete) onDelete();
                                }}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-rose-500 text-white hover:bg-rose-400 shadow-[0_0_16px_rgba(239,68,68,0.25)] transition-all active:scale-95"
                            >
                                Delete
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ─── Add Custom Source Modal ───────────────────────────────────────────────────
const PRESET_COLORS = [
    '#83a2d4', '#4285f4', '#ef4444', '#f97316', '#a855f7',
    '#16a34a', '#d97706', '#0ea5e9', '#7c3aed', '#94a3b8',
];

const IOC_TYPES_ALL = ['IP', 'Domain', 'URL', 'File', 'Email', 'CVE'];

const AddSourceModal = ({
    isOpen,
    onClose,
    onAdd,
    onEdit,
    editSource = null,
}: {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (source: any) => void;
    onEdit?: (source: any) => void;
    editSource?: any;
}) => {
    const [name, setName] = useState('');
    const [abbr, setAbbr] = useState('');
    const [color, setColor] = useState('#83a2d4');
    const [website, setWebsite] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [testEndpoint, setTestEndpoint] = useState('');
    const [authType, setAuthType] = useState<'header' | 'bearer' | 'query_param'>('header');
    const [authParam, setAuthParam] = useState('X-API-Key');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [showKey, setShowKey] = useState(false);
    const [logo, setLogo] = useState('');
    const [logoUrlMode, setLogoUrlMode] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isValid = name.trim() && abbr.trim() && selectedTypes.length > 0;

    const reset = () => {
        setName(''); setAbbr(''); setWebsite(''); setApiKey(''); setBaseUrl('');
        setTestEndpoint(''); setAuthType('header'); setAuthParam('X-API-Key');
        setSelectedTypes([]); setColor('#83a2d4'); setShowKey(false);
        setLogo(''); setLogoUrlMode(false);
    };

    useEffect(() => {
        if (editSource) {
            setName(editSource.name || '');
            setAbbr(editSource.abbr || '');
            setColor(editSource.color || '#83a2d4');
            setWebsite(editSource.website || '');
            setApiKey(editSource.apiKey || editSource.currentKey || '');
            setBaseUrl(editSource.baseUrl || '');
            setTestEndpoint(editSource.testEndpoint || '');
            setAuthType(editSource.authType || 'header');
            setAuthParam(editSource.authParam || 'X-API-Key');
            setSelectedTypes(editSource.iocTypes || []);
            setLogo(editSource.logo || '');
        } else {
            reset();
        }
    }, [editSource, isOpen]);

    const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setLogo(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleClose = () => { reset(); onClose(); };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) return;
        
        const payload = {
            id: editSource ? editSource.id : `custom-${Date.now()}`,
            name: name.trim(),
            abbr: abbr.trim().slice(0, 4).toUpperCase(),
            color,
            bg: `${color}20`,
            description: editSource ? editSource.description : `Custom CTI source: ${name.trim()}`,
            settingsKey: editSource ? editSource.settingsKey : `custom_cti_${name.trim().toLowerCase().replace(/\s+/g, '_')}_key`,
            iocTypes: selectedTypes,
            website: website.trim(),
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            testEndpoint: testEndpoint.trim(),
            authType,
            authParam: authParam.trim() || 'X-API-Key',
            logo: logo.trim() || undefined,
            free: editSource ? editSource.free : false,
            isCustom: editSource ? editSource.isCustom : true,
        };

        if (editSource && onEdit) {
            onEdit(payload);
        } else {
            onAdd(payload);
        }
        reset();
        onClose();
    };

    const toggleType = (t: string) =>
        setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        className="relative w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-cyan-500/15 shrink-0">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2.5">
                                {editSource ? <Settings size={15} className="text-cyan-400" /> : <Plus size={15} className="text-cyan-400" />}
                                {editSource ? 'Edit CTI Source' : 'Add CTI Source'}
                            </h3>
                            <button onClick={handleClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar flex-1">
                            {/* Dummy hidden inputs to absorb browser autofill */}
                            <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0, overflow: 'hidden' }}>
                                <input type="text" name="prevent_autofill_username" tabIndex={-1} autoComplete="new-password" />
                                <input type="password" name="prevent_autofill_password" tabIndex={-1} autoComplete="new-password" />
                            </div>

                            {/* Preview */}
                            <div className="flex items-center gap-3 p-3 bg-slate-950/40 border border-slate-800 rounded-xl">
                                <SourceAvatar abbr={abbr || '??'} color={color} bg={`${color}20`} logo={logo || undefined} />
                                <div>
                                    <p className="text-sm font-medium text-white">{name || 'Source Name'}</p>
                                    <p className="text-[11px] text-slate-600">{website || 'website.com'}</p>
                                </div>
                            </div>

                            {/* Logo Upload */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Source Logo</label>
                                <div className="flex items-center gap-3">
                                    {/* Clickable upload box */}
                                    <div
                                        className="relative w-14 h-14 rounded-xl flex items-center justify-center cursor-pointer group overflow-hidden shrink-0 transition-all"
                                        style={{ background: `${color}18`, border: `1px dashed ${color}50` }}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {logo ? (
                                            <>
                                                <img src={logo} alt="logo" className="w-9 h-9 object-contain" onError={() => setLogo('')} />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                                    <Upload size={14} className="text-white" />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1">
                                                <Upload size={15} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                                                <span className="text-[8px] text-slate-600 group-hover:text-slate-400 transition-colors">Upload</span>
                                            </div>
                                        )}
                                        <input ref={fileInputRef} type="file" accept="image/*,image/svg+xml,.avif,.webp" className="hidden" onChange={handleLogoFile} />
                                    </div>

                                    {/* URL / clear controls */}
                                    <div className="flex-1 space-y-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setLogoUrlMode(v => !v)}
                                            className="text-[10px] text-cyan-500/60 hover:text-cyan-400 transition-colors"
                                        >
                                            {logoUrlMode ? '↑ Hide URL input' : 'Or paste image URL…'}
                                        </button>
                                        {logoUrlMode && (
                                            <input
                                                value={logo.startsWith('data:') ? '' : logo}
                                                onChange={(e) => setLogo(e.target.value)}
                                                placeholder="https://example.com/logo.png"
                                                className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-1.5 px-3 text-[11px] text-slate-200 transition-all placeholder:text-slate-600 font-mono"
                                            />
                                        )}
                                        {logo && (
                                            <button type="button" onClick={() => setLogo('')} className="flex items-center gap-1 text-[10px] text-rose-400/60 hover:text-rose-400 transition-colors">
                                                <ImageOff size={10} /> Remove logo
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Source Name *</label>
                                    <input
                                        autoFocus
                                        autoComplete="off"
                                        name="cti-source-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. ThreatConnect"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Abbreviation *</label>
                                    <input
                                        value={abbr}
                                        onChange={(e) => setAbbr(e.target.value.slice(0, 4).toUpperCase())}
                                        placeholder="e.g. TC"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600 uppercase font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Website</label>
                                    <input
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                        placeholder="example.com"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Base URL</label>
                                    <input
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder="https://api.example.com"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            {/* Test Connection Config */}
                            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/50 border border-cyan-500/10">
                                <label className="text-[11px] font-bold text-cyan-400/60 uppercase tracking-wider flex items-center gap-1.5">
                                    <Plug size={11} />
                                    API Test Configuration
                                </label>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">Test Endpoint URL</label>
                                    <input
                                        value={testEndpoint}
                                        onChange={(e) => setTestEndpoint(e.target.value)}
                                        placeholder="https://api.example.com/v1/ping"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600 font-mono text-[11px]"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Auth Method</label>
                                        <select
                                            value={authType}
                                            onChange={(e) => {
                                                const v = e.target.value as 'header' | 'bearer' | 'query_param';
                                                setAuthType(v);
                                                setAuthParam(v === 'bearer' ? 'Authorization' : v === 'query_param' ? 'api_key' : 'X-API-Key');
                                            }}
                                            className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all"
                                        >
                                            <option value="header">API Key Header</option>
                                            <option value="bearer">Bearer Token</option>
                                            <option value="query_param">Query Param</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                                            {authType === 'query_param' ? 'Param Name' : 'Header Name'}
                                        </label>
                                        <input
                                            value={authParam}
                                            onChange={(e) => setAuthParam(e.target.value)}
                                            placeholder={authType === 'bearer' ? 'Authorization' : authType === 'query_param' ? 'api_key' : 'X-API-Key'}
                                            disabled={authType === 'bearer'}
                                            className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 px-3 text-sm text-slate-200 transition-all placeholder:text-slate-600 font-mono text-[11px] disabled:opacity-40"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Color picker */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">Brand Color</label>
                                <div className="flex items-center gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColor(c)}
                                            className={cn(
                                                'w-6 h-6 rounded-lg transition-all',
                                                color === c ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/50 scale-110' : 'hover:scale-105'
                                            )}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* IOC Types */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider">IOC Types *</label>
                                <div className="flex flex-wrap gap-2">
                                    {IOC_TYPES_ALL.map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => toggleType(type)}
                                            className={cn(
                                                'text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all',
                                                selectedTypes.includes(type)
                                                    ? IOC_COLORS[type]
                                                    : 'border-slate-700 text-slate-600 hover:border-slate-600 hover:text-slate-400'
                                            )}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* API Key */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-cyan-400/60 uppercase tracking-wider flex items-center gap-1.5">
                                    <Key size={12} className="text-cyan-400/50" />
                                    API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="Enter API key…"
                                        className="w-full bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none rounded-lg py-2 pl-3 pr-9 text-sm text-slate-200 transition-all placeholder:text-slate-600 font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey(v => !v)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-cyan-400 transition-colors"
                                    >
                                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 py-2.5 bg-transparent hover:bg-white/5 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 text-sm font-medium transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!isValid}
                                    className={cn(
                                        'flex-[1.5] py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2',
                                        isValid
                                            ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
                                            : 'bg-slate-800/60 text-slate-600 cursor-not-allowed border border-slate-700/50'
                                    )}
                                >
                                    {editSource ? <Save size={15} /> : <Plus size={15} />}
                                    {editSource ? 'Save Changes' : 'Add Source'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
export const CTIConfiguration = () => {
    const { token } = useSocAuth();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [customSources, setCustomSources] = useState<any[]>([]);
    const [builtinOverrides, setBuiltinOverrides] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editSource, setEditSource] = useState<any>(null);

    const baseUrl = apiBase();

    const fetchSettings = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${baseUrl}/api/settings/`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
                if (data.custom_cti_sources) {
                    try { setCustomSources(JSON.parse(data.custom_cti_sources)); } catch {}
                }
                if (data.builtin_cti_overrides) {
                    try { setBuiltinOverrides(JSON.parse(data.builtin_cti_overrides)); } catch {}
                }
            }
        } catch (err) {
            console.error('Failed to load CTI settings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchSettings(); }, [token]);

    const patchSetting = async (key: string, value: string) => {
        if (!token) return;
        await fetch(`${baseUrl}/api/settings/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ [key]: value }),
        });
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const saveCustomSources = async (sources: any[]) => {
        const json = JSON.stringify(sources);
        await patchSetting('custom_cti_sources', json);
        setCustomSources(sources);
    };

    const handleAddCustom = async (source: any) => {
        const updated = [...customSources, source];
        await saveCustomSources(updated);
        if (source.apiKey) {
            await patchSetting(source.settingsKey, source.apiKey);
        }
    };

    const handleDeleteCustom = (idx: number) => {
        const updated = customSources.filter((_, i) => i !== idx);
        saveCustomSources(updated);
    };

    const handleOpenEdit = (source: any) => {
        setEditSource(source);
        setIsAddModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditSource(null);
        setIsAddModalOpen(false);
    };

    const handleEditCustom = async (updatedSource: any) => {
        const updated = customSources.map(s => s.id === updatedSource.id ? updatedSource : s);
        await saveCustomSources(updated);
        if (updatedSource.apiKey) {
            await patchSetting(updatedSource.settingsKey, updatedSource.apiKey);
        }
    };

    const handleEditBuiltin = async (updatedSource: any) => {
        const updated = {
            ...builtinOverrides,
            [updatedSource.id]: {
                ...builtinOverrides[updatedSource.id],
                name: updatedSource.name,
                abbr: updatedSource.abbr,
                color: updatedSource.color,
                bg: updatedSource.bg,
                website: updatedSource.website,
                baseUrl: updatedSource.baseUrl,
                iocTypes: updatedSource.iocTypes,
            }
        };
        await patchSetting('builtin_cti_overrides', JSON.stringify(updated));
        setBuiltinOverrides(updated);
        
        if (updatedSource.apiKey) {
            await patchSetting(updatedSource.settingsKey, updatedSource.apiKey);
        }
    };

    const handleDeleteBuiltin = async (id: string) => {
        const updated = {
            ...builtinOverrides,
            [id]: { ...(builtinOverrides[id] || {}), hidden: true }
        };
        await patchSetting('builtin_cti_overrides', JSON.stringify(updated));
        setBuiltinOverrides(updated);
    };

    const handleRestoreDefaults = async () => {
        const updated = { ...builtinOverrides };
        Object.keys(updated).forEach(id => {
            if (updated[id]) {
                updated[id].hidden = false;
            }
        });
        await patchSetting('builtin_cti_overrides', JSON.stringify(updated));
        setBuiltinOverrides(updated);
    };

    const mergedBuiltins = BUILTIN_SOURCES.map(source => {
        const overrides = builtinOverrides[source.id] || {};
        return { ...source, ...overrides };
    });

    const activeBuiltins = mergedBuiltins.filter(s => !s.hidden);

    const configuredCount = activeBuiltins.filter(s => settings[s.settingsKey]?.trim()).length
        + customSources.filter(s => settings[s.settingsKey]?.trim()).length;
    const totalCount = activeBuiltins.length + customSources.length;

    const hasHiddenBuiltins = Object.values(builtinOverrides).some((o: any) => o.hidden);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-cyan-400" size={24} />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-6 max-w-[1400px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                            <Crosshair size={18} className="text-cyan-400" />
                            CTI Configuration
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Manage threat intelligence API keys —{' '}
                            <span className="text-cyan-500/70">{configuredCount}/{totalCount} configured</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {hasHiddenBuiltins && (
                            <button
                                onClick={handleRestoreDefaults}
                                className="px-3.5 py-2 bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-slate-100 rounded-lg text-sm font-semibold transition-colors"
                            >
                                Restore Defaults
                            </button>
                        )}
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <Plus size={15} />
                            Add Source
                        </button>
                    </div>
                </div>

                {/* Cards Grid */}
                <motion.div
                    layout
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                    <AnimatePresence mode="popLayout">
                        {activeBuiltins.map(source => (
                            <CTICard
                                key={source.id}
                                source={source}
                                currentKey={settings[source.settingsKey] || ''}
                                onSave={(key) => patchSetting(source.settingsKey, key)}
                                onEdit={() => handleOpenEdit(source)}
                                onDelete={() => handleDeleteBuiltin(source.id)}
                            />
                        ))}

                        {customSources.map((cs, i) => (
                            <CTICard
                                key={cs.id || `custom-${i}`}
                                source={cs}
                                currentKey={settings[cs.settingsKey] || cs.apiKey || ''}
                                onSave={(key) => patchSetting(cs.settingsKey, key)}
                                onEdit={() => handleOpenEdit(cs)}
                                onDelete={() => handleDeleteCustom(i)}
                                isCustom
                            />
                        ))}

                        {/* Add Source card */}
                        <motion.button
                            key="add-source-card"
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -2 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setIsAddModalOpen(true)}
                            className="group relative rounded-2xl p-5 flex flex-col items-center justify-center gap-4 min-h-[200px] cursor-pointer overflow-hidden hover:bg-cyan-500/[0.04] transition-colors duration-200"
                            style={{
                                background: 'transparent',
                                border: '1px dashed rgba(103,137,198,0.20)',
                            }}
                        >
                            <div
                                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300"
                                style={{
                                    background: 'linear-gradient(145deg, rgba(131,162,212,0.15), rgba(131,162,212,0.05))',
                                    border: '1px solid rgba(131,162,212,0.25)',
                                    boxShadow: '0 0 20px rgba(131,162,212,0.1)',
                                }}
                            >
                                <Plus size={24} className="text-cyan-400/70 group-hover:text-cyan-300 transition-colors duration-300" />
                            </div>
                            <div className="text-center relative z-10">
                                <p className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors duration-300 tracking-wide">Add CTI Source</p>
                                <p className="text-[11px] text-slate-600 group-hover:text-slate-400 mt-1 transition-colors duration-300">Connect a custom threat intel feed</p>
                            </div>
                        </motion.button>
                    </AnimatePresence>
                </motion.div>
            </div>

            <AddSourceModal
                isOpen={isAddModalOpen}
                onClose={handleCloseModal}
                onAdd={handleAddCustom}
                onEdit={editSource?.isCustom ? handleEditCustom : handleEditBuiltin}
                editSource={editSource ? {
                    ...editSource,
                    currentKey: settings[editSource.settingsKey] || ''
                } : null}
            />
        </div>
    );
};
