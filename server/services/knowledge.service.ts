/**
 * Knowledge Service — ChromaDB integration for URL content storage & retrieval.
 *
 * 3 functions:
 * 1. ingestToChromaDB — store scraped URL content (auto, background)
 * 2. getCachedUrl — check if URL already stored & fresh
 * 3. retrieveRelevantContext — semantic search for relevant chunks
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';

const log = logger.child('knowledge');

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RELEVANCE_THRESHOLD = 0.75; // cosine distance threshold
const MAX_RETRIEVAL_RESULTS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitTextIntoChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  if (!text || text.length === 0) return chunks;

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk); // Skip tiny fragments
    start += size - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function loadRagDeps() {
  const { resolveRagConfig } = await import('../../src/rag/runtimeConfig.js');
  const { createOllamaEmbedding } = await import('../../src/rag/ollamaService.js');
  const {
    upsertKnowledgeDocsRaw,
    getKnowledgeDocsBySourceRaw,
    queryKnowledgeDocsRaw,
  } = await import('../../src/rag/chromaService.js');

  const cfg = resolveRagConfig();
  return { cfg, createOllamaEmbedding, upsertKnowledgeDocsRaw, getKnowledgeDocsBySourceRaw, queryKnowledgeDocsRaw };
}

// ---------------------------------------------------------------------------
// 1. Auto-Ingest: Store scraped URL content to ChromaDB
// ---------------------------------------------------------------------------

export async function ingestToChromaDB(url: string, text: string, userId: string): Promise<boolean> {
  try {
    const { cfg, createOllamaEmbedding, upsertKnowledgeDocsRaw } = await loadRagDeps();
    if (cfg.missing.length > 0) {
      log.warn('RAG infra not configured, skipping ingest', { missing: cfg.missing });
      return false;
    }

    if (!text || text.trim().length < 50) {
      log.warn('Text too short to ingest', { url, length: text?.length });
      return false;
    }

    const chunks = splitTextIntoChunks(text);
    if (chunks.length === 0) return false;

    // Embed all chunks
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const emb = await createOllamaEmbedding(cfg.ollamaBaseUrl, chunk, cfg.embeddingModel);
      embeddings.push(emb);
    }

    // Deterministic IDs — same URL always overwrites same entries
    const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
    const ids = chunks.map((_, i) => `url_${urlHash}_${i}`);
    const now = new Date().toISOString();
    const metadatas = chunks.map((chunk, i) => ({
      source_url: url,
      chunk_index: i,
      total_chunks: chunks.length,
      scraped_at: now,
      user_id: userId,
      chars: chunk.length,
    }));

    await upsertKnowledgeDocsRaw(cfg.chromaBaseUrl, {
      ids,
      documents: chunks,
      metadatas,
      embeddings,
    });

    log.info('URL ingested to ChromaDB', { url, chunks: chunks.length });
    return true;
  } catch (err: any) {
    log.warn('ChromaDB ingest failed (non-fatal)', { url, error: err.message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// 2. Cache Check: Is this URL already stored & fresh?
// ---------------------------------------------------------------------------

export async function getCachedUrl(url: string): Promise<string | null> {
  try {
    const { cfg, getKnowledgeDocsBySourceRaw } = await loadRagDeps();
    if (cfg.missing.length > 0) return null;

    const result = await getKnowledgeDocsBySourceRaw(cfg.chromaBaseUrl, url, 50);
    const docs = result?.documents || [];
    const metas = result?.metadatas || [];

    if (docs.length === 0) return null;

    // Check freshness
    const scrapedAt = metas[0]?.scraped_at;
    if (scrapedAt) {
      const age = Date.now() - new Date(scrapedAt).getTime();
      if (age > CACHE_TTL_MS) return null; // Expired
    }

    // Reconstruct text from ordered chunks
    const ordered = docs
      .map((doc: string, i: number) => ({ doc, index: Number(metas[i]?.chunk_index ?? i) }))
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.doc);

    return ordered.join('\n\n');
  } catch {
    return null; // ChromaDB unavailable — proceed with fresh scrape
  }
}

// ---------------------------------------------------------------------------
// 3. Semantic Retrieval: Find relevant chunks for a question
// ---------------------------------------------------------------------------

export async function retrieveRelevantContext(question: string): Promise<string> {
  try {
    if (!question || question.trim().length < 10) return '';

    const { cfg, createOllamaEmbedding, queryKnowledgeDocsRaw } = await loadRagDeps();
    if (cfg.missing.length > 0) return '';

    // Quick check: if Ollama URL is not configured, skip immediately
    if (!cfg.ollamaBaseUrl) return '';

    const embedding = await createOllamaEmbedding(cfg.ollamaBaseUrl, question, cfg.embeddingModel);
    const results = await queryKnowledgeDocsRaw(cfg.chromaBaseUrl, embedding, MAX_RETRIEVAL_RESULTS);

    const docs = results?.documents?.[0] || [];
    const distances = results?.distances?.[0] || [];
    const metas = results?.metadatas?.[0] || [];

    // Filter by relevance
    const relevant = docs
      .map((doc: string, i: number) => ({ doc, distance: distances[i], meta: metas[i] }))
      .filter((r: any) => r.distance < RELEVANCE_THRESHOLD && r.doc.length > 20)
      .slice(0, MAX_RETRIEVAL_RESULTS);

    if (relevant.length === 0) return '';

    // Format as context
    const parts = relevant.map((r: any) => {
      const source = r.meta?.source_url ? `[Source: ${r.meta.source_url}]` : '';
      return `${source}\n${r.doc}`;
    });

    return parts.join('\n\n---\n\n');
  } catch (err: any) {
    log.warn('ChromaDB retrieval failed (non-fatal)', { error: err.message });
    return '';
  }
}
