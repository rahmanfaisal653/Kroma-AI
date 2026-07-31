import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.service.js';
import type { DbUser, SafeUser, AuthPayload, TokenPair } from '../types/index.js';
import { config } from '../config.js';

// --- API Key Helpers ---

export function generateApiKey(): string {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

export function maskApiKey(key: string | null | undefined): string {
  if (!key || key.length < 4) return '';
  return `sk-...${key.slice(-4)}`;
}

export function isLikelyUserApiKey(value: string | null | undefined): boolean {
  const v = String(value || '').trim();
  return /^sk-[A-Za-z0-9_-]{16,}$/.test(v);
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHmac('sha256', config.hmacSecret).update(apiKey).digest('hex');
}

// --- Password Hashing (bcrypt) ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  // Reject plaintext passwords — force rehash via admin
  if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$')) {
    console.error('[AUTH CRITICAL] Plaintext password detected — login rejected. Admin harus rehash password user ini.');
    return false;
  }
  return bcrypt.compare(password, hash);
}

// --- Optional Users Schema Helpers ---
let usersColumnsCache: Set<string> | null = null;

export async function usersHasColumn(column: string): Promise<boolean> {
  if (!usersColumnsCache) {
    try {
      usersColumnsCache = new Set(await db.getTableColumns('users'));
    } catch {
      usersColumnsCache = new Set();
    }
  }
  return usersColumnsCache.has(column);
}

async function getUserTokenVersion(user: DbUser | null): Promise<number> {
  if (!user || !(await usersHasColumn('token_version'))) return 0;
  return Number((user as any).token_version) || 0;
}

async function updateUserOptionalColumns(userId: string | number, payload: Record<string, any>) {
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (await usersHasColumn(key)) filtered[key] = value;
  }
  if (Object.keys(filtered).length === 0) return;
  await db.update('users', userId, filtered);
}

// --- JWT ---

export async function generateTokens(payload: AuthPayload): Promise<TokenPair> {
  const user = await findUserById(payload.id);
  const tokenVersion = await getUserTokenVersion(user);
  const tokenPayload = { ...payload, token_version: tokenVersion };
  const accessToken = jwt.sign(tokenPayload as object, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
  const refreshToken = jwt.sign({ id: payload.id, token_version: tokenVersion }, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn as any });
  return { accessToken, refreshToken };
}

export async function verifyAccessToken(token: string): Promise<AuthPayload | null> {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ id: string | number; token_version?: number } | null> {
  try {
    const payload = jwt.verify(token, config.jwtRefreshSecret) as { id: string | number; token_version?: number };
    const user = await findUserById(payload.id);
    if (!user) return null;
    const currentVersion = await getUserTokenVersion(user);
    const payloadVersion = payload.token_version === undefined ? 0 : Number(payload.token_version);
    if (payloadVersion !== currentVersion) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function bumpTokenVersion(userId: string | number): Promise<number> {
  const user = await findUserById(userId);
  const nextVersion = (await getUserTokenVersion(user)) + 1;
  await updateUserOptionalColumns(userId, { token_version: nextVersion });
  return nextVersion;
}

// --- User Queries ---

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  return db.findOne('users', 'email', email);
}

export async function findUserByKey(apiKey: string): Promise<DbUser | null> {
  const keyHash = hashApiKey(apiKey);
  if (await usersHasColumn('user_key_hash')) {
    const byHash = await db.findOne('users', 'user_key_hash', keyHash);
    if (byHash) return byHash;
  }

  // Migration fallback: existing users may still store plaintext API keys.
  const legacyUser = await db.findOne('users', 'user_key', apiKey);
  if (legacyUser && !(legacyUser as any).user_key_hash) {
    try {
      await updateUserOptionalColumns(legacyUser.id, { user_key_hash: keyHash });
      if (await usersHasColumn('user_key_hash')) await db.update('users', legacyUser.id, { user_key: maskApiKey(apiKey) });
      return { ...legacyUser, user_key_hash: keyHash, user_key: maskApiKey(apiKey) } as DbUser;
    } catch {
      return legacyUser;
    }
  }
  return legacyUser;
}

export async function findUserById(id: string | number): Promise<DbUser | null> {
  return db.findOne('users', 'id', id);
}

export function toSafeUser(user: DbUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: (user as any).status,
    user_key: maskApiKey(user.user_key)
  };
}

/**
 * Owner profile view: returns only a masked API key.
 * Full keys are available only from /api/user/reveal-key or immediately after rotation.
 */
export function toOwnerUser(user: DbUser): SafeUser & { user_key: string; quota_limit: number; usage_count: number; balance: number } {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: (user as any).status,
    user_key: maskApiKey(user.user_key),
    quota_limit: Number(user.quota_limit) || 0,
    usage_count: Number(user.usage_count) || 0,
    balance: Number((user as any).balance) || 0,
  };
}
