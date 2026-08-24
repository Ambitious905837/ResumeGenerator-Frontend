import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { AuthUser } from './types/api';

export const API_BASE_URL: string = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
export const GOOGLE_CLIENT_ID: string = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const TOKEN_KEY = 'ru_token';
const USER_KEY = 'ru_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// --- Global axios interceptors (installed once at module load) ---------------
// Attach the session token to every outgoing request.
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the backend ever rejects our token, clear the session and let the app know.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.dispatchEvent(new Event('ru-unauthorized'));
    }
    return Promise.reject(error);
  }
);

interface AuthContextValue {
  user: AuthUser | null;
  /** False until any stored token has been checked against the backend. */
  ready: boolean;
  isAdmin: boolean;
  loginWithGoogle: (credential: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await axios.post<{ token: string; user: AuthUser }>(
      `${API_BASE_URL}/api/auth/google`,
      { credential }
    );
    const { token, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  // On first load, validate any stored token against the backend.
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return undefined;
    }
    axios
      .get<{ user: AuthUser }>(`${API_BASE_URL}/api/auth/me`)
      .then((res) => {
        if (cancelled) return;
        setUser(res.data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [logout]);

  // React to 401s raised by the response interceptor from anywhere in the app.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener('ru-unauthorized', handler);
    return () => window.removeEventListener('ru-unauthorized', handler);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, isAdmin: user?.role === 'admin', loginWithGoogle, logout }),
    [user, ready, loginWithGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
