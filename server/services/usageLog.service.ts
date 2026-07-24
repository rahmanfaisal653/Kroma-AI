import { db } from './db.service.js';

// ponytail: usage logs are analytics only; never block gateway responses.
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
    // non-critical
  }
}
