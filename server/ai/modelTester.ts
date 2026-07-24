import axios from 'axios';
import { config } from '../config.js';
import { openAiCompatibleBody, nativeOllamaBody, providerChatTargets, providerHeaders } from './customProvider.js';
import { commandCodeBody, commandCodeHeaders } from './special/commandCodeGo.js';

const PING_BODY = {
  messages: [{ role: 'user', content: 'ping' }],
  max_tokens: 1,
  stream: false,
};

function providerError(data: any) {
  if (!data) return 'provider request failed';
  if (typeof data === 'string') {
    try { return providerError(JSON.parse(data)); } catch { return data.slice(0, 300); }
  }
  return data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
}

export async function testProviderModel(provider: any, providerModel: string) {
  const headers = providerHeaders(provider, true);

  if (provider.id === 'commandcode-go') {
    const raw = await axios.post(provider.baseUrl, commandCodeBody(providerModel, PING_BODY, PING_BODY.messages), { timeout: config.defaultTimeoutMs, responseType: 'text', headers: commandCodeHeaders(headers), validateStatus: () => true, transformResponse: [(data) => data] });
    return raw.status < 400 ? { status: 'on' as const } : { status: 'off' as const, error: providerError(raw.data) };
  }

  let lastError = 'no compatible endpoint';
  for (const target of providerChatTargets(provider)) {
    const body = target.native ? nativeOllamaBody(PING_BODY, providerModel) : openAiCompatibleBody(PING_BODY, providerModel);
    const raw = await axios.post(target.url, body, { timeout: config.defaultTimeoutMs, headers, validateStatus: () => true });
    if (raw.status === 404) { lastError = `HTTP 404 at ${target.url}`; continue; }
    return raw.status < 400 ? { status: 'on' as const } : { status: 'off' as const, error: providerError(raw.data) };
  }

  return { status: 'off' as const, error: lastError };
}
