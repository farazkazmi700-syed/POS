import type { LoginResponse } from '@pos/shared-types';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../store/auth';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<LoginResponse>('/api/auth/refresh', {
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
    const isAuthCall = original?.url?.startsWith('/auth/');
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
