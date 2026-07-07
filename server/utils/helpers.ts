/**
 * Shared utility/helper functions extracted from server.ts monolith.
 */

import { lookup } from 'node:dns/promises';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const normalizeBooleanLike = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  return false;
};

export const isActiveLike = (value: any): boolean => normalizeBooleanLike(value);

export const isValidHttpUrl = (value: any): boolean => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isPrivateOrLocalHost = (hostnameRaw: string): boolean => {
  const h = String(hostnameRaw || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '::1' || h === '0:0:0:0:0:0:0:1' || h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  // IPv6 private/local/link-local ranges.
  if (h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  return false;
};

export const resolvesToPrivateOrLocalAddress = async (hostnameRaw: string): Promise<boolean> => {
  const hostname = String(hostnameRaw || '').trim().replace(/^\[|\]$/g, '');
  if (isPrivateOrLocalHost(hostname)) return true;
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.some((record: { address: string }) => isPrivateOrLocalHost(record.address));
  } catch {
    return true;
  }
};

export const normalizeEndpointPath = (value: any): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const toNumericId = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeTimeoutMs = (value: any): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

export const getEffectiveTimeoutMs = (api: any, fallbackMs: number): number => {
  const fromDb = normalizeTimeoutMs(api?.timeout_ms);
  if (fromDb) return fromDb;
  return fallbackMs;
};

export const parsePrice = (val: any): number => {
  const stripped = String(val || '0').replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(stripped) || 0);
};

export const parseList = (val: any): string[] => {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== 'string') return [];
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p : [val];
  } catch {
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
};

/**
 * Derive a text prompt from an array of chat messages.
 * Used when upstream requires `prompt` field instead of `messages`.
 */
export const derivePromptFromMessages = (messages: any): string => {
  if (!Array.isArray(messages)) return '';
  const userMessages = messages.filter((m: any) => String(m?.role || '').toLowerCase() === 'user');
  const source = userMessages.length > 0 ? userMessages : messages;
  const parts = source
    .map((m: any) => {
      const c = m?.content;
      if (typeof c === 'string') return c.trim();
      if (Array.isArray(c)) {
        return c
          .map((p: any) => (typeof p === 'string' ? p : String(p?.text || '').trim()))
          .filter(Boolean)
          .join(' ');
      }
      return '';
    })
    .filter(Boolean);
  return parts.join('\n').trim();
};

/**
 * Extract text content from diverse AI response formats.
 */
export const extractUniversalTextContent = (responseData: any): string => {
  if (!responseData) return '';
  if (responseData?.choices?.[0]?.message?.content) {
    const msgContent = responseData.choices[0].message.content;
    return Array.isArray(msgContent)
      ? msgContent.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('')
      : msgContent;
  }
  if (responseData?.choices?.[0]?.text) return responseData.choices[0].text;
  if (responseData?.output_text) return responseData.output_text;
  if (responseData?.text) return responseData.text;
  if (responseData?.content) return responseData.content;
  if (responseData?.message?.content) return responseData.message.content;
  if (responseData?.response) return responseData.response;
  if (responseData?.generated_text) return responseData.generated_text;
  if (Array.isArray(responseData?.candidates) && responseData.candidates[0]?.content?.parts?.[0]?.text) {
    return responseData.candidates[0].content.parts.map((p: any) => p?.text || '').join('');
  }
  if (Array.isArray(responseData?.results) && responseData.results[0]?.text) return responseData.results[0].text;
  if (Array.isArray(responseData) && responseData[0]?.generated_text) return responseData[0].generated_text;
  if (typeof responseData === 'string') return responseData;
  return '';
};

/**
 * Apply target authentication headers from API config.
 * Supports: JSON object, multi-line headers, bare token, Bearer/Basic.
 */
export const applyTargetAuthHeaders = (headers: Record<string, string>, targetAuthRaw: any): void => {
  const targetAuth = String(targetAuthRaw || '').trim();
  if (!targetAuth) return;

  // JSON object syntax: {"x-api-key":"...","authorization":"Bearer ..."}
  if (targetAuth.startsWith('{') && targetAuth.endsWith('}')) {
    try {
      const parsed = JSON.parse(targetAuth);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (k && v !== undefined && v !== null) headers[String(k)] = String(v);
        }
        return;
      }
    } catch { /* fall through */ }
  }

  // Multi/single custom header syntax
  const lines = targetAuth.split('\n').map(s => s.trim()).filter(Boolean);
  const allHeaderLike = lines.length > 0 && lines.every(line => /^\s*[A-Za-z0-9-]+\s*:\s*.+$/.test(line));
  if (allHeaderLike) {
    for (const line of lines) {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key && val) headers[key] = val;
    }
    return;
  }

  // Bare token without header name
  if (!targetAuth.includes(':') && !/\s/.test(targetAuth) && !/^Bearer\s+/i.test(targetAuth) && !/^Basic\s+/i.test(targetAuth)) {
    headers['x-api-key'] = targetAuth;
    return;
  }

  // Default: treat as Authorization value
  headers['Authorization'] = targetAuth;
};

/**
 * Build fallback target URL when original target points to root.
 */
export const buildFallbackTargetUrl = (targetUrl: string, requestedPath: string): string | null => {
  if (!isValidHttpUrl(targetUrl) || !requestedPath.startsWith('/')) return null;
  try {
    const parsed = new URL(targetUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    if (normalizedPath && normalizedPath !== '') return null;
    return `${parsed.origin}${requestedPath}`;
  } catch {
    return null;
  }
};
