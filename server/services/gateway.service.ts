import axios from 'axios';
import { config } from '../config.js';
import { db } from './db.service.js';
import { LRUCache } from '../utils/cache.js';
import type { AsyncJob, AsyncJobStatus } from '../types/index.js';
import {
  sleep, isValidHttpUrl, isActiveLike, toNumericId,
  getEffectiveTimeoutMs, applyTargetAuthHeaders,
  buildFallbackTargetUrl, derivePromptFromMessages, extractUniversalTextContent,
  isPrivateOrLocalHost, resolvesToPrivateOrLocalAddress
} from '../utils/helpers.js';

// --- Async Jobs Store (LRU with TTL) ---
const asyncJobs = new LRUCache<string, AsyncJob>(500, 30 * 60 * 1000); // max 500 jobs, 30min TTL

export async function getAsyncJob(id: string): Promise<AsyncJob | undefined> {
  const cached = asyncJobs.get(id);
  if (cached) return cached;
  try {
    const row = await db.findById('async_jobs', id);
    if (!row) return undefined;
    const job: AsyncJob = {
      id: String(row.id),
      status: row.status,
      endpoint: row.endpoint,
      user_id: row.user_id,
      created_at: Number(row.created_at) || Date.now(),
      updated_at: Number(row.updated_at) || Date.now(),
      result: typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
      error: typeof row.error === 'string' ? JSON.parse(row.error) : row.error,
    };
    asyncJobs.set(job.id, job);
    return job;
  } catch {
    return undefined;
  }
}

export function setAsyncJob(job: AsyncJob): void {
  asyncJobs.set(job.id, job);
  const payload = {
    status: job.status,
    endpoint: job.endpoint,
    created_at: job.created_at,
    updated_at: job.updated_at,
    result: job.result === undefined ? null : JSON.stringify(job.result),
    error: job.error === undefined ? null : JSON.stringify(job.error),
  };
  db.update('async_jobs', job.id, payload).catch(async () => {
    try { await db.create('async_jobs', { id: job.id, ...payload }); } catch { /* optional persistence */ }
  });
}

// --- Retry Logic ---
function shouldRetryUpstreamError(error: any): boolean {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN') return true;
  const status = Number(error?.response?.status || 0);
  if (status >= 500 && status < 600) return true;
  const detail = String(
    error?.response?.data?.error?.message || error?.response?.data?.error ||
    error?.response?.data?.detail || error?.message || ''
  ).toLowerCase();
  return detail.includes('timeout') || detail.includes('timed out');
}

async function requestUpstreamWithRetry(axiosConfig: any, retries = config.gatewayRetryMax) {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios(axiosConfig);
    } catch (error: any) {
      lastError = error;
      if (attempt >= retries || !shouldRetryUpstreamError(error)) throw error;
      const delay = config.gatewayRetryBackoffMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function requestUpstreamWithUrlFallback(
  baseConfig: any, fallbackUrl: string | null, retries?: number
): Promise<{ response: any; used_fallback: boolean; attempted_url: string; fallback_url?: string }> {
  const firstResponse = await requestUpstreamWithRetry(baseConfig, retries);
  if (!fallbackUrl || fallbackUrl === baseConfig.url) {
    return { response: firstResponse, used_fallback: false, attempted_url: String(baseConfig.url || '') };
  }
  if (firstResponse.status === 404 || firstResponse.status === 405) {
    const secondResponse = await requestUpstreamWithRetry({ ...baseConfig, url: fallbackUrl }, retries);
    return { response: secondResponse, used_fallback: true, attempted_url: String(baseConfig.url || ''), fallback_url: fallbackUrl };
  }
  return { response: firstResponse, used_fallback: false, attempted_url: String(baseConfig.url || '') };
}

// --- Billing Helpers ---
const usageLocks = new Map<string, Promise<void>>();

async function withUserUsageLock<T>(userId: string | number, fn: () => Promise<T>): Promise<T> {
  const key = String(userId);
  const previous = usageLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  usageLocks.set(key, previous.then(() => current, () => current));
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (usageLocks.get(key) === current) usageLocks.delete(key);
  }
}

/** Write to credit_ledger table for audit trail */
export async function logCreditLedger(entry: {
  user_id: string | number;
  type: string; // 'reservation' | 'charge' | 'refund' | 'purchase' | 'admin_grant'
  amount: number;
  balance_after?: number;
  reason?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await db.create('credit_ledger', {
      user_id: entry.user_id,
      type: entry.type,
      amount: entry.amount,
      balance_after: entry.balance_after || 0,
      reason: entry.reason || '',
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
  } catch (err: any) {
    // Non-fatal — log but don't block billing
    console.error('[Ledger] Failed to write ledger entry:', err.message);
  }
}

export async function putUserUsage(userId: string | number, usageCount: number): Promise<void> {
  await db.update('users', userId, { usage_count: Math.round(Number(usageCount) || 0) });
}

export async function reserveUserCredits(userId: string | number, amount: number): Promise<{ usage_count: number; quota_limit: number; remaining: number }> {
  const required = Math.max(0, Math.round(Number(amount) || 0));
  return withUserUsageLock(userId, async () => {
    // Atomic check-and-reserve: only succeeds if remaining >= required
    const sql = `UPDATE users SET usage_count = COALESCE(usage_count, 0) + ? WHERE id = ? AND (COALESCE(quota_limit, 0) - COALESCE(usage_count, 0)) >= ?`;
    const result = await db.query<any>(sql, [required, userId, required]);
    const affectedRows = result?.affectedRows ?? 0;

    if (affectedRows === 0 && required > 0) {
      // Either user doesn't exist or insufficient credits
      const user = await db.findById('users', userId);
      if (!user) {
        const error: any = new Error('User not found.');
        error.statusCode = 404;
        throw error;
      }
      const quotaLimit = Number(user?.quota_limit) || 0;
      const current = Number(user?.usage_count) || 0;
      const remaining = quotaLimit - current;
      const error: any = new Error('Insufficient credits.');
      error.statusCode = 402;
      error.remaining = remaining;
      error.required = required;
      throw error;
    }

    // Read updated values for response
    const user = await db.findById('users', userId);
    const quotaLimit = Number(user?.quota_limit) || 0;
    const usageCount = Number(user?.usage_count) || 0;

    if (required > 0) {
      logCreditLedger({
        user_id: userId,
        type: 'reservation',
        amount: required,
        balance_after: quotaLimit - usageCount,
        reason: 'API request reservation',
      });
    }

    return { usage_count: usageCount, quota_limit: quotaLimit, remaining: quotaLimit - usageCount };
  });
}

export async function adjustUserUsageSafely(userId: string | number, delta: number): Promise<number> {
  return withUserUsageLock(userId, async () => {
    const rounded = Math.round(delta);
    if (rounded === 0) {
      const user = await db.findById('users', userId);
      return Number(user?.usage_count) || 0;
    }

    if (rounded > 0) {
      // Charge — just increment
      await db.atomicIncrement('users', userId, 'usage_count', rounded);
    } else {
      // Refund — decrement but never go below 0
      const sql = `UPDATE users SET usage_count = GREATEST(0, COALESCE(usage_count, 0) + ?) WHERE id = ?`;
      await db.query(sql, [rounded, userId]);
    }

    const user = await db.findById('users', userId);
    return Number(user?.usage_count) || 0;
  });
}

export async function refundUsageSafely(userId: string | number, amount: number): Promise<void> {
  if (amount <= 0) return;
  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await adjustUserUsageSafely(userId, -amount);
      const user = await db.findById('users', userId);
      const quotaLimit = Number(user?.quota_limit) || 0;
      const usageCount = Number(user?.usage_count) || 0;
      logCreditLedger({
        user_id: userId,
        type: 'refund',
        amount: amount,
        balance_after: quotaLimit - usageCount,
        reason: 'API request failure refund',
      });
      return; // success
    } catch (err: any) {
      lastError = err;
      if (attempt < 2) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  // All retries failed — log for manual reconciliation
  console.error('[Gateway] CRITICAL: Failed to refund after 3 attempts:', lastError?.message, 'userId:', userId, 'amount:', amount);
  logCreditLedger({
    user_id: userId,
    type: 'refund',
    amount: amount,
    reason: `FAILED REFUND — manual reconciliation needed: ${lastError?.message}`,
    metadata: { failed: true, attempts: 3 },
  });
}

export function isAllowedGatewayTargetUrl(targetUrl: string): boolean {
  if (!isValidHttpUrl(targetUrl)) return false;
  if (config.allowPrivateGatewayTargets) return true;
  try {
    return !isPrivateOrLocalHost(new URL(targetUrl).hostname);
  } catch {
    return false;
  }
}

export async function isAllowedGatewayTargetUrlStrict(targetUrl: string): Promise<boolean> {
  if (!isAllowedGatewayTargetUrl(targetUrl)) return false;
  if (config.allowPrivateGatewayTargets) return true;
  try {
    return !(await resolvesToPrivateOrLocalAddress(new URL(targetUrl).hostname));
  } catch {
    return false;
  }
}

// --- API Lookup ---
export async function lookupApiByEndpoint(requestedPath: string) {
  const results = await db.findWhere('apis', 'endpoint', requestedPath);
  return Array.isArray(results) ? results : [];
}

// --- Request Body Preparation ---
export function prepareRequestBody(body: any, api: any): any {
  let requestBody = { ...body };

  // Remove gateway-only control flags
  delete requestBody.async;
  delete requestBody.future_async;
  delete requestBody.api_id;

  // Inject Admin Config: Model Slug
  if (api.model_slug) requestBody.model = api.model_slug;

  // Inject Admin Config: Max Tokens
  if (api.max_tokens) requestBody.max_tokens = api.max_tokens;

  // Inject Admin Config: Temperature default
  if (requestBody.temperature === undefined && api.default_temperature !== undefined) {
    requestBody.temperature = Number(api.default_temperature);
  }

  // Inject advanced defaults
  if (requestBody.top_p === undefined && api.default_top_p !== undefined) {
    requestBody.top_p = Number(api.default_top_p);
  }
  if (requestBody.top_k === undefined && api.default_top_k !== undefined) {
    requestBody.top_k = Number(api.default_top_k);
  }
  if (requestBody.speed_mode === undefined && api.speed_mode !== undefined) {
    requestBody.speed_mode = String(api.speed_mode);
  }

  // Input guard: truncate long messages
  if (api.max_input_chars && Array.isArray(requestBody.messages)) {
    const maxChars = Number(api.max_input_chars) || 0;
    if (maxChars > 0) {
      requestBody.messages = requestBody.messages.map((m: any) => {
        if (typeof m?.content === 'string' && m.content.length > maxChars) {
          return { ...m, content: m.content.slice(0, maxChars) };
        }
        return m;
      });
    }
  }

  // Trim messages to max allowed
  if (Array.isArray(requestBody.messages) && requestBody.messages.length > config.gatewayMaxMessages) {
    const first = requestBody.messages[0];
    const hasSystem = first?.role === 'system';
    const keepTail = hasSystem ? Math.max(config.gatewayMaxMessages - 1, 1) : config.gatewayMaxMessages;
    requestBody.messages = hasSystem
      ? [first, ...requestBody.messages.slice(-keepTail)]
      : requestBody.messages.slice(-keepTail);
  }

  // Derive prompt from messages for compatibility
  if (
    (requestBody.prompt === undefined || String(requestBody.prompt).trim() === '') &&
    Array.isArray(requestBody.messages) && requestBody.messages.length > 0
  ) {
    const derivedPrompt = derivePromptFromMessages(requestBody.messages);
    if (derivedPrompt) requestBody.prompt = derivedPrompt;
  }

  // Stream control
  const streamFromAdmin = api.is_streaming === 1 || api.is_streaming === true || api.is_streaming === 'true';
  if (body.stream !== undefined) {
    requestBody.stream = !!body.stream;
  } else {
    requestBody.stream = streamFromAdmin;
  }

  // ── Image API adapter: Convert OpenAI format to SD WebUI format ──
  if (api.type === 'text-to-image') {
    // Convert size "1024x1024" to width/height
    if (requestBody.size && typeof requestBody.size === 'string') {
      const [w, h] = requestBody.size.split('x').map(Number);
      if (w && h) {
        requestBody.width = w;
        requestBody.height = h;
      }
      delete requestBody.size;
    }

    // Convert n to batch_size
    if (requestBody.n !== undefined) {
      requestBody.batch_size = requestBody.n;
      delete requestBody.n;
    }

    // Set SD WebUI defaults if not provided
    if (requestBody.steps === undefined) requestBody.steps = 20;
    if (requestBody.cfg_scale === undefined) requestBody.cfg_scale = 7;
    if (requestBody.n_iter === undefined) requestBody.n_iter = 1;
    if (requestBody.seed === undefined) requestBody.seed = -1;
    if (requestBody.sampler_name === undefined) requestBody.sampler_name = 'Euler a';
    if (requestBody.scheduler === undefined) requestBody.scheduler = 'Automatic';
    if (requestBody.negative_prompt === undefined) requestBody.negative_prompt = '';
    if (requestBody.width === undefined) requestBody.width = 512;
    if (requestBody.height === undefined) requestBody.height = 512;

    // Remove OpenAI-specific fields that SD WebUI doesn't understand
    delete requestBody.messages;
    delete requestBody.model;
    delete requestBody.stream;
    delete requestBody.temperature;
    delete requestBody.max_tokens;
    delete requestBody.top_p;
    delete requestBody.top_k;
  }

  return requestBody;
}

// --- Response Normalization ---
export function normalizeResponse(responseData: any, api: any): any {
  // Parse string response
  if (typeof responseData === 'string') {
    try {
      responseData = JSON.parse(responseData);
    } catch {
      if (responseData.length > 100 && !responseData.includes(' ')) {
        responseData = { images: [responseData] };
      } else {
        responseData = { content: responseData };
      }
    }
  }

  if (typeof responseData !== 'object' || responseData === null) {
    responseData = { content: String(responseData) };
  }

  // Image adapter: images[] -> data[]
  if (Array.isArray(responseData.images) && !Array.isArray(responseData.data)) {
    responseData.data = responseData.images.map((b64: string) => ({ b64_json: b64 }));
  }

  // Text adapter: normalize to OpenAI chat completion format
  if (!responseData.choices && !responseData.images && !responseData.data) {
    const content = extractUniversalTextContent(responseData);
    if (content) {
      responseData = {
        id: 'gen-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: api.model_slug || api.name,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: responseData.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
  }

  // Completion style -> chat style
  if (responseData.choices && Array.isArray(responseData.choices) &&
    !responseData.choices[0]?.message?.content && responseData.choices[0]?.text) {
    responseData.choices = responseData.choices.map((c: any, idx: number) => ({
      index: c.index ?? idx,
      message: { role: 'assistant', content: c.text || '' },
      finish_reason: c.finish_reason ?? 'stop'
    }));
  }

  // Ensure stable metadata
  if (!responseData.id) responseData.id = 'gen-' + Date.now();
  if (!responseData.created) responseData.created = Math.floor(Date.now() / 1000);
  if (!responseData.object) {
    responseData.object = responseData.choices ? 'chat.completion' : 'image.generation';
  }

  // Override model name with admin setting
  if (api.model_slug) responseData.model = api.model_slug;

  return responseData;
}

// --- Token Estimation ---
/**
 * Rough token estimate: ~4 chars per token (industry standard approximation).
 * Used for streaming billing where we can't rely on usage metadata.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- Usage Logging ---
// ponytail: fire-and-forget, never blocks the gateway response
export async function logUsage(params: {
  userId: string | number;
  apiId?: string | number;
  apiKeyId?: string;
  endpoint: string;
  modelSlug?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.create('usage_logs', {
      user_id: params.userId,
      api_id: params.apiId || null,
      api_key_id: params.apiKeyId || null,
      endpoint: params.endpoint,
      model_slug: params.modelSlug || null,
      input_tokens: params.inputTokens || 0,
      output_tokens: params.outputTokens || 0,
      total_tokens: params.totalTokens || 0,
      cost: params.cost || 0,
      latency_ms: params.latencyMs || 0,
      status_code: params.statusCode || 200,
      error_code: params.errorCode || null,
      error_message: params.errorMessage || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    });
  } catch {
    // ponytail: usage logging is non-critical, swallow errors
  }
}

// --- Token Billing ---
export function calculateTokenCost(responseData: any, api: any): number {
  const priceInput = Number(api.price_input) || 0;
  const priceOutput = Number(api.price_output) || Number(api.price_per_token) || 0;

  if (responseData?.usage) {
    const promptTokens = Number(responseData.usage.prompt_tokens) || 0;
    const completionTokens = Number(responseData.usage.completion_tokens) || 0;
    const costInput = (promptTokens / 1000) * priceInput;
    const costOutput = (completionTokens / 1000) * priceOutput;
    return Math.round(costInput + costOutput);
  }

  // Fallback: estimate tokens from response content (~4 chars per token)
  // Consistent with streaming billing which always uses this estimate
  let estimatedOutputChars = 0;
  if (responseData?.choices?.[0]?.message?.content) {
    estimatedOutputChars = String(responseData.choices[0].message.content).length;
  } else if (Array.isArray(responseData?.data) && responseData.data.length > 0) {
    estimatedOutputChars = 200; // image generation — flat estimate
  }
  if (estimatedOutputChars > 0 && priceOutput > 0) {
    const estimatedTokens = Math.ceil(estimatedOutputChars / 4);
    return Math.round((estimatedTokens / 1000) * priceOutput);
  }

  return 0;
}

// --- Stream Chunk Normalization ---
/**
 * Normalized delta chunk sent to frontend via SSE.
 * Unified format regardless of upstream provider (Ollama, OpenAI, RAG wrapper).
 */
export interface NormalizedDelta {
  content: string;
  thinking: string;
  done: boolean;
  model?: string;
}

/**
 * Parse a single raw SSE data payload (JSON string after "data: ") from upstream
 * and extract `content` + `thinking` fields in a provider-agnostic way.
 *
 * Supports:
 *  - OpenAI format:     { choices: [{ delta: { content } }] }
 *  - Ollama format:     { message: { content, thinking }, done }
 *  - RAG wrapper:       { text: "{\"answer\":\"...\", ...}" }  or  { text: "plain" }
 *  - Plain text:        string data
 */
export function normalizeStreamChunk(jsonStr: string): NormalizedDelta | null {
  if (!jsonStr || jsonStr === '[DONE]') return null;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Not valid JSON — treat entire string as content
    return { content: jsonStr, thinking: '', done: false };
  }

  // --- OpenAI chat completion delta ---
  if (parsed?.choices?.[0]?.delta !== undefined) {
    return {
      content: parsed.choices[0].delta.content || '',
      thinking: parsed.choices[0].delta.thinking || '',
      done: parsed.choices[0].finish_reason === 'stop',
      model: parsed.model,
    };
  }

  // --- Ollama native format ---
  if (parsed?.message !== undefined && typeof parsed.message === 'object') {
    return {
      content: parsed.message.content || '',
      thinking: parsed.message.thinking || '',
      done: !!parsed.done,
      model: parsed.model,
    };
  }

  // --- RAG wrapper: { text: "..." } ---
  if (parsed?.text !== undefined) {
    const rawText = String(parsed.text);
    // Check if text is itself a JSON object (RAG wrapper nests JSON in text)
    const innerContent = tryExtractInnerContent(rawText);
    if (innerContent !== null) {
      return { content: innerContent.content, thinking: innerContent.thinking, done: false };
    }
    // Plain text inside { text }
    return { content: rawText, thinking: '', done: false };
  }

  // --- RAG wrapper: { answer: "..." } (direct, not nested in text) ---
  if (parsed?.answer !== undefined) {
    return { content: String(parsed.answer), thinking: '', done: false };
  }

  // --- Direct content/response fields ---
  if (parsed?.content !== undefined) return { content: String(parsed.content), thinking: '', done: false };
  if (parsed?.response !== undefined) return { content: String(parsed.response), thinking: '', done: false };
  if (parsed?.generated_text !== undefined) return { content: String(parsed.generated_text), thinking: '', done: false };
  if (parsed?.output_text !== undefined) return { content: String(parsed.output_text), thinking: '', done: false };

  // Ollama final stats chunk (done=true, no content) — skip silently
  if (parsed?.done === true && parsed?.total_duration !== undefined) {
    return null;
  }

  // Ollama metadata chunk with no useful content — skip
  // (has "model", "created_at" but message.content is empty)
  if (parsed?.model && parsed?.created_at && parsed?.done !== undefined) {
    // This is an Ollama envelope — extract content if any, otherwise skip
    const content = parsed?.message?.content || parsed?.response || '';
    const thinking = parsed?.message?.thinking || '';
    if (!content && !thinking) return null; // Skip empty metadata chunks
    return { content, thinking, done: !!parsed.done };
  }

  // Last resort: only forward if it doesn't look like API metadata
  // Skip anything that has "model" + "done" fields (likely leaked Ollama envelope)
  if (parsed?.model && parsed?.done !== undefined) {
    return null;
  }

  return { content: JSON.stringify(parsed), thinking: '', done: false };
}

/**
 * Try to extract actual content from a JSON string that may be
 * a RAG wrapper ({"answer":"...", "enhanced": ...}) or
 * an Ollama object ({"model":"...","message":{"content":"...","thinking":"..."}})
 */
function tryExtractInnerContent(raw: string): { content: string; thinking: string } | null {
  if (!raw.startsWith('{') && !raw.startsWith('[')) return null;
  try {
    const inner = JSON.parse(raw);
    // RAG wrapper: { answer: "..." }
    if (inner?.answer !== undefined) {
      return { content: String(inner.answer), thinking: '' };
    }
    // Ollama nested in text: { message: { content, thinking } }
    if (inner?.message?.content !== undefined || inner?.message?.thinking !== undefined) {
      return {
        content: inner.message.content || '',
        thinking: inner.message.thinking || '',
      };
    }
    // OpenAI nested: { choices: [{ delta: { content } }] }
    if (inner?.choices?.[0]?.delta?.content !== undefined) {
      return { content: inner.choices[0].delta.content, thinking: '' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a NormalizedDelta into an OpenAI-compatible SSE data line.
 * This is the canonical format sent to the frontend.
 */
export function deltaToSSE(delta: NormalizedDelta, model?: string): string {
  const payload = {
    choices: [{
      index: 0,
      delta: {
        ...(delta.content ? { content: delta.content } : {}),
        ...(delta.thinking ? { thinking: delta.thinking } : {}),
      },
      finish_reason: delta.done ? 'stop' : null,
    }],
    ...(model || delta.model ? { model: model || delta.model } : {}),
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// --- Error Translator ---
export type GatewayErrorResponse = {
  error: string;
  error_code: string;
  suggestion?: string;
  credits_refunded?: boolean;
};

export function translateGatewayError(rawError: any, context?: string): GatewayErrorResponse {
  const code = rawError?.code || rawError?.response?.status;
  const message = (rawError?.message || '').toLowerCase();
  const upstreamStatus = rawError?.response?.status;
  const upstreamData = rawError?.response?.data;

  // 1. Connection refused / DNS not found → server mati
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      error: 'Server AI saat ini tidak dapat dihubungi.',
      error_code: 'UPSTREAM_OFFLINE',
      suggestion: 'Kemungkinan server AI sedang down atau dalam maintenance. Coba beberapa saat lagi.',
      credits_refunded: true,
    };
  }

  // 2. Timeout
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || message.includes('timeout')) {
    return {
      error: 'Server AI terlalu lama merespons (timeout).',
      error_code: 'UPSTREAM_TIMEOUT',
      suggestion: 'Request mungkin terlalu kompleks, atau server sedang overload. Coba request yang lebih sederhana atau coba lagi nanti.',
      credits_refunded: true,
    };
  }

  // 3. Upstream auth failure (bukan user auth, tapi gateway → upstream)
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      error: 'Koneksi ke server AI gagal karena masalah autentikasi.',
      error_code: 'UPSTREAM_AUTH_ERROR',
      suggestion: 'Hubungi admin — kemungkinan ada masalah konfigurasi di sisi server.',
      credits_refunded: true,
    };
  }

  // 4. Rate limit dari upstream
  if (upstreamStatus === 429) {
    return {
      error: 'Terlalu banyak request ke server AI saat ini.',
      error_code: 'UPSTREAM_RATE_LIMITED',
      suggestion: 'Tunggu beberapa detik lalu coba lagi.',
      credits_refunded: true,
    };
  }

  // 5. Server error dari upstream (5xx)
  if (upstreamStatus && upstreamStatus >= 500) {
    // Extract user-safe message from upstream if available
    const upstreamMsg = upstreamData?.error?.message || upstreamData?.error || '';
    let detail = '';
    if (typeof upstreamMsg === 'string' && upstreamMsg.length > 0 && upstreamMsg.length < 200) {
      detail = ` Detail: ${upstreamMsg}`;
    }
    return {
      error: `Server AI mengalami masalah internal.${detail}`,
      error_code: 'UPSTREAM_SERVER_ERROR',
      suggestion: 'Ini masalah di sisi server AI, bukan di request kamu. Coba lagi nanti.',
      credits_refunded: true,
    };
  }

  // 6. Streaming terputus
  if (context === 'stream_error') {
    return {
      error: 'Koneksi streaming ke server AI terputus di tengah jalan.',
      error_code: 'STREAM_DISCONNECTED',
      suggestion: 'Jaringan mungkin tidak stabil. Coba kirim ulang pesan.',
      credits_refunded: true,
    };
  }

  // 7. Stream setup gagal
  if (context === 'stream_setup') {
    return {
      error: 'Gagal memulai koneksi streaming ke server AI.',
      error_code: 'STREAM_SETUP_FAILED',
      suggestion: 'Server AI mungkin tidak mendukung streaming atau sedang tidak tersedia. Coba lagi.',
      credits_refunded: true,
    };
  }

  // 8. Network/unknown
  if (message.includes('network') || message.includes('socket')) {
    return {
      error: 'Terjadi masalah koneksi jaringan ke server AI.',
      error_code: 'NETWORK_ERROR',
      suggestion: 'Periksa koneksi internet atau coba lagi.',
      credits_refunded: true,
    };
  }

  // 9. Fallback — generic
  console.error('[Gateway] Unhandled error:', rawError?.message || rawError);
  return {
    error: 'Terjadi kesalahan yang tidak terduga saat memproses request.',
    error_code: 'UNKNOWN_ERROR',
    suggestion: 'Coba lagi. Jika masalah berlanjut, hubungi admin.',
    credits_refunded: true,
  };
}

// --- Settle billing difference between reservation and actual cost ---
export async function settleBillingDifference(
  userId: string | number,
  reservedAmount: number,
  actualCost: number
): Promise<number> {
  const diff = actualCost - reservedAmount;
  
  if (diff > 0) {
    // User owes more than reserved — charge the difference
    console.log(`[Gateway] Settlement: charging extra ${diff} (reserved=${reservedAmount}, actual=${actualCost})`);
    return await adjustUserUsageSafely(userId, diff);
  } else if (diff < 0) {
    // User overpaid — refund the difference
    console.log(`[Gateway] Settlement: refunding ${Math.abs(diff)} (reserved=${reservedAmount}, actual=${actualCost})`);
    return await adjustUserUsageSafely(userId, diff); // negative delta = refund
  }
  
  // Exact match — nothing to do, just return current usage_count
  const user = await db.findById('users', userId);
  return Number(user?.usage_count) || 0;
}

export {
  applyTargetAuthHeaders,
  buildFallbackTargetUrl,
  getEffectiveTimeoutMs,
  isValidHttpUrl,
  isPrivateOrLocalHost,
  resolvesToPrivateOrLocalAddress,
  isActiveLike,
  toNumericId
};
