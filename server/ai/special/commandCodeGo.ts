import crypto from 'crypto';

// Config provider special: endpoint tunggal /alpha/generate (bukan OpenAI-compatible).
export const COMMANDCODE_GO_PROVIDER = {
  id: 'commandcode-go',
  name: 'Command Code Go',
  baseUrl: 'https://api.commandcode.ai/alpha/generate',
  kind: 'special' as const,
};

export const COMMANDCODE_GO_MODELS = [
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'moonshotai/Kimi-K2.6',
  'moonshotai/Kimi-K2.5',
  'zai-org/GLM-5.1',
  'zai-org/GLM-5',
  'MiniMaxAI/MiniMax-M2.7',
  'MiniMaxAI/MiniMax-M2.5',
  'Qwen/Qwen3.6-Max-Preview',
  'Qwen/Qwen3.6-Plus',
  'stepfun/Step-3.5-Flash',
];

export function commandCodeHeaders(apiHeaders: Record<string, string>) {
  return {
    ...apiHeaders,
    Accept: 'text/event-stream',
    'User-Agent': 'commandcode/0.25.7',
    'x-session-id': crypto.randomUUID(),
    'x-command-code-version': '0.25.7',
    'x-cli-environment': 'cli',
  };
}

function textOf(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => typeof item === 'string' ? item : item?.text || '').filter(Boolean).join('\n');
  return String(content);
}

export function commandCodeBody(model: string, body: any, messages: any[]) {
  const system = messages.filter(m => m?.role === 'system').map(m => textOf(m.content)).filter(Boolean).join('\n\n');
  const converted = messages.filter(m => m?.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'tool' ? 'tool' : 'user',
    content: [{ type: 'text', text: textOf(m.content) }],
  }));
  return {
    threadId: crypto.randomUUID(),
    memory: '',
    config: { workingDir: process.cwd(), date: new Date().toISOString().slice(0, 10), environment: process.platform, structure: [], isGitRepo: false, currentBranch: '', mainBranch: '', gitStatus: '', recentCommits: [] },
    params: { model, messages: converted, stream: true, max_tokens: body?.max_tokens || body?.max_output_tokens || 4096, temperature: body?.temperature ?? 0.3, ...(system ? { system } : {}) },
  };
}

export function commandCodeToOpenAI(raw: string, model: string) {
  let content = '';
  let reasoning = '';
  let usage: any;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: any;
    try { event = JSON.parse(trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed); } catch { continue; }
    if (event.type === 'text-delta') content += event.text || event.delta || '';
    if (event.type === 'reasoning-delta') reasoning += event.text || '';
    if (event.type === 'finish-step' && event.usage) usage = event.usage;
    if (event.type === 'finish' && (event.totalUsage || usage)) usage = event.totalUsage || usage;
    if (event.type === 'error') throw new Error(typeof event.error === 'string' ? event.error : JSON.stringify(event.error || event.message || 'Command Code error'));
  }
  const message: any = { role: 'assistant', content };
  if (reasoning) message.reasoning_content = reasoning;
  const response: any = { id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message, finish_reason: 'stop' }] };
  if (usage) response.usage = { prompt_tokens: Number(usage.inputTokens || usage.prompt_tokens || 0), completion_tokens: Number(usage.outputTokens || usage.completion_tokens || 0), total_tokens: Number(usage.totalTokens || usage.total_tokens || 0) };
  return response;
}
