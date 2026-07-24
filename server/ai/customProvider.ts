import axios from 'axios';

export function providerHeaders(provider: any, json = false) {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (provider.apiKey) {
    headers.Authorization = ['Bearer', provider.apiKey].join(' ');
    headers['x-api-key'] = provider.apiKey;
  }
  return headers;
}

export function providerModelUrls(baseUrl: string) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const root = base.replace(/\/v1$/i, '');
  return [...new Set(base.endsWith('/v1') ? [`${base}/models`, `${root}/api/tags`] : [`${base}/models`, `${base}/v1/models`, `${base}/api/tags`])];
}

export function providerChatTargets(baseUrl: string) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const root = base.replace(/\/v1$/i, '');
  return [...new Set(base.endsWith('/v1')
    ? [{ url: `${base}/chat/completions`, native: false }, { url: `${root}/api/chat`, native: true }]
    : [{ url: `${base}/chat/completions`, native: false }, { url: `${base}/v1/chat/completions`, native: false }, { url: `${base}/api/chat`, native: true }]
  )];
}

export async function fetchCustomProviderModels(provider: any) {
  const headers = providerHeaders(provider);
  const tried: string[] = [];
  let lastError = '';

  for (const url of providerModelUrls(provider.baseUrl)) {
    tried.push(url);
    try {
      const res = await axios.get(url, { timeout: 5000, headers, validateStatus: () => true });
      if (res.status === 404) { lastError = `HTTP 404 at ${url}`; continue; }
      if (res.status >= 400) return { status: 'error', models: [] as string[], error: `${provider.name || provider.id} models request failed: HTTP ${res.status}` };

      const native = url.endsWith('/api/tags');
      const data = native || Array.isArray(res.data?.models) ? res.data?.models : Array.isArray(res.data?.data) ? res.data.data : [];
      const ids = (Array.isArray(data) ? data : []).map((item: any) => String(item?.id || item?.name || '').trim()).filter(Boolean);
      return { status: 'on', models: ids.map((id: string) => id.startsWith(`${provider.id}/`) ? id : `${provider.id}/${id}`) };
    } catch (err: any) {
      lastError = err.code || err.message || 'request failed';
    }
  }

  return { status: 'error', models: [] as string[], error: `${provider.name || provider.id} models unavailable: ${lastError || 'no compatible endpoint'}; tried ${tried.join(', ')}` };
}

export function openAiCompatibleBody(body: any, model: string) {
  return { ...body, model };
}

export function nativeOllamaBody(body: any, model: string) {
  return { model, messages: body.messages, stream: false };
}

export function nativeOllamaToOpenAI(data: any, requestedModel: string, providerModel: string) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{ index: 0, message: { role: 'assistant', content: data?.message?.content || data?.response || '' }, finish_reason: 'stop' }],
    usage: data?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    _gateway: { provider_model: providerModel, native: 'ollama' },
  };
}

export function visibilityIncludes(provider: any, audience: 'internal' | 'partner') {
  const visibility = Array.isArray(provider.visibility) ? provider.visibility : provider.visibility === 'both' ? ['internal', 'partner'] : [provider.visibility || 'internal'];
  return visibility.includes(audience);
}

export function canUseProvider(provider: any, ownerType?: string) {
  if (provider.enabled === false) return false;
  return visibilityIncludes(provider, ownerType === 'internal' ? 'internal' : 'partner');
}

export function visibleProviders(providers: any[], ownerType: 'internal' | 'partner') {
  return providers.filter(provider => canUseProvider(provider, ownerType));
}
