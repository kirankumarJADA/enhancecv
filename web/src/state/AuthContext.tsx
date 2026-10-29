import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { api } from '../api';
import { performLogout, type LogoutResult } from './logout';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<LogoutResult>;
  /**
   * Set when sign-out could not be completed server-side. Held here, above the
   * router, because signing out clears `user` and the protected route then
   * redirects to /login — a component-local message would be unmounted with it.
   */
  logoutWarning: string | null;
  clearLogoutWarning: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => ({ serverRevoked: false, warning: null, user: null }),
  logoutWarning: null,
  clearLogoutWarning: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading] = useState(false);
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);

  // In the login-free stateless architecture, there is no session to fetch.
  // Kept as a safe no-op to maintain full interface compatibility without
  // making doomed GET /auth/me network calls that 404.
  const refresh = useCallback(async () => {}, []);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    const result = await performLogout((path) => api.post(path));
    setUser(result.user);
    setLogoutWarning(result.warning);
    return result;
  }, []);

  const clearLogoutWarning = useCallback(() => setLogoutWarning(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, logoutWarning, clearLogoutWarning }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
