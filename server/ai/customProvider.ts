import axios from 'axios';

export function providerHeaders(provider: any, json = false) {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (provider.apiKey) {
    headers.Authorization = ['Bearer', provider.apiKey].join(' ');
    headers['x-api-key'] = provider.apiKey;
  }
  return headers;
}

function joinUrl(baseUrl: string, path: string) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  return `${base}${suffix}`;
}

export function providerModelUrls(provider: any) {
  return [joinUrl(provider.baseUrl, provider.modelsPath || '/models')];
}

export function providerChatTargets(provider: any) {
  const path = provider.chatPath || '/chat/completions';
  return [{ url: joinUrl(provider.baseUrl, path), native: path.endsWith('/api/chat') || path === '/api/chat' }];
}

export async function fetchCustomProviderModels(provider: any) {
  const headers = providerHeaders(provider);
  const tried: string[] = [];
  let lastError = '';

  for (const url of providerModelUrls(provider)) {
    tried.push(url);
    try {
      const res = await axios.get(url, { timeout: 5000, headers, validateStatus: () => true });
      if (res.status === 404) { lastError = `HTTP 404 at ${url}`; continue; }
      if (res.status >= 400) return { status: 'error', models: [] as string[], error: `${provider.name || provider.id} models request failed: HTTP ${res.status}` };

      // Handle all common response formats
      let data: any[] = [];
      const body = res.data;
      
      if (Array.isArray(body)) {
        // Plain array: [{id: "model1"}, ...] or ["model1", ...]
        data = body;
      } else if (Array.isArray(body?.models)) {
        // Ollama format: { models: [...] }
        data = body.models;
      } else if (Array.isArray(body?.data)) {
        // OpenAI format: { data: [...] }
        data = body.data;
      } else if (body?.object === 'list' && Array.isArray(body?.data)) {
        // OpenAI list format: { object: "list", data: [...] }
        data = body.data;
      }
      
      // Extract model IDs from various formats
      const ids = data
        .map((item: any) => {
          if (typeof item === 'string') return item.trim();
          return String(item?.id || item?.name || item?.model || '').trim();
        })
        .filter(Boolean);
      
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

export function buildChatBody(provider: any, messages: any[], model: string, options: any = {}): any {
  if (provider.chatFormat === 'ollama') {
    return {
      prompt: messages.filter((m: any) => m.role !== 'system').map((m: any) => m.content).join('\n'),
      model,
      stream: false,
      ...options,
    };
  }
  return { ...options, messages, model };
}
