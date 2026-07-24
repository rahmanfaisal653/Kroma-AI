import { config } from '../config.js';

export type ProviderId = 'openai' | 'ollama' | 'lmstudio' | 'opencode-go' | 'commandcode-go';

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
    'opencode-go': { id: 'opencode-go', name: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1' },
    'commandcode-go': { id: 'commandcode-go', name: 'Command Code Go', baseUrl: 'https://api.commandcode.ai/alpha/generate' },
  };
}

export function getProvider(id: ProviderId): ProviderConfig {
  return getProviders()[id];
}
