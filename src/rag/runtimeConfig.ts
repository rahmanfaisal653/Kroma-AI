import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

type ServiceConfig = {
  scraperApiUrl: string;
  ollamaBaseUrl: string;
  chromaBaseUrl: string;
  chromaCollectionName: string;
  cacheTtlMs: number;
  autoRefreshMs: number;
  maxDistanceThreshold: number;
  allowPrivateTargets: boolean;
  defaultAutoUrls: string[];
  autoIngestOnChat: boolean;
  forceRefreshOnRecency: boolean;
  embeddingModel: string;
  chatModel: string;
  missing: string[];
};

const parseFallbackEnvFiles = (): Record<string, string> => {
  const result: Record<string, string> = {};
  const files = ['.env', '.env.example'];
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    process.cwd(),
    path.resolve(moduleDir, '..', '..', '..'),
    path.resolve(moduleDir, '..', '..'),
    path.resolve(moduleDir, '..')
  ];

  const uniqueDirs = candidateDirs.filter((d, i, arr) => arr.indexOf(d) === i);
  for (const dir of uniqueDirs) {
    for (const f of files) {
      const full = path.join(dir, f);
      if (!fs.existsSync(full)) continue;
      const raw = fs.readFileSync(full, 'utf8');
      const parsed = dotenv.parse(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!(key in result)) {
          result[key] = value;
        }
      }
    }
  }
  return result;
};

const getVar = (...keys: string[]): string => {
  const fallback = parseFallbackEnvFiles();
  for (const k of keys) {
    const envVal = String(process.env[k] || '').trim();
    if (envVal) return envVal;
    const fb = String(fallback[k] || '').trim();
    if (fb) return fb;
  }
  return '';
};

export const resolveRagConfig = (): ServiceConfig => {
  const scraperApiUrl = getVar('SCRAPER_API_URL', 'SCRAPLING_API_URL');
  const ollamaBaseUrl = getVar('OLLAMA_URL');
  const chromaBaseUrl = getVar('CHROMADB_URL');
  const chromaCollectionName = getVar('CHROMADB_COLLECTION_NAME');
  const cacheTtlRaw = getVar('RAG_CACHE_TTL_MS');
  const cacheTtlMs = Number(cacheTtlRaw) > 0 ? Number(cacheTtlRaw) : 10 * 60 * 1000;
  const autoRefreshRaw = getVar('RAG_AUTO_REFRESH_MS');
  const autoRefreshMs = Number(autoRefreshRaw) > 0 ? Number(autoRefreshRaw) : 5 * 60 * 1000;
  const maxDistanceRaw = Number(getVar('RAG_MAX_DISTANCE_THRESHOLD'));
  const maxDistanceThreshold = Number.isFinite(maxDistanceRaw) && maxDistanceRaw > 0 ? maxDistanceRaw : 0.75;
  const allowPrivateTargets = /^(1|true|yes|on)$/i.test(getVar('ALLOW_PRIVATE_SCRAPE_TARGETS'));
  const autoIngestOnChat = !/^(0|false|no|off)$/i.test(getVar('RAG_AUTO_INGEST_ON_CHAT') || 'true');
  const forceRefreshOnRecency = !/^(0|false|no|off)$/i.test(getVar('RAG_FORCE_REFRESH_ON_RECENCY') || 'true');
  const embeddingModel = getVar('OLLAMA_EMBED_MODEL', 'OLLAMA_EMBEDDING_MODEL', 'RAG_EMBEDDING_MODEL', 'EMBEDDING_MODEL');
  const chatModel = getVar('OLLAMA_CHAT_MODEL', 'RAG_CHAT_MODEL', 'CHAT_MODEL');
  const defaultAutoUrls = String(
    getVar('DEFAULT_RAG_AUTO_URLS', 'VITE_DEFAULT_RAG_AUTO_URLS') || ''
  ).split(',').map(s => s.trim()).filter(Boolean);

  const missing: string[] = [];
  if (!scraperApiUrl) missing.push('SCRAPER_API_URL');
  if (!ollamaBaseUrl) missing.push('OLLAMA_URL');
  if (!chromaBaseUrl) missing.push('CHROMADB_URL');
  if (!chromaCollectionName) missing.push('CHROMADB_COLLECTION_NAME');
  if (!embeddingModel) missing.push('OLLAMA_EMBED_MODEL');

  return {
    scraperApiUrl,
    ollamaBaseUrl,
    chromaBaseUrl,
    chromaCollectionName,
    cacheTtlMs,
    autoRefreshMs,
    maxDistanceThreshold,
    allowPrivateTargets,
    defaultAutoUrls,
    autoIngestOnChat,
    forceRefreshOnRecency,
    embeddingModel,
    chatModel,
    missing
  };
};
