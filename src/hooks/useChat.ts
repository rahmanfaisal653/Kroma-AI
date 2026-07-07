import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, GatewayResponse } from '../types/api';
import { gatewayApi } from '../services/api';
import { generateMessageId } from '../features/chat/utils/messageHelpers';
import { trimMessagesToFit, estimateMessagesTokens } from '../features/chat/utils/tokenCounter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChatOptions {
  endpoint: string;
  userKey: string;
  model?: string;
  stream?: boolean;
  maxContextTokens?: number;
  onCostUpdate?: (cost: number, remaining: number) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  contextTokens: number;
  sendMessage: (content: string, overrides?: Record<string, any>) => Promise<void>;
  regenerate: (messageId?: string) => Promise<void>;
  editAndRegenerate: (messageId: string, newContent: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  abortCurrentRequest: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequestMessages(
  messages: ChatMessage[],
  overrides?: Record<string, any>,
  maxContextTokens?: number
) {
  // Deep clone to avoid mutating original messages
  let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

  // Inject system prompt
  if (overrides?.system && !apiMessages.some(m => m.role === 'system')) {
    apiMessages = [{ role: 'system' as const, content: overrides.system }, ...apiMessages];
  }

  // ── Strip ALL previously injected scraped context from history ──
  // This prevents old web content from polluting the current context
  const WEB_CONTEXT_MARKER = '[WEB CONTEXT]';
  apiMessages = apiMessages
    // Remove standalone scraped context system messages
    .filter(m => {
      if (m.role === 'system' && typeof m.content === 'string' && m.content.includes(WEB_CONTEXT_MARKER)) {
        return false;
      }
      return true;
    })
    // Strip appended scraped content from user messages
    .map(m => {
      if (m.role === 'user' && typeof m.content === 'string' && m.content.includes(WEB_CONTEXT_MARKER)) {
        const idx = m.content.indexOf(`\n\n${WEB_CONTEXT_MARKER}`);
        if (idx > 0) {
          return { ...m, content: m.content.substring(0, idx) };
        }
      }
      return m;
    });

  // Context windowing — trim if exceeding token budget
  if (maxContextTokens && maxContextTokens > 0) {
    apiMessages = trimMessagesToFit(apiMessages, maxContextTokens);
  }

  // ── Inject FRESH scraped context as system message (after system prompt) ──
  if (overrides?.scrapedContext) {
    // Limit scraped context to prevent request from being too large
    const MAX_SCRAPE_INJECT = 16000;
    let scrapeContent = overrides.scrapedContext;
    if (scrapeContent.length > MAX_SCRAPE_INJECT) {
      scrapeContent = scrapeContent.substring(0, MAX_SCRAPE_INJECT) + '\n\n...[content truncated for brevity]';
    }
    
    const contextMsg = {
      role: 'system' as const,
      content:
        `[WEB CONTEXT] Below is the content scraped from the user's shared URL.\n` +
        `IMPORTANT RULES:\n` +
        `- Answer ONLY based on this web context.\n` +
        `- Do NOT reference any previously scraped pages or content.\n` +
        `- If the question is not related to this content, say so.\n` +
        `- Be concise, structured, and well-formatted.\n\n` +
        `---\n${scrapeContent}\n---`,
    };
    const sysIdx = apiMessages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      apiMessages.splice(sysIdx + 1, 0, contextMsg);
    } else {
      apiMessages.unshift(contextMsg);
    }
  }

  // Handle image attachment for vision models
  if (overrides?.image_url) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.content = [
        { type: 'text', text: lastMsg.content },
        { type: 'image_url', image_url: { url: overrides.image_url } },
      ] as any;
    }
  }

  return apiMessages;
}

function buildRequestBody(
  apiMessages: Array<{ role: string; content: any }>,
  model?: string,
  overrides?: Record<string, any>
) {
  const body: Record<string, any> = { messages: apiMessages };
  if (model) body.model = model;
  if (overrides?.temperature !== undefined) body.temperature = overrides.temperature;
  if (overrides?.max_tokens !== undefined) body.max_tokens = overrides.max_tokens;
  return body;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(options: UseChatOptions): UseChatReturn {
  const { endpoint, userKey, model, stream = false, maxContextTokens, onCostUpdate } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const overridesRef = useRef<Record<string, any>>({});
  const isSendingRef = useRef(false); // Mutex — prevent concurrent sends
  const mountedRef = useRef(true);    // Track mount status

  // Abort in-flight request when endpoint/model changes (user switched model)
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        isSendingRef.current = false;
      }
    };
  }, [endpoint, model]);

  // Cleanup on unmount — abort any in-flight request
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // ---- Computed ----
  const contextTokens = estimateMessagesTokens(
    messages.map(m => ({ content: m.content }))
  );

  // ---- Abort ----
  const abortCurrentRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isSendingRef.current = false;
    setIsLoading(false);
  }, []);

  // ---- Core send (internal) ----
  // CRITICAL FIX: This must be called OUTSIDE of setState updaters.
  // React StrictMode calls setState updaters twice, which caused double-sends.
  const sendCore = useCallback(async (
    allChatMessages: ChatMessage[],
    overrides?: Record<string, any>
  ) => {
    // Mutex guard — prevent concurrent sends
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    setIsLoading(true);
    setError(null);

    const apiMessages = buildRequestMessages(allChatMessages, overrides, maxContextTokens);
    const body = buildRequestBody(apiMessages, model, overrides);

    // Create AbortController for this request
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (stream) {
        // ---- Streaming mode ----
        const assistantId = generateMessageId();
        const assistantMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          thinking: '',
          timestamp: Date.now(),
          model,
        };

        if (!mountedRef.current) return;
        setMessages(prev => [...prev, assistantMsg]);

        const response = await gatewayApi.chatStream(
          endpoint, body, userKey, controller.signal
        );
        if (!response.ok) {
          let errorText = `HTTP ${response.status}`;
          try {
            const errData = await response.json();
            // Extract error details from backend response
            const mainError = errData.error || errData.message || 'Stream failed';
            const detail = errData.detail || '';
            const code = errData.code || '';
            const upstreamStatus = errData.upstream_status || '';
            
            // Build comprehensive error message
            errorText = mainError;
            if (detail) errorText += `: ${detail}`;
            if (code) errorText += ` [${code}]`;
            if (upstreamStatus) errorText += ` (upstream: ${upstreamStatus})`;
          } catch {
            // JSON parse failed, try to get text
            try {
              errorText = await response.text() || `HTTP ${response.status}`;
            } catch {
              errorText = `Stream gagal (HTTP ${response.status})`;
            }
          }
          throw new Error(errorText);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let accContent = '';
        let accThinking = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (controller.signal.aborted || !mountedRef.current) {
              reader.cancel();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            // Handle both OpenAI SSE ("data: ...") and raw NDJSON lines
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
              // Extract JSON payload from either format
              let data: string;
              if (line.startsWith('data:')) {
                data = line.slice(5).trim();
              } else if (line.trim().startsWith('{')) {
                data = line.trim();
              } else {
                continue; // Skip non-data lines
              }

              if (data === '[DONE]') break;
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                // Support multiple response formats:
                // OpenAI: parsed.choices[0].delta.content
                // Ollama: parsed.message.content or parsed.response
                const deltaContent = parsed.choices?.[0]?.delta?.content
                  || parsed.message?.content
                  || parsed.response
                  || '';
                const deltaThinking = parsed.choices?.[0]?.delta?.thinking
                  || parsed.message?.thinking
                  || '';

                if (deltaContent || deltaThinking) {
                  accContent += deltaContent;
                  accThinking += deltaThinking;

                  if (mountedRef.current) {
                    // Capture current values for closure safety
                    const c = accContent;
                    const t = accThinking;
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? { ...m, content: c, thinking: t }
                          : m
                      )
                    );
                  }
                }
              } catch {
                /* skip non-JSON lines */
              }
            }
          }
        } catch (readErr: any) {
          if (readErr.name !== 'AbortError') throw readErr;
        }
      } else {
        // ---- Standard (non-streaming) mode ----
        const data = await gatewayApi.chat(endpoint, body, userKey);
        const content = data.choices?.[0]?.message?.content || '';

        const assistantMsg: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          model: data.model,
          cost: data._gateway?.cost,
        };

        if (mountedRef.current) {
          setMessages(prev => [...prev, assistantMsg]);
        }

        if (data._gateway && onCostUpdate) {
          onCostUpdate(data._gateway.cost, data._gateway.credits_remaining);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      
      // Detailed error logging
      console.error('[useChat] Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        stack: err.stack
      });
      
      const errorData = err.response?.data || {};
      const msg = errorData.error || err.message || 'Gagal mendapat respons dari server.';
      
      // Build full error message: error + suggestion
      let fullMessage = msg;
      if (errorData.suggestion) {
        fullMessage += `\n💡 ${errorData.suggestion}`;
      }
      if (errorData.error_code) {
        fullMessage += ` [${errorData.error_code}]`;
      }
      
      if (mountedRef.current) {
        setError(fullMessage);
        // Also inject error as an assistant message bubble so it shows in chat
        const errorMsg: ChatMessage = {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${fullMessage}`,
          timestamp: Date.now(),
          isError: true,
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      abortRef.current = null;
      isSendingRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [endpoint, userKey, model, stream, maxContextTokens, onCostUpdate]);

  // ---- Public: send message ----
  // CRITICAL FIX: sendCore is called AFTER setMessages, not inside it.
  // This prevents double-sends caused by React StrictMode.
  const sendMessage = useCallback(async (
    content: string,
    overrides?: Record<string, any>
  ) => {
    if (!content.trim() || !userKey) return;

    // If there's a stuck request, abort it before starting new one
    if (isSendingRef.current && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      isSendingRef.current = false;
    }

    if (isSendingRef.current) return; // Still locked somehow — bail

    overridesRef.current = overrides || {};
    setError(null); // Clear any previous error

    const userMsg: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    // Step 1: Add user message to state
    const updatedMessages = await new Promise<ChatMessage[]>(resolve => {
      setMessages(prev => {
        const next = [...prev, userMsg];
        resolve(next);
        return next;
      });
    });

    // Step 2: Send to API (OUTSIDE setState — safe from StrictMode double-fire)
    await sendCore(updatedMessages, overrides);
  }, [userKey, sendCore]);

  // ---- Public: regenerate last assistant response ----
  const regenerate = useCallback(async (messageId?: string) => {
    if (isSendingRef.current) return;

    // Step 1: Remove assistant message from state
    const trimmed = await new Promise<ChatMessage[]>(resolve => {
      setMessages(prev => {
        const targetIdx = messageId
          ? prev.findIndex(m => m.id === messageId)
          : prev.length - 1;

        if (targetIdx < 0 || prev[targetIdx]?.role !== 'assistant') {
          resolve(prev);
          return prev;
        }

        const result = prev.slice(0, targetIdx);
        resolve(result);
        return result;
      });
    });

    // Step 2: Re-send (OUTSIDE setState)
    if (trimmed.length > 0) {
      await sendCore(trimmed, overridesRef.current);
    }
  }, [sendCore]);

  // ---- Public: edit user message and regenerate from that point ----
  const editAndRegenerate = useCallback(async (
    messageId: string,
    newContent: string
  ) => {
    if (!newContent.trim() || isSendingRef.current) return;

    // Step 1: Edit message and trim
    const trimmed = await new Promise<ChatMessage[]>(resolve => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === messageId);
        if (idx < 0 || prev[idx].role !== 'user') {
          resolve(prev);
          return prev;
        }
        const edited = { ...prev[idx], content: newContent.trim() };
        const result = [...prev.slice(0, idx), edited];
        resolve(result);
        return result;
      });
    });

    // Step 2: Re-send (OUTSIDE setState)
    if (trimmed.length > 0) {
      await sendCore(trimmed, overridesRef.current);
    }
  }, [sendCore]);

  // ---- Public: clear ----
  const clearMessages = useCallback(() => {
    abortCurrentRequest();
    setMessages([]);
    setError(null);
  }, [abortCurrentRequest]);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    isLoading,
    error,
    contextTokens,
    sendMessage,
    regenerate,
    editAndRegenerate,
    clearMessages,
    clearError,
    setMessages,
    abortCurrentRequest,
  };
}
