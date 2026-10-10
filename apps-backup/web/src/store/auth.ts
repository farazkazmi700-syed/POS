import type { AuthResponse, UserSummary } from '@pos/shared-types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserSummary | null;
  setSession: (r: AuthResponse) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (r) => set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'pos-auth' },
  ),
);
