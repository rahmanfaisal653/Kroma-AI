export type ProviderId = 'commandcode-go';

export type ProviderConfig = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  apiKey?: string;
  chatPath?: string;
  modelsPath?: string;
};

export function getProviders(): Record<ProviderId, ProviderConfig> {
  return {
    'commandcode-go': { id: 'commandcode-go', name: 'Command Code Go', baseUrl: 'https://api.commandcode.ai/alpha/generate' },
  };
}

export function getProvider(id: ProviderId): ProviderConfig {
  return getProviders()[id];
}
