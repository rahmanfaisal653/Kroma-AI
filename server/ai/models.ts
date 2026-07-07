import type { ProviderId } from './providers.js';

export type GatewayModel = {
  id: string;
  provider: ProviderId;
  providerModel: string;
  enabled: boolean;
  contextLimit?: number;
};

const MODELS: GatewayModel[] = [
  { id: 'openai/gpt-4o-mini', provider: 'openai', providerModel: 'gpt-4o-mini', enabled: true },
  { id: 'ollama/qwen2.5:7b', provider: 'ollama', providerModel: 'qwen2.5:7b', enabled: true },
  { id: 'lmstudio/local', provider: 'lmstudio', providerModel: 'local', enabled: true },
];

export function listModels(): GatewayModel[] {
  return MODELS.filter(model => model.enabled);
}

export function getModel(id: string): GatewayModel | undefined {
  return listModels().find(model => model.id === id);
}
