import { config } from '../config.js';

export type ProviderId = 'openai' | 'ollama' | 'lmstudio';

export type ProviderConfig = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  apiKey?: string;
};

export function getProviders(): Record<ProviderId, ProviderConfig> {
  return {
    openai: { id: 'openai', name: 'OpenAI', baseUrl: config.openaiBaseUrl, apiKey: config.openaiApiKey },
    ollama: { id: 'ollama', name: 'Ollama', baseUrl: config.ollamaBaseUrl },
    lmstudio: { id: 'lmstudio', name: 'LM Studio', baseUrl: config.lmstudioBaseUrl },
  };
}

export function getProvider(id: ProviderId): ProviderConfig {
  return getProviders()[id];
}
