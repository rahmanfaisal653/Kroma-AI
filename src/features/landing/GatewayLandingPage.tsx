import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Database, Route, Server, ShieldCheck, TerminalSquare } from 'lucide-react';

const curl = `curl -s -X POST http://localhost:20202/v1/chat/completions \\
  -H "x-api-key: kg_live_xxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "groq/llama-3.3-70b-versatile",
    "messages": [{"role":"user","content":"Return a 3-line incident summary."}],
    "rag": true
  }'`;

const logs = [
  ['200', 'groq/llama-3.3-70b-versatile', '812ms', '1.9k', 'internal'],
  ['200', 'gemini/gemini-2.5-flash', '640ms', '3.2k', 'internal'],
  ['403', 'openrouter/meta-llama/llama-3.1-8b-instruct:free', '14ms', '0', 'partner'],
  ['502', 'deepseek/deepseek-chat', '3.0s', '0', 'partner'],
];
export default function GatewayLandingPage() {
  return <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-text)]">
    <div className="mx-auto max-w-7xl px-5 py-6 space-y-7">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-3">
          <img src="/brand/kroma-ai-wordmark.png" alt="Kroma AI" className="h-8 w-auto kroma-logo-mark" />
          <span className="rounded border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-muted)]">v1.0.0-stable</span>
        </div>
        <div className="hidden gap-5 text-sm text-[var(--color-text-muted)] md:flex"><a href="#gateway">Introduction</a><a href="#features">Features</a><a href="#dashboard">Dashboard</a><a href="#docs">Docs</a></div>
      </header>

      <section id="gateway" className="grid gap-6 py-5 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 99.98% local gateway uptime</div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">The Cloud-Native Gateway for LLMs</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--color-text-muted)]">Route, secure, and observe AI traffic across OpenAI-compatible providers, local Ollama nodes, LM Studio hosts, and partner-facing API keys.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link to="/docs" className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-bg)]">Read API docs <ArrowRight size={14} /></Link><Link to="/models" className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface)]"><Server size={14} /> Providers</Link></div>
        </div>
        <CodeBlock code={curl} />
      </section>

      <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Frequently used routes</p>
        <div className="grid gap-3 md:grid-cols-3">
          <MiniRoute provider="groq" model="llama-3.3-70b-versatile" use="fast general chat" />
          <MiniRoute provider="gemini" model="gemini-2.5-flash" use="reasoning / multimodal-ready" />
          <MiniRoute provider="openrouter" model="meta-llama/llama-3.1-8b-instruct:free" use="partner fallback" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="requests / 24h" value="184,229" sub="across 6 providers" />
        <Metric label="healthy providers" value="—" sub="see Providers page" tone="emerald" />
        <Metric label="p95 latency" value="812ms" sub="Ollama + LM Studio" tone="amber" />
        <Metric label="token throughput" value="41.8M" sub="input + output" />
      </section>

      <section className="space-y-5">
        <div><p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">routing plane</p><h2 className="mt-2 text-2xl font-semibold">Built for AI traffic, not generic API demos.</h2></div>
        <Architecture />
      </section>

      <section id="features" className="space-y-5">
        <div><p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">features</p><h2 className="mt-2 text-2xl font-semibold">Operational controls for gateway traffic.</h2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {[[ShieldCheck, 'Guardrails', 'Internal/Partner visibility, disabled provider blocking, API-key scoped routing.'], [Clock3, 'Provider health', 'Provider response includes status, error reason, and model count.'], [Database, 'Clean proxy', 'Route OpenAI-compatible and provider-specific traffic with minimal transformation.']].map(([Icon, title, desc]: any) => <Card key={title}><Icon size={17} className="text-[var(--color-text-muted)]" /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{desc}</p></Card>)}
        </div>
      </section>

      <section id="dashboard" className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"><div><p className="text-sm font-medium">Developer Dashboard</p><p className="font-mono text-xs text-[var(--color-text-muted)]">/providers · /keys · /usage</p></div><span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600">gateway on</span></div>
        <div className="overflow-x-auto p-4"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-muted)]"><tr><th className="py-2">status</th><th>model</th><th>latency</th><th>tokens</th><th>key type</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{logs.map(row => <tr key={row.join(':')} className="font-mono text-xs"><td className="py-3">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td></tr>)}</tbody></table></div>
      </section>

      <section id="docs" className="grid gap-6 pb-10 lg:grid-cols-[220px_1fr_220px]"><Card><p className="mb-3 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">API Reference</p><p>/v1</p><p>/v1/models</p><p>/v1/chat/completions</p></Card><Card><h2 className="text-xl font-semibold">OpenAI-compatible chat</h2><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Use provider-prefixed model ids returned from <code>/v1/models</code>.</p><div className="mt-4"><CodeBlock code={curl} /></div></Card><Card><p className="mb-3 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">On this page</p><p>Authentication</p><p>Provider sync</p><p>Chat request</p></Card></section>
    </div>
  </div>;
}

function CodeBlock({ code }: { code: string }) { return <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-code-bg)] p-4 text-xs leading-6 text-[var(--color-text)]"><code>{code}</code></pre>; }

function Metric({ label, value, sub, tone = 'normal' }: { label: string; value: string; sub: string; tone?: 'normal' | 'emerald' | 'amber' }) { const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-[var(--color-text)]'; return <Card><p className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p><p className={`mt-2 font-mono text-2xl font-semibold ${color}`}>{value}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{sub}</p></Card>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">{children}</div>; }
function MiniRoute({ provider, model, use }: { provider: string; model: string; use: string }) { return <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3"><p className="font-mono text-sm text-[var(--color-text)]">{provider}/{model}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{use}</p></div>; }
function Architecture() { const box = 'min-h-[96px] h-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm flex flex-col justify-center'; return <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-4"><div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch"><div className={box}><TerminalSquare size={16} className="mb-2 text-[var(--color-text-muted)]" />Client / KroomBridge</div><div className="hidden items-center md:flex"><ArrowRight className="text-[var(--color-text-muted)]" size={18} /></div><div className={box}><Route size={16} className="mb-2 text-[var(--color-text-muted)]" />Kroma Gateway<br /><span className="text-xs text-[var(--color-text-muted)]">auth · routing · logs</span></div><div className="hidden items-center md:flex"><ArrowRight className="text-[var(--color-text-muted)]" size={18} /></div><div className={box}><Server size={16} className="mb-2 text-[var(--color-text-muted)]" />Providers<br /><span className="text-xs text-[var(--color-text-muted)]">OpenAI · Ollama · LM Studio</span></div></div></div>; }
