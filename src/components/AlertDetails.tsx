import { useMemo, useState } from 'react';
import {
    Clock,
    Server,
    Download,
    Terminal,
    ChevronDown,
    User,
    Monitor,
    Globe,
    Cpu,
    FileText,
    Hash,
    Mail,
    Link,
    ListTree,
    Cog,
    Copy,
    Check,
    Search,
    Shield,
    Sparkles,
    Braces,
    Tag,
} from 'lucide-react';
import { cn } from './DashboardLayout';
import { buildAlertFacts, alertBody, type EntityKind, type Fact } from '../utils/alertFacts';

const ENTITY_ICON: Record<EntityKind, any> = {
    user: User, host: Monitor, ip: Globe, process: Cpu, file: FileText, hash: Hash,
    email: Mail, url: Link, registry: ListTree, service: Cog,
};

// Entity chips shown before "+N more"
const ENTITY_PREVIEW = 6;

// Keys Nightshift writes into the alert; left out of the JSON views and downloads
const AI_KEYS = ['ai_status', 'verdict', 'ai_analysis_results', 'graph_layout', 'last_updated'];

const getSeverityConfig = (level: number) => {
    if (level >= 13) return { bars: 5, label: 'CRITICAL', color: 'text-purple-400', bg: 'bg-purple-500' };
    if (level >= 10) return { bars: 4, label: 'HIGH',     color: 'text-rose-400',   bg: 'bg-rose-500' };
    if (level >= 7)  return { bars: 3, label: 'MEDIUM',   color: 'text-orange-400', bg: 'bg-orange-500' };
    if (level >= 4)  return { bars: 2, label: 'LOW',      color: 'text-yellow-400', bg: 'bg-yellow-500' };
    return                 { bars: 1, label: 'INFO',      color: 'text-cyan-400',   bg: 'bg-cyan-500' };
};

// Same colours as the verdict pill on the alert cards
const verdictStyle = (v: string) => {
    const s = v.toLowerCase();
    if (s === 'malicious') return 'text-rose-300 bg-rose-500/15 border-rose-400/40';
    if (s === 'suspicious') return 'text-amber-300 bg-amber-500/15 border-amber-400/40';
    if (s === 'already blocked' || s === 'blocked') return 'text-sky-300 bg-sky-500/15 border-sky-400/40';
    return 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40';
};

const TONE: Record<NonNullable<Fact['tone']>, string> = {
    good: 'text-emerald-300',
    bad: 'text-rose-300',
    warn: 'text-amber-300',
};

const formatWhen = (ts: any): string | null => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

/** Copies a value and remembers which one, so its button can show a tick for a moment. */
function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = (key: string, text: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(c => (c === key ? null : c)), 1200);
        }).catch(() => {});
    };
    return { copied, copy };
}

const CopyButton = ({ id, text, copied, copy, className }: { id: string; text: string; copied: string | null; copy: (k: string, t: string) => void; className?: string }) => (
    <button
        onClick={(e) => { e.stopPropagation(); copy(id, text); }}
        title="Copy"
        className={cn("shrink-0 p-0.5 rounded text-slate-500 hover:text-cyan-300 transition-colors", copied === id ? "opacity-100" : "opacity-0 group-hover:opacity-100", className)}
    >
        {copied === id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
);

const SectionTitle = ({ icon: Icon, children, right }: { icon: any; children: React.ReactNode; right?: React.ReactNode }) => (
    <div className="flex items-center gap-2 pb-2 mb-2.5 border-b border-cyan-500/10">
        <Icon size={13} className="text-cyan-400 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200/80">{children}</span>
        {right && <span className="ml-auto">{right}</span>}
    </div>
);

/** A label / value row; the value can be copied from the button that appears on hover. */
const FactRow = ({ id, label, value, mono, tone, copied, copy }: { id: string; label: string; value: string; mono?: boolean; tone?: Fact['tone']; copied: string | null; copy: (k: string, t: string) => void }) => (
    <div className="group grid grid-cols-[110px_minmax(0,1fr)_16px] gap-3 py-[5px] items-start">
        <span className="text-[11px] text-slate-400 leading-[18px]">{label}</span>
        <span className={cn(
            "text-slate-100 leading-[18px] [overflow-wrap:anywhere]",
            mono ? "font-mono text-[11.5px]" : "text-[12.5px]",
            tone && TONE[tone]
        )}>
            {value}
        </span>
        <CopyButton id={id} text={value} copied={copied} copy={copy} />
    </div>
);

/**
 * Raw log line exactly as Wazuh delivered it (`full_log`). Collapsed to a few lines by default;
 * click to expand when the log is long enough to need it.
 */
const RawLogPanel = ({ fullLog }: { fullLog: string }) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = fullLog.length > 220 || fullLog.split('\n').length > 4;
    return (
        <section className="rounded-xl border border-cyan-500/25 bg-slate-950/30 p-3">
            <SectionTitle
                icon={Terminal}
                right={isLong && (
                    <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors">
                        {expanded ? 'Collapse' : 'Expand'}
                        <ChevronDown size={11} className={cn("transition-transform", expanded && "rotate-180")} />
                    </button>
                )}
            >
                Raw log
            </SectionTitle>
            <div className="relative">
                <pre className={cn(
                    "text-[11px] font-mono text-cyan-100 leading-relaxed whitespace-pre-wrap break-all",
                    expanded ? "max-h-[280px] overflow-y-auto cyber-scrollbar pr-1" : "max-h-[72px] overflow-hidden"
                )}>
                    {fullLog}
                </pre>
                {isLong && !expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-[#0b1224] to-transparent pointer-events-none" />
                )}
            </div>
        </section>
    );
};

type Tab = 'overview' | 'fields' | 'raw';

const AlertDetailsView = ({ alert }: { alert: any }) => {
    const [tab, setTab] = useState<Tab>('overview');
    const [query, setQuery] = useState('');
    const [allEntities, setAllEntities] = useState(false);
    const { copied, copy } = useCopy();

    // --- ROBUST DATA EXTRACTION ---
    let rawData = alert.rawData || alert;
    if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch (e) { console.error("Failed to parse rawData", e); }
    }
    if (!rawData.rule && !rawData.agent && rawData.raw_data) {
        rawData = rawData.raw_data;
    }

    const info = useMemo(() => buildAlertFacts(rawData), [rawData]);
    const body = alertBody(rawData);
    const rule = body.rule || {};
    const agentData = body.agent || {};

    const level = alert.level !== undefined ? alert.level : (rule.level || 0);
    const config = getSeverityConfig(level);
    const title = alert.title || rule.description || rawData.title || 'Security event';
    // When the event happened; for an imported alert, alert.timestamp is when it was imported
    const when = formatWhen(body.timestamp || alert.timestamp);
    const ruleId = rule.id || null;
    const agentName = agentData.name || alert.agent || null;

    // AI result: the extractor's one-line summary and the judge's verdict
    const aiSummary: string | null = rawData.ai_analysis_results?.agent_screener?.summary || alert.node_results?.agent_screener?.summary || null;
    const verdictRaw: string = alert.verdict || rawData.verdict || alert.node_results?.agent_judge?.verdict || '';
    const verdict = verdictRaw && !/error|failed|unknown/i.test(verdictRaw) ? (verdictRaw.toLowerCase() === 'blocked' ? 'Already Blocked' : verdictRaw) : null;

    // Rule context
    const mitre = rule.mitre || {};
    const asList = (v: any): string[] => (Array.isArray(v) ? v : v ? [v] : []).map(String);
    const mitreIds = asList(mitre.id);
    const mitreNames = asList(mitre.technique);
    const mitreTactics = asList(mitre.tactic);
    const groups = [...new Set(asList(rule.groups))];
    const compliance = ([
        ['PCI DSS', rule.pci_dss], ['HIPAA', rule.hipaa], ['GDPR', rule.gdpr], ['NIST 800-53', rule.nist_800_53], ['TSC', rule.tsc], ['GPG13', rule.gpg13],
    ] as [string, any][]).map(([name, ids]) => [name, asList(ids)] as [string, string[]]).filter(([, ids]) => ids.length > 0);
    const osInfo = agentData.os ? [agentData.os.name, agentData.os.version].filter(Boolean).join(' ') : null;
    const agentIp = agentData.ip && !/^(::1|127\.0\.0\.1|0{4}(:0{4}){6}:0{3}1)$/.test(agentData.ip) ? agentData.ip : null;
    const fullLog: string | null = typeof body.full_log === 'string' && body.full_log.trim() ? body.full_log : null;

    const exportJson = () => {
        const data = { ...rawData };
        AI_KEYS.forEach(k => delete (data as any)[k]);
        return data;
    };
    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(exportJson(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wazuh-alert-${ruleId || 'rule'}-${alert.id || 'raw'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const q = query.trim().toLowerCase();
    const shownFields = q ? info.fields.filter(r => r.path.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)) : info.fields;

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'fields', label: 'All fields', count: info.fields.length },
        { id: 'raw', label: fullLog ? 'Raw log & JSON' : 'JSON' },
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/30">
            {/* === HEADER: severity, title, when / rule / agent / type, JSON download === */}
            <div className="flex-none px-4 pt-3 pb-3 border-b border-cyan-500/15">
                <div className="flex items-start gap-4">
                    <div className="flex-none flex flex-col items-start gap-1 pt-0.5" title={`Severity level ${level}`}>
                        <div className="flex items-end gap-[3px] h-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "w-[5px] rounded-sm",
                                        i <= config.bars ? config.bg : "bg-slate-700/50",
                                        i === 1 ? "h-1.5" : i === 2 ? "h-2" : i === 3 ? "h-2.5" : i === 4 ? "h-3" : "h-4"
                                    )}
                                />
                            ))}
                        </div>
                        <span className={cn("text-[11px] font-bold tracking-widest leading-none", config.color)}>{config.label}</span>
                        <span className={cn("text-[9.5px] font-mono leading-none opacity-70", config.color)}>LVL {level}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-[16px] font-bold text-white leading-snug">{title}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-slate-400">
                            {when && <span className="inline-flex items-center gap-1.5"><Clock size={11} className="text-cyan-400/80" />{when}</span>}
                            {ruleId && <span>Rule <span className="font-mono text-slate-200">{ruleId}</span></span>}
                            {agentName && <span className="inline-flex items-center gap-1.5"><Server size={11} className="text-cyan-400/80" /><span className="font-mono text-slate-200">{agentName}</span></span>}
                            <span className="inline-flex items-center gap-1.5 px-2 py-[1px] rounded-md border border-cyan-500/25 bg-cyan-500/[0.07] text-cyan-200">
                                <Tag size={10} />{info.category}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={downloadJson}
                        title="Download the alert as JSON"
                        className="flex-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-[11px] font-semibold transition-all hover:border-cyan-400/70 hover:bg-cyan-500/15"
                    >
                        <Download size={13} />
                        Download
                    </button>
                </div>

                {/* AI result, when the alert was analysed */}
                {(aiSummary || verdict) && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2">
                        <Sparkles size={13} className="mt-[3px] text-cyan-300 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">AI analysis</span>
                                {verdict && (
                                    <span className={cn("text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded border", verdictStyle(verdict))}>{verdict}</span>
                                )}
                            </div>
                            {aiSummary && <p className="mt-0.5 text-[12.5px] text-slate-200 leading-relaxed">{aiSummary}</p>}
                        </div>
                    </div>
                )}
            </div>

            {/* === TABS === */}
            <div className="flex-none flex items-center gap-1 px-4 border-b border-cyan-500/15">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            "px-3 py-2 -mb-px border-b-2 text-[11.5px] font-semibold transition-colors",
                            tab === t.id ? "border-cyan-400 text-cyan-200" : "border-transparent text-slate-400 hover:text-slate-200"
                        )}
                    >
                        {t.label}
                        {t.count !== undefined && <span className="ml-1.5 text-[10px] font-mono text-slate-500">{t.count}</span>}
                    </button>
                ))}
            </div>

            {/* === CONTENT === */}
            <div className="flex-1 min-h-0 overflow-y-auto cyber-scrollbar p-4">
                {tab === 'overview' && (
                    <div className="flex flex-col gap-3">
                        {/* Entities: who and what the alert involves */}
                        {info.entities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {(allEntities ? info.entities : info.entities.slice(0, ENTITY_PREVIEW)).map((e, i) => {
                                    const Icon = ENTITY_ICON[e.kind];
                                    const id = `entity-${i}`;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => copy(id, e.value)}
                                            title={`${e.role ? e.role + ': ' : ''}${e.value} (click to copy)`}
                                            className="group inline-flex items-center gap-1.5 max-w-full h-7 pl-2 pr-2 rounded-md border border-cyan-500/20 bg-slate-900/60 hover:border-cyan-400/50 transition-colors text-[11.5px]"
                                        >
                                            <Icon size={12} className="text-cyan-300 shrink-0" />
                                            {e.role && <span className="text-slate-500 shrink-0">{e.role}</span>}
                                            <span className="font-mono text-slate-100 truncate max-w-[280px]">{e.value}</span>
                                            {copied === id ? <Check size={11} className="text-emerald-400 shrink-0" /> : <Copy size={11} className="text-slate-500 shrink-0 opacity-0 group-hover:opacity-100" />}
                                        </button>
                                    );
                                })}
                                {info.entities.length > ENTITY_PREVIEW && (
                                    <button
                                        onClick={() => setAllEntities(v => !v)}
                                        className="inline-flex items-center h-7 px-2.5 rounded-md border border-dashed border-cyan-500/30 text-[11px] text-cyan-300 hover:border-cyan-400/60 hover:text-cyan-200 transition-colors"
                                    >
                                        {allEntities ? 'Show less' : `+${info.entities.length - ENTITY_PREVIEW} more`}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-3 items-start">
                            {/* Key facts for this type of alert */}
                            <section className="rounded-xl border border-cyan-500/25 bg-slate-950/30 p-3">
                                <SectionTitle icon={Shield}>{info.category}</SectionTitle>
                                {info.message && <p className="text-[11.5px] text-slate-400 leading-relaxed mb-1.5">{info.message}</p>}
                                {info.facts.length > 0 ? (
                                    <div className="flex flex-col">
                                        {info.facts.map((fact, i) => (
                                            <FactRow key={fact.label + i} id={`fact-${i}`} {...fact} copied={copied} copy={copy} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11.5px] text-slate-500 italic">No details beyond the rule. See All fields.</p>
                                )}
                            </section>

                            {/* The rule and where the alert comes from */}
                            <section className="rounded-xl border border-cyan-500/25 bg-slate-950/30 p-3">
                                <SectionTitle icon={FileText}>Rule & source</SectionTitle>
                                <div className="flex flex-col">
                                    {ruleId && <FactRow id="rule" label="Rule" value={`${ruleId} · level ${level}`} mono copied={copied} copy={copy} />}
                                    {rule.description && rule.description !== title && <FactRow id="desc" label="Description" value={rule.description} copied={copied} copy={copy} />}
                                    {rule.firedtimes != null && <FactRow id="fired" label="Fired" value={`${rule.firedtimes} time${Number(rule.firedtimes) === 1 ? '' : 's'}`} copied={copied} copy={copy} />}
                                    {agentName && <FactRow id="agent" label="Agent" value={[agentName, agentData.id && agentData.id !== '000' ? `#${agentData.id}` : null, agentIp].filter(Boolean).join(' · ')} mono copied={copied} copy={copy} />}
                                    {osInfo && <FactRow id="os" label="OS" value={osInfo} copied={copied} copy={copy} />}
                                    {body.manager?.name && <FactRow id="manager" label="Manager" value={body.manager.name} mono copied={copied} copy={copy} />}
                                    {body.location && <FactRow id="location" label="Log source" value={body.location} mono copied={copied} copy={copy} />}
                                    {body.decoder?.name && <FactRow id="decoder" label="Decoder" value={body.decoder.name} mono copied={copied} copy={copy} />}
                                </div>

                                {mitreIds.length > 0 && (
                                    <div className="mt-2.5 pt-2.5 border-t border-cyan-500/10">
                                        <div className="text-[11px] text-slate-400 mb-1.5">MITRE ATT&CK</div>
                                        <div className="flex flex-wrap gap-1">
                                            {mitreIds.map((id, i) => (
                                                <span key={id} className="px-1.5 py-0.5 rounded text-[10.5px] border border-violet-400/35 bg-violet-500/10 text-violet-200">
                                                    <span className="font-mono font-bold">{id}</span>{mitreNames[i] ? ` · ${mitreNames[i]}` : ''}
                                                </span>
                                            ))}
                                        </div>
                                        {mitreTactics.length > 0 && <div className="mt-1.5 text-[11px] text-slate-400">Tactics: <span className="text-slate-300">{mitreTactics.join(', ')}</span></div>}
                                    </div>
                                )}

                                {groups.length > 0 && (
                                    <div className="mt-2.5 pt-2.5 border-t border-cyan-500/10 flex flex-wrap gap-1">
                                        {groups.map(g => (
                                            <span key={g} className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-cyan-500/20 bg-cyan-500/10 text-cyan-200/80">#{g}</span>
                                        ))}
                                    </div>
                                )}

                                {compliance.length > 0 && (
                                    <details className="mt-2.5 pt-2.5 border-t border-cyan-500/10 group/compliance">
                                        <summary className="cursor-pointer list-none flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
                                            <ChevronDown size={11} className="transition-transform -rotate-90 group-open/compliance:rotate-0" />
                                            Compliance · {compliance.map(([name]) => name).join(', ')}
                                        </summary>
                                        <div className="mt-1.5 flex flex-col gap-1">
                                            {compliance.map(([name, ids]) => (
                                                <div key={name} className="flex flex-wrap items-center gap-1">
                                                    <span className="text-[9.5px] font-bold font-mono text-emerald-400 uppercase tracking-wider mr-0.5">{name}</span>
                                                    {ids.map(id => (
                                                        <span key={id} className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{id}</span>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </section>
                        </div>

                        {fullLog && !info.logInFacts && <RawLogPanel fullLog={fullLog} />}
                    </div>
                )}

                {tab === 'fields' && (
                    <div className="flex flex-col gap-2">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter by field name or value"
                                className="w-full h-8 pl-8 pr-3 rounded-lg border border-cyan-500/25 bg-slate-950/50 text-[12px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                            />
                        </div>
                        <div className="rounded-xl border border-cyan-500/20 overflow-hidden">
                            {shownFields.length === 0 && <div className="px-3 py-3 text-[11.5px] text-slate-500">No field matches "{query}".</div>}
                            {shownFields.map((r, i) => (
                                <div key={r.path} className={cn("group grid grid-cols-[minmax(0,38%)_minmax(0,1fr)_16px] gap-3 px-3 py-1.5 border-b border-white/[0.04] last:border-0 items-start", i % 2 === 1 && "bg-white/[0.015]")}>
                                    <span className="font-mono text-[11px] text-cyan-200/75 break-all leading-[18px]">{r.path}</span>
                                    <span className="font-mono text-[11.5px] text-slate-200 [overflow-wrap:anywhere] leading-[18px]">{r.value}</span>
                                    <CopyButton id={`field-${r.path}`} text={r.value} copied={copied} copy={copy} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'raw' && (
                    <div className="flex flex-col gap-3">
                        {fullLog && (
                            <section className="rounded-xl border border-cyan-500/25 bg-slate-950/30 p-3">
                                <SectionTitle icon={Terminal} right={<CopyButton id="full-log" text={fullLog} copied={copied} copy={copy} className="opacity-100" />}>Raw log</SectionTitle>
                                <pre className="text-[11px] font-mono text-cyan-100 leading-relaxed whitespace-pre-wrap break-all">{fullLog}</pre>
                            </section>
                        )}
                        <section className="rounded-xl border border-cyan-500/25 bg-slate-950/30 p-3">
                            <SectionTitle icon={Braces} right={<CopyButton id="json" text={JSON.stringify(exportJson(), null, 2)} copied={copied} copy={copy} className="opacity-100" />}>Alert JSON</SectionTitle>
                            <pre className="text-[11px] font-mono text-slate-200 leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(exportJson(), null, 2)}</pre>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export const AlertDetails = ({ alert }: { alert: any }) => {
    if (!alert) return <div className="h-full flex items-center justify-center text-slate-400 font-mono">SELECT_SIGNAL</div>;
    // Keyed by alert so the tab and the field filter start fresh for each alert
    return <AlertDetailsView key={alert.id} alert={alert} />;
};
