import React, { useEffect, useState } from 'react';
import { Edit2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { providerStatusApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast } from '../../ui/Toast';

type Visibility = 'internal' | 'partner';
type ProviderStatus = {
  id: string;
  name: string;
  baseUrl: string;
  configured?: boolean;
  enabled?: boolean;
  visibility?: Visibility[];
  overridden?: boolean;
  custom?: boolean;
  status?: string;
  error?: string;
};
type Form = { id: string; originalId?: string; name: string; baseUrl: string; secret: string; enabled: boolean; visibility: Visibility[]; mode: 'create' | 'edit' };

const emptyForm: Form = { id: '', name: '', baseUrl: '', secret: '', enabled: true, visibility: ['internal'], mode: 'create' };
const visibilityLabels: Record<Visibility, string> = { internal: 'Internal', partner: 'Partner' };
const cleanVisibility = (value?: Visibility[] | string): Visibility[] => {
  const raw = Array.isArray(value) ? value : value === 'both' ? ['internal', 'partner'] : value ? [value] : ['internal'];
  const picked = raw.filter((item): item is Visibility => item === 'internal' || item === 'partner');
  return picked.length ? [...new Set(picked)] : ['internal'];
};
const toggleVisibility = (current: Visibility[], value: Visibility) => {
  const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  return next.length ? next : current;
};

export default function ModelsPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(false);

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
    const payload = { id: form.id, name: form.name, baseUrl: form.baseUrl, apiKey: form.secret || undefined, enabled: form.enabled, visibility: form.visibility };
    if (form.mode === 'create') await providerStatusApi.create(payload);
    else if (form.originalId && form.id !== form.originalId) { await providerStatusApi.create(payload); await providerStatusApi.reset(form.originalId); }
    else await providerStatusApi.update(form.id, payload);
    setForm(null); await load(); toast.success('Provider saved');
  };

  const remove = async (p: ProviderStatus) => {
    if (!confirm('Hapus provider ini?')) return;
    await providerStatusApi.reset(p.id); await load(); toast.success('Provider deleted');
  };

  const edit = (p: ProviderStatus) => setForm({
    id: p.id,
    originalId: p.id,
    name: p.name || p.id,
    baseUrl: p.baseUrl,
    secret: '',
    enabled: p.enabled !== false,
    visibility: cleanVisibility(p.visibility),
    mode: 'edit',
  });

  const quickUpdate = async (p: ProviderStatus, patch: Partial<Form>) => {
    await providerStatusApi.update(p.id, {
      name: p.name || p.id,
      baseUrl: p.baseUrl,
      enabled: patch.enabled ?? p.enabled !== false,
      visibility: patch.visibility ?? cleanVisibility(p.visibility),
    });
    await load();
  };

  return <div className="h-full overflow-y-auto"><div className="max-w-5xl mx-auto p-6 space-y-6 animate-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold text-[var(--color-text)]">Providers</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Tambah provider OpenAI-compatible. Atur status dan akses: internal, partner, atau dua-duanya.</p></div>
      <div className="flex gap-2"><Button variant="outline" loading={loading} icon={<RefreshCw size={14} />} onClick={load}>Test All</Button><Button icon={<Plus size={14} />} onClick={() => setForm(emptyForm)}>Add Provider</Button></div>
    </div>

    {form && <div className="kroma-card-hover rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3 backdrop-blur-xl">
      <h2 className="font-semibold text-[var(--color-text)]">{form.mode === 'create' ? 'Add Provider' : `Edit ${form.name}`}</h2>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Groq" />
        <Input label="Prefix" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="groq" hint="Dipakai sebagai model prefix: groq/namamodel" />
      </div>
      <Input label="Base URL" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.groq.com/openai/v1" />
      <Input label="API Key" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Kosongkan kalau provider lokal" />
      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><div className="flex gap-2"><Toggle active={form.enabled} onClick={() => setForm({ ...form, enabled: true })}>Enable</Toggle><Toggle active={!form.enabled} onClick={() => setForm({ ...form, enabled: false })}>Disable</Toggle></div></div>
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Visibility</p><div className="flex flex-wrap gap-2">{(['internal', 'partner'] as Visibility[]).map(v => <Toggle key={v} active={form.visibility.includes(v)} onClick={() => setForm({ ...form, visibility: toggleVisibility(form.visibility, v) })}>{visibilityLabels[v]}</Toggle>)}</div></div>
      </div>
      <div className="flex gap-2"><Button icon={<Save size={14} />} onClick={save}>Save</Button><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
    </div>}

    <div className="grid md:grid-cols-3 gap-4">
      {providers.map(p => <div key={p.id} className="kroma-card-hover rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-[var(--color-text)]">{p.name || p.id}</h2><span className={`text-xs px-2 py-1 rounded-full ${p.enabled === false ? 'bg-zinc-500/10 text-zinc-400' : p.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : p.status === 'not_configured' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>{p.enabled === false ? 'disabled' : p.status || 'unknown'}</span></div>
        <p className="text-xs font-mono text-[var(--color-text-muted)] break-all">{p.baseUrl}</p>
        <p className="text-xs text-[var(--color-text-muted)]">model: <code>{p.id}/model-name</code></p>
        <p className="text-xs text-[var(--color-text-muted)]">{p.custom ? 'custom' : p.overridden ? 'custom config' : 'env default'} · key: {p.configured ? 'set' : 'empty'} · visibility: {cleanVisibility(p.visibility).map(v => visibilityLabels[v]).join(', ')}</p>
        {p.error && <p className="text-xs text-red-400">{p.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => quickUpdate(p, { enabled: p.enabled === false })}>{p.enabled === false ? 'Enable' : 'Disable'}</Button>
          {(['internal', 'partner'] as Visibility[]).map(v => <Button key={v} size="sm" variant={cleanVisibility(p.visibility).includes(v) ? 'primary' : 'outline'} onClick={() => quickUpdate(p, { visibility: toggleVisibility(cleanVisibility(p.visibility), v) })}>{visibilityLabels[v]}</Button>)}
        </div>
        <div className="flex gap-2"><Button size="sm" variant="outline" icon={<Edit2 size={13} />} onClick={() => edit(p)}>Edit</Button><Button size="sm" variant="outline" icon={<Trash2 size={13} />} onClick={() => remove(p)}>Delete</Button></div>
      </div>)}
    </div>
  </div></div>;
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-xs ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{children}</button>;
}
