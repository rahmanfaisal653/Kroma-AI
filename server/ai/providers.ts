import { FREE_PROVIDERS } from './free/index.js';
import { SPECIAL_PROVIDERS } from './special/index.js';

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  chatPath?: string;
  modelsPath?: string;
  kind?: 'free' | 'special' | 'custom';
};

export type ProviderId = string;

// Registry provider bawaan: free tier (OpenAI-compatible) + special adapters.
export function getProviders(): Record<string, ProviderConfig> {
  const registry: Record<string, ProviderConfig> = {};
  for (const provider of [...FREE_PROVIDERS, ...SPECIAL_PROVIDERS]) registry[provider.id] = provider;
  return registry;
}

export function getProvider(id: string): ProviderConfig | undefined {
  return getProviders()[id];
}
