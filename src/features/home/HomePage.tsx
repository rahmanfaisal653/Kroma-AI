import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Database, FileText, Key, Layers, Server, TerminalSquare } from 'lucide-react';
import { userApi } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';

export default function HomePage() {
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    userApi.getDashboard().then(setData).catch(() => setData(null));
  }, []);

  const usage = data?.usage || { requests: 0, tokens: 0, today: 0, errors: 0 };
  const keys = data?.keys || { total: 0, internal: 0, partner: 0 };
  const providers = data?.providers || { total: 0, enabled: 0 };
  const recent = data?.recent || [];

  return <div className="h-full overflow-y-auto">
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Kroma AI Gateway</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">Pantau provider, API key, usage, dan Knowledge/RAG dari satu dashboard owner.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/models" className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface-alt)]"><Server size={14} /> Providers</Link>
            <Link to="/keys" className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-bg)]"><Key size={14} /> Generate key</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Layers size={16} />} label="Providers enabled" value={`${providers.enabled}/${providers.total}`} sub="routing targets" />
        <Stat icon={<Key size={16} />} label="API keys" value={keys.total} sub={`${keys.internal} internal · ${keys.partner} partner`} />
        <Stat icon={<Activity size={16} />} label="Requests logged" value={usage.requests} sub={`${usage.errors} errors`} />
        <Stat icon={<Database size={16} />} label="Tokens today" value={Number(usage.today || 0).toLocaleString()} sub={`${Number(usage.tokens || 0).toLocaleString()} all-time`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3">
            <div><h2 className="text-sm font-semibold text-[var(--color-text)]">Recent API usage</h2><p className="text-xs text-[var(--color-text-muted)]">Auto-cleanup: logs older than 7 days</p></div>
            <Link to="/usage" className="text-xs font-medium text-[var(--color-text)] hover:underline">Open usage <ArrowRight size={12} className="inline" /></Link>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {recent.map((log: any) => <div key={log.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-xs">
              <div className="min-w-0"><p className="truncate font-mono text-[var(--color-text)]">{log.model_slug || '-'}</p><p className="truncate text-[var(--color-text-muted)]">{log.endpoint || '/v1/chat/completions'}</p></div>
              <span className={Number(log.status_code) >= 400 ? 'text-red-500' : 'text-emerald-600'}>{log.status_code || '-'}</span>
              <span className="font-mono text-[var(--color-text-muted)]">{log.total_tokens || 0} tok</span>
            </div>)}
            {recent.length === 0 && <div className="p-5 text-sm text-[var(--color-text-muted)]">Belum ada request usage.</div>}
          </div>
        </div>

        <div className="space-y-3">
          <Quick to="/docs" icon={<TerminalSquare size={16} />} title="Test chat endpoint" desc="Run cURL-style provider test." />
          <Quick to="/knowledge" icon={<Database size={16} />} title="Knowledge / RAG" desc="Add text sources and test retrieval." />
          <Quick to="/docs" icon={<FileText size={16} />} title="API documentation" desc="/v1, /v1/providers, chat completions." />
        </div>
      </section>
    </div>
  </div>;
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><div className="mb-3 text-[var(--color-text-muted)]">{icon}</div><p className="font-mono text-2xl font-semibold text-[var(--color-text)]">{value}</p><p className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{sub}</p></div>;
}
function Quick({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return <Link to={to} className="block rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:bg-[var(--color-surface-alt)]"><div className="mb-2 text-[var(--color-text-muted)]">{icon}</div><p className="text-sm font-semibold text-[var(--color-text)]">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{desc}</p></Link>;
}
