import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const TOKEN_KEY = 'ru_token';
const USER_KEY = 'ru_user';

export function getToken() {
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
    if (error && error.response && error.response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.dispatchEvent(new Event('ru-unauthorized'));
    }
    return Promise.reject(error);
  }
);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY)) || null;
    } catch {
      return null;
    }
  });
  // `ready` is false until we've checked any existing session with the backend.
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const res = await axios.post(`${API_BASE_URL}/api/auth/google`, { credential });
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
      return;
    }
    axios
      .get(`${API_BASE_URL}/api/auth/me`)
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

  const isAdmin = !!user && user.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, ready, isAdmin, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
