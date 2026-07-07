export interface ApiModel {
  id: string | number;
  name: string;
  type: 'text-to-text' | 'text-to-image' | 'text-to-audio' | 'text-to-video' | string;
  description: string;
  endpoint: string;
  price_per_token: number;
  price_input: number;
  price_output: number;
  features: string[];
  versions: string[];
  target_url?: string; // admin-only; hidden from public /api/apis
  target_auth?: string; // admin-only
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

export interface DocSnippet {
  id: string | number;
  title: string;
  category: string;
  content: string;
}

export interface AsyncJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  endpoint: string;
  created_at: number;
  updated_at: number;
  result?: any;
  error?: any;
}

export interface GatewayResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  _gateway?: {
    api_name: string;
    api_type: string;
    cost: number;
    credits_remaining: number;
  };
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  thinking?: string;
  timestamp: number;
  model?: string;
  cost?: number;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  model_id?: string | number;
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
}
