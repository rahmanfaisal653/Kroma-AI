import { Router } from 'express';
import axios from 'axios';
import { listModels, getModel } from '../ai/models.js';
import { getProvider } from '../ai/providers.js';
import { requireGatewayKey } from '../middleware/internalApiKey.middleware.js';
import { findGatewayKey, touchGatewayKey } from '../services/internalApiKey.service.js';
import { logUsage } from '../services/gateway.service.js';
import { config } from '../config.js';
import { getProviderConfig, listProviderConfigs } from '../services/providerConfig.service.js';
import { resolveRagConfig } from '../../src/rag/runtimeConfig.js';
import { createOllamaEmbedding } from '../../src/rag/ollamaService.js';
import { queryKnowledgeDocsRaw } from '../../src/rag/chromaService.js';

const router = Router();

function apiError(res: any, status: number, code: string, message: string, details?: Record<string, unknown>) {
  return res.status(status).json({
    error: {
      message,
      code,
      status,
      details,
      timestamp: new Date().toISOString(),
    },
  });
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value || '').length / 4);
}

function extractSseContent(raw: string): string {
  return raw.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('data:')).map(line => {
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return '';
    try {
      const parsed = JSON.parse(data);
      return parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content || '';
    } catch { return ''; }
  }).join('');
}

async function fetchProviderModels(provider: any) {
  if (provider.id === 'openai' && !provider.apiKey) {
    return { status: 'not_configured', models: [] as string[], error: 'OpenAI API key is not configured' };
  }
  try {
    const headers: Record<string, string> = {};
    if (provider.apiKey) {
      headers.Authorization = ['Bearer', provider.apiKey].join(' ');
      headers['x-api-key'] = provider.apiKey;
    }
    const nativeOllama = !String(provider.baseUrl).endsWith('/v1');
    const url = `${provider.baseUrl}${nativeOllama ? '/api/tags' : '/models'}`;
    let res = await axios.get(url, { timeout: 3000, headers, validateStatus: () => true });
    if (res.status === 404 && !nativeOllama) res = await axios.get(`${provider.baseUrl.replace(/\/v1$/, '')}/api/tags`, { timeout: 3000, headers, validateStatus: () => true });
    if (res.status >= 400) return { status: 'error', models: [] as string[], error: `${provider.name || provider.id} models request failed: HTTP ${res.status}` };
    const data = nativeOllama || Array.isArray(res.data?.models) ? res.data?.models : Array.isArray(res.data?.data) ? res.data.data : [];
    const ids = (Array.isArray(data) ? data : []).map((item: any) => String(item?.id || item?.name || '').trim()).filter(Boolean);
    return { status: 'on', models: ids.map((id: string) => id.startsWith(`${provider.id}/`) ? id : `${provider.id}/${id}`) };
  } catch (err: any) {
    return { status: 'error', models: [] as string[], error: `${provider.name || provider.id} is unreachable: ${err.code || err.message || 'request failed'}` };
  }
}

function visibilityIncludes(provider: any, audience: 'internal' | 'partner') {
  const visibility = Array.isArray(provider.visibility) ? provider.visibility : provider.visibility === 'both' ? ['internal', 'partner'] : [provider.visibility || 'internal'];
  return visibility.includes(audience);
}

function canUseProvider(provider: any, ownerType?: string) {
  if (provider.enabled === false) return false;
  return visibilityIncludes(provider, ownerType === 'internal' ? 'internal' : 'partner');
}

async function ownerTypeFromRequest(req: any): Promise<'internal' | 'partner'> {
  const xKey = String(req.headers['x-api-key'] || '').trim();
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  // ponytail: try both headers; ignore dashboard JWT/non-kg bearer tokens.
  for (const key of [xKey, bearer]) {
    const clean = key.replace(/^bearer\s+/i, '').trim();
    if (!clean.startsWith('kg_')) continue;
    const record = await findGatewayKey(clean);
    if (record) return record.owner_type === 'internal' ? 'internal' : 'partner';
  }
  return 'partner';
}

async function gatewayModels(ownerType: 'internal' | 'partner') {
  const providers = (await listProviderConfigs()).filter(provider => canUseProvider(provider, ownerType));
  const groups = await Promise.all(providers.map(async provider => {
    const result = await fetchProviderModels(provider);
    return result.models.map(id => ({ id, provider: provider.id as any, providerModel: id.slice(provider.id.length + 1), enabled: true }));
  }));
  return groups.flat();
}

async function withRag(messages: any[], enabled: boolean) {
  if (!enabled) return messages;
  const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user')?.content;
  if (!lastUser) return messages;
  const cfg = resolveRagConfig();
  const embedding = await createOllamaEmbedding(cfg.ollamaBaseUrl, String(lastUser), cfg.embeddingModel);
  const result = await queryKnowledgeDocsRaw(cfg.chromaBaseUrl, embedding, 4);
  const docs = (result.documents?.[0] || []).filter(Boolean).slice(0, 4);
  if (!docs.length) return messages;
  return [{ role: 'system', content: `Gunakan konteks berikut bila relevan. Jika tidak ada jawaban di konteks, bilang tidak tahu.\n\n${docs.map((d: string, i: number) => `[${i + 1}] ${d}`).join('\n\n')}` }, ...messages];
}

router.get('/', async (req, res) => {
  const ownerType = await ownerTypeFromRequest(req);
  const models = (await gatewayModels(ownerType)).map(model => ({ id: model.id, provider: model.provider }));
  res.json({
    name: 'Kroma AI Gateway',
    base_url: '/v1',
    endpoints: ['/v1', '/v1/providers', '/v1/chat/completions'],
    models,
  });
});

router.get('/providers', async (req, res) => {
  const ownerType = await ownerTypeFromRequest(req);
  const providers = (await listProviderConfigs()).filter(provider => canUseProvider(provider, ownerType));
  const data = await Promise.all(providers.map(async provider => {
    const result = await fetchProviderModels(provider);
    return {
      id: provider.id,
      name: provider.name,
      object: 'provider',
      configured: provider.configured,
      status: result.status,
      error: result.error,
      models: result.models,
    };
  }));
  res.json({ object: 'list', data });
});


router.post('/chat/completions', requireGatewayKey, async (req, res) => {
  const started = Date.now();
  const modelId = String(req.body?.model || '').trim();
  let messages = req.body?.messages;
  if (!modelId) return apiError(res, 400, 'VALIDATION_ERROR', 'model is required', { example: 'pchitam/llama3:latest' });
  if (!modelId.includes('/')) return apiError(res, 400, 'VALIDATION_ERROR', 'model must use provider prefix: prefix/model-name', { received: modelId, example: 'token-router/provider-model-name' });
  if (!Array.isArray(messages)) return apiError(res, 400, 'VALIDATION_ERROR', 'messages must be an array', { example: [{ role: 'user', content: 'Halo' }] });

  const fixedModel = getModel(modelId);
  const prefix = modelId.includes('/') ? modelId.split('/')[0] : '';
  const dynamicProvider = fixedModel ? null : await getProviderConfig(prefix);
  const model = fixedModel || (dynamicProvider ? { id: modelId, provider: dynamicProvider.id as any, providerModel: modelId.slice(prefix.length + 1) || 'default', enabled: true } : undefined);
  if (!model) return apiError(res, 404, 'MODEL_NOT_FOUND', 'model/provider not found', { received: modelId, providerPrefix: prefix, hint: 'Check GET /v1/providers and use one of the returned model ids.' });
  if (!req.gatewayKey) return apiError(res, 401, 'INVALID_API_KEY', 'invalid API key');

  const configured = await getProviderConfig(model.provider);
  const fallback = fixedModel ? getProvider(model.provider as any) : undefined;
  const provider = configured ? { id: configured.id, baseUrl: configured.baseUrl, apiKey: configured.apiKey } : fallback;
  if (!provider) return apiError(res, 404, 'PROVIDER_NOT_FOUND', 'provider not found', { provider: model.provider, hint: 'Create provider in Providers menu.' });
  if (configured && !canUseProvider(configured, req.gatewayKey.owner_type)) return apiError(res, 403, 'PROVIDER_NOT_ALLOWED', 'provider is not available for this API key', { provider: configured.id, visibility: configured.visibility, keyType: req.gatewayKey.owner_type });
  if (provider.id === 'openai' && !provider.apiKey) return apiError(res, 503, 'PROVIDER_NOT_CONFIGURED', 'OpenAI API key is not configured', { provider: provider.id, hint: 'Set provider API key in Providers menu.' });
  messages = await withRag(messages, req.body?.rag === true);

  const estimatedInput = estimateTokens(messages);
  try {
    const stream = req.body?.stream === true;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.apiKey) {
      headers.Authorization = ['Bearer', provider.apiKey].join(' ');
      headers['x-api-key'] = provider.apiKey;
    }

    const nativeOllama = provider.id === 'ollama' && !String(provider.baseUrl).endsWith('/v1');
    if (nativeOllama && stream) return apiError(res, 400, 'VALIDATION_ERROR', 'native Ollama streaming needs /v1 base URL', { baseUrl: provider.baseUrl, fix: 'Use Ollama OpenAI-compatible base URL ending with /v1.' });
    const upstream = await axios.post(
      nativeOllama ? `${provider.baseUrl}/api/chat` : `${provider.baseUrl}/chat/completions`,
      nativeOllama ? { model: model.providerModel, messages, stream: false } : { ...req.body, messages, model: model.providerModel, stream },
      { timeout: config.defaultTimeoutMs, responseType: stream ? 'stream' : 'json', headers, validateStatus: () => true }
    );

    if (stream) {
      if (upstream.status >= 400) return apiError(res, 502, 'PROVIDER_ERROR', 'provider stream failed', { provider: provider.id, upstreamStatus: upstream.status, model: model.providerModel });
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let output = '';
      upstream.data.on('data', (chunk: Buffer) => { const raw = chunk.toString('utf8'); output += extractSseContent(raw); res.write(raw); });
      upstream.data.on('end', async () => {
        const outputTokens = estimateTokens(output);
        await Promise.allSettled([touchGatewayKey(req.gatewayKey!.id), logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, apiId: model.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, outputTokens, totalTokens: estimatedInput + outputTokens, latencyMs: Date.now() - started, statusCode: 200, ipAddress: req.ip, userAgent: req.get('user-agent') })]);
        res.end();
      });
      upstream.data.on('error', async (err: any) => {
        await logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, totalTokens: estimatedInput, latencyMs: Date.now() - started, statusCode: 502, errorMessage: err.message, ipAddress: req.ip, userAgent: req.get('user-agent') });
        res.end();
      });
      return;
    }

    const responseData = nativeOllama ? {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model.id,
      choices: [{ index: 0, message: { role: 'assistant', content: upstream.data?.message?.content || '' }, finish_reason: upstream.data?.done ? 'stop' : null }],
    } : upstream.data;
    const usage = responseData?.usage || {};
    const outputTokens = Number(usage.completion_tokens) || estimateTokens(responseData?.choices?.[0]?.message?.content || responseData);
    const inputTokens = Number(usage.prompt_tokens) || estimatedInput;
    const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens;
    await Promise.allSettled([touchGatewayKey(req.gatewayKey.id), logUsage({ userId: 0, apiKeyId: req.gatewayKey.id, apiId: model.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens, outputTokens, totalTokens, latencyMs: Date.now() - started, statusCode: upstream.status, errorMessage: upstream.status >= 400 ? JSON.stringify(upstream.data).slice(0, 500) : undefined, ipAddress: req.ip, userAgent: req.get('user-agent') })]);

    if (upstream.status >= 400) return apiError(res, 502, 'PROVIDER_ERROR', upstream.data?.error?.message || upstream.data?.message || 'provider request failed', { provider: provider.id, upstreamStatus: upstream.status, upstreamBaseUrl: provider.baseUrl, providerModel: model.providerModel });
    res.status(upstream.status).json(responseData);
  } catch (err: any) {
    await logUsage({ userId: 0, apiKeyId: req.gatewayKey.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, totalTokens: estimatedInput, latencyMs: Date.now() - started, statusCode: 502, errorMessage: err.message, ipAddress: req.ip, userAgent: req.get('user-agent') });
    apiError(res, 502, 'PROVIDER_ERROR', err.message || 'provider request failed', { provider: provider.id, upstreamBaseUrl: provider.baseUrl, providerModel: model.providerModel });
  }
});

export default router;
