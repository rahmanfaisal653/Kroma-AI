import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { providerStatusApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/Toast';

type ModelCheck = { status: 'on' | 'off'; error?: string; checked_at?: string };
type ProviderStatus = { id: string; name: string; baseUrl: string; status?: string; error?: string; models?: string[]; model_checks?: Record<string, ModelCheck> };

export default function ProviderDetailPage() {
  const { id = '' } = useParams();
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const providers = await providerStatusApi.list();
      setProvider((providers || []).find((item: ProviderStatus) => item.id === id) || null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const copy = async (model: string) => {
    await navigator.clipboard.writeText(model);
    toast.success('Model copied');
  };

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

  return <div className="h-full overflow-y-auto"><div className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <Link to="/models"><Button variant="outline" size="sm" icon={<ArrowLeft size={14} />}>Providers</Button></Link>
        <div><h1 className="text-xl font-bold text-[var(--color-text)]">{provider.name || provider.id}</h1><p className="text-xs font-mono text-[var(--color-text-muted)] break-all">{provider.baseUrl}</p></div>
      </div>
      <Button variant="outline" loading={loading} icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
    </div>

    {provider.error && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{provider.error}</div>}

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
  </div></div>;
}
