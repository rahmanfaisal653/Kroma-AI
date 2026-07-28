import axios from 'axios';
import { config } from '../config.js';
import { openAiCompatibleBody, nativeOllamaBody, providerChatTargets, providerHeaders } from './customProvider.js';
import { commandCodeBody, commandCodeHeaders, commandCodeToOpenAI } from './special/commandCodeGo.js';

const PING_BODY = {
  messages: [{ role: 'user', content: 'Reply exactly: pong' }],
  max_tokens: 32,
};

function providerError(data: any) {
  if (!data) return 'provider request failed';
  if (typeof data === 'string') {
    try { return providerError(JSON.parse(data)); } catch { return data.slice(0, 300); }
  }
  return data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
}

function textOf(data: any): string {
  // Handle all common response formats
  const msg = data?.choices?.[0]?.message;
  return String(
    msg?.content || msg?.text || data?.choices?.[0]?.text ||
    data?.message?.content || data?.response || data?.output ||
    data?.result || ''
  ).trim();
}

function validChatResponse(data: any, native = false) {
  if (!data) return false;
  // Only reject if there's a real error (not null/empty)
  if (data.error && (typeof data.error !== 'object' || Object.keys(data.error).length > 0)) return false;
  if (native) return Boolean(textOf(data));
  // Accept if we can extract any text content
  if (Boolean(textOf(data))) return true;
  // Fallback: accept if choices array exists with any content
  return Array.isArray(data.choices) && data.choices.length > 0;
}

export async function testProviderModel(provider: any, providerModel: string) {
  const headers = providerHeaders(provider, true);

  if (provider.id === 'commandcode-go') {
    const raw = await axios.post(provider.baseUrl, commandCodeBody(providerModel, PING_BODY, PING_BODY.messages), { timeout: config.defaultTimeoutMs, responseType: 'text', headers: commandCodeHeaders(headers), validateStatus: () => true, transformResponse: [(data) => data] });
    if (raw.status >= 400) return { status: 'off' as const, error: providerError(raw.data) };
    try {
      const data = commandCodeToOpenAI(raw.data, providerModel);
      return validChatResponse(data) ? { status: 'on' as const } : { status: 'off' as const, error: 'provider returned no chat content' };
    } catch (err: any) {
      return { status: 'off' as const, error: err.message || providerError(raw.data) };
    }
  }

  let lastError = 'no compatible endpoint';
  for (const target of providerChatTargets(provider)) {
    const body = target.native ? nativeOllamaBody(PING_BODY, providerModel) : openAiCompatibleBody(PING_BODY, providerModel);
    const raw = await axios.post(target.url, body, { timeout: config.defaultTimeoutMs, headers, validateStatus: () => true });
    if (raw.status === 404) { lastError = `HTTP 404 at ${target.url}`; continue; }
    if (raw.status >= 400) return { status: 'off' as const, error: providerError(raw.data) };
    return validChatResponse(raw.data, target.native) ? { status: 'on' as const } : { status: 'off' as const, error: 'provider returned no valid chat completion' };
  }

  return { status: 'off' as const, error: lastError };
}
