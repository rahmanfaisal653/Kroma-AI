import { fetchCustomProviderModels, visibleProviders } from './customProvider.js';
import { COMMANDCODE_GO_MODELS } from './special/commandCodeGo.js';
import { findGatewayKey } from '../services/internalApiKey.service.js';
import { listProviderConfigs, pruneProviderModelChecks } from '../services/providerConfig.service.js';

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
      models: COMMANDCODE_GO_MODELS.map(id => `${provider.id}/${id}`),
      error: configured ? undefined : 'Command Code Go API key is not configured',
    };
  }
  // Allow keyless providers (both http and https); upstream handles its own auth.
  // Previously we blocked keyless https providers — removed so public HTTPS APIs
  // and Cloudflare Tunnel / reverse-proxy setups work without a dummy key.
  return fetchCustomProviderModels(provider);
}

export function activeCheckedModels(models: string[], checks: Record<string, any> = {}) {
  return models.filter(id => checks[id]?.status !== 'off');
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
  const providers = visibleProviders(await listProviderConfigs(), ownerType);
  const rows = await Promise.all(providers.map(async provider => {
    const result = await fetchProviderModels(provider);
    const fresh = await pruneProviderModelChecks(provider.id, result.models);
    const checks = fresh?.model_checks || provider.model_checks || {};
    return activeCheckedModels(result.models, checks).map(id => {
      const check = checks[id];
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
