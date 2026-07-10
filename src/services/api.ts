import http from './http';
import type { ApiModel, DocSnippet, AsyncJob, GatewayResponse } from '../types/api';
import type { AuthResponse, LoginRequest, RegisterRequest, UserQuota } from '../types/user';
import type { Plan, PaymentMethod, Transaction, CreateTransactionRequest } from '../types/billing';

// --- Auth ---
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

// --- User ---
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

  getQuota: () =>
    http.get<UserQuota>('/api/user/quota').then(r => r.data),

  revokeKey: () =>
    http.delete<{ success: boolean; message: string }>('/api/user/revoke-key').then(r => r.data),

  getUsageHistory: (params: { limit?: number; api_key_id?: string; owner_type?: string; owner_name?: string; provider?: string; model?: string; from?: string; to?: string } = {}) =>
    http.get<{ logs: any[]; total: number }>('/api/user/usage-history', { params: { limit: 200, ...params } }).then(r => r.data),

  clearUsageHistory: () =>
    http.delete<{ success: boolean }>('/api/user/usage-history').then(r => r.data),

  cleanupUsageHistory: () =>
    http.post<{ success: boolean; deleted: number }>('/api/user/usage-history/cleanup').then(r => r.data),

  getDashboard: () =>
    http.get<any>('/api/user/dashboard').then(r => r.data),
};

// --- Models (Public) ---
export const modelsApi = {
  getAll: () =>
    http.get<ApiModel[]>('/api/apis').then(r => r.data),

  getById: (id: string | number) =>
    http.get<ApiModel[]>('/api/apis').then(r =>
      r.data.find((m: ApiModel) => String(m.id) === String(id)) || null
    ),
};

// --- Docs (Public) ---
export const docsApi = {
  getAll: () =>
    http.get<DocSnippet[]>('/api/docs').then(r => r.data),
};

// --- Plans (Public) ---
export const plansApi = {
  getAll: () =>
    http.get<Plan[]>('/api/plans').then(r => r.data),
};

// --- Payment Methods (Public) ---
export const paymentMethodsApi = {
  getAll: () =>
    http.get<PaymentMethod[]>('/api/payment-methods').then(r => r.data),
};

// --- Billing / Transactions ---
export const billingApi = {
  createTransaction: (data: CreateTransactionRequest) =>
    http.post('/api/transactions', data).then(r => r.data),

  getTransactions: () =>
    http.get<Transaction[]>('/api/transactions').then(r => r.data),

  buyCredits: (userKey: string, amount: number) =>
    http.post('/api/billing/buy-credits', { userKey, amount }).then(r => r.data),
};

// --- Gateway (AI Proxy) ---
// Gateway now accepts JWT via Authorization header (handled by http interceptor)
// x-user-key with full API key is optional fallback for external consumers
export const gatewayApi = {
  chat: async (endpoint: string, body: any, userKey?: string) => {
    if (endpoint.startsWith('/v1/')) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey || ''}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { response: { status: res.status, data } });
      return data as GatewayResponse;
    }
    return http.post<GatewayResponse>(endpoint, body).then(r => r.data);
  },

  chatStream: (
    endpoint: string,
    body: any,
    userKey?: string,
    signal?: AbortSignal
  ): Promise<Response> => {
    const token = endpoint.startsWith('/v1/') ? (userKey || '') : (localStorage.getItem('kroma_access_token') || '');
    // Always prefix with origin to prevent requests to external URLs
    const url = endpoint.startsWith('http') ? endpoint : `${window.location.origin}${endpoint}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  },

  getAsyncJob: (jobId: string) =>
    http.get<AsyncJob>(`/api/async-jobs/${jobId}`).then(r => r.data),
};

// --- Owner-managed internal gateway keys ---
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


// --- Scrape API ---
export interface ScrapeResponse {
  success: boolean;
  url: string;
  text: string;
  chars: number;
  truncated: boolean;
  cached?: boolean;
  error?: string;
}

export const scrapeApi = {
  scrapeUrl: (url: string, opts?: { timeout?: number }) =>
    http.post<ScrapeResponse>('/api/scrape', { url }, {
      timeout: opts?.timeout || 30000, // 30s max — match backend timeout
    }).then(r => r.data),
};

// --- Feedback API ---
export const feedbackApi = {
  submit: (data: { conversation_id: string; message_index: number; rating: 'up' | 'down'; comment?: string }) =>
    http.post('/api/feedback', data).then(r => r.data),
  getAll: () =>
    http.get('/api/feedback').then(r => r.data),
  remove: (id: string | number) =>
    http.delete(`/api/feedback/${id}`).then(r => r.data),
};

// --- Admin API ---
export const adminApi = {
  // Models
  getModels: () =>
    http.get('/api/admin/apis').then(r => r.data),
  createModel: (data: any) =>
    http.post('/api/admin/apis', data).then(r => r.data),
  updateModel: (id: string | number, data: any) =>
    http.put(`/api/admin/apis/${id}`, data).then(r => r.data),
  deleteModel: (id: string | number) =>
    http.delete(`/api/admin/apis/${id}`).then(r => r.data),
  schemaHealth: () =>
    http.get('/api/admin/apis/schema-health').then(r => r.data),

  // Users
  getUsers: () =>
    http.get('/api/admin/users').then(r => r.data),
  updateUser: (id: string | number, data: any) =>
    http.put(`/api/admin/users/${id}`, data).then(r => r.data),
  deleteUser: (id: string | number) =>
    http.delete(`/api/admin/users/${id}`).then(r => r.data),
  updateUserQuota: (id: string | number, data: any) =>
    http.put(`/api/admin/users/${id}/quota`, data).then(r => r.data),

  // Plans
  createPlan: (data: any) =>
    http.post('/api/admin/plans', data).then(r => r.data),
  updatePlan: (id: string | number, data: any) =>
    http.put(`/api/admin/plans/${id}`, data).then(r => r.data),
  deletePlan: (id: string | number) =>
    http.delete(`/api/admin/plans/${id}`).then(r => r.data),

  // Payment Methods
  getPaymentMethods: () =>
    http.get('/api/admin/payment-methods').then(r => r.data),
  createPaymentMethod: (data: any) =>
    http.post('/api/admin/payment-methods', data).then(r => r.data),
  updatePaymentMethod: (id: string | number, data: any) =>
    http.put(`/api/admin/payment-methods/${id}`, data).then(r => r.data),
  deletePaymentMethod: (id: string | number) =>
    http.delete(`/api/admin/payment-methods/${id}`).then(r => r.data),

  // Transactions
  getTransactions: (status?: string) =>
    http.get('/api/admin/transactions', { params: status ? { status } : undefined }).then(r => r.data),
  confirmTransaction: (id: string | number, notes?: string) =>
    http.put(`/api/admin/transactions/${id}/confirm`, { notes }).then(r => r.data),
  rejectTransaction: (id: string | number, notes?: string) =>
    http.put(`/api/admin/transactions/${id}/reject`, { notes }).then(r => r.data),

  // Docs
  createDoc: (data: any) =>
    http.post('/api/admin/docs', data).then(r => r.data),
  updateDoc: (id: string | number, data: any) =>
    http.put(`/api/admin/docs/${id}`, data).then(r => r.data),
  deleteDoc: (id: string | number) =>
    http.delete(`/api/admin/docs/${id}`).then(r => r.data),
};
