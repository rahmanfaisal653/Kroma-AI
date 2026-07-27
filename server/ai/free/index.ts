import type { ProviderConfig } from '../providers.js';

// Provider free-tier/populer, semua OpenAI-compatible.
// ponytail: tambah provider free baru cukup tambah entry di list ini.
export const FREE_PROVIDERS: ProviderConfig[] = [
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1' },
  { id: 'github-models', name: 'GitHub Models', baseUrl: 'https://models.github.ai/inference' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'nvidia-nim', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'chutes', name: 'Chutes AI', baseUrl: 'https://llm.chutes.ai/v1' },
  { id: 'sambanova', name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1' },
  { id: 'hyperbolic', name: 'Hyperbolic', baseUrl: 'https://api.hyperbolic.xyz/v1' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
].map(provider => ({ ...provider, chatPath: '/chat/completions', modelsPath: '/models' }));
