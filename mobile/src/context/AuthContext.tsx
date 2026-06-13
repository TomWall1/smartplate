import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '../types';
import { login as apiLogin, signup as apiSignup } from '../api/auth';
import { getProfile } from '../api/users';
import { TOKEN_KEY, REFRESH_KEY, registerUnauthorizedHandler } from '../api/client';

const GUEST_KEY = 'smartplate-guest-mode';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  guestMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  googleLogin: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [token, setToken]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [guestMode, setGuestMode] = useState(false);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(null);
    setUser(null);
    setGuestMode(false);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    async function restoreSession() {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          setToken(stored);
          const profile = await getProfile();
          setUser(profile);
        } else {
          const guest = await SecureStore.getItemAsync(GUEST_KEY);
          if (guest === 'true') setGuestMode(true);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  const persistTokens = useCallback(async (accessToken: string, refreshToken?: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.deleteItemAsync(GUEST_KEY);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    await persistTokens(data.token, data.refresh_token);
    setToken(data.token);
    setUser(data.user);
    setGuestMode(false);
  }, [persistTokens]);

  const signup = useCallback(async (email: string, password: string) => {
    const data = await apiSignup(email, password);
    await persistTokens(data.token, data.refresh_token);
    setToken(data.token);
    setUser(data.user);
    setGuestMode(false);
  }, [persistTokens]);

  // Called after a successful Google OAuth flow — tokens come from the Supabase
  // redirect hash. Store the refresh token too so the session survives access-
  // token expiry (the client auto-refreshes on 401).
  const googleLogin = useCallback(async (accessToken: string, refreshToken?: string) => {
    await persistTokens(accessToken, refreshToken);
    setToken(accessToken);
    const profile = await getProfile();
    setUser(profile);
    setGuestMode(false);
  }, [persistTokens]);

  const enterGuestMode = useCallback(async () => {
    await SecureStore.setItemAsync(GUEST_KEY, 'true');
    setGuestMode(true);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
    } catch {
      // silently fail
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, guestMode, login, signup, googleLogin, logout, enterGuestMode, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
