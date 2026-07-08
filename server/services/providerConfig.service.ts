import { db } from './db.service.js';
import { getProvider, getProviders, type ProviderConfig, type ProviderId } from '../ai/providers.js';

const TABLE = 'docs';
const CATEGORY = 'provider_config';
const FIXED_IDS = ['openai', 'ollama', 'lmstudio'] as const;

type Audience = 'internal' | 'partner';
type Input = { id?: string; name?: string; baseUrl?: string; token?: string; enabled?: boolean; visibility?: Audience[] | string };
type StoredProvider = ProviderConfig & { overridden?: boolean; custom?: boolean; configured: boolean; enabled: boolean; visibility: Audience[] };

function cleanUrl(value = '') { return value.trim().replace(/\/+$/, ''); }
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
  return { ...safe, configured: Boolean(apiKey), enabled: provider.enabled !== false, visibility: cleanVisibility(provider.visibility) };
}

export function fixedProviderIds() { return [...FIXED_IDS] as ProviderId[]; }

async function providerRows() {
  return db.findWhere(TABLE, 'category', CATEGORY);
}

export async function getProviderConfig(id: string): Promise<StoredProvider | null> {
  const clean = cleanId(id);
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  const override = parse(row);
  if (override.deleted) return null;

  if (FIXED_IDS.includes(clean as any)) {
    const base = getProvider(clean as ProviderId);
    const apiKey = override.token ?? base.apiKey;
    return {
      id: base.id,
      name: override.name || base.name,
      baseUrl: cleanUrl(override.baseUrl || base.baseUrl),
      apiKey,
      configured: Boolean(apiKey),
      enabled: override.enabled !== false,
      visibility: cleanVisibility(override.visibility),
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
    .filter((id: string) => !FIXED_IDS.includes(id as any));
  const customProviders = await Promise.all(custom.map(getProviderConfig));
  return [...fixed, ...customProviders].filter(Boolean) as StoredProvider[];
}

export async function createProviderConfig(input: Input) {
  const id = cleanId(input.id || input.name || '');
  if (!id || FIXED_IDS.includes(id as any)) return null;
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
  });
  if (row) await db.update(TABLE, row.id, { title: input.name?.trim() || current.name, content, published: true });
  else await db.create(TABLE, { title: current.name, slug: slug(clean), category: CATEGORY, content, published: true });
  return getProviderConfig(clean);
}

export async function deleteProviderConfig(id: string) {
  const clean = cleanId(id);
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(clean));
  if (!FIXED_IDS.includes(clean as any)) {
    if (row) await db.remove(TABLE, row.id);
    return;
  }
  const base = getProvider(clean as ProviderId);
  const content = JSON.stringify({ name: base.name, baseUrl: base.baseUrl, token: base.apiKey || '', enabled: false, visibility: 'internal', deleted: true });
  if (row) await db.update(TABLE, row.id, { title: base.name, content, published: true });
  else await db.create(TABLE, { title: base.name, slug: slug(clean), category: CATEGORY, content, published: true });
}

export async function publicProviderConfigs() {
  return (await listProviderConfigs()).map(safeProvider);
}

export { getProviders };
