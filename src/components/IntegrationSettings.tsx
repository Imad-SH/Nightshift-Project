import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
    Check, ChevronRight, Copy, Eye, EyeOff, KeyRound, Loader2, Plug, RefreshCw, Save, Send,
    ShieldAlert, Webhook, X, Zap, Radio, Briefcase,
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
const INPUT = 'w-full bg-cyan-950/60 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-[11px] font-mono font-bold text-cyan-100 placeholder:text-cyan-500/25 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all tracking-wider';
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

const StatusPill = ({ status }: { status: ConnectorStatus }) => {
    const style = STATE_STYLE[status.state] || STATE_STYLE.unknown;
    return (
        <div title={status.message} className={cn('flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-mono font-black uppercase tracking-[0.2em] whitespace-nowrap', style.cls)}>
            <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
            {style.label}
        </div>
    );
};

const ConnectorLogo = ({ connector, size = 'md' }: { connector: ConnectorView; size?: 'md' | 'lg' }) => {
    const box = size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
    const isFlowintel = connector.id === 'flowintel';
    const logo = connector.logo || (isFlowintel ? '/assets/flowintel_logo.png' : null);
    return (
        <div className={cn(box, 'flex-shrink-0 rounded-xl flex items-center justify-center border border-cyan-500/30 bg-cyan-500/5 overflow-hidden')}>
            {logo ? (
                <img src={logo} alt={connector.name} className={cn('w-[80%] h-[80%] object-contain', isFlowintel && 'brightness-[2.5] contrast-[1.2]')} />
            ) : (
                <Webhook size={size === 'lg' ? 26 : 20} className="text-cyan-300" />
            )}
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
            className={cn(
                'w-full text-left relative bg-gradient-to-br from-slate-900/95 via-cyan-950/30 to-slate-900/95 backdrop-blur-xl border-2 rounded-2xl p-4 transition-all group',
                connector.active ? 'border-cyan-400/70 shadow-[0_0_25px_rgba(34,211,238,0.15)]' : 'border-cyan-500/25 hover:border-cyan-400/50'
            )}
        >
            <div className="flex items-start gap-3">
                <ConnectorLogo connector={connector} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white tracking-wider uppercase">{connector.name}</span>
                        {connector.active && (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-400/50 text-[8px] font-mono font-black text-cyan-200 uppercase tracking-[0.2em]">Active</span>
                        )}
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

const AutoEscalationPanel = ({ value, activeSoar, onSave }: { value: AutoEscalation; activeSoar: string; onSave: (v: Partial<{ auto_escalation_enabled: boolean; auto_escalation_min_score: number; auto_escalation_verdicts: string[] }>) => void }) => {
    const verdicts = value.auto_escalation_verdicts.split(',').map((v) => v.trim()).filter(Boolean);
    const toggleVerdict = (v: string) => {
        const next = verdicts.includes(v) ? verdicts.filter((x) => x !== v) : [...verdicts, v];
        onSave({ auto_escalation_verdicts: next });
    };
    const disabled = activeSoar === 'none';
    return (
        <div className={cn('rounded-2xl border-2 border-cyan-500/25 bg-gradient-to-br from-slate-900/95 via-cyan-950/20 to-slate-900/95 p-5 space-y-4', disabled && 'opacity-60')}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Zap size={18} className="text-cyan-300" />
                    <div>
                        <div className="text-sm font-black text-white tracking-wider uppercase">Auto-escalation</div>
                        <div className="text-[10.5px] text-slate-400 mt-0.5">
                            {disabled ? 'Choose a case-management system first.' : 'After an AI scan, open a case automatically when these conditions match.'}
                        </div>
                    </div>
                </div>
                <button type="button" role="switch" aria-checked={value.auto_escalation_enabled} disabled={disabled}
                    onClick={() => onSave({ auto_escalation_enabled: !value.auto_escalation_enabled })}
                    className={cn('relative w-11 h-6 rounded-full border transition-all flex-shrink-0', value.auto_escalation_enabled ? 'bg-cyan-500/40 border-cyan-400/60' : 'bg-slate-800 border-slate-600')}>
                    <span className={cn('absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all', value.auto_escalation_enabled ? 'left-[22px] bg-cyan-200' : 'left-0.5 bg-slate-400')} />
                </button>
            </div>
            {value.auto_escalation_enabled && !disabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className={LABEL}>Minimum severity</label>
                        <select value={value.auto_escalation_min_score} onChange={(e) => onSave({ auto_escalation_min_score: Number(e.target.value) })} className={cn(INPUT, 'appearance-none cursor-pointer')}>
                            {SEVERITY_FLOORS.map((s) => <option key={s.value} value={s.value} className="bg-slate-900">{s.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className={LABEL}>AI verdicts</label>
                        <div className="flex flex-wrap gap-2">
                            {VERDICTS.map((v) => (
                                <button key={v} onClick={() => toggleVerdict(v)}
                                    className={cn('px-3 py-2 rounded-lg border text-[10px] font-mono font-black uppercase tracking-wider transition-all',
                                        verdicts.includes(v) ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-100' : 'bg-transparent border-slate-600 text-slate-500 hover:border-slate-400')}>
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* SIEM */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Radio size={18} className="text-cyan-300" />
                                <div>
                                    <div className="text-2xl font-black text-white tracking-[0.15em] uppercase">Alert sources</div>
                                    <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em]">SIEMs that send alerts to Nightshift</div>
                                </div>
                            </div>
                            {siem.map((c) => <ConnectorCard key={c.id} connector={c} onOpen={() => setOpenId({ kind: 'siem', id: c.id })} />)}
                        </section>

                        {/* SOAR */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Briefcase size={18} className="text-cyan-300" />
                                <div>
                                    <div className="text-2xl font-black text-white tracking-[0.15em] uppercase">Case management</div>
                                    <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em]">Where escalated alerts become cases</div>
                                </div>
                            </div>
                            {soar.map((c) => <ConnectorCard key={c.id} connector={c} onOpen={() => setOpenId({ kind: 'soar', id: c.id })} />)}
                            {activeSoar !== 'none' && (
                                <button onClick={() => setSwitchTo('none')} className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-300 transition-colors">
                                    Turn escalation off
                                </button>
                            )}
                            <AutoEscalationPanel value={data.auto_escalation} activeSoar={activeSoar} onSave={saveAutoEscalation} />
                        </section>
                    </div>
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
