import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from './components/DashboardLayout';
import { LiveAlertStream } from './components/LiveAlertStream';
import { GraphVisualizer } from './components/GraphVisualizer';
import { XRayInspector } from './components/XRayInspector';
import { UserManagement } from './components/UserManagement';
import { LoginActivity } from './components/LoginActivity';
import { LLMSettings } from './components/LLMSettings';
import { SOCStatistics } from './components/SOCStatistics';
import { IntegrationSettings } from './components/IntegrationSettings';
import { CTIConfiguration } from './components/CTIConfiguration';
import { useSocAuth } from './contexts/AuthContext';
import type { AppTab } from './types';

const DashboardContent = () => {
  // Persist selection across reloads
  const [selectedAlertId, setSelectedAlertId] = useState<string | undefined>(() => {
    return localStorage.getItem('selectedAlertId') || undefined;
  });

  const [activeTab, setActiveTab] = useState<AppTab>('MONITORING');
  const [subTab, setSubTab] = useState<string | null>(null);

  const handleSelectAlert = (id: string) => {
    setSelectedAlertId(prev => {
      const newValue = prev === id ? undefined : id;
      if (newValue) {
        localStorage.setItem('selectedAlertId', newValue);
      } else {
        localStorage.removeItem('selectedAlertId');
      }
      return newValue;
    });
  };

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    setSubTab(null);
  };

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={handleTabChange} subTab={subTab}>
      {/* MONITORING TAB - Always mounted, hidden via CSS to preserve graph state across tab switches */}
      <div className={activeTab === 'MONITORING' ? 'contents' : 'hidden'}>
          {/* Zone 1: Left - Live Stream (30%) */}
          <div className="col-span-3 h-full min-h-0 relative z-50">
            <LiveAlertStream onSelectAlert={handleSelectAlert} selectedAlertId={selectedAlertId} />
          </div>

          {/* Zone 2: Right - Graph Visualizer (most of the height) & XRay Inspector (a compact action bar) */}
          <div className="col-span-7 h-full flex flex-col gap-4 overflow-hidden">
            {/* Top: Graph Section - takes the remaining height */}
            <div className="flex-1 min-h-0">
              <GraphVisualizer
                selectedAlertId={selectedAlertId}
              />
            </div>

            {/* Bottom: Inspector Section - sized to the action buttons */}
            <div className="flex-none h-[164px] flex flex-col">
              <XRayInspector 
                selectedAlertId={selectedAlertId} 
              />
            </div>
          </div>
      </div>

      {activeTab === 'USERS MANAGEMENT' && (
        <div className="col-span-10 h-full min-h-0">
          <UserManagement />
        </div>
      )}

      {activeTab === 'LOGIN ACTIVITY' && (
        <div className="col-span-10 h-full min-h-0">
          <LoginActivity />
        </div>
      )}
      
      {activeTab === 'LLM SETTINGS' && (
        <div className="col-span-10 h-full min-h-0">
          <LLMSettings onSubTabChange={setSubTab} />
        </div>
      )}

      {activeTab === 'STATISTICS' && (
        <div className="col-span-10 h-full min-h-0">
          <SOCStatistics />
        </div>
      )}

      {activeTab === 'INTEGRATIONS' && (
        <div className="col-span-10 h-full min-h-0">
          <IntegrationSettings onSubTabChange={setSubTab} />
        </div>
      )}

      {activeTab === 'CTI CONFIGURATION' && (
        <div className="col-span-10 h-full min-h-0">
          <CTIConfiguration />
        </div>
      )}
    </DashboardLayout>
  );
};
export default function App() {
  const { isAuthenticated, isLoading, error, login } = useSocAuth();

  // Start the login redirect from an effect (not during render), and only once
  const loginStarted = useRef(false);
  useEffect(() => {
    if (!isLoading && !error && !isAuthenticated && !loginStarted.current) {
      loginStarted.current = true;
      login();
    }
  }, [isLoading, error, isAuthenticated, login]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-cyan-500 font-mono tracking-widest text-sm animate-pulse uppercase">
          Synchronizing Secure Session...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="text-red-500 font-mono mb-4 tracking-widest">SYSTEM_OFFLINE</div>
        <div className="text-slate-400 text-xs font-mono max-w-md mb-8">
          {(error.message === 'Failed to fetch') ? 'Failed to establish secure session. Backend services may be offline.' : (error.message || 'An unexpected error occurred during the secure handshake.')}
        </div>
        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          }}
          className="px-6 py-2 bg-cyan-900/30 border border-cyan-500/50 text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] hover:bg-cyan-500/20 transition-colors"
        >
          RE-ESTABLISH CONNECTION
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-cyan-500 font-mono tracking-widest text-sm animate-pulse uppercase">
          Redirecting to Portal...
        </div>
      </div>
    );
  }

  return <DashboardContent />;
}
