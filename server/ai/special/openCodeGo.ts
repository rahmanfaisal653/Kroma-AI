export const OPENCODE_GO_MODELS = ['kimi-k2', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'minimax-m3', 'minimax-m2.7', 'minimax-m2.5'];
export const OPENCODE_MESSAGES_MODELS = new Set(['minimax-m3', 'minimax-m2.7', 'minimax-m2.5', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus']);

export function openCodeMessagesBody(body: any, model: string) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.filter((msg: any) => msg.role === 'system').map((msg: any) => msg.content).filter(Boolean).join('\n\n');
  return {
    model,
    max_tokens: body.max_tokens || 1024,
    system: system || undefined,
    messages: messages.filter((msg: any) => msg.role !== 'system').map((msg: any) => ({ role: msg.role, content: msg.content })),
  };
}

export function openCodeMessagesToOpenAI(data: any, requestedModel: string, providerModel: string) {
  const content = Array.isArray(data?.content)
    ? data.content.map((part: any) => part?.text || '').join('')
    : data?.content || data?.message?.content || '';
  return {
    id: data?.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: data?.stop_reason || 'stop' }],
    usage: data?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    _gateway: { provider_model: providerModel, native: 'opencode-messages' },
  };
}
