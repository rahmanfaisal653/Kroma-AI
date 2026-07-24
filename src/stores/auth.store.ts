import { create } from 'zustand';
import type { User } from '../types/user';
import { authApi, userApi } from '../services/api';
import { setTokens, clearTokens, getAccessToken } from '../services/http';

const USER_STORAGE_KEY = 'kroma_user';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<{ api_key?: string }>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  hydrate: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  hasHydrated: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await authApi.login({ email, password });
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, isLoading: false, hasHydrated: true });
      return { api_key: data.api_key };
    } catch (error: any) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    clearTokens();
    localStorage.removeItem(USER_STORAGE_KEY);
    set({ user: null, isAuthenticated: false, hasHydrated: true });
    // Reset conversation store to anonymous scope
  },

  updateUser: (partial) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partial };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    set({ user: updated });
  },

  refreshMe: async () => {
    try {
      const me = await userApi.getMe();
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(me));
      set({ user: me, isAuthenticated: true, hasHydrated: true });
    } catch {
      // Token likely expired; let interceptor handle logout
    }
  },

  hydrate: async () => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      const token = getAccessToken();
      if (stored && token) {
        const user = JSON.parse(stored) as User;
        set({ user, isAuthenticated: true, hasHydrated: true });
        // Sync conversation store to this user's scope
          // Re-fetch full profile (esp. user_key, quota) to ensure freshness
        get().refreshMe().catch(() => {});
      } else {
        set({ hasHydrated: true });
      }
    } catch {
      clearTokens();
      localStorage.removeItem(USER_STORAGE_KEY);
      set({ user: null, isAuthenticated: false, hasHydrated: true });
    }
  },
}));

// Auto-logout on token expiry event
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().logout();
  });
}
