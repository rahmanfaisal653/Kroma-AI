import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { userApi } from '../../services/api';
import { Button } from '../../ui/Button';

type UsageLog = {
  id: string | number;
  api_key_id?: string;
  key_name?: string;
  key_prefix?: string;
  owner_type?: string;
  owner_name?: string;
  provider?: string;
  model_slug?: string;
  endpoint?: string;
  total_tokens?: number;
  status_code?: number;
  latency_ms?: number;
  created_at?: string;
};

type UsageSummary = {
  requests: number;
  tokens: number;
  today_tokens: number;
  month_tokens: number;
  errors: number;
};

const PAGE_SIZE = 25;
const REFRESH_SECONDS = 40;

export default function UsagePage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [summary, setSummary] = useState<UsageSummary>({ requests: 0, tokens: 0, today_tokens: 0, month_tokens: 0, errors: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [keyFilter, setKeyFilter] = useState('');
  const [ownerType, setOwnerType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters = useMemo(() => ({
    api_key_id: keyFilter || undefined,
    owner_type: ownerType || undefined,
    owner_name: ownerName || undefined,
    provider: providerFilter || undefined,
    model: modelFilter || undefined,
    from: from || undefined,
    to: to || undefined,
  }), [keyFilter, ownerType, ownerName, providerFilter, modelFilter, from, to]);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const data = await userApi.getUsageHistory({ ...filters, page: nextPage, page_size: PAGE_SIZE });
      setLogs(data.logs || []);
      setTotal(Number(data.total) || 0);
      setPage(Number(data.page) || nextPage);
      setSummary(data.summary || { requests: 0, tokens: 0, today_tokens: 0, month_tokens: 0, errors: 0 });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => load(page), REFRESH_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [page, filters]);

  const applyFilters = () => load(1);

  const clearAll = async () => {
    if (!confirm('Hapus semua usage log?')) return;
    await userApi.clearUsageHistory();
    await load(1);
  };

  const cleanupOld = async () => {
    await userApi.cleanupUsageHistory();
    await load(1);
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const errorRate = summary.requests ? Math.round((summary.errors / summary.requests) * 100) : 0;

  const exportCsv = () => {
    const rows = [
      ['created_at', 'owner_type', 'owner_name', 'key_name', 'key_prefix', 'provider', 'model', 'tokens', 'status', 'latency_ms'],
      ...logs.map(log => [log.created_at || '', log.owner_type || '', log.owner_name || '', log.key_name || '', log.key_prefix || '', log.provider || '', log.model_slug || '', String(log.total_tokens || 0), String(log.status_code || ''), String(log.latency_ms || '')]),
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kroma-usage-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">API Usage</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              Auto-refresh tiap {REFRESH_SECONDS}s. Logs otomatis dihapus setelah 7 hari.
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Last updated: {lastUpdated || '-'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => load(page)} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
            <Button variant="outline" size="sm" onClick={cleanupOld}>Cleanup 7d+</Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportCsv}>Export page</Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={clearAll}>Clear all</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Stat label="Requests" value={summary.requests.toLocaleString()} />
          <Stat label="Tokens" value={summary.tokens.toLocaleString()} />
          <Stat label="Today" value={summary.today_tokens.toLocaleString()} />
          <Stat label="This Month" value={summary.month_tokens.toLocaleString()} />
          <Stat label="Error Rate" value={`${errorRate}%`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <input value={keyFilter} onChange={e => setKeyFilter(e.target.value)} placeholder="API key id exact" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <select value={ownerType} onChange={e => setOwnerType(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
            <option value="">All type</option>
            <option value="internal">internal</option>
            <option value="partner">partner</option>
          </select>
          <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="owner/partner name" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <input value={providerFilter} onChange={e => setProviderFilter(e.target.value)} placeholder="provider" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <input value={modelFilter} onChange={e => setModelFilter(e.target.value)} placeholder="model" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm" />
          <Button onClick={applyFilters}>Apply</Button>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Usage Logs</p>
              <p className="text-xs text-[var(--color-text-muted)]">Showing page {page} of {pageCount} · {total.toLocaleString()} rows</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => load(page + 1)}>Next</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[900px] divide-y divide-[var(--color-border)]">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 grid grid-cols-[1.7fr_0.8fr_1fr_1fr_0.7fr_0.6fr_0.7fr] gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className="font-mono truncate text-[var(--color-text)]">{log.model_slug || '-'}</span>
                  <span className="truncate">{log.provider || '-'}</span>
                  <span className="truncate">{log.key_name || log.api_key_id || '-'}</span>
                  <span className="truncate">{log.owner_type || '-'} / {log.owner_name || '-'}</span>
                  <span>{log.total_tokens || 0} tokens</span>
                  <span className={Number(log.status_code) >= 400 ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>{log.status_code || '-'}</span>
                  <span>{log.latency_ms ? `${log.latency_ms}ms` : '-'}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="p-5 text-sm text-[var(--color-text-muted)]">Belum ada usage log.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="p-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]"><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="text-2xl font-bold text-[var(--color-text)]">{value}</p></div>;
}
