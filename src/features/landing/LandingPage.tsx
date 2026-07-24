import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Route, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800 bg-slate-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <img src="/brand/kroma-ai-wordmark.png" alt="Kroma AI" className="kroma-wordmark-on-dark h-8 w-auto" />
        <Link to="/login" className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Owner login</Link>
      </div>
    </header>

    <main>
      <section className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">AI API Gateway</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">Infrastructure layer for routing and securing AI traffic.</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">Kroma AI is a private gateway for teams that need controlled access to LLM providers, local models, partner API keys, and retrieval context without exposing upstream credentials.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login" className="inline-flex items-center gap-2 rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white">Open owner console <ArrowRight size={14} /></Link>
          <a href="#principles" className="inline-flex items-center gap-2 rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900">Read principles</a>
        </div>
      </section>

      <section id="principles" className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
          <Principle icon={<Route size={18} />} title="Provider routing" text="Route requests by provider prefix and keep upstream URLs/API keys inside Kroma." />
          <Principle icon={<ShieldCheck size={18} />} title="Access boundaries" text="Separate internal and partner access without leaking private providers." />
          <Principle icon={<LockKeyhole size={18} />} title="Owner controlled" text="No public signup. API keys are generated, tracked, and revoked from one owner console." />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded border border-slate-800 bg-slate-900 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Design intent</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">Technical, precise, secure, and boring by design. Kroma focuses on operational control for AI traffic: provider status, API keys, and usage logs.</p>
        </div>
      </section>
    </main>
  </div>;
}

function Principle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded border border-slate-800 bg-slate-950 p-5"><div className="text-slate-500">{icon}</div><h2 className="mt-4 font-semibold text-slate-100">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>;
}
