import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Save } from 'lucide-react';
import { providerStatusApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { providerIconUrl, ROBOT_ICON } from './providerIcons';
import { useThemeStore } from '../../stores/theme.store';

type Visibility = 'internal' | 'partner';
type ProviderKind = 'free' | 'special' | 'custom';
type ProviderStatus = {
  id: string;
  name: string;
  baseUrl: string;
  kind?: ProviderKind;
  custom?: boolean;
  configured?: boolean;
  enabled?: boolean;
  status?: string;
};
type Form = { id: string; name: string; baseUrl: string; secret: string; chatPath: string; modelsPath: string; enabled: boolean; visibility: Visibility[] };

const emptyForm: Form = { id: '', name: '', baseUrl: '', secret: '', chatPath: '/chat/completions', modelsPath: '/models', enabled: true, visibility: ['internal'] };
const visibilityLabels: Record<Visibility, string> = { internal: 'Internal', partner: 'Partner' };
const toggleVisibility = (current: Visibility[], value: Visibility) => {
  const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  return next.length ? next : current;
};
const providerKind = (p: ProviderStatus): ProviderKind | 'unknown' => p.kind || (p.custom ? 'custom' : 'unknown');
const statusStyles = (p: ProviderStatus) => {
  if (p.enabled === false) return 'border-slate-500/40 bg-slate-500/10 text-slate-400';
  if (p.status === 'on') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400';
  if (p.status === 'not_configured') return 'border-amber-500/40 bg-amber-500/15 text-amber-400';
  return 'border-red-500/40 bg-red-500/15 text-red-400';
};
const statusLabel = (p: ProviderStatus) => p.enabled === false ? 'disabled' : p.status || 'unknown';

export default function ModelsPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useThemeStore(state => state.theme);

  const load = async () => {
    setLoading(true);
    try { setProviders(await providerStatusApi.list()); }
    catch { toast.error('Gagal cek provider'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form?.name.trim()) return toast.error('Nama wajib diisi');
    if (!form.id.trim()) return toast.error('Prefix wajib diisi');
    if (!form.baseUrl.trim()) return toast.error('URL wajib diisi');
    await providerStatusApi.create({
      id: form.id, name: form.name, baseUrl: form.baseUrl,
      apiKey: form.secret || undefined,
      chatPath: form.chatPath, modelsPath: form.modelsPath,
      enabled: form.enabled, visibility: form.visibility,
    });
    setForm(null); await load(); toast.success('Provider saved');
  };

  const freeProviders = providers.filter(p => providerKind(p) === 'free');
  const specialProviders = providers.filter(p => providerKind(p) === 'special');
  const customProviders = providers.filter(p => providerKind(p) === 'custom');

  return <div className="h-full overflow-y-auto"><div className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold text-[var(--color-text)]">Providers</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Free provider bawaan selalu muncul setelah update. Special pakai adapter. Custom kamu tambah manual.</p></div>
      <div className="flex gap-2"><Button variant="outline" loading={loading} icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button><Button icon={<Plus size={14} />} onClick={() => setForm(emptyForm)}>Add Custom</Button></div>
    </div>

    {form && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3 shadow-xl">
      <h2 className="font-semibold text-[var(--color-text)]">Add Custom Provider</h2>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Groq" />
        <Input label="Prefix" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="groq" hint="Dipakai sebagai model prefix: groq/namamodel" />
      </div>
      <Input label="Base URL" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.groq.com/openai/v1" />
      <Input label="API Key" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Kosongkan kalau provider lokal" />
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Models Path" value={form.modelsPath} onChange={e => setForm({ ...form, modelsPath: e.target.value })} placeholder="/models" />
        <Input label="Chat Path" value={form.chatPath} onChange={e => setForm({ ...form, chatPath: e.target.value })} placeholder="/chat/completions" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><div className="flex gap-2"><Toggle active={form.enabled} onClick={() => setForm({ ...form, enabled: true })}>Enable</Toggle><Toggle active={!form.enabled} onClick={() => setForm({ ...form, enabled: false })}>Disable</Toggle></div></div>
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Visibility</p><div className="flex flex-wrap gap-2">{(['internal', 'partner'] as Visibility[]).map(v => <Toggle key={v} active={form.visibility.includes(v)} onClick={() => setForm({ ...form, visibility: toggleVisibility(form.visibility, v) })}>{visibilityLabels[v]}</Toggle>)}</div></div>
      </div>
      <div className="flex gap-2"><Button icon={<Save size={14} />} onClick={save}>Save</Button><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
    </div></div>}

    <ProviderSection title="Free Providers" desc="OpenAI-compatible bawaan. Tinggal isi API key." providers={freeProviders} theme={theme} loading={loading} />
    <ProviderSection title="Special Providers" desc="Provider non-OpenAI-compatible yang butuh adapter khusus." providers={specialProviders} theme={theme} loading={loading} />
    <ProviderSection title="Custom Providers" desc="Provider manual dari dashboard. Bisa kamu hapus/edit sendiri." providers={customProviders} theme={theme} loading={loading} empty="Belum ada custom provider." />
  </div></div>;
}

function ProviderSection({ title, desc, providers, theme, loading, empty = 'Belum ada provider.' }: { title: string; desc: string; providers: ProviderStatus[]; theme: 'light' | 'dark'; loading: boolean; empty?: string }) {
  return <section className="space-y-3">
    <div className="flex items-end justify-between gap-3 border-b border-[var(--color-border)] pb-2">
      <div><h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2><p className="text-xs text-[var(--color-text-muted)]">{desc}</p></div>
      <span className="font-mono text-xs text-[var(--color-text-muted)]">{providers.length}</span>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {providers.map(p => <ProviderCard key={p.id} provider={p} theme={theme} />)}
      {!loading && !providers.length && <p className="col-span-full text-sm text-[var(--color-text-muted)]">{empty}</p>}
    </div>
  </section>;
}

function ProviderCard({ provider: p, theme }: { provider: ProviderStatus; theme: 'light' | 'dark' }) {
  return <Link to={`/models/${p.id}`} className="kroma-card-hover group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 backdrop-blur-xl transition hover:border-[var(--color-primary)]/50">
    <div className="flex items-center gap-3">
      <img src={providerIconUrl(p.id, theme)} alt="" className="w-8 h-8 rounded shrink-0" loading="lazy" onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith(ROBOT_ICON)) img.src = ROBOT_ICON; }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-[var(--color-text)] truncate">{p.name || p.id}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] truncate">{p.id}</p>
      </div>
    </div>
    <div className="mt-3 flex items-center justify-between">
      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${statusStyles(p)}`}>{statusLabel(p)}</span>
      <span className="text-[10px] text-[var(--color-text-muted)]">{p.configured ? 'key set' : 'no key'}</span>
    </div>
  </Link>;
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-xs ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{children}</button>;
}
