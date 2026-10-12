import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { WebStorageStateStore } from 'oidc-client-ts'
import './index.css'
import App from './App.tsx'
import { SocAuthProvider } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'

// AUTO-PURGE: Clear lingering OIDC keys from localStorage (fixes the QuotaExceededError automatically)
// ONLY run this if we are not in the middle of a redirect back from the login portal
if (!window.location.search.includes('state=') && !window.location.search.includes('code=')) {
  try {
    Object.keys(localStorage).forEach(key => {
      if ((key.startsWith('oidc.') || key.startsWith('cortex_')) && !key.includes('graph')) {
        localStorage.removeItem(key);
        console.log(`[AUTH] Purged legacy key: ${key}`);
      }
    });
  } catch (e) {
    console.error('[AUTH] Failed to purge storage:', e);
  }
}

const oidcConfig = {
  authority: `http://${window.location.hostname}:8080/realms/AI-Driven%20SOC`,
  client_id: "bluesec-frontend",
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <SocAuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </SocAuthProvider>
    </AuthProvider>
  </StrictMode>,
)
