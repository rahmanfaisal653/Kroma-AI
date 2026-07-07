import React, { useEffect, useState } from 'react';
import { Copy, Key, Plus, Trash2 } from 'lucide-react';
import { internalKeysApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/Toast';

type OwnerType = 'internal' | 'partner';
type GatewayKey = { id: string; name: string; key_prefix: string; key?: string; owner_type: OwnerType; owner_name?: string; note?: string; allowed_models: string[]; last_used_at?: string; monthly_tokens_used?: number };
const emptyForm = { name: '', owner_name: '', note: '', allowed_models: '*' };

export default function KeysPage() {
  const [keys, setKeys] = useState<GatewayKey[]>([]);
  const [type, setType] = useState<OwnerType>('internal');
  const [form, setForm] = useState(emptyForm);
  const [createdKey, setCreatedKey] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => internalKeysApi.list().then(setKeys).catch(() => toast.error('Gagal load API keys'));
  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!form.name.trim()) return toast.error('Nama key wajib diisi');
    setLoading(true);
    try {
      const data = await internalKeysApi.create({ name: form.name.trim(), owner_type: type, owner_name: (form.owner_name || form.name).trim(), note: form.note.trim(), allowed_models: form.allowed_models.split(',').map(s => s.trim()).filter(Boolean) });
      setCreatedKey(data.key); setForm(emptyForm); await load(); toast.success('API key dibuat');
    } finally { setLoading(false); }
  };

  const remove = async (id: string) => { if (!confirm('Hapus API key ini?')) return; await internalKeysApi.revoke(id); await load(); toast.success('API key dihapus'); };
  const internalKeys = keys.filter(k => (k.owner_type || 'internal') === 'internal');
  const partnerKeys = keys.filter(k => k.owner_type === 'partner');

  return <div className="h-full overflow-y-auto"><div className="max-w-5xl mx-auto p-6 space-y-6 animate-fade-in">
    <div><h1 className="text-xl font-bold text-[var(--color-text)]">API Keys</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Generate key internal dan partner. Limit belum dipakai dulu.</p></div>
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex gap-2">{(['internal', 'partner'] as OwnerType[]).map(t => <button key={t} onClick={() => setType(t)} className={`px-3 py-2 rounded text-sm border ${type === t ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text)]'}`}>{t === 'internal' ? 'Internal Key' : 'Partner Integration Key'}</button>)}</div>
      <div className="grid md:grid-cols-3 gap-2"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="nama key" className="px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" /><input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="owner/partner name" className="px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" /><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="catatan optional" className="px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" /><input value={form.allowed_models} onChange={e => setForm({ ...form, allowed_models: e.target.value })} placeholder="allowed models: * atau openai/gpt-4o-mini" className="md:col-span-3 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" /></div>
      <Button onClick={createKey} loading={loading} icon={<Plus size={14} />}>Generate</Button>
      {createdKey && <div className="p-3 rounded bg-[var(--color-code-bg)] border border-[var(--color-border)]"><p className="text-xs text-amber-500 mb-2">Copy sekarang. Full key hanya tampil sekali.</p><div className="flex gap-2 items-center"><code className="flex-1 text-xs break-all">{createdKey}</code><Button size="sm" variant="outline" icon={<Copy size={14} />} onClick={() => { navigator.clipboard.writeText(createdKey); localStorage.setItem('kroma_gateway_key', createdKey); toast.success('Copied + siap dipakai di Docs'); }}>Copy</Button></div></div>}
    </div>
    <KeyList title="Internal Keys" keys={internalKeys} onRemove={remove} />
    <KeyList title="Partner Integration Keys" keys={partnerKeys} onRemove={remove} />
  </div></div>;
}

function KeyList({ title, keys, onRemove }: { title: string; keys: GatewayKey[]; onRemove: (id: string) => void }) {
  const copyKey = (key?: string) => {
    if (!key) return toast.error('Full key tidak tersedia untuk key lama. Generate key baru kalau perlu copy ulang.');
    navigator.clipboard.writeText(key);
    localStorage.setItem('kroma_gateway_key', key);
    toast.success('Copied + siap dipakai di Docs');
  };
  return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
    <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] flex items-center gap-2"><Key size={15} /><span className="text-sm font-semibold">{title}</span></div>
    <div className="divide-y divide-[var(--color-border)]">
      {keys.map(k => <div key={k.id} className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)]">{k.name} <span className="text-xs text-[var(--color-text-muted)]">({k.owner_name || k.owner_type})</span></p>
          <p className="text-xs font-mono text-[var(--color-text-muted)]">{k.key ? '••••••••••••••••••••••••' : k.key_prefix} · {k.allowed_models?.join(', ') || '*'}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Used this month: {k.monthly_tokens_used || 0} tokens · Last used: {k.last_used_at || '-'}{k.note ? ` · ${k.note}` : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" icon={<Copy size={13} />} onClick={() => copyKey(k.key)}>Copy</Button>
          <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={() => onRemove(k.id)}>Delete</Button>
        </div>
      </div>)}
      {keys.length === 0 && <div className="p-5 text-sm text-[var(--color-text-muted)]">Belum ada key.</div>}
    </div>
  </div>;
}
