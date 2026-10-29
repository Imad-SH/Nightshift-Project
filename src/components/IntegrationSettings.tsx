import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
    Check, ChevronRight, Copy, Eye, EyeOff, KeyRound, Loader2, Plug, RefreshCw, Save, Send,
    ShieldAlert, Webhook, X, Zap, ZapOff, Ban, Radio, Briefcase, ArrowRight,
} from 'lucide-react';
import { useSocAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { apiBase } from '../config';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// ---- API types (see backend app/api/endpoints/integrations.py) -------------------------

interface FieldDef {
    key: string;
    label: string;
    type: 'text' | 'url' | 'password' | 'number' | 'toggle' | 'select';
    required: boolean;
    placeholder: string;
    help: string;
    default: unknown;
    options: { value: string; label: string }[];
    secret: boolean;
}

interface ConnectorStatus { state: string; message: string; checked_at?: string | null }

interface ConnectorView {
    id: string;
    kind: 'siem' | 'soar';
    name: string;
    description: string;
    logo: string | null;
    fields: FieldDef[];
    values: Record<string, unknown>;
    configured: boolean;
    status: ConnectorStatus;
    // SIEM only
    ingest_path?: string;
    token_set?: boolean;
    last_alert_at?: string | null;
    legacy_path_open?: boolean;
    // SOAR only
    active?: boolean;
}

interface AutoEscalation {
    auto_escalation_enabled: boolean;
    auto_escalation_min_score: number;
    auto_escalation_verdicts: string;
}

interface IntegrationsData {
    siem: ConnectorView[];
    soar: ConnectorView[];
    active_soar: string;
    auto_escalation: AutoEscalation;
}

interface SetupGuide {
    steps: string[];
    snippets: { title: string; language: string; content: string }[];
}

// ---- presentation helpers --------------------------------------------------------------

const STATE_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
    connected: { label: 'Connected', cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
    receiving: { label: 'Receiving', cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
    ready: { label: 'Ready', cls: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300', dot: 'bg-cyan-300' },
    configured: { label: 'Configured', cls: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300', dot: 'bg-cyan-300' },
    error: { label: 'Error', cls: 'bg-red-500/10 border-red-500/40 text-red-400', dot: 'bg-red-400' },
    not_configured: { label: 'Not set up', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-400', dot: 'bg-slate-500' },
    unknown: { label: 'Checking', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-400', dot: 'bg-slate-400 animate-pulse' },
};

const VERDICTS = ['Malicious', 'Suspicious', 'False Positive'];
const SEVERITY_FLOORS = [
    { value: 4, label: 'Low and above (4+)' },
    { value: 7, label: 'Medium and above (7+)' },
    { value: 10, label: 'High and above (10+)' },
    { value: 13, label: 'Critical only (13+)' },
];

const isTrue = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

const LABEL = 'text-[10px] font-mono font-black text-cyan-400/60 uppercase tracking-[0.25em]';
const INPUT = 'w-full bg-cyan-950/60 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-[11px] font-mono font-bold text-cyan-100 placeholder:text-cyan-500/25 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(111,139,230,0.15)] transition-all tracking-wider';
const BUTTON = 'py-3 px-4 rounded-xl border text-[10px] font-mono font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed';

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Clipboard API is unavailable on plain-http pages: fall back to a hidden textarea
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
    }
}

const TOOLTIP_WIDTH = 300;

const StatusPill = ({ status }: { status: ConnectorStatus }) => {
    const style = STATE_STYLE[status.state] || STATE_STYLE.unknown;
    const reduceMotion = useReducedMotion();
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const isError = status.state === 'error';
    // "Cannot reach the Wazuh API: All connection attempts failed" -> what failed, then the technical cause
    const sep = status.message.indexOf(': ');
    const headline = sep > 0 ? status.message.slice(0, sep) : status.message;
    const cause = sep > 0 ? status.message.slice(sep + 2) : '';
    // No tooltip when the message only repeats the label ("Not set up", "Checking...")
    const informative = !!status.message && status.message.replace(/[.\s]+$/, '').toLowerCase() !== style.label.toLowerCase();

    // The tooltip is fixed on screen: close it rather than let it drift away from the pill
    useEffect(() => {
        if (!anchor) return;
        const close = () => setAnchor(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [anchor]);

    const center = anchor ? anchor.left + anchor.width / 2 : 0;
    const left = Math.min(Math.max(center - TOOLTIP_WIDTH / 2, 16), window.innerWidth - TOOLTIP_WIDTH - 16);

    return (
        <>
            <div onMouseEnter={(e) => informative && setAnchor(e.currentTarget.getBoundingClientRect())} onMouseLeave={() => setAnchor(null)}
                className={cn('flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-mono font-black uppercase tracking-[0.2em] whitespace-nowrap', informative && 'cursor-help', style.cls)}>
                <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                {style.label}
            </div>
            {createPortal(
                <AnimatePresence>
                    {anchor && (
                        <motion.div role="tooltip"
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            style={{ position: 'fixed', left, bottom: window.innerHeight - anchor.top + 12, width: TOOLTIP_WIDTH, zIndex: 999999, pointerEvents: 'none' }}>
                            <div className={cn('relative rounded-xl border bg-slate-900/95 backdrop-blur-xl px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)]',
                                isError ? 'border-red-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_30px_rgba(239,68,68,0.12)]' : 'border-cyan-500/30')}>
                                <div className={cn('absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent to-transparent', isError ? 'via-red-400/70' : 'via-cyan-400/50')} />
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className={cn('flex items-center gap-1.5 text-[9px] font-mono font-black uppercase tracking-[0.2em]', style.cls, 'bg-transparent border-0')}>
                                        <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                                        {isError ? 'Connection error' : style.label}
                                    </span>
                                    {status.checked_at && (
                                        <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">
                                            checked {formatDistanceToNow(new Date(status.checked_at), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[12px] font-semibold text-slate-100 leading-snug">{headline}</p>
                                {cause && (
                                    <p className={cn('mt-2 px-2.5 py-1.5 rounded-lg border font-mono text-[10px] leading-relaxed break-words',
                                        isError ? 'bg-red-950/40 border-red-500/20 text-red-300/90' : 'bg-cyan-950/40 border-cyan-500/20 text-cyan-300/80')}>
                                        {cause}
                                    </p>
                                )}
                                <div className={cn('absolute -bottom-[7px] w-3 h-3 rotate-45 border-r border-b bg-slate-900', isError ? 'border-red-500/40' : 'border-cyan-500/30')}
                                    style={{ left: Math.min(Math.max(center - left - 6, 12), TOOLTIP_WIDTH - 24) }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
};

/** The connector's own logo (webhook icon for the generic connectors), sized to its box. */
const LogoMark = ({ connector, iconSize = 20 }: { connector: ConnectorView; iconSize?: number }) => {
    const isFlowintel = connector.id === 'flowintel';
    const logo = connector.logo || (isFlowintel ? '/assets/flowintel_logo.png' : null);
    return logo ? (
        <img src={logo} alt={connector.name} className={cn('w-[80%] h-[80%] object-contain', isFlowintel && 'brightness-[2.5] contrast-[1.2]')} />
    ) : (
        <Webhook size={iconSize} className="text-cyan-300" />
    );
};

const ConnectorLogo = ({ connector, size = 'md' }: { connector: ConnectorView; size?: 'md' | 'lg' }) => {
    const box = size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
    return (
        <div className={cn(box, 'flex-shrink-0 rounded-xl flex items-center justify-center border border-cyan-500/30 bg-cyan-500/5 overflow-hidden')}>
            <LogoMark connector={connector} iconSize={size === 'lg' ? 26 : 20} />
        </div>
    );
};

const CodeBlock = ({ title, content }: { title: string; content: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <div className="rounded-xl border border-cyan-500/20 bg-slate-950/80 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/10 bg-cyan-500/5">
                <span className="text-[9px] font-mono font-black text-cyan-400/70 uppercase tracking-[0.2em] truncate">{title}</span>
                <button
                    onClick={async () => { if (await copyText(content)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-500/60 hover:text-cyan-300 transition-colors"
                >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="p-3 text-[10px] leading-relaxed font-mono text-cyan-100/90 overflow-x-auto max-h-56 whitespace-pre">{content}</pre>
        </div>
    );
};

// ---- form field --------------------------------------------------------------------------

const FieldInput = ({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) => {
    const [reveal, setReveal] = useState(false);

    if (field.type === 'toggle') {
        const on = isTrue(value);
        return (
            <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                <div>
                    <div className={LABEL}>{field.label}</div>
                    {field.help && <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{field.help}</div>}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => onChange(!on)}
                    className={cn('relative w-11 h-6 rounded-full border transition-all flex-shrink-0', on ? 'bg-cyan-500/40 border-cyan-400/60' : 'bg-slate-800 border-slate-600')}
                >
                    <span className={cn('absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all', on ? 'left-[22px] bg-cyan-200' : 'left-0.5 bg-slate-400')} />
                </button>
            </label>
        );
    }

    return (
        <div className="space-y-2">
            <label className={cn(LABEL, 'flex items-center gap-2')}>
                {field.label}
                {field.required && <span className="text-cyan-300/80">*</span>}
            </label>
            {field.type === 'select' ? (
                <select value={String(value ?? field.default ?? '')} onChange={(e) => onChange(e.target.value)} className={cn(INPUT, 'appearance-none cursor-pointer')}>
                    {field.options.map((o) => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
                </select>
            ) : (
                <div className="relative">
                    <input
                        type={field.secret && !reveal ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        value={String(value ?? '')}
                        autoComplete={field.secret ? 'new-password' : 'off'}
                        placeholder={field.placeholder}
                        onChange={(e) => onChange(e.target.value)}
                        className={cn(INPUT, field.secret && 'pr-12')}
                    />
                    {field.secret && (
                        <button type="button" onClick={() => setReveal(!reveal)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-500/40 hover:text-cyan-400 transition-colors">
                            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    )}
                </div>
            )}
            {field.help && <div className="text-[10px] text-slate-400 leading-relaxed">{field.help}</div>}
        </div>
    );
};

// ---- connector card ------------------------------------------------------------------------

const ConnectorCard = ({ connector, onOpen }: { connector: ConnectorView; onOpen: () => void }) => {
    const last = connector.last_alert_at ? formatDistanceToNow(new Date(connector.last_alert_at), { addSuffix: true }) : null;
    return (
        <motion.button
            whileHover={{ y: -2 }}
            onClick={onOpen}
            className="w-full text-left relative bg-gradient-to-br from-slate-900/95 via-cyan-950/30 to-slate-900/95 backdrop-blur-xl border-2 rounded-2xl p-4 transition-all group border-cyan-500/25 hover:border-cyan-400/50 hover:shadow-[0_0_24px_rgba(138,162,238,0.08)]"
        >
            {/* Case management set up: whether escalations go to it */}
            {connector.kind === 'soar' && connector.configured && (
                <span className={cn('absolute right-4 bottom-4 flex items-center gap-1.5 px-3 py-1 rounded-md border text-[9px] font-mono font-black uppercase tracking-[0.2em]',
                    connector.active ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-200' : 'bg-slate-500/10 border-slate-500/30 text-slate-400')}>
                    {connector.active ? <Check size={10} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                    {connector.active ? 'Enabled' : 'Disabled'}
                </span>
            )}
            <div className="flex items-start gap-3">
                <ConnectorLogo connector={connector} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white tracking-wider uppercase">{connector.name}</span>
                    </div>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed mt-1 line-clamp-2">{connector.description}</p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <StatusPill status={connector.status} />
                        {connector.kind === 'siem' && last && (
                            <span className="text-[9px] font-mono text-cyan-500/60 uppercase tracking-wider">Last alert {last}</span>
                        )}
                    </div>
                    {connector.legacy_path_open && (
                        <div className="flex items-start gap-1.5 mt-2 text-[9.5px] text-amber-300/90 leading-relaxed">
                            <ShieldAlert size={12} className="flex-shrink-0 mt-[1px]" />
                            Alert intake is not protected yet. Generate a token to secure it.
                        </div>
                    )}
                </div>
                <ChevronRight size={18} className="text-cyan-500/40 group-hover:text-cyan-300 transition-colors flex-shrink-0 mt-1" />
            </div>
        </motion.button>
    );
};

// ---- configuration panel ---------------------------------------------------------------------

interface PanelProps {
    connector: ConnectorView;
    activeSoar: string;
    request: (path: string, init?: RequestInit) => Promise<any>;
    onChanged: () => void;
    onClose: () => void;
    onMakeActive: (id: string) => void;
}

const ConnectorPanel = ({ connector, activeSoar, request, onChanged, onClose, onMakeActive }: PanelProps) => {
    const [values, setValues] = useState<Record<string, unknown>>(connector.values);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    // SIEM intake
    const [baseUrl, setBaseUrl] = useState(window.location.origin);
    const [guide, setGuide] = useState<SetupGuide | null>(null);
    const [newToken, setNewToken] = useState<string | null>(null);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [busy, setBusy] = useState<'token' | 'test-alert' | null>(null);
    const isSiem = connector.kind === 'siem';

    const loadGuide = useCallback(async (base: string) => {
        if (!isSiem) return;
        try {
            const data = await request(`/siem/${connector.id}/setup`, { method: 'POST', body: JSON.stringify({ base_url: base }) });
            setGuide(data.setup);
        } catch { /* shown on demand */ }
    }, [connector.id, isSiem, request]);

    useEffect(() => { if (isSiem && !newToken) loadGuide(window.location.origin); }, [isSiem, loadGuide, newToken]);

    const setValue = (key: string, v: unknown) => { setValues((prev) => ({ ...prev, [key]: v })); setResult(null); };

    const runTest = async () => {
        setTesting(true); setResult(null);
        try {
            const data = await request(`/${connector.kind}/${connector.id}/test`, { method: 'POST', body: JSON.stringify({ values }) });
            setResult({ ok: !!data.ok, message: data.message });
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally { setTesting(false); }
    };

    const save = async () => {
        setSaving(true); setResult(null);
        try {
            await request(`/${connector.kind}/${connector.id}`, { method: 'PUT', body: JSON.stringify({ values }) });
            setResult({ ok: true, message: 'Saved.' });
            onChanged();
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally { setSaving(false); }
    };

    const generateToken = async () => {
        setConfirmRegenerate(false); setBusy('token');
        try {
            const data = await request(`/siem/${connector.id}/token`, { method: 'POST', body: JSON.stringify({ base_url: baseUrl }) });
            setNewToken(data.token);
            setGuide(data.setup);
            onChanged();
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally { setBusy(null); }
    };

    const sendTestAlert = async () => {
        setBusy('test-alert'); setResult(null);
        try {
            const data = await request(`/siem/${connector.id}/test-alert`, { method: 'POST' });
            setResult({ ok: true, message: `Test alert ${data.alert_id} sent. It is now in Live Alerts.` });
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally { setBusy(null); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 sm:p-6"
            onClick={onClose}>
            {/* The panel fits the window: its header stays put and its body has its own scroll bar */}
            <motion.div initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}
                className="w-full max-w-3xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden bg-gradient-to-br from-slate-900/98 via-cyan-950/40 to-slate-900/98 border-2 border-cyan-500/40 rounded-[28px] shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]"
                onClick={(e) => e.stopPropagation()}>

                {/* header */}
                <div className="flex-shrink-0 flex items-start gap-4 px-7 pt-6 pb-5 border-b border-cyan-500/15">
                    <ConnectorLogo connector={connector} size="lg" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-xl font-black text-white tracking-wider uppercase">{connector.name}</h3>
                            <StatusPill status={connector.status} />
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{connector.description}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-7 py-6 space-y-7">
                    {/* settings form */}
                    {connector.fields.length > 0 && (
                        <section className="space-y-4">
                            <div className={cn(LABEL, 'text-cyan-300/80')}>Settings</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {connector.fields.map((f) => (
                                    <div key={f.key} className={cn(f.type === 'toggle' && 'md:col-span-2')}>
                                        <FieldInput field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button onClick={runTest} disabled={testing}
                                    className={cn(BUTTON, 'flex-1 bg-cyan-500/5 border-cyan-500/30 text-cyan-400/80 hover:border-cyan-400/60 hover:text-cyan-300')}>
                                    {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                                    {testing ? 'Testing...' : 'Test connection'}
                                </button>
                                <button onClick={save} disabled={saving}
                                    className={cn(BUTTON, 'flex-1 bg-cyan-500/15 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25')}>
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </section>
                    )}

                    {result && (
                        <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-3 text-[11px] leading-relaxed',
                            result.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300')}>
                            {result.ok ? <Check size={14} className="mt-[1px] flex-shrink-0" /> : <X size={14} className="mt-[1px] flex-shrink-0" />}
                            {result.message}
                        </div>
                    )}

                    {/* SOAR: use for escalations */}
                    {!isSiem && (
                        <section className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4">
                            <div>
                                <div className={cn(LABEL, 'text-cyan-300/80')}>Escalations</div>
                                <div className="text-[11px] text-slate-300 mt-1">
                                    {activeSoar === connector.id ? `Analysts' escalations go to ${connector.name}.` : `Send analysts' escalations to ${connector.name} instead of the current system.`}
                                </div>
                            </div>
                            {activeSoar === connector.id ? (
                                <span className="px-3 py-1.5 rounded-lg bg-cyan-400/20 border border-cyan-400/50 text-[9px] font-mono font-black text-cyan-200 uppercase tracking-[0.2em]">Active</span>
                            ) : (
                                <button onClick={() => onMakeActive(connector.id)} disabled={!connector.configured}
                                    title={connector.configured ? '' : 'Save its settings first'}
                                    className={cn(BUTTON, 'py-2 bg-cyan-500/15 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25')}>
                                    <Briefcase size={13} /> Use for escalations
                                </button>
                            )}
                        </section>
                    )}

                    {/* SIEM: alert intake */}
                    {isSiem && (
                        <section className="space-y-4">
                            <div className={cn(LABEL, 'text-cyan-300/80')}>Alert intake</div>

                            <div className="space-y-2">
                                <label className={LABEL}>Address your SIEM uses to reach Nightshift</label>
                                <div className="flex gap-2">
                                    <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={INPUT} placeholder="https://soc.example.local" />
                                    <button onClick={() => (newToken ? null : loadGuide(baseUrl))} disabled={!!newToken}
                                        title="Update the setup guide with this address"
                                        className={cn(BUTTON, 'py-2 bg-cyan-500/5 border-cyan-500/30 text-cyan-400/80 hover:text-cyan-300')}>
                                        <RefreshCw size={13} />
                                    </button>
                                </div>
                                <div className="text-[10px] text-slate-400 leading-relaxed">
                                    Intake URL: <span className="font-mono text-cyan-200/90">{baseUrl.replace(/\/+$/, '')}{connector.ingest_path}</span>
                                </div>
                            </div>

                            {newToken ? (
                                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-amber-200 text-[11px] font-bold">
                                        <KeyRound size={14} /> Copy this token now: it will not be shown again.
                                    </div>
                                    <CodeBlock title="Ingest token" content={newToken} />
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4">
                                    <div className="text-[11px] text-slate-300 leading-relaxed">
                                        {connector.token_set
                                            ? 'A token is set. Regenerating it disconnects the SIEM until its configuration is updated.'
                                            : 'No token yet. The SIEM authenticates with a token you generate here.'}
                                    </div>
                                    {connector.token_set && !confirmRegenerate ? (
                                        <button onClick={() => setConfirmRegenerate(true)} className={cn(BUTTON, 'py-2 whitespace-nowrap bg-transparent border-amber-500/40 text-amber-300 hover:bg-amber-500/10')}>
                                            <KeyRound size={13} /> Regenerate
                                        </button>
                                    ) : (
                                        <button onClick={generateToken} disabled={busy === 'token'}
                                            className={cn(BUTTON, 'py-2 whitespace-nowrap', confirmRegenerate ? 'bg-amber-500/20 border-amber-400/60 text-amber-200' : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25')}>
                                            {busy === 'token' ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                                            {confirmRegenerate ? 'Confirm regenerate' : 'Generate token'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {guide && (
                                <div className="space-y-3">
                                    <div className={cn(LABEL, 'text-cyan-300/80')}>Set up {connector.name}</div>
                                    <ol className="space-y-1.5 list-decimal list-inside text-[11px] text-slate-300 leading-relaxed">
                                        {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
                                    </ol>
                                    {guide.snippets.map((s) => <CodeBlock key={s.title} title={s.title} content={s.content} />)}
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4">
                                <div className="text-[11px] text-slate-300 leading-relaxed">
                                    Send a sample {connector.name} alert through intake to check the pipeline. It is not scanned by the AI.
                                </div>
                                <button onClick={sendTestAlert} disabled={busy === 'test-alert'}
                                    className={cn(BUTTON, 'py-2 whitespace-nowrap bg-cyan-500/15 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25')}>
                                    {busy === 'test-alert' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                    Send test alert
                                </button>
                            </div>
                        </section>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ---- auto-escalation -----------------------------------------------------------------------

// Verdict colours: what the AI decided, at a glance
const VERDICT_STYLE: Record<string, { on: string; off: string }> = {
    'Malicious': { on: 'bg-rose-500/20 border-rose-400/60 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.2)]', off: 'border-rose-500/20 text-rose-300/40 hover:border-rose-400/50 hover:text-rose-200/80' },
    'Suspicious': { on: 'bg-amber-500/20 border-amber-400/60 text-amber-100 shadow-[0_0_14px_rgba(245,158,11,0.2)]', off: 'border-amber-500/20 text-amber-300/40 hover:border-amber-400/50 hover:text-amber-200/80' },
    'False Positive': { on: 'bg-slate-500/25 border-slate-300/50 text-slate-100', off: 'border-slate-600/50 text-slate-500 hover:border-slate-400 hover:text-slate-300' },
};
const SEVERITY_SHORT: Record<number, string> = { 4: 'Low+', 7: 'Medium+', 10: 'High+', 13: 'Critical' };

/** Auto-escalation shown as the rule it applies: "when <verdicts> and <severity> -> open a case in <SOAR>". */
const AutoEscalationPanel = ({ value, activeSoar, target, onSave }: { value: AutoEscalation; activeSoar: string; target?: ConnectorView; onSave: (v: Partial<{ auto_escalation_enabled: boolean; auto_escalation_min_score: number; auto_escalation_verdicts: string[] }>) => void }) => {
    const verdicts = value.auto_escalation_verdicts.split(',').map((v) => v.trim()).filter(Boolean);
    const toggleVerdict = (v: string) => {
        const next = verdicts.includes(v) ? verdicts.filter((x) => x !== v) : [...verdicts, v];
        onSave({ auto_escalation_verdicts: next });
    };
    const disabled = activeSoar === 'none';
    const on = value.auto_escalation_enabled && !disabled;
    // Off while a case-management system is ready: shown in red, alerts stop at the analysts
    const off = !on && !disabled;
    const WORD = 'text-[10px] font-mono font-black uppercase tracking-[0.22em] text-cyan-400/60';
    return (
        <section id="auto-escalation" className={cn(
            'relative rounded-3xl border-2 p-6 overflow-hidden transition-colors duration-500 scroll-mt-6',
            on ? 'border-cyan-400/40 bg-gradient-to-r from-cyan-950/60 via-slate-900/95 to-slate-900/95 shadow-[0_0_40px_rgba(138,162,238,0.08)]'
               : off ? 'border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900/95 to-slate-900/95 shadow-[0_0_40px_rgba(244,63,94,0.06)]'
               : 'border-cyan-500/20 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-900/95',
            disabled && 'opacity-60'
        )}>
            {on && <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />}
            {off && <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />}
            <div className="relative flex items-center justify-between gap-6 flex-wrap">
                <div className="flex items-center gap-4">
                    <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500',
                        on ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_24px_rgba(138,162,238,0.35)]'
                           : off ? 'border-rose-400/50 bg-rose-500/10 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                           : 'border-slate-600 bg-slate-800/50 text-slate-500')}>
                        {off ? <ZapOff size={20} /> : <Zap size={20} className={cn(on && 'drop-shadow-[0_0_6px_rgba(201,212,247,0.8)]')} />}
                    </div>
                    <div>
                        <div className="text-lg font-black text-white tracking-[0.15em] uppercase">Auto-escalation</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                            {disabled ? 'Choose a case-management system first.'
                                : on ? 'After each AI scan, matching alerts become cases automatically.'
                                : 'Off: analysts escalate alerts themselves, from the alert view.'}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={cn('text-[10px] font-mono font-black uppercase tracking-[0.25em]', on ? 'text-cyan-300' : off ? 'text-rose-300' : 'text-slate-500')}>{on ? 'On' : 'Off'}</span>
                    <button type="button" role="switch" aria-checked={value.auto_escalation_enabled} disabled={disabled} aria-label="Auto-escalation"
                        onClick={() => onSave({ auto_escalation_enabled: !value.auto_escalation_enabled })}
                        className={cn('relative w-14 h-7 rounded-full border transition-all flex-shrink-0', value.auto_escalation_enabled ? 'bg-cyan-500/40 border-cyan-400/60' : 'bg-slate-800 border-slate-600')}>
                        <span className={cn('absolute top-[3px] w-5 h-5 rounded-full transition-all', value.auto_escalation_enabled ? 'left-[30px] bg-cyan-100 shadow-[0_0_10px_rgba(201,212,247,0.8)]' : 'left-[3px] bg-slate-400')} />
                    </button>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {on && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="relative">
                        <div className="mt-6 pt-6 border-t border-cyan-500/15 flex flex-wrap items-center gap-x-4 gap-y-4">
                            <span className={WORD}>When the AI verdict is</span>
                            <div className="flex flex-wrap gap-2">
                                {VERDICTS.map((v) => (
                                    <button key={v} onClick={() => toggleVerdict(v)} aria-pressed={verdicts.includes(v)}
                                        className={cn('px-3 py-1.5 rounded-lg border text-[10px] font-mono font-black uppercase tracking-wider transition-all',
                                            verdicts.includes(v) ? VERDICT_STYLE[v].on : cn('bg-transparent', VERDICT_STYLE[v].off))}>
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <span className={WORD}>and severity is</span>
                            <div className="inline-flex rounded-lg border border-cyan-500/25 bg-slate-950/40 p-0.5">
                                {SEVERITY_FLOORS.map((s) => (
                                    <button key={s.value} title={s.label} onClick={() => onSave({ auto_escalation_min_score: s.value })}
                                        aria-pressed={value.auto_escalation_min_score === s.value}
                                        className={cn('px-3 py-1.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider transition-all',
                                            value.auto_escalation_min_score === s.value ? 'bg-cyan-500/25 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(169,187,243,0.4)]' : 'text-slate-500 hover:text-cyan-200')}>
                                        {SEVERITY_SHORT[s.value] || s.label}
                                    </button>
                                ))}
                            </div>
                            <ArrowRight size={16} className="text-cyan-400/70" />
                            <span className={WORD}>open a case in</span>
                            {target && (
                                <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-lg border border-cyan-400/40 bg-cyan-500/10">
                                    <span className="scale-[0.6] -m-2"><ConnectorLogo connector={target} /></span>
                                    <span className="text-[11px] font-black text-white uppercase tracking-wider">{target.name}</span>
                                </span>
                            )}
                        </div>
                        {verdicts.length === 0 && (
                            <div className="mt-3 text-[10.5px] text-amber-300/80">Select at least one verdict, otherwise nothing is escalated.</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

// ---- pipeline overview ----------------------------------------------------------------------

// Nightshift's hat mark, white version for the dark interface
const HAT_MARK = '/assets/Hat%20Part%20Light.png';

const PipelineNode = ({ visual, title, value, detail, ok, center }: { visual: React.ReactNode; title: string; value: string; detail: string; ok: boolean; center?: boolean }) => (
    <div className={cn('relative rounded-2xl border px-4 py-4 flex items-center gap-3 min-w-0 transition-colors duration-500',
        center ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_32px_rgba(138,162,238,0.14)]'
            : ok ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-slate-600/40 bg-slate-800/30')}>
        <div className={cn('relative w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0',
            center ? 'border-cyan-300/60 bg-slate-950/80 text-cyan-100 shadow-[inset_0_0_14px_rgba(138,162,238,0.3),0_0_16px_rgba(138,162,238,0.2)]' : ok ? 'border-emerald-400/40 bg-slate-950/50 text-emerald-200' : 'border-slate-600 text-slate-500')}>
            {visual}
        </div>
        <div className="min-w-0">
            <div className={LABEL}>{title}</div>
            <div className="text-sm font-black text-white uppercase tracking-wider truncate mt-1">{value}</div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5 leading-snug flex items-start gap-1.5">
                {(ok || center) && <span className={cn('w-1.5 h-1.5 mt-[4px] rounded-full flex-shrink-0 animate-pulse', center ? 'bg-cyan-300' : 'bg-emerald-400')} />}
                {detail}
            </div>
        </div>
    </div>
);

/** A link between two pipeline steps; packets flow along it while the link is live. */
const FlowLink = ({ live, label }: { live: boolean; label?: string }) => {
    const reduce = useReducedMotion();
    return (
        <div className="flex md:flex-col items-center justify-center gap-1.5 py-1 md:py-0">
            <div className={cn('relative h-8 w-px md:h-px md:w-20 lg:w-24', live ? 'bg-cyan-400/30' : 'border-l md:border-l-0 md:border-t border-dashed border-slate-600')}>
                {live && !reduce && [0, 0.6, 1.2].map((delay) => (
                    <motion.span key={delay}
                        className="absolute left-[-2.5px] top-0 md:top-[-2.5px] md:left-0 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(169,187,243,0.9)]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 1, 0], ...(typeof window !== 'undefined' && window.innerWidth >= 768 ? { left: ['0%', '100%'] } : { top: ['0%', '100%'] }) }}
                        transition={{ duration: 1.8, delay, repeat: Infinity, ease: 'linear' }} />
                ))}
                <ChevronRight size={14} className={cn('absolute -right-[7px] -top-[7px] hidden md:block', live ? 'text-cyan-300' : 'text-slate-600')} />
            </div>
            {label && <span className={cn('text-[8.5px] font-mono font-black uppercase tracking-[0.2em] whitespace-nowrap', live ? 'text-cyan-300/70' : 'text-slate-500')}>{label}</span>}
        </div>
    );
};

/** The escalation link while auto-escalation is off: alerts run into a barrier and stop there. */
const BlockedLink = ({ label, onClick }: { label: string; onClick: () => void }) => {
    const reduce = useReducedMotion();
    const horizontal = typeof window !== 'undefined' && window.innerWidth >= 768;
    const segment = horizontal ? { width: 'calc(50% - 13px)' } : { height: 'calc(50% - 13px)' };
    return (
        <button type="button" onClick={onClick} title="Auto-escalation is off: analysts escalate alerts themselves. Click to set it up."
            className="group flex md:flex-col items-center justify-center gap-1.5 py-1 md:py-0 rounded-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/60">
            <div className={cn('relative', horizontal ? 'h-6 w-20 lg:w-24' : 'w-6 h-16')}>
                <div style={segment} className={cn('absolute bg-rose-400/40', horizontal ? 'left-0 top-1/2 h-px' : 'top-0 left-1/2 w-px')}>
                    {!reduce && [0, 0.8].map((delay) => (
                        <motion.span key={delay}
                            className={cn('absolute w-1.5 h-1.5 rounded-full bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.9)]', horizontal ? 'top-[-2.5px]' : 'left-[-2.5px]')}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 1, 0], scale: [1, 1, 1, 0.2], ...(horizontal ? { left: ['0%', '15%', '85%', '100%'] } : { top: ['0%', '15%', '85%', '100%'] }) }}
                            transition={{ duration: 1.6, delay, repeat: Infinity, ease: 'linear', times: [0, 0.15, 0.85, 1] }} />
                    ))}
                </div>
                <div style={segment} className={cn('absolute border-dashed border-rose-500/25', horizontal ? 'right-0 top-1/2 border-t' : 'bottom-0 left-1/2 border-l')} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    {/* the barrier flashes each time an alert hits it */}
                    <motion.div
                        className="w-[22px] h-[22px] rounded-full border border-rose-400/70 bg-rose-950/90 text-rose-300 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.4)] group-hover:border-rose-300 group-hover:text-rose-200 transition-colors"
                        animate={reduce ? undefined : { scale: [1, 1.2, 1], boxShadow: ['0 0 10px rgba(244,63,94,0.35)', '0 0 22px rgba(244,63,94,0.85)', '0 0 10px rgba(244,63,94,0.35)'] }}
                        transition={{ duration: 0.8, delay: 1.5, repeat: Infinity, times: [0, 0.15, 1] }}>
                        <Ban size={12} strokeWidth={2.5} />
                    </motion.div>
                </div>
            </div>
            <span className="text-[8.5px] font-mono font-black uppercase tracking-[0.2em] whitespace-nowrap text-rose-300/80 group-hover:text-rose-200 transition-colors">{label}</span>
        </button>
    );
};

const PipelineOverview = ({ siem, target, autoEscalation, onShowAutoEscalation }: { siem: ConnectorView[]; target?: ConnectorView; autoEscalation: AutoEscalation; onShowAutoEscalation: () => void }) => {
    const reduce = useReducedMotion();
    const live = siem.filter((c) => ['connected', 'receiving', 'ready'].includes(c.status.state));
    const lastAlert = siem.map((c) => c.last_alert_at).filter(Boolean).sort().pop();
    const targetOk = !!target && ['connected', 'configured'].includes(target.status.state);
    const auto = autoEscalation.auto_escalation_enabled && !!target;
    const sourceVisual = live.length ? (
        <>
            <LogoMark connector={live[0]} iconSize={19} />
            {live.length > 1 && (
                <span className="absolute -bottom-1.5 -right-1.5 px-1 rounded-md border border-emerald-400/40 bg-slate-950 text-[8px] font-mono font-black text-emerald-200">+{live.length - 1}</span>
            )}
        </>
    ) : <Radio size={19} />;
    return (
        <section className="relative rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-cyan-950/25 to-slate-900/90 p-6 overflow-hidden">
            <div className="absolute -top-20 right-10 w-72 h-40 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
            <div className="relative flex items-end justify-between gap-4 mb-5">
                <div>
                    <div className="text-2xl font-black text-white tracking-[0.15em] uppercase">Alert pipeline</div>
                    <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em] mt-1">How alerts flow through Nightshift</div>
                </div>
            </div>
            <div className="relative grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-3">
                <PipelineNode visual={sourceVisual} title="Alert sources" ok={live.length > 0}
                    value={live.length ? live.map((c) => c.name).join(' + ') : 'None connected'}
                    detail={lastAlert ? `Last alert ${formatDistanceToNow(new Date(lastAlert), { addSuffix: true })}` : live.length ? 'Waiting for the first alert' : 'Connect a SIEM below'} />
                <FlowLink live={live.length > 0} label="Alerts" />
                <PipelineNode title="AI triage" center value="3 AI agents" detail="Extract · Investigate · Decide" ok
                    visual={<motion.img src={HAT_MARK} alt="Nightshift" className="w-[84%] h-[84%] object-contain drop-shadow-[0_0_6px_rgba(201,212,247,0.35)]"
                        animate={reduce ? undefined : { y: [0, -1.5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />} />
                {target && !autoEscalation.auto_escalation_enabled
                    ? <BlockedLink label="Auto-escalation off" onClick={onShowAutoEscalation} />
                    : <FlowLink live={auto && targetOk} label={!target ? 'No escalation' : 'Auto-escalation'} />}
                <PipelineNode visual={target ? <LogoMark connector={target} iconSize={19} /> : <Briefcase size={19} />} title="Case management" ok={targetOk}
                    value={target ? target.name : 'None selected'}
                    detail={target ? (STATE_STYLE[target.status.state] || STATE_STYLE.unknown).label : 'Choose one below'} />
            </div>
        </section>
    );
};

// ---- page ---------------------------------------------------------------------------------

export const IntegrationSettings: React.FC<{ onSubTabChange?: (tab: string | null) => void }> = ({ onSubTabChange }) => {
    const { token } = useSocAuth();
    const { serviceStatus } = useSocket();
    const [data, setData] = useState<IntegrationsData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [openId, setOpenId] = useState<{ kind: 'siem' | 'soar'; id: string } | null>(null);
    const [switchTo, setSwitchTo] = useState<string | null>(null);

    useEffect(() => { onSubTabChange?.(null); }, [onSubTabChange]);

    const request = useCallback(async (path: string, init: RequestInit = {}) => {
        const res = await fetch(`${apiBase()}/api/integrations${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail || `Request failed (HTTP ${res.status})`);
        return body;
    }, [token]);

    const load = useCallback(async () => {
        if (!token) return;
        try {
            setData(await request('/'));
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    }, [request, token]);

    useEffect(() => { load(); }, [load]);

    // Live health from the socket overrides the status fetched with the page
    const withLiveStatus = useCallback((c: ConnectorView): ConnectorView => {
        const live = serviceStatus.connectors?.[c.kind]?.[c.id];
        return live ? { ...c, status: live, active: c.kind === 'soar' ? serviceStatus.active_soar === c.id : c.active } : c;
    }, [serviceStatus]);

    const siem = useMemo(() => (data?.siem || []).map(withLiveStatus), [data, withLiveStatus]);
    const soar = useMemo(() => (data?.soar || []).map(withLiveStatus), [data, withLiveStatus]);
    const activeSoar = serviceStatus.active_soar || data?.active_soar || 'none';
    const open = openId ? [...siem, ...soar].find((c) => c.kind === openId.kind && c.id === openId.id) : null;

    const makeActive = async (id: string) => {
        setSwitchTo(null);
        try {
            await request('/soar-active', { method: 'PUT', body: JSON.stringify({ connector: id }) });
            await load();
        } catch (e: any) { setError(e.message); }
    };

    const saveAutoEscalation = async (v: object) => {
        try {
            const updated = await request('/auto-escalation', { method: 'PUT', body: JSON.stringify(v) });
            setData((prev) => (prev ? { ...prev, auto_escalation: updated } : prev));
        } catch (e: any) { setError(e.message); }
    };

    const switchTarget = soar.find((c) => c.id === switchTo);

    return (
        <div className="h-full w-full flex flex-col p-6 overflow-y-auto custom-scrollbar relative">
            <div className="absolute inset-0 micro-grid-bg opacity-[0.03] pointer-events-none" />

            <div className="max-w-6xl w-full mx-auto px-4 space-y-6 relative">
                {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[11px] text-red-300">
                        <X size={14} /> {error}
                    </div>
                )}

                {!data ? (
                    <div className="flex items-center justify-center py-24 text-cyan-500/60"><Loader2 className="animate-spin" /></div>
                ) : (
                    <>
                        <PipelineOverview siem={siem} target={soar.find((c) => c.id === activeSoar)} autoEscalation={data.auto_escalation}
                            onShowAutoEscalation={() => document.getElementById('auto-escalation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* SIEM */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Radio size={18} className="text-cyan-300" />
                                    <div>
                                        <div className="text-xl font-black text-white tracking-[0.15em] uppercase">Alert sources</div>
                                        <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em]">SIEMs that send alerts to Nightshift</div>
                                    </div>
                                </div>
                                {siem.map((c) => <ConnectorCard key={c.id} connector={c} onOpen={() => setOpenId({ kind: 'siem', id: c.id })} />)}
                            </section>

                            {/* SOAR */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <Briefcase size={18} className="text-cyan-300" />
                                        <div>
                                            <div className="text-xl font-black text-white tracking-[0.15em] uppercase">Case management</div>
                                            <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em]">Where escalated alerts become cases</div>
                                        </div>
                                    </div>
                                    {activeSoar !== 'none' && (
                                        <button onClick={() => setSwitchTo('none')}
                                            className="px-3 py-1.5 rounded-lg border border-slate-600/50 text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-rose-300 hover:border-rose-400/40 transition-colors whitespace-nowrap">
                                            Turn escalation off
                                        </button>
                                    )}
                                </div>
                                {soar.map((c) => <ConnectorCard key={c.id} connector={c} onOpen={() => setOpenId({ kind: 'soar', id: c.id })} />)}
                            </section>
                        </div>

                        <AutoEscalationPanel value={data.auto_escalation} activeSoar={activeSoar}
                            target={soar.find((c) => c.id === activeSoar)} onSave={saveAutoEscalation} />
                    </>
                )}
            </div>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {open && (
                        <ConnectorPanel
                            key={`${open.kind}-${open.id}`}
                            connector={open}
                            activeSoar={activeSoar}
                            request={request}
                            onChanged={load}
                            onClose={() => setOpenId(null)}
                            onMakeActive={(id) => setSwitchTo(id)}
                        />
                    )}
                    {switchTo && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
                            onClick={() => setSwitchTo(null)}>
                            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                className="max-w-md w-full bg-slate-900/90 border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                                onClick={(e) => e.stopPropagation()}>
                                <div className="text-center space-y-3">
                                    <h3 className="text-xl font-black text-white tracking-wider uppercase">
                                        {switchTo === 'none' ? 'Turn escalation off?' : 'Change case management?'}
                                    </h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {switchTo === 'none'
                                            ? 'Analysts will not be able to escalate alerts, and auto-escalation stops.'
                                            : <>Escalations will go to <span className="font-bold text-cyan-300">{switchTarget?.name}</span> from now on. Existing cases stay where they are.</>}
                                    </p>
                                </div>
                                <div className="flex gap-4 pt-6">
                                    <button onClick={() => setSwitchTo(null)} className="flex-1 px-6 py-3 rounded-xl border border-white/5 bg-white/5 text-xs font-mono font-black text-white/40 hover:text-white/60 hover:bg-white/10 transition-all uppercase tracking-widest">
                                        Cancel
                                    </button>
                                    <button onClick={() => makeActive(switchTo)} className="flex-1 px-6 py-3 rounded-xl text-xs font-mono font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-all uppercase tracking-widest">
                                        Confirm
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};
