/** The dashboard's top-level screens (sidebar entries). */
export type AppTab = 'MONITORING' | 'USERS MANAGEMENT' | 'LLM SETTINGS' | 'STATISTICS' | 'LOGIN ACTIVITY' | 'INTEGRATIONS' | 'CTI CONFIGURATION';

export type AlertStatus = 'running' | 'extracting' | 'investigating' | 'judging' | 'benign' | 'malicious' | 'waiting' | 'completed' | 'failed';

export interface Alert {
    id: string;
    title: string;
    timestamp: string;
    status: AlertStatus;
    level: number;
    agent?: string;
    rawData?: any;
    pipeline_status?: PipelineStatus;
    verdict?: string;
    graph_state?: {
        nodes: any[];
        edges: any[];
        last_updated: string;
    };
    alert_status?: string;
}

export type PipelineStatus = 'running' | 'extracting' | 'investigating' | 'judging' | 'completed' | 'paused' | 'waiting_approval' | 'failed' | 'idle' | 'waiting';

export interface Evidence {
    source_ip: string;
    cti_score: number;
    internal_frequency: number;
    geo_location?: string;
}

export interface SocketEvent {
    alert_id: string;
    pipeline_status: PipelineStatus;
    current_node: string;
    log_monologue: string[];
    node_results?: Record<string, any>; // Persistent data for each agent node
    updates?: any[]; // Raw history of socket payloads for re-hydration
    evidence?: Evidence;
    verdict?: string;
    graph_state?: {
        nodes: any[];
        edges: any[];
        last_updated: string;
    };
    report_path?: string;
}

export interface GraphNodeStatus {
    id: string;
    state: 'idle' | 'active' | 'success' | 'failure';
}
