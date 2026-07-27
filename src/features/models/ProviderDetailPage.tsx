import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Edit2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { providerStatusApi } from '../../services/api';
import { providerIconUrl, ROBOT_ICON } from './providerIcons';
import { useThemeStore } from '../../stores/theme.store';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast } from '../../ui/Toast';

type Visibility = 'internal' | 'partner';
type ModelCheck = { status: 'on' | 'off'; error?: string; checked_at?: string };
type ProviderStatus = {
  id: string;
  name: string;
  baseUrl: string;
  chatPath?: string;
  modelsPath?: string;
  configured?: boolean;
  enabled?: boolean;
  visibility?: Visibility[];
  overridden?: boolean;
  custom?: boolean;
  status?: string;
  error?: string;
  models?: string[];
  model_checks?: Record<string, ModelCheck>;
};
type Form = { id: string; originalId: string; name: string; baseUrl: string; secret: string; chatPath: string; modelsPath: string; enabled: boolean; visibility: Visibility[] };

const visibilityLabels: Record<Visibility, string> = { internal: 'Internal', partner: 'Partner' };
const cleanVisibility = (value?: Visibility[] | string): Visibility[] => {
  const raw = Array.isArray(value) ? value : value === 'both' ? ['internal', 'partner'] : value ? [value] : ['internal'];
  const picked = raw.filter((item): item is Visibility => item === 'internal' || item === 'partner');
  return picked.length ? [...new Set(picked)] : ['internal'];
};
const toggleVis = (current: Visibility[], value: Visibility) => {
  const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  return next.length ? next : current;
};

export default function ProviderDetailPage() {
  const theme = useThemeStore(state => state.theme);
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const providers = await providerStatusApi.list();
      setProvider((providers || []).find((item: ProviderStatus) => item.id === id) || null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const openEdit = () => provider && setForm({
    id: provider.id,
    originalId: provider.id,
    name: provider.name || provider.id,
    baseUrl: provider.baseUrl,
    secret: '',
    chatPath: provider.chatPath || '/chat/completions',
    modelsPath: provider.modelsPath || '/models',
    enabled: provider.enabled !== false,
    visibility: cleanVisibility(provider.visibility),
  });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.id.trim() || !form.baseUrl.trim()) return toast.error('Nama, prefix, URL wajib diisi');
    setSaving(true);
    try {
      const payload = {
        id: form.id, name: form.name, baseUrl: form.baseUrl,
        apiKey: form.secret || undefined,
        chatPath: form.chatPath, modelsPath: form.modelsPath,
        enabled: form.enabled, visibility: form.visibility,
      };
      if (form.id !== form.originalId) {
        await providerStatusApi.create(payload);
        await providerStatusApi.reset(form.originalId);
        toast.success('Provider saved');
        setForm(null);
        navigate(`/models/${form.id}`);
        return;
      }
      await providerStatusApi.update(form.id, payload);
      setForm(null);
      await load();
      toast.success('Provider saved');
    } catch { toast.error('Gagal save provider'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!provider) return;
    if (!confirm(`Hapus provider ${provider.name || provider.id}?`)) return;
    await providerStatusApi.reset(provider.id);
    toast.success('Provider deleted');
    navigate('/models');
  };

  const quickUpdate = async (patch: { enabled?: boolean; visibility?: Visibility[] }) => {
    if (!provider) return;
    const next = {
      ...provider,
      enabled: patch.enabled ?? provider.enabled !== false,
      visibility: patch.visibility ?? cleanVisibility(provider.visibility),
    };
    setProvider(next);
    try {
      await providerStatusApi.update(provider.id, {
        name: provider.name || provider.id,
        baseUrl: provider.baseUrl,
        chatPath: provider.chatPath || '/chat/completions',
        modelsPath: provider.modelsPath || '/models',
        enabled: next.enabled,
        visibility: next.visibility,
      });
      toast.success('Provider updated');
    } catch { toast.error('Gagal update'); await load(); }
  };

  const copy = async (model: string) => { await navigator.clipboard.writeText(model); toast.success('Model copied'); };

  const testModel = async (model: string) => {
    if (!provider) return;
    setTesting(model);
    try {
      const result = await providerStatusApi.testModel(provider.id, model);
      setProvider({ ...provider, model_checks: { ...(provider.model_checks || {}), [model]: { status: result.status, error: result.error, checked_at: new Date().toISOString() } } });
      result.status === 'on' ? toast.success(`${model} ON`) : toast.error(`${model} OFF`);
    } finally { setTesting(''); }
  };

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading provider...</div>;
  if (!provider) return <div className="p-6 space-y-3"><Link to="/models"><Button variant="outline" icon={<ArrowLeft size={14} />}>Back</Button></Link><p className="text-sm text-red-500">Provider not found.</p></div>;

  const vis = cleanVisibility(provider.visibility);

  return <div className="h-full overflow-y-auto"><div className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
    <Link to="/models"><Button variant="outline" size="sm" icon={<ArrowLeft size={14} />}>Providers</Button></Link>

    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <img src={providerIconUrl(provider.id, theme === 'dark' ? 'dark' : 'light')} alt="" className="w-10 h-10 rounded shrink-0" loading="lazy" onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith(ROBOT_ICON)) img.src = ROBOT_ICON; }} />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{provider.name || provider.id}</h1>
            <p className="text-xs font-mono text-[var(--color-text-muted)] break-all">{provider.baseUrl}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={loading} icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button variant="outline" size="sm" icon={<Edit2 size={13} />} onClick={openEdit}>Edit</Button>
          <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={remove}>Delete</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <Meta label="Status">{provider.enabled === false ? 'Disabled' : provider.status || 'unknown'}</Meta>
        <Meta label="Key">{provider.configured ? 'set' : 'empty'}</Meta>
        <Meta label="Config">{provider.custom ? 'custom' : provider.overridden ? 'override' : 'default'}</Meta>
        <Meta label="Visibility">{vis.map(v => visibilityLabels[v]).join(', ')}</Meta>
        <Meta label="Models Path"><code className="font-mono">{provider.modelsPath || '/models'}</code></Meta>
        <Meta label="Chat Path"><code className="font-mono">{provider.chatPath || '/chat/completions'}</code></Meta>
        <Meta label="Model ID"><code className="font-mono">{provider.id}/model-name</code></Meta>
        <Meta label="Total Models">{provider.models?.length || 0}</Meta>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border)]">
        <Button size="sm" variant="outline" onClick={() => quickUpdate({ enabled: provider.enabled === false })}>{provider.enabled === false ? 'Enable' : 'Disable'}</Button>
        {(['internal', 'partner'] as Visibility[]).map(v => <Button key={v} size="sm" variant={vis.includes(v) ? 'primary' : 'outline'} onClick={() => quickUpdate({ visibility: toggleVis(vis, v) })}>{visibilityLabels[v]}</Button>)}
      </div>

      {provider.error && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{provider.error}</div>}
    </div>

    <div>
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Models</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(provider.models || []).map(model => {
          const checked = provider.model_checks?.[model];
          const status = checked?.status || 'unknown';
          return <div key={model} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-all font-mono text-xs text-[var(--color-text)]">{model}</p>
              <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-1 rounded border ${status === 'on' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : status === 'off' ? 'border-red-500/40 bg-red-500/10 text-red-500' : 'border-amber-500/40 bg-amber-500/10 text-amber-500'}`}>{status}</span>
            </div>
            {checked?.checked_at && <p className="text-[11px] text-[var(--color-text-muted)]">checked: {new Date(checked.checked_at).toLocaleString('id-ID')}</p>}
            {checked?.error && <p className="rounded border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-500">{checked.error}</p>}
            <div className="flex gap-2"><Button size="sm" variant="outline" icon={<Copy size={13} />} onClick={() => copy(model)}>Copy</Button><Button size="sm" disabled={testing === model} onClick={() => testModel(model)}>{testing === model ? 'Testing...' : 'Test model'}</Button></div>
          </div>;
        })}
        {!provider.models?.length && <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">No models returned.</div>}
      </div>
    </div>

    {form && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3 shadow-xl">
      <h2 className="font-semibold text-[var(--color-text)]">Edit {form.name}</h2>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input label="Prefix" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} hint="Ganti prefix = create baru + hapus lama" />
      </div>
      <Input label="Base URL" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} />
      <Input label="API Key" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Kosongkan kalau tidak diganti" />
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Models Path" value={form.modelsPath} onChange={e => setForm({ ...form, modelsPath: e.target.value })} />
        <Input label="Chat Path" value={form.chatPath} onChange={e => setForm({ ...form, chatPath: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><div className="flex gap-2"><Pill active={form.enabled} onClick={() => setForm({ ...form, enabled: true })}>Enable</Pill><Pill active={!form.enabled} onClick={() => setForm({ ...form, enabled: false })}>Disable</Pill></div></div>
        <div><p className="text-xs text-[var(--color-text-muted)] mb-1">Visibility</p><div className="flex flex-wrap gap-2">{(['internal', 'partner'] as Visibility[]).map(v => <Pill key={v} active={form.visibility.includes(v)} onClick={() => setForm({ ...form, visibility: toggleVis(form.visibility, v) })}>{visibilityLabels[v]}</Pill>)}</div></div>
      </div>
      <div className="flex gap-2"><Button icon={<Save size={14} />} onClick={save} loading={saving}>Save</Button><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
    </div></div>}
  </div></div>;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
    <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
    <p className="text-[var(--color-text)] mt-0.5 break-all">{children}</p>
  </div>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-xs ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{children}</button>;
}
