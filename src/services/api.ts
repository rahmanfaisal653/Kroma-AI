import http from './http';
import type { AuthResponse, LoginRequest } from '../types/user';

export const authApi = {
  login: (data: LoginRequest) =>
    http.post<AuthResponse>('/api/auth/login', data).then(r => r.data),


  refresh: (refreshToken: string) =>
    http.post('/api/auth/refresh', { refreshToken }).then(r => r.data),

};

export const userApi = {
  getMe: () =>
    http.get<import('../types/user').User>('/api/user/me').then(r => r.data),


  getUsageHistory: (params: { page?: number; page_size?: number; limit?: number; api_key_id?: string; owner_type?: string; owner_name?: string; provider?: string; model?: string; from?: string; to?: string } = {}) =>
    http.get<{ logs: any[]; total: number; page: number; pageSize: number; summary: any; retentionDays: number }>('/api/user/usage-history', { params: { page: 1, page_size: 25, ...params } }).then(r => r.data),

  clearUsageHistory: () =>
    http.delete<{ success: boolean }>('/api/user/usage-history').then(r => r.data),

  cleanupUsageHistory: () =>
    http.post<{ success: boolean; deleted: number }>('/api/user/usage-history/cleanup').then(r => r.data),

  getDashboard: () =>
    http.get<any>('/api/user/dashboard').then(r => r.data),
};

export const internalKeysApi = {
  list: (owner_type?: 'internal' | 'partner') => http.get('/api/internal-keys', { params: owner_type ? { owner_type } : undefined }).then(r => r.data),
  create: (data: { name: string; owner_type?: 'internal' | 'partner'; owner_name?: string; note?: string; allowed_models?: string[] }) =>
    http.post('/api/internal-keys', data).then(r => r.data),
  revoke: (id: string) => http.delete(`/api/internal-keys/${id}`).then(r => r.data),
};

type ProviderVisibility = 'internal' | 'partner';
export const providerStatusApi = {
  list: () => http.get('/api/provider-status').then(r => r.data),
  create: (data: { id?: string; name: string; baseUrl: string; apiKey?: string; chatPath?: string; modelsPath?: string; bodyTemplate?: string; enabled?: boolean; visibility?: ProviderVisibility[] }) => http.post('/api/provider-status', data).then(r => r.data),
  update: (id: string, data: { name?: string; baseUrl: string; apiKey?: string; chatPath?: string; modelsPath?: string; bodyTemplate?: string; enabled?: boolean; visibility?: ProviderVisibility[] }) => http.put(`/api/provider-status/${id}`, data).then(r => r.data),
  reset: (id: string) => http.delete(`/api/provider-status/${id}`).then(r => r.data),
  testModel: (id: string, model: string) => http.post(`/api/provider-status/${id}/test-model`, { model }).then(r => r.data),
};
