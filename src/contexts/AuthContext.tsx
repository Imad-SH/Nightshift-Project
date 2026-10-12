import { useAuth } from 'react-oidc-context';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: any | null;
  user: any;
  token: string | null;
  roles: string[];
  isSocAdmin: boolean;
  userTitle: string;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  user: null,
  token: null,
  roles: [],
  isSocAdmin: false,
  userTitle: '',
  login: () => {},
  logout: () => {},
});

export const useSocAuth = () => useContext(AuthContext);

export const SocAuthProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  // Helper to map technical roles to human-readable titles
  const mapRoleToTitle = (roleList: string[]) => {
    const roles = roleList.map(r => r.toLowerCase());
    if (roles.includes('soc_manager') || roles.includes('soc_admin') || roles.includes('admin') || roles.includes('administrator')) {
        return 'SOC Manager';
    }
    if (roles.includes('soc_analyst_l3')) return 'L3 SOC Analyst';
    if (roles.includes('soc_analyst_l2')) return 'L2 SOC Analyst';
    if (roles.includes('soc_analyst_l1') || roles.includes('soc_analyst')) return 'L1 SOC Analyst';
    
    if (roleList.length > 0) {
        const socRole = roleList.find(r => 
            r.toLowerCase().includes('soc') && 
            !r.toLowerCase().includes('default-roles-ai-driven-soc') &&
            !r.toLowerCase().includes('offline_access') &&
            !r.toLowerCase().includes('uma_authorization')
        );
        if (socRole) return socRole.replace(/_/g, ' ');
        
        // If no SOC role found, try to find ANY non-system role
        const nonSystemRole = roleList.find(r => 
            !r.toLowerCase().includes('default-roles') &&
            !r.toLowerCase().includes('offline_access') &&
            !r.toLowerCase().includes('uma_authorization')
        );
        if (nonSystemRole) return nonSystemRole.replace(/_/g, ' ');

        return null;
    }
    return null;
  };

  // 1. Initial Calculation to prevent flicker on reload
  const initialProfile = auth.user?.profile as any;
  const initialRealmRoles = initialProfile?.realm_access?.roles || [];
  const initialClientRoles = initialProfile?.resource_access?.['bluesec-frontend']?.roles || [];
  const initialRolesArray = Array.from(new Set([...initialRealmRoles, ...initialClientRoles]));
  
  const initialTitle = mapRoleToTitle(initialRolesArray);

  const [roles, setRoles] = useState<string[]>(initialRolesArray);
  const [userTitle, setUserTitle] = useState<string | null>(initialTitle);
  
  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.profile) {
      console.log('DEBUG: Auth Profile:', auth.user.profile);
      const profile = auth.user.profile as any;
      const realmRoles = profile.realm_access?.roles || [];
      const clientRoles = profile.resource_access?.['bluesec-frontend']?.roles || [];
      const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));
      
      console.log('DEBUG: Aggregated Roles (Realm + Client):', allRoles);
      setRoles(allRoles);
      
      // Update title from roles if we don't have one yet or if roles changed
      const currentTitle = mapRoleToTitle(allRoles);
      if (currentTitle) {
        setUserTitle(currentTitle);
      } else if (allRoles.length > 0) {
        setUserTitle(allRoles[0].toUpperCase());
      }

      // Fetch the true user title and roles from our FastAPI backend
      if (auth.user?.access_token) {
        fetch(`http://${window.location.hostname}:8000/api/admin/users/me`, {
          headers: {
            'Authorization': `Bearer ${auth.user.access_token}`
          }
        })
        .then(res => res.json())
        .then(data => {
          // 1. Update internal roles from backend source of truth
          if (data.roles && data.roles.length > 0) {
            setRoles(data.roles);
          }

          // 2. Prioritize literal title attribute from Keycloak (the one we save in UI)
          if (data && data.title && data.title.trim()) {
            console.log('DEBUG: Using Literal Backend Title:', data.title);
            setUserTitle(data.title);
          } else {
            // 3. Fallback to role mapping
            const finalRoles = (data.roles && data.roles.length > 0) ? data.roles : allRoles;
            const mappedTitle = mapRoleToTitle(finalRoles);
            console.log('DEBUG: Fallback to role mapping:', mappedTitle);
            setUserTitle(mappedTitle || '');
          }
        })
        .catch(err => {
          console.error('Failed to fetch user profile:', err);
          setUserTitle(mapRoleToTitle(allRoles) || '');
        });
      }

    } else if (!auth.isLoading) {
      setRoles([]);
      setUserTitle(null);
    }
  }, [auth.isAuthenticated, auth.user, auth.isLoading]);

  const value: AuthContextType = {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error || null,
    user: auth.user?.profile,
    token: auth.user?.access_token || null,
    roles,
    isSocAdmin: roles.some(role => {
      const r = role.toLowerCase();
      return r === 'soc_admin' || r === 'soc_manager' || r === 'admin' || r === 'administrator';
    }) || 
    auth.user?.profile?.preferred_username?.toLowerCase() === 'admin' ||
    (auth.user?.profile as any)?.realm_access?.roles?.some((r: string) => {
      const lowerR = r.toLowerCase();
      return lowerR === 'soc_admin' || lowerR === 'soc_manager' || lowerR === 'admin' || lowerR === 'administrator';
    }),
    userTitle: (userTitle || (auth.isLoading ? 'SYNCING...' : '')).toUpperCase(),
    login: () => auth.signinRedirect(),
    logout: () => auth.signoutRedirect(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
