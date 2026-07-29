import { Router } from 'express';
import axios from 'axios';
import { providerChatTargets, providerHeaders, nativeOllamaToOpenAI, canUseProvider, buildChatBody } from '../ai/customProvider.js';
import { commandCodeBody, commandCodeHeaders, commandCodeToOpenAI } from '../ai/special/commandCodeGo.js';
import { requireGatewayKey } from '../middleware/internalApiKey.middleware.js';
import { touchGatewayKey } from '../services/internalApiKey.service.js';
import { logUsage } from '../services/usageLog.service.js';
import { listGatewayModels, ownerTypeFromRequest } from '../ai/modelCatalog.js';
import { config } from '../config.js';
import { getProviderConfig } from '../services/providerConfig.service.js';

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


async function logGatewayFailure(req: any, modelId: string, statusCode: number, message: string, started: number) {
  if (!req.gatewayKey) return;
  await Promise.allSettled([
    touchGatewayKey(req.gatewayKey.id),
    logUsage({
      userId: 0,
      apiKeyId: req.gatewayKey.id,
      endpoint: '/v1/chat/completions',
      modelSlug: modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - started,
      statusCode,
      errorMessage: message,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    }),
  ]);
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

async function gatewayModels(ownerType: 'internal' | 'partner') {
  return listGatewayModels(ownerType);
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
  if (!modelId) { await logGatewayFailure(req, '-', 400, 'model is required', started); return apiError(res, 400, 'VALIDATION_ERROR', 'model is required', { example: 'groq/llama-3.3-70b-versatile' }); }
  if (!modelId.includes('/')) { await logGatewayFailure(req, modelId, 400, 'model must use provider prefix', started); return apiError(res, 400, 'VALIDATION_ERROR', 'model must use provider prefix: prefix/model-name', { received: modelId, example: 'groq/provider-model-name' }); }
  if (!Array.isArray(messages)) { await logGatewayFailure(req, modelId, 400, 'messages must be an array', started); return apiError(res, 400, 'VALIDATION_ERROR', 'messages must be an array', { example: [{ role: 'user', content: 'Halo' }] }); }

  const prefix = modelId.includes('/') ? modelId.split('/')[0] : '';
  const configured = prefix ? await getProviderConfig(prefix) : null;
  const model = configured ? { id: modelId, provider: configured.id, providerModel: modelId.slice(prefix.length + 1) || 'default', enabled: true } : undefined;
  if (!model) { await logGatewayFailure(req, modelId, 404, 'model/provider not found', started); return apiError(res, 404, 'MODEL_NOT_FOUND', 'model/provider not found', { received: modelId, providerPrefix: prefix, hint: 'Check GET /v1/models and use one of the returned model ids.' }); }
  if (!req.gatewayKey) return apiError(res, 401, 'INVALID_API_KEY', 'invalid API key');

  const provider = configured ? { id: configured.id, baseUrl: configured.baseUrl, apiKey: configured.apiKey, chatPath: configured.chatPath, modelsPath: configured.modelsPath, name: configured.name, enabled: configured.enabled, visibility: configured.visibility, chatFormat: (configured as any).chatFormat || 'openai' } : null;
  if (!provider) { await logGatewayFailure(req, modelId, 404, 'provider not found', started); return apiError(res, 404, 'PROVIDER_NOT_FOUND', 'provider not found', { provider: model.provider, hint: 'Check GET /v1/models.' }); }
  if (!canUseProvider(provider, req.gatewayKey.owner_type)) { await logGatewayFailure(req, modelId, 403, 'provider not available for this API key', started); return apiError(res, 403, 'PROVIDER_NOT_ALLOWED', 'provider is not available for this API key', { provider: provider.id, key_type: req.gatewayKey.owner_type }); }
  const estimatedInput = estimateTokens(messages);
  try {
    const stream = req.body?.stream === true;
    const headers = providerHeaders(provider, true);

    let nativeOllama = false;
    let upstream: any = null;
    let triedChat: string[] = [];

    if (provider.id === 'commandcode-go') {
      const url = provider.baseUrl;
      const body = commandCodeBody(model.providerModel, req.body, messages);
      const ccHeaders = commandCodeHeaders(headers);
      console.log('[DEBUG] CommandCode Go request:', JSON.stringify({ url, headers: ccHeaders, bodyKeys: Object.keys(body), paramsKeys: Object.keys(body.params || {}), hasTools: !!body.params?.tools, stream }));
      triedChat.push(url);
      if (stream) {
        const raw = await axios.post(url, body, { timeout: config.defaultTimeoutMs, responseType: 'stream', headers: ccHeaders, validateStatus: () => true });
        if (raw.status >= 400) return apiError(res, raw.status >= 400 && raw.status < 500 ? raw.status : 502, 'PROVIDER_ERROR', 'provider stream failed', { provider: provider.id, upstreamStatus: raw.status, model: model.providerModel });
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        let output = '';
        const chatId = `chatcmpl-${Date.now()}`;
        raw.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            let event: any;
            try { event = JSON.parse(line.startsWith('data:') ? line.slice(5).trim() : line); } catch { continue; }
            if (event.type === 'text-delta' && (event.text || event.delta)) {
              const sse = `data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: event.text || event.delta }, finish_reason: null }] })}\n\n`;
              output += event.text || event.delta || '';
              res.write(sse);
            }
            // reasoning-delta is intentionally dropped — prevents COT leak to client
            if (event.type === 'error') {
              const sse = `data: ${JSON.stringify({ error: { message: typeof event.error === 'string' ? event.error : JSON.stringify(event.error || event.message || 'Command Code error') } })}\n\n`;
              res.write(sse);
            }
          }
        });
        raw.data.on('end', async () => {
          const endSse = `data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
          res.write(endSse);
          const outputTokens = estimateTokens(output);
          await Promise.allSettled([touchGatewayKey(req.gatewayKey!.id), logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, apiId: model.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, outputTokens, totalTokens: estimatedInput + outputTokens, latencyMs: Date.now() - started, statusCode: 200, ipAddress: req.ip, userAgent: req.get('user-agent') })]);
          res.end();
        });
        raw.data.on('error', async (err: any) => {
          // Write SSE error so the client knows the stream aborted, not just truncated.
          res.write(`data: ${JSON.stringify({ error: { message: err.message || 'stream error', code: 'STREAM_ERROR' } })}\n\n`);
          await logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, totalTokens: estimatedInput, latencyMs: Date.now() - started, statusCode: 502, errorMessage: err.message, ipAddress: req.ip, userAgent: req.get('user-agent') });
          res.end();
        });
        return;
      }
      const raw = await axios.post(url, body, { timeout: config.defaultTimeoutMs, responseType: 'text', headers: commandCodeHeaders(headers), validateStatus: () => true, transformResponse: [(data) => data] });
      upstream = { ...raw, data: raw.status >= 400 ? (() => { try { return JSON.parse(raw.data); } catch { return { error: { message: raw.data } }; } })() : commandCodeToOpenAI(raw.data, model.id) };
    } else for (const target of providerChatTargets(provider)) {
      if (stream && target.native) continue;
      triedChat.push(target.url);
      const body = buildChatBody(provider, messages, model.providerModel, { ...req.body, stream });
      console.log('[DEBUG] Custom provider request:', JSON.stringify({ url: target.url, providerId: provider.id, chatFormat: provider.chatFormat, bodyKeys: Object.keys(body), hasTools: !!body.tools, hasToolChoice: !!body.tool_choice, messageCount: body.messages?.length, stream }));
      const candidate = await axios.post(target.url, body, { timeout: config.defaultTimeoutMs, responseType: stream ? 'stream' : 'json', headers, validateStatus: () => true });
      upstream = candidate;
      nativeOllama = target.native;
      if (candidate.status !== 404) break;
    }

    if (stream) {
      if (!upstream) return apiError(res, 502, 'PROVIDER_ERROR', 'no upstream target resolved', { provider: provider.id });
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
        res.write(`data: ${JSON.stringify({ error: { message: err.message || 'stream error', code: 'STREAM_ERROR' } })}\n\n`);
        await logUsage({ userId: 0, apiKeyId: req.gatewayKey!.id, endpoint: '/v1/chat/completions', modelSlug: model.id, inputTokens: estimatedInput, totalTokens: estimatedInput, latencyMs: Date.now() - started, statusCode: 502, errorMessage: err.message, ipAddress: req.ip, userAgent: req.get('user-agent') });
        res.end();
      });
      return;
    }

    const responseData = nativeOllama
      ? nativeOllamaToOpenAI(upstream.data, model.id, model.providerModel)
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
