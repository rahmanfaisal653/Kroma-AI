import crypto from 'crypto';

// Config provider special: endpoint tunggal /alpha/generate (bukan OpenAI-compatible).
export const COMMANDCODE_GO_PROVIDER = {
  id: 'commandcode-go',
  name: 'Command Code Go',
  baseUrl: 'https://api.commandcode.ai/alpha/generate',
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'x-session-id': crypto.randomUUID(),
    'x-command-code-version': '0.25.7',
  };
  // Pass through Authorization from providerHeaders
  if (apiHeaders.Authorization) headers.Authorization = apiHeaders.Authorization;
  return headers;
}

function flattenText(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(item => typeof item === 'string' ? item : item?.text || '').filter(Boolean).join('\n');
  }
  return String(content);
}

function toContentBlocks(content: any): any[] {
  if (content == null) return [{ type: 'text', text: '' }];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) {
    const blocks: any[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        blocks.push({ type: 'text', text: part });
      } else if (part && typeof part === 'object') {
        if (part.type === 'text' && typeof part.text === 'string') {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' || part.type === 'image') {
          blocks.push({ type: 'text', text: '[image omitted]' });
        } else if (typeof part.text === 'string') {
          blocks.push({ type: 'text', text: part.text });
        }
      }
    }
    return blocks.length ? blocks : [{ type: 'text', text: '' }];
  }
  return [{ type: 'text', text: String(content) }];
}

function safeParseJson(s: any): any {
  if (s == null) return {};
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

function convertMessages(messages: any[] = []) {
  const out: any[] = [];
  const systemTexts: string[] = [];

  for (const m of messages) {
    if (!m) continue;
    const role = m.role;

    if (role === 'system') {
      const t = flattenText(m.content);
      if (t) systemTexts.push(t);
      continue;
    }

    if (role === 'tool') {
      const value = typeof m.content === 'string' ? m.content : flattenText(m.content);
      out.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: m.tool_call_id || '',
          toolName: m.name || '',
          output: { type: 'text', value },
        }],
      });
      continue;
    }

    if (role === 'assistant') {
      const blocks: any[] = [];
      const text = flattenText(m.content);
      if (text) blocks.push({ type: 'text', text });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const fn = tc.function || {};
          blocks.push({
            type: 'tool-call',
            toolCallId: tc.id || '',
            toolName: fn.name || '',
            input: safeParseJson(fn.arguments),
          });
        }
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      continue;
    }

    out.push({ role: 'user', content: toContentBlocks(m.content) });
  }

  return { messages: out, system: systemTexts.join('\n\n') };
}

function convertTools(tools: any[]): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const result: any[] = [];
  for (const t of tools) {
    if (!t) continue;
    if (t.type === 'function' && t.function) {
      result.push({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters || { type: 'object' },
      });
    } else if (t.name && (t.input_schema || t.parameters)) {
      result.push({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema || t.parameters,
      });
    }
  }
  return result.length ? result : undefined;
}

export function commandCodeBody(model: string, body: any, messages: any[]) {
  const { messages: converted, system } = convertMessages(messages);
  const params: any = {
    model,
    messages: converted,
    stream: body?.stream !== false,
    max_tokens: body?.max_tokens || body?.max_output_tokens || 4096,
    temperature: body?.temperature ?? 0.3,
  };

  if (system) params.system = system;

  const tools = convertTools(body?.tools);
  if (tools) params.tools = tools;
  if (body?.top_p != null) params.top_p = body.top_p;

  const today = new Date().toISOString().slice(0, 10);

  return {
    threadId: crypto.randomUUID(),
    memory: '',
    config: {
      workingDir: process.cwd(),
      date: today,
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: '',
      mainBranch: '',
      gitStatus: '',
      recentCommits: [],
    },
    params,
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
  const response: any = { id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message, finish_reason: 'stop' }] };
  if (usage) response.usage = { prompt_tokens: Number(usage.inputTokens || usage.prompt_tokens || 0), completion_tokens: Number(usage.outputTokens || usage.completion_tokens || 0), total_tokens: Number(usage.totalTokens || usage.total_tokens || 0) };
  return response;
}
