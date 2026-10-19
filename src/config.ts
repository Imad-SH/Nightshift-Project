/**
 * Runtime configuration, loaded from /config.json before the app renders.
 *
 * One build serves every installation: in production the web container writes
 * config.json at startup from the installer's settings, so server addresses are
 * never baked into the bundle. In development (`npm run dev`) there is no
 * config.json and the dev defaults below apply; Vite proxies /api and /socket.io
 * to the backend, so the app always talks to its own origin.
 */
export interface AppConfig {
    /** Base URL of the backend. Empty means the page's own origin (behind the reverse proxy). */
    apiBaseUrl: string;
    /** Keycloak base URL: a path such as "/auth" behind the reverse proxy, or an absolute URL. */
    authUrl: string;
    /** Keycloak realm and OIDC client of this installation. */
    realm: string;
    clientId: string;
}

const DEFAULTS: AppConfig = import.meta.env.DEV
    ? { apiBaseUrl: '', authUrl: 'http://localhost:8080', realm: 'nightshift', clientId: 'bluesec-frontend' }
    : { apiBaseUrl: '', authUrl: '/auth', realm: 'nightshift', clientId: 'bluesec-frontend' };

let current: AppConfig = DEFAULTS;

export async function loadConfig(): Promise<AppConfig> {
    try {
        const res = await fetch('/config.json', { cache: 'no-store' });
        // The dev server answers unknown paths with index.html, so check it really is JSON
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
            current = { ...DEFAULTS, ...(await res.json()) };
        }
    } catch (err) {
        console.warn('[Config] Could not load /config.json, using defaults', err);
    }
    return current;
}

export const getConfig = (): AppConfig => current;

/** Base URL for backend calls, without a trailing slash ('' = same origin). */
export const apiBase = (): string => current.apiBaseUrl.replace(/\/+$/, '');

/** The OIDC authority (Keycloak realm URL), always absolute. */
export const authorityUrl = (): string =>
    new URL(`${current.authUrl.replace(/\/+$/, '')}/realms/${encodeURIComponent(current.realm)}`, window.location.origin).toString();
