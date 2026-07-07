import { create } from 'zustand';
import type { User } from '../types/user';
import { authApi, userApi } from '../services/api';
import { setTokens, clearTokens, getAccessToken } from '../services/http';
import { useConversationsStore } from './conversations.store';

const USER_STORAGE_KEY = 'kroma_user';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  justRegistered: boolean;

  login: (email: string, password: string) => Promise<{ api_key?: string }>;
  register: (email: string, password: string) => Promise<{ api_key?: string }>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  hydrate: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearJustRegistered: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  hasHydrated: false,
  justRegistered: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await authApi.login({ email, password });
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, isLoading: false, hasHydrated: true, justRegistered: false });
      // Sync conversation store to this user's scope
      useConversationsStore.getState().setUserScope(data.user?.id);
      return { api_key: data.api_key };
    } catch (error: any) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await authApi.register({ email, password });
      setTokens(data.accessToken, data.refreshToken);
      // Backend returns full user_key on register; use api_key as the canonical full key.
      const fullUser: User = { ...data.user, user_key: data.api_key || data.user.user_key };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fullUser));
      set({ user: fullUser, isAuthenticated: true, isLoading: false, hasHydrated: true, justRegistered: true });
      // Sync conversation store to this user's scope
      useConversationsStore.getState().setUserScope(fullUser?.id);
      return { api_key: data.api_key };
    } catch (error: any) {
      set({ isLoading: false });
      throw error;
    }
  },

  clearJustRegistered: () => {
    set({ justRegistered: false });
  },

  logout: () => {
    clearTokens();
    localStorage.removeItem(USER_STORAGE_KEY);
    set({ user: null, isAuthenticated: false, hasHydrated: true, justRegistered: false });
    // Reset conversation store to anonymous scope
    useConversationsStore.getState().setUserScope(null);
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
        useConversationsStore.getState().setUserScope(user?.id);
        // Re-fetch full profile (esp. user_key, quota) to ensure freshness
        get().refreshMe().catch(() => {});
      } else {
        set({ hasHydrated: true });
      }
    } catch {
      clearTokens();
      localStorage.removeItem(USER_STORAGE_KEY);
      set({ user: null, isAuthenticated: false, hasHydrated: true, justRegistered: false });
    }
  },
}));

// Auto-logout on token expiry event
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().logout();
    useConversationsStore.getState().setUserScope(null);
  });
}
