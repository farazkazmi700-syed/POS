import type { LoginResponse } from '@pos/shared-types';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../store/auth';

// In Docker/nginx the SPA and API share an origin, so a relative '/api' base is correct.
// Set VITE_API_BASE_URL (e.g. https://api.example.com/api) when the API is hosted elsewhere.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export const api = axios.create({ baseURL: apiBaseUrl });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const branchId = useAuth.getState().activeBranchId;
  if (branchId) config.headers['X-Branch-Id'] = branchId;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<LoginResponse>(`${apiBaseUrl}/auth/refresh`, {
      refreshToken: useAuth.getState().refreshToken,
    });
    if ('requiresPin' in data) return null;
    useAuth.getState().setSession(data);
    return data.accessToken;
  } catch {
    return null;
  }
}

// On a 401, try the refresh token once (shared between parallel requests), then replay the request.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = /^\/auth\/(?:login(?:\/pin)?|developer\/(?:login|setup-password)|register|refresh|pin\/reset(?:\/request)?)$/.test(original?.url ?? '');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall && useAuth.getState().refreshToken) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => { refreshing = null; });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      useAuth.getState().logout();
    }
    return Promise.reject(error);
  },
);
