import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '../types';
import { login as apiLogin, signup as apiSignup } from '../api/auth';
import { getProfile } from '../api/users';
import { TOKEN_KEY, registerUnauthorizedHandler } from '../api/client';

const GUEST_KEY = 'smartplate-guest-mode';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  guestMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  googleLogin: (accessToken: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(data.token);
    setUser(data.user);
    setGuestMode(false);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const data = await apiSignup(email, password);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(data.token);
    setUser(data.user);
    setGuestMode(false);
  }, []);

  // Called after a successful Google OAuth flow — token is the Supabase JWT
  const googleLogin = useCallback(async (accessToken: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(accessToken);
    const profile = await getProfile();
    setUser(profile);
    setGuestMode(false);
  }, []);

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
