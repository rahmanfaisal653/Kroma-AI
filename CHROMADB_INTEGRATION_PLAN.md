# ChromaDB Integration Plan — URL Knowledge Store

**Date**: 2026-05-19
**Status**: DRAFT — Awaiting review

---

## Scope

ChromaDB = **knowledge base dari URL yang user kirim**. Titik.

### 3 Fungsi ChromaDB:

**1. Ingest URL → Store**
```
User kirim URL di chat
  → Backend scrape pakai Scrapling (10.50.224.205:14500)
  → Hasil scrape dibersihkan (strip HTML, normalize whitespace)
  → Teks dipotong jadi chunks (max 1000 chars per chunk, 100 overlap)
  → Setiap chunk di-embed via Ollama (nomic-embed-text)
  → Simpan ke ChromaDB bersama metadata (source_url, scraped_at, user_id)
```

**2. Cache Check — Skip Re-scrape**
```
User kirim URL yang sama lagi
  → Cek ChromaDB: apakah URL ini sudah pernah di-ingest?
  → Kalau sudah ada dan masih valid (< 24 jam) → ambil dari ChromaDB, skip scrape
  → Kalau expired atau belum ada → scrape ulang → update ChromaDB
```

**3. Semantic Retrieval — Inject Context ke AI**
```
User tanya sesuatu (dengan atau tanpa URL)
  → Pertanyaan user diubah jadi embedding via Ollama
  → ChromaDB cari chunks yang maknanya paling dekat (cosine similarity)
  → Top 3 chunks relevan dimasukkan ke prompt sebagai konteks
  → AI menjawab berdasarkan konteks itu
```

### Yang ChromaDB TIDAK lakukan:
- ❌ Tidak menyimpan jawaban AI
- ❌ Tidak menyimpan history chat
- ❌ Tidak menyimpan data selain hasil scrape URL

---

## Current State vs Target

| Komponen | Status | Keterangan |
|----------|--------|------------|
| Scrapling (scraper) | ✅ Ada | `10.50.224.205:14500/scrape` |
| Ollama (embedding) | ✅ Ada | `10.50.224.102:11434`, model `nomic-embed-text:latest` |
| ChromaDB | ✅ Ada | `10.50.224.205:14501`, collection `knowledge_base` |
| Text splitter | ✅ Ada | `src/rag/textSplitter.ts` |
| ChromaDB service | ✅ Ada | `src/rag/chromaService.ts` (upsert, query, delete) |
| Ingest controller | ✅ Ada | `src/rag/ingestController.ts` — tapi hanya via endpoint manual |
| **Auto-ingest dari chat** | ❌ Belum | Scrape route tidak simpan ke ChromaDB |
| **Cache check** | ❌ Belum | Scrape selalu fresh, tidak cek ChromaDB dulu |
| **Semantic retrieval di gateway** | ❌ Belum | Chat utama (`/ai/chat`) tidak query ChromaDB |

---

## Implementation Plan

### File Changes

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `server/routes/scrape.routes.ts` | MODIFY | Setelah scrape → auto-ingest ke ChromaDB (background) |
| 2 | `server/routes/scrape.routes.ts` | MODIFY | Sebelum scrape → cek cache di ChromaDB |
| 3 | `server/routes/gateway.routes.ts` | MODIFY | Sebelum forward ke AI → query ChromaDB untuk konteks relevan |
| 4 | `server/services/knowledge.service.ts` | CREATE | Helper functions: ingest, cache-check, retrieve |

---

### Task 1: Auto-Ingest ke ChromaDB Setelah Scrape

**File**: `server/routes/scrape.routes.ts`

Setelah scrape berhasil dan response dikirim ke client, jalankan background job:

```typescript
// After res.json({ success: true, ... })
// Fire-and-forget: store to ChromaDB
ingestToChromaDB(url, finalText, String(userId)).catch(err => {
  logger.warn('[Scrape] ChromaDB ingest failed (non-fatal)', { url, error: err.message });
});
```

**Helper** (`server/services/knowledge.service.ts`):

```typescript
import crypto from 'crypto';
import { resolveRagConfig } from '../../src/rag/runtimeConfig.js';
import { createOllamaEmbedding } from '../../src/rag/ollamaService.js';
import { upsertKnowledgeDocsRaw, getKnowledgeDocsBySourceRaw } from '../../src/rag/chromaService.js';
import { splitTextIntoChunks } from '../../src/rag/textSplitter.js';
import logger from '../utils/logger.js';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Ingest scraped URL content into ChromaDB.
 * Splits text into chunks, embeds each, stores with metadata.
 */
export async function ingestToChromaDB(url: string, text: string, userId: string): Promise<void> {
  const cfg = resolveRagConfig();
  if (cfg.missing.length > 0) return; // Infra not configured — skip

  const chunks = splitTextIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
  if (chunks.length === 0) return;

  // Embed all chunks
  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const emb = await createOllamaEmbedding(cfg.ollamaBaseUrl, chunk, cfg.embeddingModel);
    embeddings.push(emb);
  }

  // Generate deterministic IDs (same URL → same IDs → upsert overwrites)
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

  logger.info('[Knowledge] URL ingested to ChromaDB', { url, chunks: chunks.length });
}

/**
 * Check if URL is already in ChromaDB and still fresh (< 24h).
 * Returns cached text or null.
 */
export async function getCachedUrl(url: string): Promise<string | null> {
  const cfg = resolveRagConfig();
  if (cfg.missing.length > 0) return null;

  try {
    const result = await getKnowledgeDocsBySourceRaw(cfg.chromaBaseUrl, url, 50);
    const docs = result?.documents || [];
    const metas = result?.metadatas || [];

    if (docs.length === 0) return null;

    // Check freshness
    const scrapedAt = metas[0]?.scraped_at;
    if (scrapedAt) {
      const age = Date.now() - new Date(scrapedAt).getTime();
      if (age > CACHE_TTL_MS) return null; // Expired — need fresh scrape
    }

    // Reconstruct full text from chunks (ordered by chunk_index)
    const ordered = docs
      .map((doc: string, i: number) => ({ doc, index: metas[i]?.chunk_index ?? i }))
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.doc);

    return ordered.join('\n\n');
  } catch {
    return null; // ChromaDB unavailable — proceed with fresh scrape
  }
}

/**
 * Retrieve relevant chunks from ChromaDB for a user question.
 * Returns formatted context string or empty string.
 */
export async function retrieveRelevantContext(question: string): Promise<string> {
  const cfg = resolveRagConfig();
  if (cfg.missing.length > 0) return '';
  if (!question.trim() || question.length < 10) return ''; // Skip trivial queries

  try {
    const embedding = await createOllamaEmbedding(cfg.ollamaBaseUrl, question, cfg.embeddingModel);
    const { queryKnowledgeDocsRaw } = await import('../../src/rag/chromaService.js');
    const results = await queryKnowledgeDocsRaw(cfg.chromaBaseUrl, embedding, 3);

    const docs = results?.documents?.[0] || [];
    const distances = results?.distances?.[0] || [];
    const metas = results?.metadatas?.[0] || [];

    // Filter: only include chunks with distance < 0.75 (relevant)
    const relevant = docs
      .map((doc: string, i: number) => ({ doc, distance: distances[i], meta: metas[i] }))
      .filter((r: any) => r.distance < 0.75 && r.doc.length > 20)
      .slice(0, 3);

    if (relevant.length === 0) return '';

    // Format as context block
    const contextParts = relevant.map((r: any) => {
      const source = r.meta?.source_url ? `[Source: ${r.meta.source_url}]` : '';
      return `${source}\n${r.doc}`;
    });

    return contextParts.join('\n\n---\n\n');
  } catch (err: any) {
    logger.warn('[Knowledge] Retrieval failed (non-fatal)', { error: err.message });
    return '';
  }
}
```

---

### Task 2: Cache Check Sebelum Scrape

**File**: `server/routes/scrape.routes.ts`

Sebelum melakukan scrape, cek ChromaDB:

```typescript
// Before scraping — check cache
const cached = await getCachedUrl(url);
if (cached) {
  const finalText = cached.length > MAX_CONTEXT_CHARS ? cached.slice(0, MAX_CONTEXT_CHARS) : cached;
  return res.json({
    success: true,
    url,
    text: finalText,
    chars: cached.length,
    truncated: cached.length > MAX_CONTEXT_CHARS,
    cached: true,
    source: 'chromadb',
  });
}
// ... proceed with fresh scrape
```

---

### Task 3: Semantic Retrieval di Gateway (Inject Context ke AI)

**File**: `server/routes/gateway.routes.ts`

Sebelum forward request ke AI upstream, query ChromaDB untuk konteks relevan:

```typescript
// After prepareRequestBody, before forwarding to upstream:
// Extract user's last message for semantic search
const lastUserMsg = requestBody.messages
  ?.filter((m: any) => m.role === 'user')
  ?.slice(-1)?.[0]?.content;

if (lastUserMsg && typeof lastUserMsg === 'string' && lastUserMsg.length >= 10) {
  try {
    const context = await retrieveRelevantContext(lastUserMsg);
    if (context) {
      // Inject as system message with retrieved context
      const contextMsg = {
        role: 'system',
        content: `Berikut adalah informasi relevan dari dokumen yang pernah user berikan sebelumnya. Gunakan sebagai referensi jika relevan dengan pertanyaan:\n\n${context}`
      };
      // Add after existing system message, or as first message
      const sysIdx = requestBody.messages.findIndex((m: any) => m.role === 'system');
      if (sysIdx >= 0) {
        requestBody.messages.splice(sysIdx + 1, 0, contextMsg);
      } else {
        requestBody.messages.unshift(contextMsg);
      }
    }
  } catch {
    // Retrieval failed — proceed without context (non-fatal)
  }
}
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  USER SENDS MESSAGE (with or without URL)                        │
└──────────────────────────┬───────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │ Contains URL?           │
              └────┬───────────────┬────┘
                   │ YES           │ NO
                   ▼               │
    ┌──────────────────────┐       │
    │ Check ChromaDB cache │       │
    │ (by source_url)      │       │
    └──────┬───────────────┘       │
           │                       │
    ┌──────┴──────┐                │
    │ Cached?     │                │
    └──┬──────┬───┘                │
       │YES   │NO                  │
       │      ▼                    │
       │  ┌────────────────┐       │
       │  │ Scrape via     │       │
       │  │ Scrapling      │       │
       │  └───────┬────────┘       │
       │          │                │
       │          ▼                │
       │  ┌────────────────┐       │
       │  │ Clean + Chunk  │       │
       │  │ + Embed        │       │
       │  │ + Store ChromaDB│      │
       │  └───────┬────────┘       │
       │          │                │
       ▼          ▼                ▼
    ┌──────────────────────────────────────┐
    │ Inject scraped text as context       │
    │ (frontend sends with AI request)     │
    └──────────────────┬───────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────┐
    │ GATEWAY: Before forwarding to AI     │
    │                                      │
    │ 1. Embed user's question             │
    │ 2. Query ChromaDB (top 3 chunks)     │
    │ 3. If relevant → inject as system    │
    │    context in prompt                 │
    └──────────────────┬───────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────┐
    │ Forward to AI upstream (Qwen/Ollama) │
    │ WITH context from ChromaDB           │
    └──────────────────┬───────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────┐
    │ Stream response back to user         │
    └──────────────────────────────────────┘
```

---

## Performance & Latency

| Step | Latency | When | Blocking? |
|------|---------|------|-----------|
| Cache check (ChromaDB get) | ~50ms | Before scrape | Yes (but fast) |
| Scrape URL | 2-8s | Only if not cached | Yes |
| Chunk + Embed + Store | 1-3s | After scrape | **No** (background) |
| Semantic retrieval (embed + query) | 200-400ms | Before AI forward | Yes |

**Total added latency to chat**: ~200-400ms (retrieval only)
**Scrape with cache hit**: ~50ms instead of 2-8s

---

## Graceful Degradation

| Infra down | Behavior |
|------------|----------|
| ChromaDB down | Skip cache check, skip retrieval, skip store. Chat works normally without context. |
| Ollama down | Skip embedding, skip store, skip retrieval. Scrape still works (returns raw text). |
| Scrapling down | Scrape fails → no new data stored. Existing ChromaDB data still available for retrieval. |
| All down | Chat works as before (direct to AI, no context injection). |

---

## Execution Order

1. Create `server/services/knowledge.service.ts` (helper functions)
2. Modify `server/routes/scrape.routes.ts` (cache check + auto-ingest)
3. Modify `server/routes/gateway.routes.ts` (semantic retrieval before AI)
4. Test: send URL → verify stored in ChromaDB
5. Test: send same URL → verify cache hit (no re-scrape)
6. Test: ask question about URL content → verify context injected

---

## Execution Command

When ready: **"eksekusi CHROMADB_INTEGRATION_PLAN"**

Estimated: ~30 menit implementasi (1 file baru, 2 file modify)
