/**
 * Reads any alert and returns what an analyst needs first, whatever its type: the entities it
 * involves (users, hosts, IPs, files…), the key facts for its category (Windows logon, file or
 * registry change, SSH login, Office 365 mail…) and every field it carries, flattened.
 *
 * Category profiles cover the alert types seen in Wazuh data; any other alert falls back to its
 * most informative fields, so nothing is ever left blank.
 */

export type EntityKind = 'user' | 'host' | 'ip' | 'process' | 'file' | 'hash' | 'email' | 'url' | 'registry' | 'service';

export interface Entity { kind: EntityKind; value: string; role?: string }
export interface Fact { label: string; value: string; mono?: boolean; tone?: 'good' | 'bad' | 'warn' }
export interface FieldRow { path: string; value: string }

export interface AlertFacts {
    /** Short name of the alert type, shown as the key-facts heading: "Windows logon", "Registry change"… */
    category: string;
    /** One-line plain description from the source, when it has one (e.g. the Windows event message). */
    message: string | null;
    /** The facts already show the raw log line, so it needs no box of its own. */
    logInFacts: boolean;
    facts: Fact[];
    entities: Entity[];
    fields: FieldRow[];
}

// Keys added by Nightshift itself or by export envelopes: not part of the alert
const INTERNAL_KEYS = new Set(['ai_status', 'ai_analysis_results', 'verdict', 'graph_layout', 'last_updated',
    '_injected_by', '_injected_at', 'highlight', 'sort', '_score', '_version', '_index', '_id', 'fields']);

/** The alert itself, unwrapped from an OpenSearch export (`_source`) when it was imported that way. */
export function alertBody(raw: any): any {
    if (raw && typeof raw === 'object' && raw._source && typeof raw._source === 'object' && raw._source.rule) return raw._source;
    return raw || {};
}

/** Value at a dotted path; keys may contain spaces (Windows Defender writes "threat Name"). */
function get(obj: any, path: string): any {
    let cur = obj;
    for (const part of path.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}

/** Display string for a scalar (or list of scalars); null when empty or a placeholder. */
function str(v: any): string | null {
    if (v == null) return null;
    if (Array.isArray(v)) {
        const parts = v.map(str).filter(Boolean) as string[];
        return parts.length ? parts.join(', ') : null;
    }
    if (typeof v === 'object') return null;
    // Wazuh doubles the backslashes of Windows paths
    const s = String(v).replace(/\\\\/g, '\\').trim();
    if (!s || s === '-' || s === 'N/A' || s === 'null' || s === '(null)') return null;
    return s;
}

function pick(obj: any, ...paths: string[]): string | null {
    for (const p of paths) {
        const s = str(get(obj, p));
        if (s) return s;
    }
    return null;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "targetUserName" / "threat Name" / "dst_user" -> "Target user name" */
function humanize(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().toLowerCase();
    return titleCase(words);
}

const isLoopback = (ip: string) => ip === '127.0.0.1' || ip === '::1' || /^0{4}(:0{4}){6}:0{3}1$/.test(ip);

// --- Windows code tables ---------------------------------------------------------------------------

const LOGON_TYPES: Record<string, string> = {
    '0': 'System', '2': 'Interactive (at the keyboard)', '3': 'Network', '4': 'Batch', '5': 'Service', '7': 'Unlock',
    '8': 'Network, clear-text password', '9': 'New credentials', '10': 'Remote desktop (RDP)', '11': 'Cached credentials',
};
const WIN_TEXT_CODES: Record<string, string> = {
    '%%1842': 'Yes', '%%1843': 'No', '%%1832': 'Identification', '%%1833': 'Impersonation', '%%1840': 'Delegation',
    '%%2304': 'An error occurred during logon', '%%2305': 'Account restriction', '%%2307': 'Account locked out',
    '%%2308': 'Account disabled', '%%2309': 'Account expired', '%%2310': 'Logon time restriction',
    '%%2311': 'Workstation restriction', '%%2312': 'Logon type not granted', '%%2313': 'Unknown user name or bad password',
};
const NT_STATUS: Record<string, string> = {
    '0xc000006d': 'Bad user name or password', '0xc000006a': 'Wrong password', '0xc0000064': 'User does not exist',
    '0xc0000072': 'Account disabled', '0xc0000234': 'Account locked out', '0xc0000071': 'Password expired',
    '0xc0000193': 'Account expired', '0xc0000133': 'Clocks out of sync', '0xc000015b': 'Logon type not granted',
    '0xc0000224': 'Password must change', '0xc000006e': 'Account restriction', '0xc000006f': 'Outside allowed hours',
    '0xc0000070': 'Workstation not allowed',
};
/** "0xc000006d · Bad user name or password" when the code is known, the bare code otherwise. */
const ntStatus = (code: string | null) => (code ? `${code}${NT_STATUS[code.toLowerCase()] ? ` · ${NT_STATUS[code.toLowerCase()]}` : ''}` : null);
const winCode = (v: string | null) => (v && WIN_TEXT_CODES[v]) || v;

// --- category profiles -----------------------------------------------------------------------------

type Profile = { category: string; message?: string | null; facts: (Fact | null)[]; logInFacts?: boolean };
const f = (label: string, value: string | null, extra: Partial<Fact> = {}): Fact | null => (value ? { label, value, ...extra } : null);
const account = (user: string | null, domain: string | null) => (user ? (domain && domain !== '-' ? `${domain}\\${user}` : user) : null);

function windowsProfile(a: any): Profile {
    const ed = get(a, 'data.win.eventdata') || {};
    const sys = get(a, 'data.win.system') || {};
    const id = str(sys.eventID) || '';
    const groups: string[] = get(a, 'rule.groups') || [];
    const raw = str(sys.message);
    // The message's first sentence, without the surrounding quotes and the field dump that follows
    const message = raw ? raw.replace(/^"|"$/g, '').split(/\r?\n|\s{2,}|(?<=\.)\s+(?=[A-Z][a-z]+:)/)[0].trim() : null;
    const eventLabel = [id, str(sys.channel)].filter(Boolean).join(' · ');

    if (['4624', '4625', '4634', '4647', '4648', '4672', '4776', '4771', '4768'].includes(id)) {
        const failed = id === '4625' || id === '4771' || groups.includes('authentication_failed');
        const subStatus = pick(ed, 'subStatus');
        return {
            category: failed ? 'Windows logon failure' : id === '4634' || id === '4647' ? 'Windows logoff' : 'Windows logon',
            message,
            facts: [
                f('Account', account(pick(ed, 'targetUserName'), pick(ed, 'targetDomainName')), { mono: true }),
                f('Logon type', pick(ed, 'logonType') && `${pick(ed, 'logonType')} · ${LOGON_TYPES[pick(ed, 'logonType')!] || 'Other'}`),
                f('Result', failed ? 'Failed' : id === '4634' || id === '4647' ? null : 'Success', { tone: failed ? 'bad' : 'good' }),
                f('Failure reason', failed ? winCode(pick(ed, 'failureReason')) : null),
                f('Status', failed ? ntStatus(pick(ed, 'status')) : null, { mono: true }),
                f('Sub-status', failed && subStatus !== '0x0' ? ntStatus(subStatus) : null, { mono: true }),
                f('Source', [pick(ed, 'ipAddress'), pick(ed, 'workstationName')].filter(Boolean).join(' · ') || null, { mono: true }),
                f('Process', pick(ed, 'processName'), { mono: true }),
                f('Logon process', pick(ed, 'logonProcessName')),
                f('Authentication', pick(ed, 'authenticationPackageName')),
                f('Elevated', winCode(pick(ed, 'elevatedToken'))),
                f('Requested by', account(pick(ed, 'subjectUserName'), pick(ed, 'subjectDomainName')), { mono: true }),
                f('Event', eventLabel),
            ],
        };
    }
    if (groups.includes('windows_defender') || /defender/i.test(str(sys.providerName) || '')) {
        const path = pick(ed, 'path');
        return {
            category: 'Microsoft Defender',
            message,
            facts: [
                f('Threat', pick(ed, 'threat Name'), { tone: 'bad' }),
                f('Category', pick(ed, 'category Name')),
                f('Severity', pick(ed, 'severity Name')),
                f('Action', pick(ed, 'action Name')),
                f('Path', path ? path.replace(/^(file|webfile|process):_/i, '').split(/;\s*\w+:_/)[0] : null, { mono: true }),
                f('Detected for', pick(ed, 'detection User'), { mono: true }),
                f('Origin', pick(ed, 'origin Name')),
                f('Source', pick(ed, 'source Name')),
                f('Process', pick(ed, 'process Name') === 'Unknown' ? null : pick(ed, 'process Name'), { mono: true }),
                f('Result', pick(ed, 'error Description')),
                f('Event', eventLabel),
            ],
        };
    }
    if (['7045', '7040', '7036', '7034', '7031', '7009', '7011', '4697'].includes(id)) {
        return {
            category: 'Windows service',
            message,
            facts: [
                f('Service', pick(ed, 'serviceName', 'param1'), { mono: true }),
                f('Binary', pick(ed, 'imagePath', 'serviceFileName'), { mono: true }),
                f('Type', pick(ed, 'serviceType')),
                f('Start type', pick(ed, 'startType')),
                f('Runs as', pick(ed, 'accountName', 'serviceAccount'), { mono: true }),
                f('Event', eventLabel),
            ],
        };
    }
    if (['4720', '4722', '4723', '4724', '4725', '4726', '4738', '4740', '4767', '4728', '4729', '4732', '4733', '4756', '4757'].includes(id)) {
        return {
            category: 'Account change',
            message,
            facts: [
                f('Account', account(pick(ed, 'targetUserName'), pick(ed, 'targetDomainName')), { mono: true }),
                f('Display name', pick(ed, 'displayName')),
                f('Member', pick(ed, 'memberName', 'memberSid'), { mono: true }),
                f('Changed by', account(pick(ed, 'subjectUserName'), pick(ed, 'subjectDomainName')), { mono: true }),
                f('Account SID', pick(ed, 'targetSid'), { mono: true }),
                f('Event', eventLabel),
            ],
        };
    }
    if (id === '4688' || (id === '1' && /sysmon/i.test(str(sys.providerName) || ''))) {
        return {
            category: 'Process creation',
            message,
            facts: [
                f('Process', pick(ed, 'newProcessName', 'image'), { mono: true }),
                f('Command line', pick(ed, 'commandLine'), { mono: true }),
                f('Parent', pick(ed, 'parentProcessName', 'parentImage'), { mono: true }),
                f('User', account(pick(ed, 'subjectUserName', 'user'), pick(ed, 'subjectDomainName')), { mono: true }),
                f('Hashes', pick(ed, 'hashes'), { mono: true }),
                f('Event', eventLabel),
            ],
        };
    }
    return {
        category: 'Windows event',
        message,
        facts: [
            f('Event', eventLabel),
            f('Provider', pick(sys, 'providerName')),
            f('Computer', pick(sys, 'computer'), { mono: true }),
            f('Level', pick(sys, 'severityValue')),
            ...genericFacts(ed, 6),
        ],
    };
}

function fimProfile(a: any): Profile {
    const s = get(a, 'syscheck') || {};
    const groups: string[] = get(a, 'rule.groups') || [];
    const path = str(s.path);
    const isRegistry = groups.includes('syscheck_registry') || /^HKEY_/i.test(path || '');
    const event = str(s.event);
    const change = (before: any, after: any) => {
        const b = str(before), z = str(after);
        if (b && z && b !== z) return `${b} → ${z}`;
        return z || b;
    };
    return {
        category: isRegistry ? 'Registry change' : 'File change',
        facts: [
            f(isRegistry ? 'Key' : 'Path', path, { mono: true }),
            f('Value', [str(s.value_name), str(s.value_type)].filter(Boolean).join(' · ') || null, { mono: true }),
            f('Change', event ? titleCase(event) : null, { tone: event === 'deleted' ? 'warn' : undefined }),
            f('Changed', str(s.changed_attributes)),
            f('Size', change(s.size_before, s.size_after)),
            f('SHA-256', str(s.sha256_after) || str(s.sha256_before), { mono: true }),
            f('Previous SHA-256', event === 'modified' ? str(s.sha256_before) : null, { mono: true }),
            f('Owner', str(s.uname_after) || str(s.uname_before)),
            f('Modified', change(s.mtime_before, s.mtime_after)),
            f('Changed by', pick(a, 'syscheck.audit.user.name', 'syscheck.audit.login_user.name'), { mono: true }),
            f('Process', pick(a, 'syscheck.audit.process.name'), { mono: true }),
            f('Detection', str(s.mode) ? titleCase(str(s.mode)!) : null),
        ],
    };
}

function authProfile(a: any): Profile {
    const groups: string[] = get(a, 'rule.groups') || [];
    const program = pick(a, 'predecoder.program_name', 'decoder.parent', 'decoder.name');
    const failed = groups.some(g => /failed|failure|invalid/.test(g));
    const succeeded = groups.some(g => /success/.test(g));
    const ip = pick(a, 'data.srcip'), port = pick(a, 'data.srcport');
    return {
        category: program === 'sshd' ? 'SSH login' : program === 'sudo' ? 'Privilege use (sudo)' : 'Authentication',
        facts: [
            f('User', pick(a, 'data.dstuser', 'data.srcuser', 'data.user'), { mono: true }),
            f('Result', failed ? 'Failed' : succeeded ? 'Success' : null, { tone: failed ? 'bad' : 'good' }),
            f('Source', ip ? (port ? `${ip}:${port}` : ip) : null, { mono: true }),
            f('Command', pick(a, 'data.command'), { mono: true }),
            f('Run as', program === 'sudo' ? pick(a, 'data.dstuser') : null, { mono: true }),
            f('Terminal', pick(a, 'data.tty')),
            f('Directory', pick(a, 'data.pwd'), { mono: true }),
            f('Service', program),
            f('Host', pick(a, 'predecoder.hostname'), { mono: true }),
        ],
    };
}

function office365Profile(a: any): Profile {
    const o = get(a, 'data.office365') || {};
    const isMail = !!(o.P1Sender || o.P2Sender || o.Recipients || /mail/i.test(str(o.Operation) || ''));
    const auth = Array.isArray(o.AuthDetails) ? o.AuthDetails.map((d: any) => `${d.Name} ${d.Value}`).join(' · ') : null;
    const files = Array.isArray(o.AttachmentData) ? o.AttachmentData.map((d: any) => str(d.FileName)).filter(Boolean) : [];
    const delivery = str(o.DeliveryAction);
    if (isMail) {
        return {
            category: 'Office 365 mail',
            facts: [
                f('Sender', str(o.P2Sender) || str(o.P1Sender), { mono: true }),
                f('Recipients', str(o.Recipients), { mono: true }),
                f('Subject', str(o.Subject)),
                f('Delivery', delivery, { tone: /blocked|quarantine/i.test(delivery || '') ? 'good' : /deliver/i.test(delivery || '') ? 'bad' : undefined }),
                f('Location', str(o.LatestDeliveryLocation) || str(o.OriginalDeliveryLocation)),
                f('Verdict', [str(o.Verdict), str(o.PhishConfidenceLevel) && `${str(o.PhishConfidenceLevel)} confidence`].filter(Boolean).join(' · ') || null),
                f('Detection', str(o.DetectionMethod) || str(o.ThreatsAndDetectionTech)),
                f('Sender IP', str(o.SenderIp), { mono: true }),
                f('Authentication', auth),
                f('Attachments', files.length ? files.join(', ') : null, { mono: true }),
            ],
        };
    }
    return {
        category: 'Office 365 activity',
        facts: [
            f('Operation', str(o.Operation)),
            f('User', str(o.UserId), { mono: true }),
            f('Workload', str(o.Workload)),
            f('Client IP', str(o.ClientIP), { mono: true }),
            f('Result', str(o.ResultStatus)),
            f('Object', str(o.ObjectId), { mono: true }),
            ...genericFacts(o, 4),
        ],
    };
}

function graphProfile(a: any): Profile {
    const g = get(a, 'data.ms-graph') || {};
    return {
        category: 'Microsoft 365 Defender',
        facts: [
            f('Incident', str(g.displayName) || str(g.title)),
            f('Status', str(g.status)),
            f('Severity', str(g.severity)),
            f('Classification', str(g.classification)),
            f('Determination', str(g.determination)),
            f('Comment', str(g.resolvingComment)),
            f('Updated by', str(g.lastModifiedBy)),
            f('Incident ID', str(g.id), { mono: true }),
        ],
    };
}

function scaProfile(a: any): Profile {
    const s = get(a, 'data.sca') || {};
    if (str(s.type) === 'summary') {
        return {
            category: 'Configuration scan',
            facts: [
                f('Policy', str(s.policy)),
                f('Score', str(s.score) && `${str(s.score)}%`, { tone: Number(s.score) < 50 ? 'bad' : undefined }),
                f('Passed', str(s.passed), { tone: 'good' }),
                f('Failed', str(s.failed), { tone: Number(s.failed) > 0 ? 'bad' : undefined }),
                f('Not applicable', str(s.invalid)),
                f('Policy file', str(s.file), { mono: true }),
            ],
        };
    }
    const result = pick(s, 'check.result');
    return {
        category: 'Configuration check',
        facts: [
            f('Check', pick(s, 'check.title')),
            f('Result', result && titleCase(result), { tone: result === 'failed' ? 'bad' : result === 'passed' ? 'good' : undefined }),
            f('Policy', str(s.policy)),
            f('Rationale', pick(s, 'check.rationale')),
            f('Remediation', pick(s, 'check.remediation')),
            f('Checked', pick(s, 'check.file', 'check.command', 'check.registry', 'check.directory'), { mono: true }),
        ],
    };
}

function vulnerabilityProfile(a: any): Profile {
    const v = get(a, 'data.vulnerability') || {};
    return {
        category: 'Vulnerability',
        facts: [
            f('CVE', str(v.cve), { mono: true }),
            f('Package', [pick(v, 'package.name'), pick(v, 'package.version')].filter(Boolean).join(' ') || null, { mono: true }),
            f('Severity', str(v.severity), { tone: /critical|high/i.test(str(v.severity) || '') ? 'bad' : undefined }),
            f('CVSS', pick(v, 'score.base', 'cvss.cvss3.base_score')),
            f('Status', str(v.status)),
            f('Title', str(v.title)),
            f('Fixed in', pick(v, 'package.condition')),
        ],
    };
}

function wazuhProfile(a: any): Profile {
    const log = str(a.full_log);
    return {
        category: 'Wazuh event',
        logInFacts: !!log,
        facts: [
            f('Message', log && log.replace(/^ossec:\s*/, ''), { mono: true }),
            f('Component', str(a.location)),
            ...genericFacts(a.data, 6),
        ],
    };
}

const NOISY_KEY = /(guid|keywords|opcode|^task$|threadid|processid|version|recordid|^level$|^id$|tenantid|organizationid)$/i;

/** The most informative scalar fields of an object, labelled from their key names. */
function genericFacts(obj: any, max = 8): Fact[] {
    if (!obj || typeof obj !== 'object') return [];
    const out: Fact[] = [];
    const walk = (o: any, depth: number) => {
        for (const [k, v] of Object.entries(o)) {
            if (out.length >= max) return;
            if (v && typeof v === 'object' && !Array.isArray(v)) { if (depth < 2) walk(v, depth + 1); continue; }
            const s = str(v);
            if (!s || NOISY_KEY.test(k) || s.length > 300) continue;
            out.push({ label: humanize(k), value: s, mono: /ip|path|file|hash|sha|md5|url|user|host|name/i.test(k) });
        }
    };
    walk(obj, 0);
    return out;
}

function profileFor(a: any): Profile {
    const decoder = str(get(a, 'decoder.name')) || '';
    const groups: string[] = get(a, 'rule.groups') || [];
    if (get(a, 'data.win')) return windowsProfile(a);
    if (get(a, 'syscheck')) return fimProfile(a);
    if (get(a, 'data.office365')) return office365Profile(a);
    if (get(a, 'data.ms-graph')) return graphProfile(a);
    if (get(a, 'data.sca')) return scaProfile(a);
    if (get(a, 'data.vulnerability')) return vulnerabilityProfile(a);
    if (['sshd', 'pam', 'sudo', 'su'].includes(decoder) || groups.some(g => /^(sshd|authentication_|sudo|pam)/.test(g))) return authProfile(a);
    if (['ossec', 'wazuh'].includes(decoder) || str(a.location)?.startsWith('wazuh-')) return wazuhProfile(a);
    const data = a.data && typeof a.data === 'object' ? a.data : {};
    const integration = str(data.integration);
    const inner = integration && data[integration] && typeof data[integration] === 'object' ? data[integration] : data;
    const facts = genericFacts(inner, 8);
    const logInFacts = !facts.length && !!str(a.full_log);
    if (logInFacts) facts.push({ label: 'Log', value: str(a.full_log)!, mono: true });
    return { category: integration ? titleCase(integration) : decoder ? humanize(decoder) : 'Event', facts, logInFacts };
}

// --- entities --------------------------------------------------------------------------------------

function entitiesOf(a: any, profileCategory: string): Entity[] {
    const out: Entity[] = [];
    const add = (kind: EntityKind, value: string | null, role?: string) => {
        if (!value) return;
        if (kind === 'ip' && isLoopback(value)) return;
        if (kind === 'user' && /^(-|system|local service|network service|anonymous logon)$/i.test(value)) return;
        if (out.some(e => e.kind === kind && e.value.toLowerCase() === value.toLowerCase())) return;
        out.push({ kind, value, role });
    };
    const ed = get(a, 'data.win.eventdata') || {};
    const o = get(a, 'data.office365') || {};

    add('user', account(pick(ed, 'targetUserName'), pick(ed, 'targetDomainName')), 'Target');
    add('user', pick(ed, 'detection User'));
    add('user', pick(a, 'data.dstuser', 'data.srcuser', 'data.user'));
    add('user', pick(a, 'syscheck.audit.user.name'));
    add('email', str(o.P2Sender) || str(o.P1Sender), 'Sender');
    (Array.isArray(o.Recipients) ? o.Recipients : [o.Recipients]).forEach((r: any) => add('email', str(r), 'Recipient'));
    add('ip', pick(a, 'data.srcip') || pick(ed, 'ipAddress') || str(o.SenderIp) || str(o.ClientIP), 'Source');
    add('ip', pick(a, 'data.dstip'), 'Destination');
    add('host', pick(a, 'agent.name'), 'Agent');
    add('host', pick(ed, 'workstationName'), 'Workstation');
    add('process', pick(ed, 'newProcessName', 'image', 'processName'), 'Process');
    add('process', pick(ed, 'parentProcessName', 'parentImage'), 'Parent');
    add('service', pick(ed, 'serviceName'));
    const path = pick(a, 'syscheck.path');
    if (path) add(profileCategory === 'Registry change' ? 'registry' : 'file', path);
    add('file', pick(ed, 'imagePath'));
    const defenderPath = pick(ed, 'path');
    if (defenderPath) add('file', defenderPath.replace(/^(file|webfile|process):_/i, '').split(/;\s*\w+:_|\|/)[0]);
    add('hash', pick(a, 'syscheck.sha256_after'), 'SHA-256');
    if (Array.isArray(o.AttachmentData)) o.AttachmentData.forEach((d: any) => { add('file', str(d.FileName), 'Attachment'); add('hash', str(d.SHA256), 'SHA-256'); });
    add('url', pick(a, 'data.url'));
    return out.slice(0, 10);
}

// --- all fields ------------------------------------------------------------------------------------

function flatten(obj: any, prefix = '', out: FieldRow[] = []): FieldRow[] {
    if (obj == null) return out;
    if (Array.isArray(obj)) {
        if (obj.every(x => x == null || typeof x !== 'object')) {
            const s = str(obj);
            if (s) out.push({ path: prefix, value: s });
        } else obj.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out));
        return out;
    }
    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            if (!prefix && INTERNAL_KEYS.has(k)) continue;
            flatten(v, prefix ? `${prefix}.${k}` : k, out);
        }
        return out;
    }
    const s = str(obj);
    if (s) out.push({ path: prefix, value: s });
    return out;
}

export function buildAlertFacts(raw: any): AlertFacts {
    const a = alertBody(raw);
    const profile = profileFor(a);
    return {
        category: profile.category,
        message: profile.message ?? null,
        logInFacts: !!profile.logInFacts,
        facts: profile.facts.filter((x): x is Fact => !!x).slice(0, 12),
        entities: entitiesOf(a, profile.category),
        fields: flatten(a),
    };
}
