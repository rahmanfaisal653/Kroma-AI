import crypto from 'crypto';
import { scrapeAndCleanUrl } from './scraperService.js';
import { splitTextIntoChunks } from './textSplitter.js';
import { createOllamaEmbedding } from './ollamaService.js';
import { deleteKnowledgeBySourceRaw, queryKnowledgeDocsRaw, upsertKnowledgeDocsRaw } from './chromaService.js';

const ragIngestCache = new Map<string, { text: string; updatedAt: number; contentHash: string }>();
const URL_MAX_LENGTH = 2048;
let lastIngestedSourceUrl = '';

export const extractUrlsFromText = (text: string): string[] => {
  const matches = String(text || '').match(/https?:\/\/[^\s)]+/gi) || [];
  const cleaned = matches
    .map((u) => u.replace(/[),.;!?]+$/, '').trim())
    .filter(Boolean);
  return cleaned.filter((u, i) => cleaned.indexOf(u) === i);
};

export const isLikelyRecencyQuery = (text: string): boolean => {
  const q = String(text || '').toLowerCase();
  const keywords = [
    'saat ini', 'terkini', 'terbaru', 'hari ini', 'sekarang', 'latest', 'current', 'today',
    'presiden indonesia', 'pemimpin indonesia', 'kabinet'
  ];
  return keywords.some(k => q.includes(k));
};

export const ingestUrlToKnowledgeBase = async (
  url: string,
  env: {
    scraperApiUrl: string;
    ollamaBaseUrl: string;
    chromaBaseUrl: string;
    cacheTtlMs: number;
    autoRefreshMs?: number;
    allowPrivateTargets?: boolean;
    forceRefresh?: boolean;
    embeddingModel: string;
  }
) => {
  const normalizedUrl = String(url || '').trim();
  if (normalizedUrl.length > URL_MAX_LENGTH) {
    throw new Error('URL too long for ingest');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error('Invalid URL for ingest');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only http/https URLs are allowed for ingest');
  }
  const host = parsedUrl.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (isPrivate && !env.allowPrivateTargets) {
    throw new Error('Private/local target URL is blocked by policy');
  }

  const cached = ragIngestCache.get(normalizedUrl);
  const now = Date.now();
  const forceRefresh = !!env.forceRefresh;
  const canUseCache = !forceRefresh && !!cached && now - cached.updatedAt < env.cacheTtlMs;
  const cleanedText = canUseCache && cached
    ? cached.text
    : await scrapeAndCleanUrl(env.scraperApiUrl, normalizedUrl);
  const contentHash = crypto.createHash('sha256').update(cleanedText).digest('hex');
  const isSameContent = !!cached && cached.contentHash === contentHash;
  const shouldSkipVectorRefresh = !forceRefresh &&
    !canUseCache &&
    isSameContent &&
    !!env.autoRefreshMs &&
    now - cached.updatedAt < env.autoRefreshMs;

  if (shouldSkipVectorRefresh) {
    ragIngestCache.set(normalizedUrl, { text: cleanedText, updatedAt: now, contentHash });
    lastIngestedSourceUrl = normalizedUrl;
    return {
      source_url: normalizedUrl,
      chunks_added: 0,
      from_cache: false,
      unchanged: true
    };
  }

  if (!canUseCache) {
    ragIngestCache.set(normalizedUrl, { text: cleanedText, updatedAt: now, contentHash });
  }

  const normalizedText = String(cleanedText || '').trim();
  let chunks = splitTextIntoChunks(normalizedText, 1000);
  if (chunks.length === 0) {
    // Fallback: hard split by max chars when sentence splitter yields empty.
    const compact = normalizedText.replace(/\s+/g, ' ').trim();
    if (!compact) {
      throw new Error('No text chunks extracted from source');
    }
    chunks = compact.match(/.{1,1000}/g) || [];
  }

  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const emb = await createOllamaEmbedding(env.ollamaBaseUrl, chunk, env.embeddingModel);
    embeddings.push(emb);
  }

  const ids = chunks.map((chunk, idx) => {
    const hash = crypto.createHash('sha256').update(`${normalizedUrl}|${idx}|${chunk}`).digest('hex').slice(0, 24);
    return `kb_${hash}`;
  });
  const metadatas = chunks.map((_, idx) => ({
    source_url: normalizedUrl,
    chunk_index: idx,
    ingested_at: new Date().toISOString(),
    content_hash: contentHash
  }));

  await deleteKnowledgeBySourceRaw(env.chromaBaseUrl, normalizedUrl);
  await upsertKnowledgeDocsRaw(env.chromaBaseUrl, {
    ids,
    documents: chunks,
    metadatas,
    embeddings
  });

  // Post-ingest verification: ensure inserted vectors are retrievable in ChromaDB.
  const verifyQuery = await queryKnowledgeDocsRaw(env.chromaBaseUrl, embeddings[0], 1);
  const verifyMeta = Array.isArray(verifyQuery?.metadatas?.[0]) ? verifyQuery.metadatas[0][0] : null;
  const verifyDistance = Array.isArray(verifyQuery?.distances?.[0])
    ? Number(verifyQuery.distances[0][0])
    : null;
  const verificationPassed = !!verifyMeta && String(verifyMeta?.source_url || '') === normalizedUrl;
  lastIngestedSourceUrl = normalizedUrl;

  return {
    source_url: normalizedUrl,
    chunks_added: chunks.length,
    from_cache: canUseCache,
    unchanged: false,
    text_chars: cleanedText.length,
    text_preview: chunks.slice(0, 2).join('\n\n').slice(0, 800),
    verification: {
      passed: verificationPassed,
      checked_with: 'self-vector-query',
      top_distance: Number.isFinite(verifyDistance as number) ? verifyDistance : null
    }
  };
};

export const listCachedSourceUrls = (): string[] => Array.from(ragIngestCache.keys());
export const getLastIngestedSourceUrl = (): string => lastIngestedSourceUrl;
