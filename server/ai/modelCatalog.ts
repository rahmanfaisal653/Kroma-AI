import { fetchCustomProviderModels, visibleProviders } from './customProvider.js';
import { COMMANDCODE_GO_MODELS } from './special/commandCodeGo.js';
import { findGatewayKey } from '../services/internalApiKey.service.js';
import { publicProviderConfigs } from '../services/providerConfig.service.js';

export type ModelEntry = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  provider_name: string;
  status: string;
  error: string | null;
  checked_at: string | null;
};

export async function fetchProviderModels(provider: any) {
  if (provider.id === 'commandcode-go') {
    const configured = Boolean(provider.apiKey);
    return {
      status: configured ? 'on' : 'not_configured',
      models: configured ? COMMANDCODE_GO_MODELS.map(id => `${provider.id}/${id}`) : [] as string[],
      error: configured ? undefined : 'Command Code Go API key is not configured',
    };
  }
  return fetchCustomProviderModels(provider);
}

export async function ownerTypeFromRequest(req: any): Promise<'internal' | 'partner'> {
  const xKey = String(req.headers['x-api-key'] || '').trim();
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  // ponytail: inspect both headers; ignore dashboard JWT/non-kg bearer tokens.
  for (const key of [xKey, bearer]) {
    if (!key || !key.startsWith('kg_')) continue;
    const match = await findGatewayKey(key);
    if (match) return match.owner_type === 'internal' ? 'internal' : 'partner';
  }
  return 'partner';
}

export async function listGatewayModels(ownerType: 'internal' | 'partner'): Promise<ModelEntry[]> {
  const providers = visibleProviders(await publicProviderConfigs(), ownerType);
  const rows = await Promise.all(providers.map(async provider => {
    const result = await fetchProviderModels(provider);
    return result.models.map(id => {
      const check = provider.model_checks?.[id];
      return {
        id,
        object: 'model' as const,
        created: 0,
        owned_by: provider.id,
        provider_name: provider.name,
        status: check?.status || 'unknown',
        error: check?.error || result.error || null,
        checked_at: check?.checked_at || null,
      };
    });
  }));
  return rows.flat();
}
