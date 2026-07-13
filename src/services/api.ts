import http from './http';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../types/user';

export const authApi = {
  login: (data: LoginRequest) =>
    http.post<AuthResponse>('/api/auth/login', data).then(r => r.data),

  register: (data: RegisterRequest) =>
    http.post<AuthResponse>('/api/auth/register', data).then(r => r.data),

  refresh: (refreshToken: string) =>
    http.post('/api/auth/refresh', { refreshToken }).then(r => r.data),

  updateKey: (userId: string | number, userKey: string) =>
    http.put('/api/auth/update-key', { userId, userKey }).then(r => r.data),
};

export const userApi = {
  getMe: () =>
    http.get<import('../types/user').User>('/api/user/me').then(r => r.data),

  generateKey: (userId?: string | number) =>
    http.post<{ success: boolean; api_key: string; user_key_preview: string }>(
      '/api/user/generate-key', { userId }
    ).then(r => r.data),

  revealKey: (userId: string | number) =>
    http.get<{ user_key: string; user_key_preview: string; regenerated: boolean }>(
      '/api/user/reveal-key', { params: { userId } }
    ).then(r => r.data),

  revokeKey: () =>
    http.delete<{ success: boolean; message: string }>('/api/user/revoke-key').then(r => r.data),

  getUsageHistory: (params: { page?: number; page_size?: number; limit?: number; api_key_id?: string; owner_type?: string; owner_name?: string; provider?: string; model?: string; from?: string; to?: string } = {}) =>
    http.get<{ logs: any[]; total: number; page: number; pageSize: number; summary: any; retentionDays: number }>('/api/user/usage-history', { params: { page: 1, page_size: 25, ...params } }).then(r => r.data),

  clearUsageHistory: () =>
    http.delete<{ success: boolean }>('/api/user/usage-history').then(r => r.data),

  cleanupUsageHistory: () =>
    http.post<{ success: boolean; deleted: number }>('/api/user/usage-history/cleanup').then(r => r.data),

  getDashboard: () =>
    http.get<any>('/api/user/dashboard').then(r => r.data),
};

export const gatewayApi = {
  chat: async (endpoint: string, body: any, userKey?: string) => {
    if (endpoint.startsWith('/v1/')) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': userKey || '' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data?.error?.message || data?.error || `HTTP ${res.status}`), { response: { status: res.status, data } });
      return data;
    }
    return http.post(endpoint, body).then(r => r.data);
  },

  chatStream: (
    endpoint: string,
    body: any,
    userKey?: string,
    signal?: AbortSignal
  ): Promise<Response> => {
    const token = endpoint.startsWith('/v1/') ? (userKey || '') : (localStorage.getItem('kroma_access_token') || '');
    const url = endpoint.startsWith('http') ? endpoint : `${window.location.origin}${endpoint}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(endpoint.startsWith('/v1/') ? { 'x-api-key': token } : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  },
};

export const internalKeysApi = {
  list: (owner_type?: 'internal' | 'partner') => http.get('/api/internal-keys', { params: owner_type ? { owner_type } : undefined }).then(r => r.data),
  create: (data: { name: string; owner_type?: 'internal' | 'partner'; owner_name?: string; note?: string; allowed_models?: string[] }) =>
    http.post('/api/internal-keys', data).then(r => r.data),
  revoke: (id: string) => http.delete(`/api/internal-keys/${id}`).then(r => r.data),
};

export const knowledgeApi = {
  ingest: (data: { source: string; type?: string; text: string }) => http.post('/api/knowledge/sources', data).then(r => r.data),
  search: (data: { query: string; topK?: number }) => http.post('/api/knowledge/search', data).then(r => r.data),
};

type ProviderVisibility = 'internal' | 'partner';
export const providerStatusApi = {
  list: () => http.get('/api/provider-status').then(r => r.data),
  create: (data: { id?: string; name: string; baseUrl: string; apiKey?: string; enabled?: boolean; visibility?: ProviderVisibility[] }) => http.post('/api/provider-status', data).then(r => r.data),
  update: (id: string, data: { name?: string; baseUrl: string; apiKey?: string; enabled?: boolean; visibility?: ProviderVisibility[] }) => http.put(`/api/provider-status/${id}`, data).then(r => r.data),
  reset: (id: string) => http.delete(`/api/provider-status/${id}`).then(r => r.data),
};
