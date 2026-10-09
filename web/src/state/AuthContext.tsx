import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    const result = await performLogout((path) => api.post(path));
    // Local authentication state is cleared either way. The server discards the
    // cookie even when revocation fails, and protected data must never remain
    // on screen. The failure is reported separately rather than shown as a
    // successful sign-out.
    setUser(result.user);
    setLogoutWarning(result.warning);
    return result;
  }, []);

  const clearLogoutWarning = useCallback(() => setLogoutWarning(null), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, logoutWarning, clearLogoutWarning }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
