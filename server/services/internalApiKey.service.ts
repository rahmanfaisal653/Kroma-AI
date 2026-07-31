import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { db } from './db.service.js';
import { config } from '../config.js';

const TABLE = 'api_keys';

export function generateGatewayKey(): string {
  return `kg_${randomBytes(24).toString('hex')}`;
}

export function hashGatewayKey(key: string): string {
  return createHmac('sha256', config.hmacSecret).update(key).digest('hex');
}

function secretKey() { return createHash('sha256').update(config.aesSecret).digest(); }
function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decryptValue(value?: string) {
  if (!value) return '';
  try {
    const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

function safeJson(value: any, fallback: any) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalize(row: any, extra: Record<string, unknown> = {}) {
  const scopes = safeJson(row.scopes, ['*']);
  const scopeData = Array.isArray(scopes) ? { allowed_models: scopes } : scopes;
  return {
    id: row.id,
    name: row.name || row.key_prefix || 'API Key',
    key_prefix: row.key_prefix,
    active: !row.revoked_at,
    allowed_models: Array.isArray(scopeData.allowed_models) ? scopeData.allowed_models : ['*'],
    key: decryptValue(scopeData.encrypted_key),

    owner_type: scopeData.owner_type === 'partner' ? 'partner' : 'internal',
    owner_name: String(scopeData.owner_name || row.name || '').trim(),
    note: String(scopeData.note || '').trim(),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    ...extra,
  };
}

export async function listGatewayKeys(ownerType?: 'internal' | 'partner') {
  const rows = await db.findAll(TABLE);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const keys = await Promise.all(rows.map(async row => normalize(row, {
    monthly_tokens_used: await getTokenUsageForKey(row.id, monthStart),
  })));

  return keys
    .filter(key => !ownerType || key.owner_type === ownerType)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export async function createGatewayKey(input: { name: string; owner_type?: 'internal' | 'partner'; owner_name?: string; note?: string; allowed_models?: string[] }) {
  const key = generateGatewayKey();
  const keyPrefix = `${key.slice(0, 8)}...${key.slice(-4)}`;
  const id = randomUUID();
  await db.create(TABLE, {
    id,
    user_id: 0,
    key_hash: hashGatewayKey(key),
    key_prefix: keyPrefix,
    name: String(input.name || 'API Key').trim() || 'API Key',
    scopes: JSON.stringify({
      allowed_models: input.allowed_models?.length ? input.allowed_models : ['*'],
      encrypted_key: encryptValue(key),

      owner_type: input.owner_type === 'partner' ? 'partner' : 'internal',
      owner_name: String(input.owner_name || input.name || '').trim(),
      note: String(input.note || '').trim(),
    }),
  });
  return { key, record: { ...normalize({ id, key_prefix: keyPrefix, name: input.name, scopes: { allowed_models: input.allowed_models || ['*'], owner_type: input.owner_type, owner_name: input.owner_name, note: input.note }, created_at: new Date().toISOString() }), key } };
}

export async function revokeGatewayKey(id: string) {
  await db.remove(TABLE, id);
}


export async function findGatewayKey(key: string) {
  if (!key.startsWith('kg_')) return null;
  const row = await db.findOne(TABLE, 'key_hash', hashGatewayKey(key));
  if (!row || row.revoked_at) return null;
  return normalize(row);
}

export function isModelAllowed(keyRecord: { allowed_models?: string[] }, modelId: string) {
  const allowed = keyRecord.allowed_models?.length ? keyRecord.allowed_models : ['*'];
  return allowed.includes('*') || allowed.includes(modelId) || allowed.some(pattern => pattern.endsWith('/*') && modelId.startsWith(pattern.slice(0, -1)));
}

export async function getTokenUsageForKey(apiKeyId: string, since: Date) {
  const rows = await db.findWhere('usage_logs', 'api_key_id', apiKeyId);
  return rows
    .filter((row: any) => new Date(row.created_at || 0).getTime() >= since.getTime())
    .reduce((sum: number, row: any) => sum + (Number(row.total_tokens) || 0), 0);
}

export async function touchGatewayKey(id: string) {
  await db.update(TABLE, id, { last_used_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
}
