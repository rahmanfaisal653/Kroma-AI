import type { Request } from 'express';

// --- User & Auth ---
export interface DbUser {
  id: string | number;
  email: string;
  password: string;
  role: 'user' | 'admin';
  status?: string;
  user_key: string;
  user_key_hash?: string;
  quota_limit: number;
  usage_count: number;
  balance: number;
}

export interface SafeUser {
  id: string | number;
  email: string;
  role: string;
  status?: string;
  user_key: string; // masked
}

export interface AuthPayload {
  id: string | number;
  email: string;
  role: string;
  status?: string;
  token_version?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// --- API Service ---
export interface ApiService {
  id: string | number;
  name: string;
  type: string;
  description: string;
  price_per_token: number;
  price_input: number;
  price_output: number;
  features: string[];
  versions: string[];
  endpoint: string;
  target_url: string;
  target_auth: string;
  active: boolean;
  model_slug?: string;
  default_temperature?: number;
  max_tokens?: number;
  is_streaming?: boolean;
  timeout_ms?: number;
  max_input_chars?: number;
  speed_mode?: string;
  default_top_p?: number;
  default_top_k?: number;
}

// --- Plans ---
export interface Plan {
  id: string | number;
  name: string;
  price: number;
  credits: number;
  bonus_credits: number;
  processing_fee: number;
  billing_cycle: 'one-time' | 'monthly' | 'yearly';
  stripe_product_id: string;
  features: string[];
  popular: boolean;
}

// --- Payment Methods ---
export interface PaymentMethod {
  id: string | number;
  name: string;
  type: string;
  icon: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_url: string;
  min_amount: number;
  active: boolean;
}

// --- Transactions ---
export interface Transaction {
  id: string | number;
  user_key: string;
  user_email: string;
  user_name: string;
  plan_id: string;
  plan_name: string;
  credits: number;
  bonus_credits: number;
  price: number;
  payment_method: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  notes: string;
  created_at?: string;
}

// --- Async Jobs ---
export type AsyncJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface AsyncJob {
  id: string;
  status: AsyncJobStatus;
  endpoint: string;
  user_id?: string | number;
  created_at: number;
  updated_at: number;
  result?: any;
  error?: any;
}

// --- Express Request Extension ---
export interface GatewayUser {
  id: string | number;
  email: string;
  role: string;
  status?: string;
  quota_limit: number;
  usage_count: number;
}
