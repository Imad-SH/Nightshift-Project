/** How each SOAR connector is shown in the UI (escalation button, header badge). */
export interface SoarInfo {
    name: string;
    logo?: string;
    /** CyberCard accent */
    color: 'amber' | 'violet' | 'cyan' | 'slate';
    /** Button subtitle when nothing has been escalated yet */
    escalateLabel: string;
}

const SOARS: Record<string, SoarInfo> = {
    thehive: { name: 'TheHive', logo: '/assets/TheHive Logo.png', color: 'amber', escalateLabel: 'Escalate to TheHive' },
    flowintel: { name: 'Flowintel', logo: '/assets/flowintel_logo.png', color: 'violet', escalateLabel: 'Escalate to Flowintel' },
    webhook: { name: 'Webhook', color: 'cyan', escalateLabel: 'Escalate via webhook' },
    none: { name: 'No SOAR', color: 'slate', escalateLabel: 'No SOAR configured' },
};

export const soarInfo = (id?: string | null): SoarInfo => SOARS[id || 'none'] || SOARS.none;
