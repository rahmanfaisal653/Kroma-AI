import type express from 'express';
import { createOllamaEmbedding, generateWithOllama } from './ollamaService.js';
import { getKnowledgeDocsBySourceRaw, queryKnowledgeDocsRaw } from './chromaService.js';
import { getLastIngestedSourceUrl } from './knowledgeIngest.js';
import { resolveRagConfig } from './runtimeConfig.js';
import { UpstreamServiceError } from './upstreamError.js';

type ChatRole = 'system' | 'user' | 'assistant';
type ChatMessage = { role: ChatRole; content: string };
type RetrievalRow = { text: string; distance: number };

const DEFAULT_THRESHOLD = 0.75;
const TOP_K = 3;
const MAX_HISTORY_MESSAGES = 4;

const SYSTEM_PROMPT = [
  'Anda adalah PC-AI, asisten cerdas yang sangat patuh.',
  'Tugas Anda menjawab pertanyaan HANYA berdasarkan KONTEKS yang diberikan.',
  'ATURAN BAHASA: Anda WAJIB menjawab selalu dalam Bahasa Indonesia yang baik dan benar.',
  'DILARANG KERAS menggunakan Bahasa Mandarin, Inggris, atau bahasa asing lainnya meskipun model dasar Anda berasal dari luar.',
  'LOGIKA: Jika KONTEKS tidak relevan atau kosong, katakan dengan sopan bahwa informasi tersebut tidak ada di database Anda dan minta user memberikan URL referensi.'
].join(' ');

const GENERAL_CHAT_SYSTEM_PROMPT = [
  'Anda adalah PC-AI, asisten cerdas yang responsif dan informatif.',
  'Jawab selalu dalam Bahasa Indonesia yang baik dan benar.',
  'Jika KONTEKS tersedia, prioritaskan fakta dari KONTEKS.',
  'Jika KONTEKS kosong, tetap jawab sebagai AI umum berdasarkan pengetahuan model secara jujur tanpa mengklaim akses web real-time.'
].join(' ');

const getThreshold = (): number => {
  const raw = Number(process.env.RAG_MAX_DISTANCE_THRESHOLD || DEFAULT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD;
};

const buildNoContextReply = (userQuestion: string): string => {
  if (userQuestion) {
    return `Saya belum menemukan informasi yang cukup relevan di database untuk menjawab: "${userQuestion}". Silakan kirim URL referensi agar saya bisa mempelajarinya terlebih dahulu.`;
  }
  return 'Saya belum memiliki informasi yang cukup relevan di database. Silakan kirim URL referensi agar saya bisa mempelajarinya terlebih dahulu.';
};

const cleanHistoryFromContext = (messages: ChatMessage[]): ChatMessage[] => (
  messages
    .map((m) => ({
      role: m.role,
      content: String(m.content || '')
        .replace(/^Konteks:\s*[\s\S]*?\n\nPertanyaan:\s*/i, '')
        .trim()
    }))
    .filter((m) => Boolean(m.content))
);

const normalizeIncomingMessages = (messages: any): ChatMessage[] => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((item: any) => ({
      role: String(item?.role || '').trim().toLowerCase(),
      content: String(item?.content || '').trim()
    }))
    .filter((item: any) => (item.role === 'user' || item.role === 'assistant') && item.content)
    .map((item: any) => ({ role: item.role as ChatRole, content: item.content }))
    .slice(-MAX_HISTORY_MESSAGES);
};

const normalizeSourceUrl = (value: any): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const origin = parsed.origin.toLowerCase();
    const pathname = parsed.pathname || '/';
    const search = parsed.search || '';
    return `${origin}${pathname}${search}`.replace(/\/+(\?|$)/, '$1');
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

const buildSourceUrlVariants = (value: string): string[] => {
  const normalized = normalizeSourceUrl(value);
  if (!normalized) return [];
  const variants = new Set<string>([normalized, normalized.replace(/\/+(\?|$)/, '$1')]);
  if (!normalized.includes('?')) {
    if (!normalized.endsWith('/')) variants.add(`${normalized}/`);
    if (normalized.endsWith('/')) variants.add(normalized.replace(/\/+$/, ''));
  }
  try {
    const parsed = new URL(normalized);
    const noQuery = `${parsed.origin.toLowerCase()}${parsed.pathname || '/'}`.replace(/\/+$/, '');
    if (noQuery) {
      variants.add(noQuery);
      variants.add(`${noQuery}/`);
    }
  } catch {
    // noop
  }
  return Array.from(variants);
};

const extractFirstUrlFromText = (text: string): string => {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return normalizeSourceUrl(match?.[0] || '');
};

const buildExtractiveFallbackSummary = (rows: RetrievalRow[]): string => {
  const snippets = rows
    .map((row) => String(row.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => text.slice(0, 420));
  if (snippets.length === 0) return '';
  return `Ringkasan berdasarkan data yang tersimpan:\n\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
};

const hasStrongContextSignals = (question: string): boolean => {
  const q = String(question || '').toLowerCase();
  const markers = [
    'dari hasil ingest',
    'dari hasil scrape',
    'berdasarkan ingest',
    'berdasarkan konteks',
    'link ini'
  ];
  return markers.some((m) => q.includes(m)) || /https?:\/\//i.test(q);
};

const tokenize = (text: string): string[] => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter((w) => w.length >= 4);

const hasLexicalOverlap = (question: string, contextRows: RetrievalRow[]): boolean => {
  const qTokens = new Set(tokenize(question));
  if (qTokens.size === 0) return false;
  const contextTokenSet = new Set<string>();
  for (const row of contextRows.slice(0, 2)) {
    for (const tok of tokenize(row.text).slice(0, 80)) {
      contextTokenSet.add(tok);
    }
  }
  let overlap = 0;
  for (const tok of qTokens) {
    if (contextTokenSet.has(tok)) overlap += 1;
  }
  return overlap >= 1;
};

const toErrorJson = (res: express.Response, error: any, content: string) => {
  if (error instanceof UpstreamServiceError) {
    return res.status(error.statusCode).json({
      role: 'assistant',
      content,
      service: error.service,
      code: error.code,
      detail: error.detail
    });
  }
  return res.status(500).json({
    role: 'assistant',
    content,
    detail: error?.message || String(error || 'Unknown error')
  });
};

export const ragChatController = async (
  req: express.Request,
  res: express.Response
) => {
  const cfg = resolveRagConfig();
  if (cfg.missing.length > 0) {
    return res.status(503).json({
      role: 'assistant',
      content: 'Konfigurasi RAG belum lengkap.',
      missing: cfg.missing
    });
  }

  const incomingMessages = normalizeIncomingMessages(req.body?.messages);
  const fallbackQuery = String(req.body?.query || '').trim();
  const userMessage = incomingMessages.length > 0
    ? incomingMessages[incomingMessages.length - 1].content
    : fallbackQuery;

  if (!userMessage) {
    return res.status(400).json({
      role: 'assistant',
      content: 'Pesan user tidak ditemukan.'
    });
  }

  // Manual-ingest architecture:
  // Chat controller HANYA retrieval -> generation dari data yang sudah di-ingest.
  // URL ingest dilakukan melalui endpoint manual (/api/rag/ingest atau /api/knowledge/add).
  try {
    const requestedSourceUrl = normalizeSourceUrl(
      req.body?.source_url ||
      req.body?.sourceUrl ||
      req.body?.context_source_url
    ) || extractFirstUrlFromText(userMessage);
    const useIngest = req.body?.use_ingest === true || req.body?.use_ingest === 'true';
    const forceIngestContext = /gunakan hasil ingest/i.test(userMessage);

    const effectiveResults: RetrievalRow[] = [];
    const ingestEnabled = useIngest || forceIngestContext;

    // OFF mode: pure general AI, tanpa retrieval ingest dan tanpa membawa konteks/history lama.
    if (!ingestEnabled) {
      const requestedModel = [req.body?.model, req.body?.chat_model, req.body?.chatModel]
        .map((value: any) => String(value || '').trim())
        .find(Boolean);
      const chatModel = requestedModel || String(process.env.OLLAMA_CHAT_MODEL || '').trim();
      if (!chatModel) {
        return res.status(503).json({
          role: 'assistant',
          content: 'Model chat belum dikonfigurasi. Set OLLAMA_CHAT_MODEL atau kirim model di request.'
        });
      }

      const answer = await generateWithOllama(cfg.ollamaBaseUrl, [
        { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ], chatModel);

      return res.status(200).json({
        role: 'assistant',
        content: String(answer || '').trim()
      });
    }

    // Prioritas 1: jika source URL diketahui, ambil langsung dari dokumen sumber tersebut.
    if (ingestEnabled && requestedSourceUrl) {
      for (const sourceVariant of buildSourceUrlVariants(requestedSourceUrl)) {
        const directSourceDocs = await getKnowledgeDocsBySourceRaw(cfg.chromaBaseUrl, sourceVariant, TOP_K);
        const docsBySource = Array.isArray(directSourceDocs?.documents) ? directSourceDocs.documents : [];
        for (const row of docsBySource) {
          const text = String(row || '').trim();
          if (text) effectiveResults.push({ text, distance: 0 });
        }
        if (effectiveResults.length > 0) break;
      }
    }

    // Prioritas 2: semantic retrieval jika direct source belum menghasilkan konteks.
    // Dilewati jika user eksplisit meminta "gunakan hasil ingest".
    if (effectiveResults.length === 0 && (!ingestEnabled || !requestedSourceUrl)) {
      const questionEmbedding = await createOllamaEmbedding(cfg.ollamaBaseUrl, userMessage, cfg.embeddingModel);
      const retrieval = await queryKnowledgeDocsRaw(cfg.chromaBaseUrl, questionEmbedding, TOP_K);
      const threshold = getThreshold();
      const docs = Array.isArray(retrieval?.documents?.[0]) ? retrieval.documents[0] : [];
      const distances = Array.isArray(retrieval?.distances?.[0]) ? retrieval.distances[0] : [];
      const rankedResults: RetrievalRow[] = docs
        .map((text: string, index: number) => ({
          text,
          distance: Number(distances[index])
        }));
      const metadatas = Array.isArray(retrieval?.metadatas?.[0]) ? retrieval.metadatas[0] : [];
      const pairedResults = rankedResults.map((row, index) => ({
        ...row,
        source_url: normalizeSourceUrl(metadatas[index]?.source_url)
      }));
      const sourceFiltered = requestedSourceUrl
        ? pairedResults.filter((row) => row.source_url === requestedSourceUrl)
        : pairedResults;
      const searchResults: RetrievalRow[] = sourceFiltered
        .filter((row) => Number.isFinite(row.distance) && row.distance <= threshold);
      const fallbackResult = sourceFiltered
        .filter((row) => Number.isFinite(row.distance))
        .sort((a, b) => a.distance - b.distance)[0];
      if (searchResults.length > 0) {
        effectiveResults.push(...searchResults);
      } else if (fallbackResult) {
        effectiveResults.push(fallbackResult);
      }
    }

    // Prioritas 3: fallback ke sumber ingest terakhir bila masih kosong DAN user tidak mengunci source spesifik.
    if (ingestEnabled && effectiveResults.length === 0 && !requestedSourceUrl) {
      const lastSourceUrl = normalizeSourceUrl(getLastIngestedSourceUrl());
      if (lastSourceUrl) {
        for (const sourceVariant of buildSourceUrlVariants(lastSourceUrl)) {
          const lastSourceDocs = await getKnowledgeDocsBySourceRaw(cfg.chromaBaseUrl, sourceVariant, TOP_K);
          const docsBySource = Array.isArray(lastSourceDocs?.documents) ? lastSourceDocs.documents : [];
          for (const row of docsBySource) {
            const text = String(row || '').trim();
            if (text) effectiveResults.push({ text, distance: 0.999999 });
          }
          if (effectiveResults.length > 0) break;
        }
      }
    }

    if (ingestEnabled && requestedSourceUrl && effectiveResults.length === 0) {
      return res.status(404).json({
        role: 'assistant',
        content: 'Mode ingest aktif, tapi sumber tersebut belum ada di knowledge base. Silakan ingest URL yang valid terlebih dahulu.'
      });
    }

    if (!requestedSourceUrl && effectiveResults.length > 0 && !hasLexicalOverlap(userMessage, effectiveResults)) {
      effectiveResults.length = 0;
    }

    // 3. Siapkan Array Messages untuk Ollama
    let finalMessages = [...incomingMessages];
    finalMessages = cleanHistoryFromContext(finalMessages);

    // 4. Injeksi Konteks ke Pesan Terakhir (HANYA JIKA ADA HASIL RELEVAN)
    if (effectiveResults.length > 0 && finalMessages.length > 0) {
      const combinedContext = effectiveResults.map((r) => r.text).join('\n\n');
      finalMessages[finalMessages.length - 1] = {
        role: 'user',
        content: `Konteks: ${combinedContext}\n\nPertanyaan: ${userMessage}`
      };
    } else if (finalMessages.length === 0) {
      finalMessages = [{ role: 'user', content: `Konteks: []\n\nPertanyaan: ${userMessage}` }];
    } else {
      finalMessages[finalMessages.length - 1] = {
        role: 'user',
        content: `Konteks: []\n\nPertanyaan: ${userMessage}`
      };
    }

    // 5. System Prompt (dipaksa Bahasa Indonesia)
    const groundedMessages = ingestEnabled || effectiveResults.length === 0
      ? finalMessages.slice(-1)
      : finalMessages;
    const withSystemPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: effectiveResults.length > 0 ? SYSTEM_PROMPT : GENERAL_CHAT_SYSTEM_PROMPT
      },
      ...groundedMessages
    ];

    // 6. PANGGIL OLLAMA DI SINI (hanya jalur non-URL)
    const requestedModel = [req.body?.model, req.body?.chat_model, req.body?.chatModel]
      .map((value: any) => String(value || '').trim())
      .find(Boolean);
    const chatModel = requestedModel || String(process.env.OLLAMA_CHAT_MODEL || '').trim();
    if (!chatModel) {
      return res.status(500).json({
        role: 'assistant',
        content: 'Model chat belum dikonfigurasi. Set OLLAMA_CHAT_MODEL atau kirim model di request.'
      });
    }
    const answer = await generateWithOllama(cfg.ollamaBaseUrl, withSystemPrompt, chatModel);
    const answerText = String(answer || '').trim();
    const lowAnswer = answerText.toLowerCase();
    const lowQuestion = userMessage.toLowerCase();
    const ignoreSignals = [
      'saya perlu mengetahui konten',
      'mohon berikan informasi',
      'berikan detail',
      'tidak memiliki informasi',
      'tolong berikan'
    ];
    const shouldFallbackToExtractive = ignoreSignals.some((signal) => lowAnswer.includes(signal)) &&
      (lowQuestion.includes('ringkas') || lowQuestion.includes('rangkum'));
    const contextExpected = hasStrongContextSignals(userMessage);
    const contextMissingStyle = /tidak ada dalam konteks|tidak relevan dengan konteks|informasi.*tidak.*konteks/i.test(lowAnswer);
    const finalAnswer = (shouldFallbackToExtractive || (contextExpected && contextMissingStyle))
      ? (buildExtractiveFallbackSummary(effectiveResults) || answerText)
      : answerText;

    return res.status(200).json({
      role: 'assistant',
      content: finalAnswer
    });
  } catch (error: any) {
    return toErrorJson(
      res,
      error,
      'Maaf, terjadi kesalahan saat mencoba menjawab pertanyaan Anda.'
    );
  }
};
