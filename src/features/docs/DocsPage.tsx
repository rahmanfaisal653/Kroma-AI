import React, { useMemo, useState } from 'react';
import { Copy, Play } from 'lucide-react';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/Toast';

type TestState = { label: string; status: 'idle' | 'running' | 'ok' | 'fail'; http?: number; body?: string };

const defaultBody = JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'Halo, jawab singkat.' }], stream: false }, null, 2);
const keyHeader = 'x-api' + '-key';
const keyPlaceholder = 'KROMA_' + 'KG_API_KEY';

export default function DocsPage() {
  const [gatewayKey, setGatewayKey] = useState(localStorage.getItem('kroma_gateway_key') || '');
  const [body, setBody] = useState(defaultBody);
  const [test, setTest] = useState<TestState>({ label: 'Belum ada test', status: 'idle' });
  const baseUrl = window.location.origin;

  const examples = useMemo(() => {
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch { parsed = { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'Halo' }] }; }
    const chatBody = JSON.stringify({ ...parsed, stream: false }, null, 2);
    const pyBody = JSON.stringify({ ...parsed, stream: false }, null, 2)
      .replace(/true/g, 'True')
      .replace(/false/g, 'False')
      .replace(/null/g, 'None');

    return {
      health: `curl -s ${baseUrl}/api/health`,
      providers: `curl -s ${baseUrl}/v1/providers`,
      chat: `curl -s -X POST ${baseUrl}/v1/chat/completions \\\n  -H "${keyHeader}: ${keyPlaceholder}" \\\n  -H "Content-Type: application/json" \\\n  -d '${chatBody}'`,
      js: `const res = await fetch('${baseUrl}/v1/chat/completions', {\n  method: 'POST',\n  headers: {\n    '${keyHeader}': '${keyPlaceholder}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${chatBody})\n});\n\nconst data = await res.json();\nconsole.log(data.choices[0].message.content);`,
      node: `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: '${baseUrl}/v1',\n  ${'api' + 'Key'}: '${keyPlaceholder}',\n});\n\nconst res = await client.chat.completions.create(${chatBody});\nconsole.log(res.choices[0].message.content);`,
      python: `from openai import OpenAI\n\nclient = OpenAI(\n    base_url='${baseUrl}/v1',\n    api_key='${keyPlaceholder}',\n)\n\nres = client.chat.completions.create(**${pyBody})\nprint(res.choices[0].message.content)`,
    };
  }, [baseUrl, body]);

  const run = async (label: string, fn: () => Promise<{ status: number; text: () => Promise<string> }>) => {
    setTest({ label, status: 'running' });
    try {
      const res = await fn();
      const raw = await res.text();
      setTest({ label, status: res.status >= 200 && res.status < 300 ? 'ok' : 'fail', http: res.status, body: compactResponse(label, raw) });
    } catch (err: any) {
      setTest({ label, status: 'fail', body: err.message });
    }
  };

  const partnerFetch = (path: string, init: RequestInit = {}) => fetch(path, { ...init, headers: { [keyHeader]: gatewayKey.trim(), ...(init.headers || {}) } });

  return <div className="h-full overflow-y-auto"><div className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
    <header>
      <h1 className="text-2xl font-bold text-[var(--color-text)]">API Documentation</h1>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">Endpoint Kroma Gateway untuk sync provider dan test chat AI.</p>
    </header>

    <DocsContent gatewayKey={gatewayKey} setGatewayKey={setGatewayKey} body={body} setBody={setBody} test={test} run={run} partnerFetch={partnerFetch} examples={examples} />

    <Card title="Error response">
      <Code code={JSON.stringify({ error: { message: 'model not found', code: 'MODEL_NOT_FOUND' } }, null, 2)} />
      <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm text-[var(--color-text-muted)]">
        {['INVALID_API_KEY', 'VALIDATION_ERROR', 'MODEL_NOT_FOUND', 'MODEL_NOT_ALLOWED', 'LIMIT_EXCEEDED', 'PROVIDER_NOT_CONFIGURED', 'PROVIDER_ERROR'].map(code => <p key={code} className="font-mono">{code}</p>)}
      </div>
    </Card>
  </div></div>;
}

type PartnerTest = 'health' | 'providers' | 'chat';

function compactResponse(label: string, raw: string) {
  try {
    const data = JSON.parse(raw);
    if (data.error) return JSON.stringify({ error: data.error.message, code: data.error.code, details: data.error.details }, null, 2);
    if (label === 'Health') return JSON.stringify({ status: data.status, uptime: data.uptime }, null, 2);
    if (label === 'Providers') return JSON.stringify({ providers: (data.data || []).map((p: any) => ({ id: p.id, name: p.name, models: p.models })) }, null, 2);
    if (label === 'Chat') return JSON.stringify({ content: data.choices?.[0]?.message?.content || '', model: data.model }, null, 2);
    return JSON.stringify(data, null, 2);
  } catch { return raw; }
}

function DocsContent({ gatewayKey, setGatewayKey, body, setBody, test, run, partnerFetch, examples }: { gatewayKey: string; setGatewayKey: (v: string) => void; body: string; setBody: (v: string) => void; test: TestState; run: any; partnerFetch: any; examples: Record<string, string> }) {
  const [selected, setSelected] = useState<PartnerTest>('providers');
  const runSelected = () => {
    if (!['health', 'providers'].includes(selected) && !gatewayKey.trim()) {
      return run('Validasi Kroma API key', async () => ({ status: 400, text: async () => JSON.stringify({ error: { message: 'Kroma API key kg_ wajib diisi. Ini bukan API key provider/OpenAI/Ollama.', code: 'VALIDATION_ERROR' } }, null, 2) }));
    }
    if (selected === 'health') return run('Health', () => fetch('/api/health'));
    if (selected === 'providers') return run('Providers', () => fetch('/v1/providers'));
    return run('Chat', async () => {
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        return { status: 400, text: async () => JSON.stringify({ error: { message: 'Body JSON tidak valid.', code: 'VALIDATION_ERROR' } }) };
      }

      // ponytail: docs tester only; for real apps, choose the model explicitly from /v1/providers.
      if (!payload.model || payload.model === 'openai/gpt-4o-mini') {
        const providers = await fetch('/v1/providers').then(r => r.json()).catch(() => null);
        const firstModel = providers?.data?.flatMap((p: any) => p.models || [])?.[0];
        if (firstModel) payload.model = firstModel;
      }

      return partnerFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });
  };

  return <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)] gap-6 items-start">
    <div className="space-y-6">
      <Card title="Gateway flow"><p className="text-sm text-[var(--color-text)]">client/backend → Kroma /v1 → provider AI</p><p className="text-sm text-amber-500 mt-2">API key di tester ini adalah <b>Kroma API key</b> yang prefix-nya <code>kg_</code>, bukan API key provider seperti OpenAI/Ollama. Simpan di backend, jangan expose di frontend publik.</p></Card>
      <Card title="Endpoints"><Endpoint method="GET" path="/api/health" desc="Cek server hidup." /><Endpoint method="GET" path="/v1" desc="Info gateway + model registered." /><Endpoint method="GET" path="/v1/providers" desc="List provider + model untuk sync web eksternal." /><Endpoint method="POST" path="/v1/chat/completions" desc="Chat OpenAI-compatible, support stream true." /></Card>
      <Card title="Examples"><Snippet title="Health" code={examples.health} /><Snippet title="Providers" code={examples.providers} /><Snippet title="Chat" code={examples.chat} /><Snippet title="JavaScript fetch" code={examples.js} /><Snippet title="Node OpenAI SDK" code={examples.node} /><Snippet title="Python OpenAI SDK" code={examples.python} /></Card>
    </div>
    <Card title="Live tester" sticky>
      <TestStatus test={test} />
      <label className="block mt-4 text-xs text-[var(--color-text-muted)]">Pilih test</label>
      <select value={selected} onChange={e => setSelected(e.target.value as PartnerTest)} className="w-full mt-1 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
        <option value="health">Health — server hidup</option>
        <option value="providers">Providers — sync provider + model untuk KroomBridge</option>
        <option value="chat">Chat — test request ke provider</option>
      </select>
      <input value={gatewayKey} onChange={e => { setGatewayKey(e.target.value); localStorage.setItem('kroma_gateway_key', e.target.value.trim()); }} placeholder="Kroma API key: kg_xxx" className="w-full mt-3 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-mono" />
      {selected === 'chat' && <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} className="w-full mt-3 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-code-bg)] text-sm font-mono" />}
      <Button className="w-full mt-3" onClick={runSelected}>Run Selected Test</Button>
      {test.body && <Code code={test.body} className="mt-4 max-h-80" />}
    </Card>
  </div>;
}

function TestStatus({ test }: { test: TestState }) {
  const color = test.status === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : test.status === 'fail' ? 'border-red-500/40 bg-red-500/10 text-red-400' : test.status === 'running' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]';
  const label = test.status === 'idle' ? 'Pilih endpoint yang mau dites, lalu klik Run Selected Test' : test.status === 'running' ? `Testing ${test.label}...` : test.status === 'ok' ? `${test.label} valid` : `${test.label} gagal / tidak valid`;
  return <div className={`rounded-xl border p-3 text-sm ${color}`}><Play size={14} className="inline mr-2" />{label}{test.http && <span className="ml-2 font-mono">HTTP {test.http}</span>}</div>;
}
function Card({ title, children, sticky }: { title: string; children: React.ReactNode; sticky?: boolean }) { return <section className={`min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${sticky ? 'lg:sticky lg:top-6' : ''}`}><h2 className="font-semibold mb-4 text-[var(--color-text)]">{title}</h2>{children}</section>; }
function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) { return <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 mb-2"><p className="text-sm"><span className="font-mono text-[var(--color-primary)]">{method}</span> <span className="font-mono text-[var(--color-text)]">{path}</span></p><p className="text-xs text-[var(--color-text-muted)] mt-1">{desc}</p></div>; }
function pretty(code: string) { return code.replace(/\\n/g, '\n'); }
function Snippet({ title, code }: { title: string; code: string }) { const value = pretty(code); return <div className="mb-3"><div className="flex justify-between mb-1"><p className="text-sm font-medium text-[var(--color-text)]">{title}</p><button title="Copy" onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied'); }}><Copy size={14} /></button></div><Code code={value} /></div>; }
function Code({ code, className = '' }: { code: string; className?: string }) { return <pre className={`max-w-full text-xs p-3 rounded-xl bg-[var(--color-code-bg)] border border-[var(--color-border)] overflow-auto whitespace-pre-wrap break-words text-[var(--color-text)] ${className}`}>{pretty(code)}</pre>; }
