export interface User {
  id: string | number;
  email: string;
  role: 'user' | 'admin';
  status?: 'user' | 'admin' | string;
  user_key: string; // masked key; reveal-key returns the full key on demand
  quota_limit?: number;
  usage_count?: number;
  balance?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  accessToken: string;
  refreshToken: string;
  api_key?: string; // Only on register (full key shown once)
}

export interface UserQuota {
  name: string;
  usage: number;
  quota: number;
  remaining: number;
  balance?: number;
}
