import { db } from './db.service.js';
import { getProvider, getProviders, type ProviderConfig, type ProviderId } from '../ai/providers.js';

const TABLE = 'docs';
const CATEGORY = 'provider_config';
const FIXED_IDS = Object.keys(getProviders());

type Audience = 'internal' | 'partner';
type Input = { id?: string; name?: string; baseUrl?: string; token?: string; enabled?: boolean; visibility?: Audience[] | string; chatPath?: string; modelsPath?: string };
type ModelCheck = Record<string, { status: 'on' | 'off'; error?: string; checked_at: string }>;
type StoredProvider = ProviderConfig & { kind?: 'free' | 'special' | 'custom'; overridden?: boolean; custom?: boolean; configured: boolean; enabled: boolean; visibility: Audience[]; model_checks?: ModelCheck };

function cleanUrl(value = '') {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
}
function cleanId(value = '') { return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''); }
function parse(row: any) { try { return JSON.parse(row?.content || '{}'); } catch { return {}; } }
function slug(id: string) { return `provider-${id}`; }
function cleanVisibility(value?: Audience[] | string): Audience[] {
  const raw = Array.isArray(value) ? value : value === 'both' ? ['internal', 'partner'] : value ? [value] : ['internal'];
  const picked = raw.filter((item): item is Audience => item === 'internal' || item === 'partner');
  return picked.length ? [...new Set(picked)] : ['internal'];
}
function safeProvider(provider: StoredProvider) {
  const { apiKey, ...safe } = provider;
  return { ...safe, kind: provider.kind || (provider.custom ? 'custom' : 'free'), configured: Boolean(apiKey), enabled: provider.enabled !== false, visibility: cleanVisibility(provider.visibility), chatPath: provider.chatPath || '/chat/completions', modelsPath: provider.modelsPath || '/models', model_checks: provider.model_checks || {} };
}

export function fixedProviderIds() { return [...FIXED_IDS]; }

async function providerRows() {
  return db.findWhere(TABLE, 'category', CATEGORY);
}

export async function getProviderConfig(id: string): Promise<StoredProvider | null> {
  const clean = cleanId(id);
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  const override = parse(row);
  const isFixed = FIXED_IDS.includes(clean);
  if (override.deleted && !isFixed) return null;

  if (isFixed) {
    const base = getProvider(clean as ProviderId)!;
    const apiKey = override.token ?? base.apiKey;
    return {
      id: base.id,
      name: override.name || base.name,
      baseUrl: cleanUrl(override.baseUrl || base.baseUrl),
      apiKey,
      configured: Boolean(apiKey),
      enabled: override.enabled !== false,
      visibility: cleanVisibility(override.visibility),
      chatPath: override.chatPath || base.chatPath || '/chat/completions',
      modelsPath: override.modelsPath || base.modelsPath || '/models',
      model_checks: override.model_checks || {},
      kind: base.kind || 'free',
      overridden: Boolean(row),
      custom: false,
    };
  }

  if (!row) return null;
  const apiKey = override.token || undefined;
  return {
    id: clean,
    name: override.name || clean,
    baseUrl: cleanUrl(override.baseUrl),
    apiKey,
    configured: Boolean(apiKey),
    enabled: override.enabled !== false,
    visibility: cleanVisibility(override.visibility),
    kind: 'custom',
    overridden: true,
    custom: true,
  } as StoredProvider;
}

export async function listProviderConfigs() {
  const fixed = await Promise.all(fixedProviderIds().map(getProviderConfig));
  const rows = await providerRows();
  const custom = rows
    .filter((row: any) => row.slug?.startsWith('provider-'))
    .map((row: any) => row.slug.replace('provider-', ''))
    .filter((id: string) => !FIXED_IDS.includes(id));
  const customProviders = await Promise.all(custom.map(getProviderConfig));
  return [...fixed, ...customProviders].filter(Boolean) as StoredProvider[];
}

export async function createProviderConfig(input: Input) {
  const id = cleanId(input.id || input.name || '');
  if (!id || FIXED_IDS.includes(id)) return null;
  const baseUrl = cleanUrl(input.baseUrl);
  if (!baseUrl) return null;
  const existing = await getProviderConfig(id);
  if (existing) return null;
  const content = JSON.stringify({
    name: input.name?.trim() || id,
    baseUrl,
    token: input.token || '',
    enabled: input.enabled !== false,
    visibility: cleanVisibility(input.visibility),
    chatPath: input.chatPath || '/chat/completions',
    modelsPath: input.modelsPath || '/models',
    model_checks: {},
  });
  await db.create(TABLE, { title: input.name?.trim() || id, slug: slug(id), category: CATEGORY, content, published: true });
  return getProviderConfig(id);
}

export async function updateProviderConfig(id: string, input: Input) {
  const clean = cleanId(id);
  const current = await getProviderConfig(clean);
  if (!current) return null;
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  const content = JSON.stringify({
    name: input.name?.trim() || current.name,
    baseUrl: cleanUrl(input.baseUrl || current.baseUrl),
    token: input.token ?? current.apiKey ?? '',
    enabled: input.enabled ?? current.enabled,
    visibility: cleanVisibility(input.visibility || current.visibility),
    chatPath: input.chatPath || current.chatPath || '/chat/completions',
    modelsPath: input.modelsPath || current.modelsPath || '/models',
    model_checks: current.model_checks || {},
  });
  if (row) await db.update(TABLE, row.id, { title: input.name?.trim() || current.name, content, published: true });
  else await db.create(TABLE, { title: current.name, slug: slug(clean), category: CATEGORY, content, published: true });
  return getProviderConfig(clean);
}

export async function deleteProviderConfig(id: string) {
  const clean = cleanId(id);
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  if (!FIXED_IDS.includes(clean)) {
    if (row) await db.remove(TABLE, row.id);
    return;
  }
  const base = getProvider(clean as ProviderId)!;
  const content = JSON.stringify({ name: base.name, baseUrl: base.baseUrl, token: base.apiKey || '', enabled: false, visibility: 'internal', chatPath: base.chatPath || '/chat/completions', modelsPath: base.modelsPath || '/models' });
  if (row) await db.update(TABLE, row.id, { title: base.name, content, published: true });
  else await db.create(TABLE, { title: base.name, slug: slug(clean), category: CATEGORY, content, published: true });
}

export async function publicProviderConfigs() {
  return (await listProviderConfigs()).map(safeProvider);
}

export { getProviders };

export async function setProviderModelCheck(providerId: string, modelId: string, result: { status: 'on' | 'off'; error?: string }) {
  const clean = cleanId(providerId);
  const current = await getProviderConfig(clean);
  if (!current) return null;
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  const checks = { ...(current.model_checks || {}), [modelId]: { ...result, checked_at: new Date().toISOString() } };
  const content = JSON.stringify({
    name: current.name,
    baseUrl: current.baseUrl,
    token: current.apiKey || '',
    enabled: current.enabled,
    visibility: current.visibility,
    chatPath: current.chatPath || '/chat/completions',
    modelsPath: current.modelsPath || '/models',
    model_checks: checks,
  });
  if (row) await db.update(TABLE, row.id, { title: current.name, content, published: true });
  else await db.create(TABLE, { title: current.name, slug: slug(clean), category: CATEGORY, content, published: true });
  return getProviderConfig(clean);
}
