import { Router } from 'express';
import axios from 'axios';
import { listModels, getModel } from '../ai/models.js';
import { getProvider } from '../ai/providers.js';
import { fetchCustomProviderModels, providerChatTargets, providerHeaders, openAiCompatibleBody, nativeOllamaBody, nativeOllamaToOpenAI, canUseProvider, visibleProviders } from '../ai/customProvider.js';
import { COMMANDCODE_GO_MODELS, commandCodeBody, commandCodeHeaders, commandCodeToOpenAI } from '../ai/special/commandCodeGo.js';
import { OPENCODE_GO_MODELS, OPENCODE_MESSAGES_MODELS, openCodeMessagesBody, openCodeMessagesToOpenAI } from '../ai/special/openCodeGo.js';
import { requireGatewayKey } from '../middleware/internalApiKey.middleware.js';
import { findGatewayKey, touchGatewayKey } from '../services/internalApiKey.service.js';
import { logUsage } from '../services/usageLog.service.js';
import { config } from '../config.js';
import { getProviderConfig, listProviderConfigs } from '../services/providerConfig.service.js';

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
  if (provider.id === 'opencode-go') {
    return { status: provider.apiKey ? 'on' : 'not_configured', models: provider.apiKey ? OPENCODE_GO_MODELS.map(id => `${provider.id}/${id}`) : [] as string[], error: provider.apiKey ? undefined : 'OpenCode Go API key is not configured' };
  }
  if (provider.id === 'commandcode-go') {
    return { status: provider.apiKey ? 'on' : 'not_configured', models: provider.apiKey ? COMMANDCODE_GO_MODELS.map(id => `${provider.id}/${id}`) : [] as string[], error: provider.apiKey ? undefined : 'Command Code Go API key is not configured' };
  }
  if (provider.id === 'openai' && !provider.apiKey) {
    return { status: 'not_configured', models: [] as string[], error: 'OpenAI API key is not configured' };
  }
  return fetchCustomProviderModels(provider);
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
    return result.models.map(id => {
      const checked = provider.model_checks?.[id];
      return {
        id,
        object: 'model',
        created: 0,
        owned_by: provider.id,
        provider: provider.id as any,
        provider_name: provider.name,
        providerModel: id.slice(provider.id.length + 1),
        status: checked?.status || 'unknown',
        error: checked?.error || result.error,
        checked_at: checked?.checked_at,
      };
    });
  }));
  return groups.flat();
}

async function logGatewayFailure(req: any, modelSlug: string, statusCode: number, errorMessage: string, started: number) {
  if (!req.gatewayKey) return;
  await Promise.allSettled([
    touchGatewayKey(req.gatewayKey.id),
    logUsage({ userId: 0, apiKeyId: req.gatewayKey.id, endpoint: req.path || '/v1', modelSlug, inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: Date.now() - started, statusCode, errorMessage, ipAddress: req.ip, userAgent: req.get('user-agent') }),
  ]);
}

router.get('/', async (req, res) => {
  const ownerType = await ownerTypeFromRequest(req);
  const models = await gatewayModels(ownerType);
  res.json({
    name: 'Kroma AI Gateway',
    base_url: '/v1',
    endpoints: ['/v1', '/v1/models', '/v1/chat/completions'],
    models,
  });
});

router.get('/models', requireGatewayKey, async (req, res) => {
  const started = Date.now();
  const ownerType = req.gatewayKey?.owner_type === 'internal' ? 'internal' : 'partner';
  const models = await gatewayModels(ownerType);
  await Promise.allSettled([touchGatewayKey(req.gatewayKey!.id), logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, endpoint: '/v1/models', modelSlug: 'model-list', inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: Date.now() - started, statusCode: 200, ipAddress: req.ip, userAgent: req.get('user-agent') })]);
  res.json({ object: 'list', data: models });
});


router.post('/chat/completions', requireGatewayKey, async (req, res) => {
  const started = Date.now();
  const modelId = String(req.body?.model || '').trim();
  let messages = req.body?.messages;
  if (!modelId) { await logGatewayFailure(req, '-', 400, 'model is required', started); return apiError(res, 400, 'VALIDATION_ERROR', 'model is required', { example: 'pchitam/llama3:latest' }); }
  if (!modelId.includes('/')) { await logGatewayFailure(req, modelId, 400, 'model must use provider prefix', started); return apiError(res, 400, 'VALIDATION_ERROR', 'model must use provider prefix: prefix/model-name', { received: modelId, example: 'token-router/provider-model-name' }); }
  if (!Array.isArray(messages)) { await logGatewayFailure(req, modelId, 400, 'messages must be an array', started); return apiError(res, 400, 'VALIDATION_ERROR', 'messages must be an array', { example: [{ role: 'user', content: 'Halo' }] }); }

  const fixedModel = getModel(modelId);
  const prefix = modelId.includes('/') ? modelId.split('/')[0] : '';
  const dynamicProvider = fixedModel ? null : await getProviderConfig(prefix);
  const model = fixedModel || (dynamicProvider ? { id: modelId, provider: dynamicProvider.id as any, providerModel: modelId.slice(prefix.length + 1) || 'default', enabled: true } : undefined);
  if (!model) { await logGatewayFailure(req, modelId, 404, 'model/provider not found', started); return apiError(res, 404, 'MODEL_NOT_FOUND', 'model/provider not found', { received: modelId, providerPrefix: prefix, hint: 'Check GET /v1/models and use one of the returned model ids.' }); }
  if (!req.gatewayKey) return apiError(res, 401, 'INVALID_API_KEY', 'invalid API key');

  const configured = await getProviderConfig(model.provider);
  const fallback = fixedModel ? getProvider(model.provider as any) : undefined;
  const provider = configured ? { id: configured.id, baseUrl: configured.baseUrl, apiKey: configured.apiKey } : fallback;
  if (!provider) { await logGatewayFailure(req, modelId, 404, 'provider not found', started); return apiError(res, 404, 'PROVIDER_NOT_FOUND', 'provider not found', { provider: model.provider, hint: 'Create provider in Providers menu.' }); }
  if (configured && !canUseProvider(configured, req.gatewayKey.owner_type)) { await logGatewayFailure(req, modelId, 403, 'provider not available for this API key', started); return apiError(res, 403, 'PROVIDER_NOT_ALLOWED', 'provider is not available for this API key', { provider: configured.id, visibility: configured.visibility, keyType: req.gatewayKey.owner_type }); }
  if (provider.id === 'openai' && !provider.apiKey) { await logGatewayFailure(req, modelId, 503, 'OpenAI API key is not configured', started); return apiError(res, 503, 'PROVIDER_NOT_CONFIGURED', 'OpenAI API key is not configured', { provider: provider.id, hint: 'Set provider API key in Providers menu.' }); }
  const estimatedInput = estimateTokens(messages);
  try {
    const stream = req.body?.stream === true;
    const headers = providerHeaders(provider, true);

    let nativeOllama = false;
    let opencodeMessages = false;
    let upstream: any = null;
    let triedChat: string[] = [];

    if (provider.id === 'commandcode-go') {
      if (stream) return apiError(res, 400, 'VALIDATION_ERROR', 'Command Code Go is non-streaming in Kroma MVP', { provider: provider.id, model: model.providerModel });
      const url = provider.baseUrl;
      const body = commandCodeBody(model.providerModel, req.body, messages);
      triedChat.push(url);
      const raw = await axios.post(url, body, { timeout: config.defaultTimeoutMs, responseType: 'text', headers: commandCodeHeaders(headers), validateStatus: () => true, transformResponse: [(data) => data] });
      upstream = { ...raw, data: raw.status >= 400 ? (() => { try { return JSON.parse(raw.data); } catch { return { error: { message: raw.data } }; } })() : commandCodeToOpenAI(raw.data, model.id) };
    } else if (provider.id === 'opencode-go' && OPENCODE_MESSAGES_MODELS.has(model.providerModel)) {
      if (stream) return apiError(res, 400, 'VALIDATION_ERROR', 'OpenCode Go messages models are non-streaming in Kroma MVP', { provider: provider.id, model: model.providerModel });
      triedChat.push(`${provider.baseUrl}/messages`);
      upstream = await axios.post(`${provider.baseUrl}/messages`, openCodeMessagesBody(req.body, model.providerModel), { timeout: config.defaultTimeoutMs, responseType: 'json', headers: { ...headers, 'anthropic-version': '2023-06-01' }, validateStatus: () => true });
      opencodeMessages = true;
    } else for (const target of providerChatTargets(provider)) {
      if (stream && target.native) continue;
      triedChat.push(target.url);
      const body = target.native ? nativeOllamaBody(req.body, model.providerModel) : openAiCompatibleBody({ ...req.body, messages, stream }, model.providerModel);
      const candidate = await axios.post(target.url, body, { timeout: config.defaultTimeoutMs, responseType: stream ? 'stream' : 'json', headers, validateStatus: () => true });
      upstream = candidate;
      nativeOllama = target.native;
      if (candidate.status !== 404) break;
    }

    if (stream) {
      if (upstream.status >= 400) return apiError(res, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, 'PROVIDER_ERROR', 'provider stream failed', { provider: provider.id, upstreamStatus: upstream.status, model: model.providerModel });
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

    const responseData = nativeOllama
      ? nativeOllamaToOpenAI(upstream.data, model.id, model.providerModel)
      : opencodeMessages
        ? openCodeMessagesToOpenAI(upstream.data, model.id, model.providerModel)
        : upstream.data;
    const usage = responseData?.usage || {};
    const outputTokens = Number(usage.completion_tokens) || estimateTokens(responseData?.choices?.[0]?.message?.content || responseData);
    const inputTokens = Number(usage.prompt_tokens) || estimatedInput;
    const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens;
    await Promise.allSettled([touchGatewayKey(req.gatewayKey.id), logUsage({ userId: 0, apiKeyId: req.gatewayKey.id, apiId: model.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens, outputTokens, totalTokens, latencyMs: Date.now() - started, statusCode: upstream.status, errorMessage: upstream.status >= 400 ? JSON.stringify(upstream.data).slice(0, 500) : undefined, ipAddress: req.ip, userAgent: req.get('user-agent') })]);

    if (upstream.status >= 400) {
      const providerMessage = upstream.data?.error?.message || upstream.data?.message || 'provider request failed';
      const providerCode = upstream.data?.error?.code || upstream.data?.code || 'PROVIDER_ERROR';
      const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
      return apiError(res, status, 'PROVIDER_ERROR', providerMessage, { provider: provider.id, providerCode, upstreamStatus: upstream.status, upstreamBaseUrl: provider.baseUrl, tried: triedChat, providerModel: model.providerModel });
    }
    res.status(upstream.status).json(responseData);
  } catch (err: any) {
    await logUsage({ userId: 0, apiKeyId: req.gatewayKey.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, totalTokens: estimatedInput, latencyMs: Date.now() - started, statusCode: 502, errorMessage: err.message, ipAddress: req.ip, userAgent: req.get('user-agent') });
    apiError(res, 502, 'PROVIDER_ERROR', err.message || 'provider request failed', { provider: provider.id, upstreamBaseUrl: provider.baseUrl, providerModel: model.providerModel });
  }
});

export default router;
