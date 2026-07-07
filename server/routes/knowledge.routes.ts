import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveRagConfig } from '../../src/rag/runtimeConfig.js';
import { splitTextIntoChunks } from '../../src/rag/textSplitter.js';
import { createOllamaEmbedding } from '../../src/rag/ollamaService.js';
import { queryKnowledgeDocsRaw, upsertKnowledgeDocsRaw } from '../../src/rag/chromaService.js';

const router = Router();
router.use(requireAuth);

function sourceId(value: string) {
  return String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

router.post('/sources', async (req, res) => {
  const cfg = resolveRagConfig();
  if (!cfg.chromaBaseUrl || !cfg.embeddingModel || !cfg.ollamaBaseUrl) return res.status(503).json({ error: 'RAG is not configured' });
  const source = sourceId(req.body?.source || req.body?.name);
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const chunks = splitTextIntoChunks(text, 900).slice(0, 200);
  const embeddings = await Promise.all(chunks.map(chunk => createOllamaEmbedding(cfg.ollamaBaseUrl, chunk, cfg.embeddingModel)));
  await upsertKnowledgeDocsRaw(cfg.chromaBaseUrl, {
    ids: chunks.map((_, i) => `${source}:${Date.now()}:${i}`),
    documents: chunks,
    metadatas: chunks.map((_, i) => ({ source, chunk: i, type: req.body?.type || 'text' })),
    embeddings,
  });
  res.json({ success: true, source, chunks: chunks.length });
});

router.post('/search', async (req, res) => {
  const cfg = resolveRagConfig();
  if (!cfg.chromaBaseUrl || !cfg.embeddingModel || !cfg.ollamaBaseUrl) return res.status(503).json({ error: 'RAG is not configured' });
  const query = String(req.body?.query || '').trim();
  if (!query) return res.status(400).json({ error: 'query is required' });
  const embedding = await createOllamaEmbedding(cfg.ollamaBaseUrl, query, cfg.embeddingModel);
  const result = await queryKnowledgeDocsRaw(cfg.chromaBaseUrl, embedding, Number(req.body?.topK) || 5);
  const docs = result.documents?.[0] || [];
  const metas = result.metadatas?.[0] || [];
  const distances = result.distances?.[0] || [];
  res.json({ results: docs.map((text: string, i: number) => ({ text, metadata: metas[i], distance: distances[i] })) });
});

export default router;
