import { db } from './db.service.js';
import { getProvider, getProviders, type ProviderConfig, type ProviderId } from '../ai/providers.js';

const TABLE = 'docs';
const CATEGORY = 'provider_config';
const FIXED_IDS = ['openai', 'ollama', 'lmstudio'] as const;

type Input = { id?: string; name?: string; baseUrl?: string; token?: string };
type StoredProvider = ProviderConfig & { overridden?: boolean; custom?: boolean; configured: boolean };

function cleanUrl(value = '') { return value.trim().replace(/\/+$/, ''); }
function cleanId(value = '') { return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''); }
function parse(row: any) { try { return JSON.parse(row?.content || '{}'); } catch { return {}; } }
function slug(id: string) { return `provider-${id}`; }
function safeProvider(provider: StoredProvider) {
  const { apiKey: _secret, ...safe } = provider;
  return { ...safe, configured: Boolean(_secret) };
}

export function fixedProviderIds() { return [...FIXED_IDS] as ProviderId[]; }

async function providerRows() {
  return db.findWhere(TABLE, 'category', CATEGORY);
}

export async function getProviderConfig(id: string): Promise<StoredProvider | null> {
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(id));
  const override = parse(row);
  if (override.deleted) return null;

  if (FIXED_IDS.includes(id as any)) {
    const base = getProvider(id as ProviderId);
    const apiKey = override.token ?? base.apiKey;
    return { id: base.id, name: base.name, baseUrl: cleanUrl(override.baseUrl || base.baseUrl), apiKey, configured: Boolean(apiKey), overridden: Boolean(row), custom: false };
  }

  if (!row) return null;
  const apiKey = override.token || undefined;
  return { id, name: override.name || id, baseUrl: cleanUrl(override.baseUrl), apiKey, configured: Boolean(apiKey), overridden: true, custom: true } as StoredProvider;
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
  const content = JSON.stringify({ name: input.name?.trim() || id, baseUrl, token: input.token || '' });
  await db.create(TABLE, { title: input.name?.trim() || id, slug: slug(id), category: CATEGORY, content, published: true });
  return getProviderConfig(id);
}

export async function updateProviderConfig(id: string, input: Input) {
  const current = await getProviderConfig(id);
  if (!current) return null;
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(id));
  const content = JSON.stringify({
    name: input.name?.trim() || current.name,
    baseUrl: cleanUrl(input.baseUrl || current.baseUrl),
    token: input.token ?? current.apiKey ?? '',
  });
  if (row) await db.update(TABLE, row.id, { title: input.name?.trim() || current.name, content, published: true });
  else await db.create(TABLE, { title: current.name, slug: slug(id), category: CATEGORY, content, published: true });
  return getProviderConfig(id);
}

export async function deleteProviderConfig(id: string) {
  const rows = await providerRows();
  const row = rows.find((item: any) => item.slug === slug(id));
  if (!FIXED_IDS.includes(id as any)) {
    if (row) await db.remove(TABLE, row.id);
    return;
  }
  const base = getProvider(id as ProviderId);
  const content = JSON.stringify({ name: base.name, baseUrl: base.baseUrl, token: base.apiKey || '', deleted: true });
  if (row) await db.update(TABLE, row.id, { title: base.name, content, published: true });
  else await db.create(TABLE, { title: base.name, slug: slug(id), category: CATEGORY, content, published: true });
}

export async function publicProviderConfigs() {
  return (await listProviderConfigs()).map(safeProvider);
}

export { getProviders };
