import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Alert, SocketEvent } from '../types';

// GLOBAL SINGLETON STATE
let globalSocket: Socket | null = null;
let globalAlerts: Alert[] = [];
let globalEventsState: Record<string, SocketEvent> = {};
let globalIsConnected = false;
let globalServiceStatus = { wazuh: 'DISCONNECTED', thehive: 'DISCONNECTED', flowintel: 'DISCONNECTED', active_soar: 'thehive' };

const listeners = new Set<(state: { 
    alerts: Alert[]; 
    events: Record<string, SocketEvent>; 
    isConnected: boolean;
    serviceStatus: { wazuh: string; thehive: string; flowintel: string; active_soar: string };
}) => void>();

let notificationTimeout: ReturnType<typeof setTimeout> | null = null;
const notifyListeners = (immediate = false) => {
    const trigger = () => {
        const state = { 
            alerts: [...globalAlerts], 
            events: { ...globalEventsState },
            isConnected: globalIsConnected,
            serviceStatus: { ...globalServiceStatus }
        };
        listeners.forEach(l => l(state));
    };

    if (immediate) {
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
            notificationTimeout = null; // CRITICAL: Reset to null so throttled path isn't permanently blocked
        }
        trigger();
        return;
    }

    if (!notificationTimeout) {
        notificationTimeout = setTimeout(() => {
            trigger();
            notificationTimeout = null;
        }, 100); // 100ms throttle
    }
};

// PORT FIX: Backend is running on 8000 as seen in health checks and API calls
const SOCKET_URL = `http://${window.location.hostname}:8000`;

export const useSocket = () => {
    const [alerts, setAlerts] = useState<Alert[]>(globalAlerts);
    const [events, setEvents] = useState<Record<string, SocketEvent>>(globalEventsState);
    const [isConnected, setIsConnected] = useState(globalSocket?.connected || globalIsConnected);
    const [serviceStatus, setServiceStatus] = useState(globalServiceStatus);

    // Track component unmount
    useEffect(() => {
        let isMounted = true;
        const listener = (state: { 
            alerts: Alert[]; 
            events: Record<string, SocketEvent>; 
            isConnected: boolean;
            serviceStatus: { wazuh: string; thehive: string; flowintel: string; active_soar: string };
        }) => {
            if (isMounted) {
                setAlerts(state.alerts);
                setEvents(state.events);
                setIsConnected(state.isConnected);
                setServiceStatus(state.serviceStatus);
            }
        };
        listeners.add(listener);

        if (!globalSocket) {
            console.log(`🔌 [Socket] Initializing connection to ${SOCKET_URL}`);
            globalSocket = io(SOCKET_URL, {
                reconnection: true,
                reconnectionAttempts: 20,
                reconnectionDelay: 1000,
                transports: ['websocket', 'polling']
            });

            globalSocket.on('connect', () => {
                console.log('🔌 [Socket] Established NEW connection');
                globalIsConnected = true;
                notifyListeners(true);
            });

            globalSocket.on('disconnect', () => {
                console.log('🔌 [Socket] Connection lost');
                globalIsConnected = false;
                notifyListeners(true);
            });

            globalSocket.on('alert_history', (payload: { alerts: any[], is_append?: boolean }) => {
                const history = payload.alerts || [];
                const isAppend = payload.is_append || false;
                
                console.log(`📜 [Socket] Syncing history (${history.length} records, append=${isAppend})`);
                
                const newAlerts = history.map((rawAlert: any) => ({
                    id: rawAlert.id || `${rawAlert.title}-${rawAlert.timestamp}`,
                    title: rawAlert.title,
                    timestamp: rawAlert.timestamp,
                    status: rawAlert.status || 'waiting',
                    pipeline_status: rawAlert.status || 'waiting',
                    level: rawAlert.rule_level || 0,
                    agent: rawAlert.source || 'Win-Agent-01',
                    rawData: rawAlert.raw_data || rawAlert,
                    verdict: rawAlert.verdict,
                    graph_state: rawAlert.graph_state,
                    alert_status: rawAlert.alert_status,
                    thehive_id: rawAlert.thehive_id || null,
                    thehive_url: rawAlert.thehive_url || null,
                    flowintel_id: rawAlert.flowintel_id || null,
                    flowintel_url: rawAlert.flowintel_url || null,
                    case_url: rawAlert.case_url || null,
                }));

                if (isAppend) {
                    // Filter out any duplicates that might have been ingested in real-time
                    const existingIds = new Set(globalAlerts.map(a => a.id));
                    const uniqueNewAlerts = newAlerts.filter(a => !existingIds.has(a.id));
                    globalAlerts = [...globalAlerts, ...uniqueNewAlerts];
                } else {
                    globalAlerts = newAlerts;
                }
                
                history.forEach((rawAlert: any) => {
                    const id = rawAlert.id || `${rawAlert.title}-${rawAlert.timestamp}`;
                    
                    // Prioritize backend-provided AI results for persistence
                    const aiResults = rawAlert.ai_analysis_results || {};
                    const hasResults = Object.keys(aiResults).length > 0;
                    
                    const isActivePhase = ['running', 'extracting', 'investigating', 'judging'].includes(rawAlert.status);
                    const isCompleted = rawAlert.status === 'completed';
                    
                    const soarFields = {
                        thehive_id: rawAlert.thehive_id || null,
                        thehive_url: rawAlert.thehive_url || null,
                        flowintel_id: rawAlert.flowintel_id || null,
                        flowintel_url: rawAlert.flowintel_url || null,
                        case_url: rawAlert.case_url || null,
                    };

                    if (rawAlert.updates && rawAlert.updates.length > 0) {
                        globalEventsState[id] = {
                            alert_id: id,
                            pipeline_status: rawAlert.status || 'completed',
                            current_node: rawAlert.updates[rawAlert.updates.length - 1]?.node || 'completed',
                            log_monologue: rawAlert.updates.map((u: any) => u.log).filter(Boolean),
                            updates: rawAlert.updates,
                            node_results: aiResults,
                            verdict: rawAlert.verdict,
                            graph_state: rawAlert.graph_state,
                            report_path: rawAlert.report_path,
                            ...soarFields,
                        };
                    } else if (hasResults || isCompleted || isActivePhase) {
                        let node = 'completed';
                        if (rawAlert.status === 'extracting') node = 'agent_screener';
                        if (rawAlert.status === 'investigating') node = 'agent_investigator';
                        if (rawAlert.status === 'judging') node = 'agent_judge';

                        globalEventsState[id] = {
                            alert_id: id,
                            pipeline_status: rawAlert.status || 'completed',
                            current_node: node,
                            log_monologue: ['[REHYDRATED] Analysis history loaded.'],
                            updates: [],
                            node_results: aiResults,
                            verdict: rawAlert.verdict,
                            graph_state: rawAlert.graph_state,
                            report_path: rawAlert.report_path,
                            ...soarFields,
                        };
                    }
                });
                notifyListeners(true);
            });

            globalSocket.on('new_alert', (newAlert: any) => {
                const derivedId = newAlert.id || `${newAlert.title}-${newAlert.timestamp}`;
                const alert: Alert = {
                    id: derivedId, title: newAlert.title, timestamp: newAlert.timestamp,
                    status: newAlert.status || 'waiting', level: newAlert.rule_level || 0,
                    agent: newAlert.source || 'Win-Agent-01', rawData: newAlert.raw_data || newAlert
                };

                if (globalAlerts.some(a => a.id === alert.id)) return;
                globalAlerts = [alert, ...globalAlerts];
                globalEventsState[alert.id] = {
                    alert_id: alert.id, pipeline_status: 'waiting', current_node: 'listener',
                    log_monologue: [`[INIT] Alert Ingested: ${alert.title}`],
                    evidence: { source_ip: '0.0.0.0', cti_score: 0, internal_frequency: 0 },
                    updates: [], node_results: {}
                };
                notifyListeners(true); // Immediate: new alerts must appear instantly
            });

            globalSocket.on('service_status', (status: any) => {
                console.log('🛰️ [Socket] Service Health Update:', status);
                globalServiceStatus = { 
                    wazuh: status.wazuh, 
                    thehive: status.thehive,
                    flowintel: status.flowintel || 'DISCONNECTED',
                    active_soar: status.active_soar || 'thehive'
                };
                notifyListeners(true); // Immediate: health status changes must reflect instantly
            });

            globalSocket.on('agent_update', (update: any) => {
                const existingEvt = globalEventsState[update.alert_id];
                if (existingEvt) {
                    if (update.node === 'reset') {
                        // CLEAR GLOBAL ALERT DATA TO PREVENT UI GHOSTS
                        const alertToReset = globalAlerts.find(a => a.id === update.alert_id);
                        if (alertToReset) {
                            alertToReset.verdict = undefined;
                            alertToReset.status = 'running';
                            alertToReset.graph_state = undefined;
                            if (alertToReset.rawData) {
                                alertToReset.rawData.graph_layout = undefined;
                                alertToReset.rawData.ai_analysis_results = {};
                            }
                        }

                        globalEventsState[update.alert_id] = {
                            alert_id: update.alert_id,
                            pipeline_status: 'running',
                            current_node: 'reset',
                            log_monologue: ['♻️ Starting fresh investigation sequence...'],
                            updates: [],
                            node_results: {}
                        };
                        notifyListeners(true);
                        return;
                    }

                    // Create a new updated event object
                    const updatedEvt = { ...existingEvt };
                    updatedEvt.current_node = update.node;
                    
                    if (update.log) {
                        updatedEvt.log_monologue = [...existingEvt.log_monologue, update.log];
                    }
                    
                    if (update.data) {
                        updatedEvt.node_results = { 
                            ...existingEvt.node_results, 
                            [update.node]: { ...(existingEvt.node_results?.[update.node] || {}), ...update.data } 
                        };
                    }
                    
                    updatedEvt.updates = [...(existingEvt.updates || []), update];

                    if (update.pipeline_status) {
                        updatedEvt.pipeline_status = update.pipeline_status;
                        const globalAlert = globalAlerts.find(a => a.id === update.alert_id);
                        if (globalAlert) {
                            globalAlert.status = update.pipeline_status;
                            if (update.verdict) globalAlert.verdict = update.verdict;
                            if (update.pipeline_status === 'completed' || update.pipeline_status === 'failed') {
                                globalAlert.rawData = {
                                    ...globalAlert.rawData,
                                    ai_analysis_results: updatedEvt.node_results,
                                    pipeline_status: update.pipeline_status
                                };
                            }
                        }
                    }

                    if (update.thehive_id || update.flowintel_id || update.case_url) {
                        const globalAlert = globalAlerts.find(a => a.id === update.alert_id);
                        if (globalAlert) {
                            if (update.thehive_id) (globalAlert as any).thehive_id = update.thehive_id;
                            if (update.thehive_url) (globalAlert as any).thehive_url = update.thehive_url;
                            if (update.flowintel_id) (globalAlert as any).flowintel_id = update.flowintel_id;
                            if (update.flowintel_url) (globalAlert as any).flowintel_url = update.flowintel_url;
                            if (update.case_url) (globalAlert as any).case_url = update.case_url;
                        }
                        if (update.thehive_id) (updatedEvt as any).thehive_id = update.thehive_id;
                        if (update.thehive_url) (updatedEvt as any).thehive_url = update.thehive_url;
                        if (update.flowintel_id) (updatedEvt as any).flowintel_id = update.flowintel_id;
                        if (update.flowintel_url) (updatedEvt as any).flowintel_url = update.flowintel_url;
                        if (update.case_url) (updatedEvt as any).case_url = update.case_url;
                    }

                    globalEventsState[update.alert_id] = updatedEvt;
                    notifyListeners();
                }
            });
        } else {
            // Check connected state on re-mount to ensure UI sync
            if (globalSocket.connected) {
                globalIsConnected = true;
                notifyListeners(true);
            }
        }

        const handleLocalAgentUpdate = (e: any) => {
            const update = e.detail;
            const existingEvt = globalEventsState[update.alert_id];
            if (existingEvt) {
                // Immutable update to ensure React components detect the change
                const updatedEvt = { 
                    ...existingEvt,
                    log_monologue: update.log ? [...existingEvt.log_monologue, update.log] : existingEvt.log_monologue
                };

                if (update.pipeline_status) {
                    updatedEvt.pipeline_status = update.pipeline_status;
                    const globalAlert = globalAlerts.find(a => a.id === update.alert_id);
                    if (globalAlert) {
                        globalAlert.status = update.pipeline_status;
                    }
                }

                globalEventsState[update.alert_id] = updatedEvt;
                notifyListeners();
            }
        };
        window.addEventListener('agent_update', handleLocalAgentUpdate);

        return () => { 
            isMounted = false;
            listeners.delete(listener); 
            window.removeEventListener('agent_update', handleLocalAgentUpdate);
        };
    }, []);

    const getEventById = useCallback((id: string | undefined): SocketEvent | null => {
        if (!id) return null;
        return globalEventsState[id] || null;
    }, []);

    const injectAlert = useCallback((rawEmittable: any) => {
        const id = rawEmittable.id || `${rawEmittable.title}-${rawEmittable.timestamp}`;
        if (globalAlerts.some(a => a.id === id)) return;
        const alert: Alert = {
            id,
            title: rawEmittable.title,
            timestamp: rawEmittable.timestamp,
            status: rawEmittable.status || 'waiting',
            level: rawEmittable.rule_level || 0,
            agent: rawEmittable.source || 'Win-Agent-01',
            rawData: rawEmittable.raw_data || rawEmittable,
        };
        globalAlerts = [alert, ...globalAlerts];
        globalEventsState[id] = {
            alert_id: id, pipeline_status: 'waiting', current_node: 'listener',
            log_monologue: [`[INIT] Alert Ingested: ${alert.title}`],
            evidence: { source_ip: '0.0.0.0', cti_score: 0, internal_frequency: 0 },
            updates: [], node_results: {}
        };
        notifyListeners(true);
    }, []);

    const resetEvent = (id: string) => {
        if (!id) return;
        
        // CLEAR GLOBAL ALERT DATA TO PREVENT UI GHOSTS
        const alertToReset = globalAlerts.find(a => a.id === id);
        if (alertToReset) {
            alertToReset.verdict = undefined;
            alertToReset.status = 'running';
        }

        globalEventsState[id] = {
            alert_id: id, pipeline_status: 'running', current_node: 'reset',
            log_monologue: [`[RESET] Investigation restarted`],
            evidence: { source_ip: '0.0.0.0', cti_score: 0, internal_frequency: 0 },
            node_results: {}, updates: []
        };
        globalSocket?.emit('start_investigation', { alert_id: id });
        notifyListeners(true);
    };

    const loadMoreHistory = (currentCount: number, loadAll: boolean = false) => {
        if (globalSocket?.connected) {
            console.log(`📡 [Socket] Requesting ${loadAll ? 'FULL' : 'partial'} history (skip=${currentCount})`);
            globalSocket.emit('get_alerts_history', { 
                hours: -1, 
                skip: loadAll ? 0 : currentCount, 
                limit: loadAll ? 20000 : 200, 
                is_append: true 
            });
        }
    };



    const saveGraphState = (alert_id: string, nodes: any[], edges: any[]) => {
        if (globalSocket?.connected) {
            globalSocket.emit('save_graph_state', { alert_id, nodes, edges });
            
            // CRITICAL: Update local events state so rehydration is instant
            if (globalEventsState[alert_id]) {
                globalEventsState[alert_id] = {
                    ...globalEventsState[alert_id],
                    graph_state: { nodes, edges, last_updated: new Date().toISOString() }
                };
            }

            const alert = globalAlerts.find(a => a.id === alert_id);
            if (alert) alert.rawData = { ...alert.rawData, graph_layout: { nodes, edges, last_updated: new Date().toISOString() } };
            
            // No need to notify listeners for background saves to avoid re-render loops
            // notifyListeners(); 
        }
    };

    const loadAlertsByDateRange = (startDate: string, endDate: string) => {
        if (globalSocket?.connected && startDate && endDate) {
            console.log(`📡 [Socket] Requesting historical alerts between ${startDate} and ${endDate}`);
            globalSocket.emit('get_alerts_history', { 
                start_time: startDate,
                end_time: endDate,
                limit: 2000,
                is_append: false 
            });
        }
    };

    return {
        socket: globalSocket,
        alerts,
        events,
        isConnected,
        serviceStatus,
        getEventById,
        injectAlert,
        resetEvent,
        saveGraphState,
        loadMoreHistory,
        loadAlertsByDateRange
    };
};
