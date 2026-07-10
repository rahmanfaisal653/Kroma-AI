import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3, Database, Route, Server, ShieldCheck, TerminalSquare } from 'lucide-react';

const curl = `curl -s -X POST http://localhost:20202/v1/chat/completions \\
  -H "x-api-key: kg_live_xxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "pc-hitam/llama3:latest",
    "messages": [
      {"role":"user","content":"Return a 3-line incident summary."}
    ],
    "rag": true
  }'`;

const logs = [
  ['200', 'pc-hitam/llama3:latest', '812ms', '1.9k', 'internal'],
  ['200', 'pc-putih/qwen2.5-coder', '640ms', '3.2k', 'internal'],
  ['403', 'token-router/nvidia/free', '14ms', '0', 'partner'],
  ['502', 'deepseek-andi/chat', '3.0s', '0', 'partner'],
];

const providers = [
  { id: 'pc-hitam', status: 'healthy', models: 5, latency: '812ms' },
  { id: 'pc-putih', status: 'healthy', models: 122, latency: '640ms' },
  { id: 'token-router', status: 'degraded', models: 1, latency: '1.8s' },
];

function StatusDot({ tone }: { tone: 'healthy' | 'degraded' | 'down' }) {
  const cls = tone === 'healthy' ? 'bg-emerald-400' : tone === 'degraded' ? 'bg-amber-400' : 'bg-rose-400';
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function CodeBlock({ code }: { code: string }) {
  return <pre className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-4 text-xs leading-6 text-slate-200"><code>{code}</code></pre>;
}

function Metric({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-100';
  return <div className="rounded border border-slate-700 bg-slate-900 p-4">
    <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`mt-2 font-mono text-2xl font-semibold ${color}`}>{value}</p>
    <p className="mt-1 text-xs text-slate-500">{sub}</p>
  </div>;
}

function Architecture() {
  const box = 'rounded border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200';
  return <div className="rounded border border-slate-700 bg-slate-950 p-4">
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr] md:items-center">
      <div className={box}><TerminalSquare size={16} className="mb-2 text-slate-400" />Client / KroomBridge</div>
      <ArrowRight className="hidden text-slate-600 md:block" size={18} />
      <div className={box}><Route size={16} className="mb-2 text-slate-400" />Kroma Gateway<br /><span className="text-xs text-slate-500">auth · routing · RAG · logs</span></div>
      <ArrowRight className="hidden text-slate-600 md:block" size={18} />
      <div className={box}><Server size={16} className="mb-2 text-slate-400" />Providers<br /><span className="text-xs text-slate-500">OpenAI · Ollama · LM Studio</span></div>
    </div>
  </div>;
}

export default function LandingPage() {
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/kroma-ai-wordmark.png" alt="Kroma AI" className="kroma-wordmark-on-dark h-8 w-auto" />
          <span className="rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-500">v1.0.0-stable</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
          <a href="#gateway" className="hover:text-slate-100">Gateway</a>
          <a href="#dashboard" className="hover:text-slate-100">Dashboard</a>
          <a href="#docs" className="hover:text-slate-100">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Login</Link>
          <Link to="/docs" className="rounded bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-white">API Docs</Link>
        </div>
      </div>
    </header>

    <main>
      <section id="gateway" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400"><StatusDot tone="healthy" /> 99.98% local gateway uptime</div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 md:text-6xl">The Cloud-Native Gateway for LLMs</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">Route, secure, and observe AI traffic across OpenAI-compatible providers, local Ollama nodes, LM Studio hosts, and partner-facing API keys.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white">Open dashboard <ArrowRight size={14} /></Link>
            <Link to="/docs" className="inline-flex items-center gap-2 rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"><BookOpen size={14} /> Read API docs</Link>
          </div>
        </div>
        <CodeBlock code={curl} />
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-6 md:grid-cols-4">
          <Metric label="requests / 24h" value="184,229" sub="across 6 providers" />
          <Metric label="healthy providers" value="4 / 6" sub="2 degraded, 0 hidden" tone="emerald" />
          <Metric label="p95 latency" value="812ms" sub="Ollama + LM Studio" tone="amber" />
          <Metric label="token throughput" value="41.8M" sub="input + output tokens" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="font-mono text-xs uppercase tracking-wider text-slate-500">routing plane</p><h2 className="mt-2 text-2xl font-semibold">Built for AI traffic, not generic API demos.</h2></div>
        </div>
        <Architecture />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            [ShieldCheck, 'Guardrails', 'Internal/Partner visibility, disabled provider blocking, API-key scoped routing.'],
            [Clock3, 'Provider health', 'Every provider response includes status, error reason, and model count.'],
            [Database, 'Optional RAG', 'Inject Chroma-backed context into chat traffic only when requested.'],
          ].map(([Icon, title, desc]: any) => <div key={title} className="rounded border border-slate-800 bg-slate-900 p-4">
            <Icon size={17} className="text-slate-400" /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p>
          </div>)}
        </div>
      </section>

      <section id="dashboard" className="mx-auto max-w-7xl px-5 py-14">
        <div className="rounded border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div><p className="text-sm font-medium">Developer Dashboard</p><p className="font-mono text-xs text-slate-500">/providers · /keys · /usage · /knowledge</p></div>
            <span className="rounded border border-emerald-900 bg-emerald-950 px-2 py-1 text-xs text-emerald-300">gateway online</span>
          </div>
          <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
            <div className="border-b border-slate-800 p-4 lg:border-b-0 lg:border-r">
              <p className="mb-3 text-xs uppercase tracking-wider text-slate-500">Active providers</p>
              <div className="space-y-2">
                {providers.map(p => <div key={p.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="min-w-0"><p className="truncate font-mono text-sm">{p.id}</p><p className="text-xs text-slate-500">{p.models} models · {p.latency}</p></div>
                  <StatusDot tone={p.status as any} />
                </div>)}
              </div>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2">status</th><th>model</th><th>latency</th><th>tokens</th><th>key type</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map(row => <tr key={row.join(':')} className="font-mono text-xs text-slate-300"><td className="py-3"><span className={row[0] === '200' ? 'text-emerald-300' : row[0] === '403' ? 'text-amber-300' : 'text-rose-300'}>{row[0]}</span></td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="docs" className="mx-auto max-w-7xl px-5 py-14">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr_220px]">
          <aside className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400"><p className="mb-3 text-xs uppercase tracking-wider text-slate-500">API Reference</p><p>/v1</p><p>/v1/providers</p><p>/v1/chat/completions</p></aside>
          <article className="rounded border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">OpenAI-compatible chat</h2><p className="mt-2 text-sm leading-6 text-slate-400">Use provider-prefixed model ids returned from <code className="font-mono text-slate-200">/v1/providers</code>. Kroma forwards the request to the selected upstream and returns a compact OpenAI-style response.</p><div className="mt-4"><CodeBlock code={curl} /></div></article>
          <aside className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400"><p className="mb-3 text-xs uppercase tracking-wider text-slate-500">On this page</p><p>Authentication</p><p>Provider sync</p><p>Chat request</p><p>Error format</p></aside>
        </div>
      </section>
    </main>
  </div>;
}
