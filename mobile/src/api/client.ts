import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Single source of truth for the backend URL: app.json → expo.extra.apiBaseUrl
// (falls back to the production URL so a misconfigured build still works).
const BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'https://deals-to-dish-api.onrender.com';

export const TOKEN_KEY = 'deals_to_dish_token';
export const REFRESH_KEY = 'deals_to_dish_refresh';

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Single in-flight refresh shared across concurrent 401s (a burst of requests
// after expiry triggers one refresh, not N).
let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  if (!refreshing) {
    refreshing = axios
      .post<{ token: string; refresh_token?: string }>(
        `${BASE_URL}/api/auth/refresh`,
        { refresh_token: refreshToken },
        { timeout: 15000 }
      )
      .then(async (r) => {
        await SecureStore.setItemAsync(TOKEN_KEY, r.data.token);
        if (r.data.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, r.data.refresh_token);
        return r.data.token;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    // On 401, try ONE silent refresh + retry before giving up. Only force a
    // logout if the refresh itself fails (expired/revoked refresh token).
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const newToken = await tryRefresh();
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return client(original);
      }
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default client;
