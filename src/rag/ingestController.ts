import type express from 'express';
import { ingestUrlToKnowledgeBase } from './knowledgeIngest.js';
import { resolveRagConfig } from './runtimeConfig.js';

export const ingestKnowledgeController = async (
  req: express.Request,
  res: express.Response
) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const cfg = resolveRagConfig();
  if (cfg.missing.length > 0) {
    return res.status(500).json({
      error: `${cfg.missing.join(', ')} must be configured`,
      hint: 'Set env vars in .env or .env.example and restart server.'
    });
  }

  try {
    const ingestResult = await ingestUrlToKnowledgeBase(String(url).trim(), {
      scraperApiUrl: cfg.scraperApiUrl,
      ollamaBaseUrl: cfg.ollamaBaseUrl,
      chromaBaseUrl: cfg.chromaBaseUrl,
      cacheTtlMs: cfg.cacheTtlMs,
      autoRefreshMs: cfg.autoRefreshMs,
      allowPrivateTargets: cfg.allowPrivateTargets,
      embeddingModel: cfg.embeddingModel
    });

    if (ingestResult?.verification && !ingestResult.verification.passed) {
      return res.status(502).json({
        error: 'Knowledge ingestion verification failed',
        detail: 'Data sudah di-upsert tapi gagal diverifikasi lewat query balik ke ChromaDB.',
        ...ingestResult
      });
    }

    return res.json({
      success: true,
      ...ingestResult
    });
  } catch (error: any) {
    const detail = error?.response?.data || error?.detail || error?.message;
    const code = error?.code || null;
    const service = error?.service || null;
    return res.status(502).json({ error: 'Knowledge ingestion failed', detail, code, service });
  }
};
