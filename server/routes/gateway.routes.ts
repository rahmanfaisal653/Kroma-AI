import { Router } from 'express';
import type { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config.js';
import { requireApiKey } from '../middleware/auth.middleware.js';
import {
  getAsyncJob, setAsyncJob,
  lookupApiByEndpoint, prepareRequestBody,
  normalizeResponse, calculateTokenCost,
  reserveUserCredits, refundUsageSafely, adjustUserUsageSafely,
  requestUpstreamWithUrlFallback,
  normalizeStreamChunk, deltaToSSE,
  isAllowedGatewayTargetUrlStrict, logUsage,
  applyTargetAuthHeaders, buildFallbackTargetUrl,
  getEffectiveTimeoutMs, isValidHttpUrl, isAllowedGatewayTargetUrl, isActiveLike, toNumericId,
  translateGatewayError, settleBillingDifference
} from '../services/gateway.service.js';

const router = Router();

// GET /api/async-jobs/:id — requires auth + ownership check
router.get('/async-jobs/:id', requireApiKey, async (req, res) => {
  const job = await getAsyncJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  // Ownership check: user can only access their own jobs
  if (job.user_id && String(job.user_id) !== String(req.user!.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(job);
});

/**
 * Dynamic proxy controller — the core gateway logic.
 */
async function dynamicProxyController(req: Request, res: Response, opts?: { forceAsync?: boolean }) {
  const requestedPath = req.path;

  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: internal auth error' });
  }

  try {
    // Step 1: Lookup API config
    const results = await lookupApiByEndpoint(requestedPath);
    if (results.length === 0) {
      return res.status(404).json({
        error: `No API registered for path: ${requestedPath}`,
        hint: 'Add a record to the "apis" table with this endpoint value.'
      });
    }

    const requestedApiId = req.body?.api_id !== undefined ? String(req.body.api_id) : '';
    const requestedModel = String(req.body?.model || '').trim().toLowerCase();
    const activeRows = results.filter((r: any) => r?.active !== 0 && r?.active !== false && r?.active !== 'false');
    const basePool = activeRows.length > 0 ? activeRows : results;
    const validUrlRows = basePool.filter((r: any) => isValidHttpUrl(r?.target_url));

    let api: any;
    if (requestedApiId) {
      const byId = basePool.find((r: any) => String(r?.id) === requestedApiId);
      if (!byId) return res.status(404).json({ error: 'Model tidak ditemukan.' });
      if (!(await isAllowedGatewayTargetUrlStrict(byId?.target_url))) return res.status(502).json({ error: 'Konfigurasi model tidak valid.' });
      api = byId;
    } else {
      const allowedRows = await Promise.all(validUrlRows.map(async (r: any) => ((await isAllowedGatewayTargetUrlStrict(r?.target_url)) ? r : null)));
      let pool = allowedRows.filter(Boolean);
      if (requestedModel) {
        const byModel = pool.filter((r: any) => String(r?.model_slug || '').trim().toLowerCase() === requestedModel);
        if (byModel.length > 0) pool = byModel;
      }
      if (pool.length === 0) {
        return res.status(502).json({ error: 'Tidak ada model yang tersedia untuk endpoint ini.' });
      }
      if (!requestedModel && pool.length > 1) {
        return res.status(409).json({
          error: 'Ada beberapa model aktif. Silakan tentukan model yang ingin digunakan.',
          hint: 'Kirim parameter model di request body.',
          available_models: pool.map((r: any) => r?.model_slug).filter(Boolean)
        });
      }
      api = pool.sort((a: any, b: any) => toNumericId(b?.id) - toNumericId(a?.id))[0];
    }

    const targetUrl = String(api?.target_url || '').trim();
    const basePrice = Number(api.price_per_token) || 0;
    let quotaLimit = Number(req.user.quota_limit) || 0;

    // Step 2-3: quota check + base reservation are serialized per user.
    let currentUsageCount = Number(req.user.usage_count) || 0;
    try {
      const reservation = await reserveUserCredits(req.user.id, basePrice);
      currentUsageCount = reservation.usage_count;
      quotaLimit = reservation.quota_limit;
    } catch (error: any) {
      if (error?.statusCode === 402) {
        return res.status(402).json({
          error: 'Insufficient credits.',
          remaining: error.remaining,
          required: error.required,
          hint: 'Top up at /billing'
        });
      }
      throw error;
    }

    const requestedAsync = req.body?.async === true || req.body?.future_async === true || opts?.forceAsync === true;

    // Step 4: Prepare request
    const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    applyTargetAuthHeaders(forwardHeaders, api.target_auth);
    const requestBody = prepareRequestBody(req.body, api);
    const fallbackTargetUrl = buildFallbackTargetUrl(api.target_url, requestedPath);

    // Step 4b: Inject ChromaDB context if relevant (semantic retrieval)
    // Only for text models with messages array
    // Wrapped in timeout — max 3s, don't delay chat if infra is slow/down
    if (config.ragEnabled && Array.isArray(requestBody.messages) && requestBody.messages.length > 0) {
      const lastUserMsg = requestBody.messages
        .filter((m: any) => m.role === 'user')
        .slice(-1)[0]?.content;

      if (lastUserMsg && typeof lastUserMsg === 'string' && lastUserMsg.length >= 10) {
        try {
          const { retrieveRelevantContext } = await import('../services/knowledge.service.js');
          const context = await Promise.race([
            retrieveRelevantContext(lastUserMsg),
            new Promise<string>(resolve => setTimeout(() => resolve(''), 3000)) // 3s timeout
          ]);
          if (context) {
            const contextMsg = {
              role: 'system',
              content: `Berikut informasi relevan dari dokumen yang pernah user berikan. Gunakan sebagai referensi jika relevan:\n\n${context}`
            };
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
    }

    console.log(`[Gateway] Forwarding ${req.method} to: ${api.target_url} (Stream: ${requestBody.stream}, Async: ${requestBody.async || false})`);
    const startTime = Date.now();

    // --- ASYNC MODE ---
    if (requestedAsync) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setAsyncJob({ id: jobId, status: 'queued', endpoint: requestedPath, created_at: Date.now(), updated_at: Date.now() });

      (async () => {
        try {
          const job = await getAsyncJob(jobId);
          if (!job) return;
          job.status = 'running';
          job.updated_at = Date.now();
          setAsyncJob(job);

          const asyncResult = await requestUpstreamWithUrlFallback({
            method: req.method, url: api.target_url, headers: forwardHeaders,
            data: { ...requestBody, stream: false },
            timeout: getEffectiveTimeoutMs(api, config.defaultTimeoutMs),
            validateStatus: () => true
          }, fallbackTargetUrl);

          const targetResponse = asyncResult.response;
          if (targetResponse.status >= 400) {
            await refundUsageSafely(req.user!.id, basePrice);
            job.status = 'failed';
            job.error = { error: 'AI Server error.', detail: targetResponse.data?.error?.message || targetResponse.data?.error, status: targetResponse.status };
            job.updated_at = Date.now();
            setAsyncJob(job);
            return;
          }

          const normalized = normalizeResponse(targetResponse.data, api);
          const hasText = !!normalized?.choices?.[0];
          const hasImage = Array.isArray(normalized?.data) && normalized.data.length > 0;
          if (!hasText && !hasImage) {
            await refundUsageSafely(req.user!.id, basePrice);
            job.status = 'failed';
            job.error = { error: 'No usable response' };
            job.updated_at = Date.now();
            setAsyncJob(job);
            return;
          }

          job.status = 'done';
          job.result = normalized;
          job.updated_at = Date.now();
          setAsyncJob(job);
        } catch (err: any) {
          await refundUsageSafely(req.user!.id, basePrice);
          const job = await getAsyncJob(jobId);
          if (!job) return;
          job.status = 'failed';
          job.error = { error: 'Async gateway failed', detail: err.message };
          job.updated_at = Date.now();
          setAsyncJob(job);
        }
      })();

      return res.status(202).json({ accepted: true, mode: 'async', job_id: jobId, status_url: `/api/async-jobs/${jobId}` });
    }

    // --- STREAMING MODE (with per-token billing) ---
    if (requestBody.stream) {
      try {
        // Use the configured timeout (from DB apis.timeout_ms or env DEFAULT_STREAM_TIMEOUT_MS)
        // Don't cap artificially — some models need long thinking time
        const streamTimeout = getEffectiveTimeoutMs(api, config.defaultStreamTimeoutMs);

        const streamResult = await requestUpstreamWithUrlFallback({
          method: req.method, url: api.target_url, headers: forwardHeaders,
          data: requestBody, responseType: 'stream',
          timeout: streamTimeout,
          validateStatus: () => true
        }, fallbackTargetUrl, 0); // No retries for streaming — fail fast

        const streamResponse = streamResult.response;

        if (streamResponse.status >= 400) {
          await refundUsageSafely(req.user!.id, basePrice);
          
          // Try to extract error details from upstream response
          let errorDetail = 'AI server returned an error during stream setup.';
          let upstreamError = '';
          let errorBody: any = {};
          
          try {
            // Read error response body
            errorBody = await new Promise<any>((resolve) => {
              let data = '';
              streamResponse.data.on('data', (chunk: any) => {
                data += chunk.toString();
              });
              streamResponse.data.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch {
                  resolve({ error: data || 'Unknown error' });
                }
              });
              streamResponse.data.on('error', () => {
                resolve({ error: 'Failed to read error response' });
              });
            });
            
            upstreamError = errorBody?.error?.message || errorBody?.error || errorBody?.detail || errorBody?.message || '';
          } catch {
            // Failed to parse error response
          }
          
          if (upstreamError) {
            console.error(`[Gateway] Stream setup error:`, upstreamError);
          }
          
          return res.status(502).json(translateGatewayError({
            response: { status: streamResponse.status, data: errorBody || {} }
          }, 'stream_setup'));
        }

        res.status(streamResponse.status);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const upstreamCT = String(streamResponse.headers['content-type'] || '').toLowerCase();
        let streamedChars = 0;
        let clientDisconnected = false;
        let streamSettled = false; // Prevent double billing/refund if both end+error fire

        // Detect client disconnect — abort upstream if client leaves
        req.on('close', () => {
          clientDisconnected = true;
          if (streamResponse.data?.destroy) {
            streamResponse.data.destroy();
          }
        });

        // Buffer for handling partial JSON chunks split across TCP packets
        let partialBuffer = '';

        streamResponse.data.on('data', (chunk: any) => {
          if (clientDisconnected) return; // Client left — stop processing
          const raw = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
          if (!raw) return;

          // Combine with any leftover partial data
          const combined = partialBuffer + raw;
          partialBuffer = '';

          // Split into lines — handle both SSE "data:" lines and raw JSON lines
          const lines = combined.split(/\r?\n/);

          // Last element may be incomplete — save for next chunk
          const lastLine = lines[lines.length - 1];
          if (lastLine !== '' && !lastLine.endsWith('}') && !lastLine.endsWith(']')) {
            partialBuffer = lines.pop() || '';
          }

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Extract JSON payload
            let jsonStr = trimmed;
            if (trimmed.startsWith('data:')) {
              jsonStr = trimmed.slice(5).trim();
            }
            if (jsonStr === '[DONE]') continue;

            // Normalize the chunk to unified format
            const delta = normalizeStreamChunk(jsonStr);
            if (!delta) continue;

            // Count only actual content for billing (not thinking/metadata)
            streamedChars += delta.content.length;

            // Forward as normalized OpenAI-compatible SSE
            if (delta.content || delta.thinking) {
              res.write(deltaToSSE(delta, api.model_slug || api.name));
            }
          }
        });

        streamResponse.data.on('end', async () => {
          if (streamSettled) return;
          streamSettled = true;

          // Send [DONE] marker first
          res.write('data: [DONE]\n\n');

          // Bill based on estimated tokens from streamed content (chars / 4 estimate)
          const priceOutput = Number(api.price_output) || Number(api.price_per_token) || 0;
          let streamCost = 0;
          if (priceOutput > 0 && streamedChars > 0) {
            const estimatedTokens = Math.ceil(streamedChars / 4);
            streamCost = Math.round((estimatedTokens / 1000) * priceOutput);
          }
          
          // Settle BEFORE res.end() — prevents billing loss on server crash
          try {
            currentUsageCount = await settleBillingDifference(req.user!.id, basePrice, streamCost);
          } catch (e: any) {
            console.error('[Gateway] Stream settlement error:', e.message);
          }

          // Now close the response
          res.end();

          // Log usage
          logUsage({
            userId: req.user!.id,
            apiId: api.id,
            endpoint: requestedPath,
            modelSlug: api.model_slug,
            outputTokens: Math.ceil(streamedChars / 4),
            totalTokens: Math.ceil(streamedChars / 4),
            cost: streamCost,
            latencyMs: Date.now() - startTime,
            statusCode: 200,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          });
        });

        streamResponse.data.on('error', async (err: any) => {
          if (streamSettled) return;
          streamSettled = true;

          // Partial billing: if user received some content, charge proportionally.
          // If no content streamed, full refund.
          const priceOutput = Number(api.price_output) || Number(api.price_per_token) || 0;
          let partialCost = 0;
          if (streamedChars > 0 && priceOutput > 0) {
            const estimatedTokens = Math.ceil(streamedChars / 4);
            partialCost = Math.round((estimatedTokens / 1000) * priceOutput);
          }
          
          try {
            await settleBillingDifference(req.user!.id, basePrice, partialCost);
          } catch (e: any) {
            console.error('[Gateway] Stream error settlement error:', e.message);
          }
          
          // More specific error messages based on error type
          let errorMessage = 'Upstream stream failed';
          let errorDetail = err.message || 'Unknown stream error';
          
          if (err.code === 'ECONNRESET') {
            errorMessage = 'Koneksi ke AI server terputus tiba-tiba';
            errorDetail = 'AI server menutup koneksi saat streaming. Coba ulangi request.';
          } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
            errorMessage = 'AI server timeout';
            errorDetail = 'AI server tidak merespons dalam waktu yang ditentukan. Model mungkin sedang overload.';
          } else if (err.code === 'ECONNREFUSED') {
            errorMessage = 'AI server tidak dapat dihubungi';
            errorDetail = 'AI server menolak koneksi. Pastikan service AI sedang berjalan.';
          } else if (err.code === 'EPIPE') {
            errorMessage = 'Koneksi stream terputus';
            errorDetail = 'Koneksi terputus saat menerima data dari AI server.';
          }
          
          console.error(`[Gateway] Stream error: ${err.code || 'UNKNOWN'} - ${err.message}`);
          
          if (!res.headersSent) {
            res.status(502).json(translateGatewayError(err, 'stream_error'));
          } else {
            res.end();
          }
        });
        return;
      } catch (streamError: any) {
        await refundUsageSafely(req.user!.id, basePrice);
        
        // More specific error for stream setup failures
        let errorMessage = 'Gagal memulai stream ke AI server';
        let errorDetail = streamError.message || 'Unknown error';
        
        if (streamError.code === 'ECONNREFUSED' || streamError.code === 'ENOTFOUND') {
          errorMessage = 'AI server tidak dapat dihubungi';
          errorDetail = 'Server AI tidak merespons. Pastikan service AI sedang berjalan.';
        } else if (streamError.code === 'ECONNABORTED' || streamError.code === 'ETIMEDOUT') {
          errorMessage = 'AI server timeout';
          errorDetail = 'Request ke AI server timeout. Model mungkin sedang overload atau request terlalu kompleks.';
        } else if (streamError.response?.status === 401 || streamError.response?.status === 403) {
          errorMessage = 'Autentikasi ke AI server gagal';
          errorDetail = 'API key atau credentials untuk AI server tidak valid.';
        } else if (streamError.response?.status === 429) {
          errorMessage = 'Rate limit AI server tercapai';
          errorDetail = 'Terlalu banyak request ke AI server. Coba beberapa saat lagi.';
        } else if (streamError.response?.status >= 500) {
          errorMessage = 'Server AI mengalami masalah.';
          errorDetail = 'Server AI mengalami masalah internal.';
        }
        
        console.error(`[Gateway] Stream setup error: ${streamError.code || 'UNKNOWN'} - ${streamError.message}`);
        
        if (!res.headersSent) {
          return res.status(502).json(translateGatewayError(streamError, 'stream_setup'));
        }
        return;
      }
    }

    // --- STANDARD (Non-Streaming) ---
    let targetResponse;
    try {
      const nonStreamResult = await requestUpstreamWithUrlFallback({
        method: req.method, url: api.target_url, headers: forwardHeaders,
        data: requestBody,
        timeout: getEffectiveTimeoutMs(api, config.defaultTimeoutMs),
        validateStatus: () => true
      }, fallbackTargetUrl);
      targetResponse = nonStreamResult.response;
    } catch (proxyError: any) {
        await refundUsageSafely(req.user.id, basePrice);
        console.error(`[Gateway] Proxy error: ${proxyError.code || 'UNKNOWN'} - ${proxyError.message}`);
        const status = proxyError.code === 'ECONNABORTED' ? 504 : 502;
        return res.status(status).json(translateGatewayError(proxyError));
    }

    if (targetResponse.status >= 400) {
        await refundUsageSafely(req.user.id, basePrice);
        console.error(`[Gateway] Upstream error (${targetResponse.status}):`, targetResponse.data?.error || '');
        const errResponse = translateGatewayError({ response: { status: targetResponse.status, data: targetResponse.data } });
        return res.status(502).json(errResponse);
    }

    // Step 5: Process & Bill
    const responseData = normalizeResponse(targetResponse.data, api);
    const tokenCost = calculateTokenCost(responseData, api);

    // Settle the difference between reservation (basePrice) and actual token cost
    try {
      currentUsageCount = await settleBillingDifference(req.user.id, basePrice, tokenCost);
    } catch (e: any) {
      console.error('[Gateway] Settlement error:', e.message);
    }

    res.json({
      ...responseData,
      _gateway: {
        api_name: api.name,
        api_type: api.type,
        cost: Math.round(tokenCost),
        credits_remaining: Math.max(0, Math.round(quotaLimit - currentUsageCount))
      }
    });

    // Log usage
    logUsage({
      userId: req.user.id,
      apiId: api.id,
      endpoint: requestedPath,
      modelSlug: api.model_slug,
      inputTokens: responseData?.usage?.prompt_tokens,
      outputTokens: responseData?.usage?.completion_tokens,
      totalTokens: responseData?.usage?.total_tokens,
      cost: Math.round(tokenCost),
      latencyMs: Date.now() - startTime,
      statusCode: 200,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

  } catch (error: any) {
    console.error('[dynamicProxyController] Error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Terjadi kesalahan internal pada gateway.' });
  }
}

// Export controller for use in gateway middleware
export { dynamicProxyController, requireApiKey };
export default router;
