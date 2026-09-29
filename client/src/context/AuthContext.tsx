import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { setUnauthorizedHandler, tokenStore } from '../services/api';
import { authService } from '../services/authService';
import type { AuthResponse, User } from '../types/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: (reason?: 'expired' | 'manual') => void;
  applySession: (auth: AuthResponse) => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Read the `exp` claim from a JWT (no verification - the server does that). */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const expiryTimer = useRef<number | undefined>(undefined);

  const logout = useCallback(
    (reason: 'expired' | 'manual' = 'manual') => {
      if (reason === 'manual') void authService.logout();
      tokenStore.clear();
      window.clearTimeout(expiryTimer.current);
      setUserState(null);
      setStatus('anonymous');
      navigate(reason === 'expired' ? '/login?expired=1' : '/login', { replace: true });
    },
    [navigate],
  );

  const scheduleExpiry = useCallback(
    (token: string) => {
      window.clearTimeout(expiryTimer.current);
      const expiresAt = tokenExpiry(token);
      if (!expiresAt) return;
      // setTimeout cannot handle very long delays; sessions are hours long so cap to 24h.
      const delay = Math.min(expiresAt - Date.now(), 24 * 60 * 60 * 1000);
      expiryTimer.current = window.setTimeout(() => logout('expired'), Math.max(delay, 0));
    },
    [logout],
  );

  const applySession = useCallback(
    (auth: AuthResponse) => {
      tokenStore.set(auth.token);
      setUserState(auth.user);
      setStatus('authenticated');
      scheduleExpiry(auth.token);
    },
    [scheduleExpiry],
  );

  useEffect(() => {
    setUnauthorizedHandler((code) => logout(code === 'TOKEN_EXPIRED' ? 'expired' : 'manual'));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    const token = tokenStore.get();
    const expiresAt = token ? tokenExpiry(token) : null;
    if (!token || (expiresAt !== null && expiresAt <= Date.now())) {
      tokenStore.clear();
      setStatus('anonymous');
      return;
    }
    authService
      .me()
      .then((me) => {
        setUserState(me);
        setStatus('authenticated');
        scheduleExpiry(token);
      })
      .catch(() => {
        tokenStore.clear();
        setStatus('anonymous');
      });
    return () => window.clearTimeout(expiryTimer.current);
    // Run once on start-up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email, password) => applySession(await authService.login(email, password)),
      register: async (name, email, password) => applySession(await authService.register(name, email, password)),
      logout,
      applySession,
      setUser: setUserState,
    }),
    [user, status, logout, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
