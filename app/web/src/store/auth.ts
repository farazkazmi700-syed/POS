import type { AuthResponse, UserSummary } from '@pos/shared-types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCart } from './cart';
import { queryClient } from '../api/query-client';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserSummary | null;
  activeBranchId: string | null;
  setSession: (r: AuthResponse) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      activeBranchId: null,
      setSession: (r) => { const sameUser = get().user?._id === r.user._id; set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, activeBranchId: sameUser ? get().activeBranchId : null }); if (!sameUser) { useCart.setState({ items: [], held: [] }); queryClient.clear(); } },
      logout: () => { const token = get().accessToken; set({ accessToken: null, refreshToken: null, user: null, activeBranchId: null }); useCart.setState({ items: [], held: [] }); queryClient.clear(); if (token) void fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => undefined); },
    }),
    { name: 'pos-auth' },
  ),
);
