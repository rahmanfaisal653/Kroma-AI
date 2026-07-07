import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
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

export default function UsagePage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [keyFilter, setKeyFilter] = useState('');
  const [ownerType, setOwnerType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = () => userApi.getUsageHistory({
    api_key_id: keyFilter || undefined,
    owner_type: ownerType || undefined,
    owner_name: ownerName || undefined,
    provider: providerFilter || undefined,
    model: modelFilter || undefined,
    from: from || undefined,
    to: to || undefined,
  }).then(data => setLogs(data.logs || [])).catch(() => setLogs([]));

  useEffect(() => { load(); }, []);

  const totalTokens = logs.reduce((sum, log) => sum + (Number(log.total_tokens) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayTokens = logs.filter(log => String(log.created_at || '').startsWith(today)).reduce((sum, log) => sum + (Number(log.total_tokens) || 0), 0);
  const monthTokens = logs.filter(log => String(log.created_at || '').startsWith(month)).reduce((sum, log) => sum + (Number(log.total_tokens) || 0), 0);
  const errors = logs.filter(log => Number(log.status_code) >= 400).length;

  const exportCsv = () => {
    const rows = [
      ['created_at', 'owner_type', 'owner_name', 'key_name', 'key_prefix', 'provider', 'model', 'tokens', 'status', 'latency_ms'],
      ...logs.map(log => [log.created_at || '', log.owner_type || '', log.owner_name || '', log.key_name || '', log.key_prefix || '', log.provider || '', log.model_slug || '', String(log.total_tokens || 0), String(log.status_code || ''), String(log.latency_ms || '')]),
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kroma-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Usage</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Pantau pemakaian token internal dan partner.</p>
          </div>
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Stat label="Total Requests" value={logs.length.toLocaleString()} />
          <Stat label="Total Tokens" value={totalTokens.toLocaleString()} />
          <Stat label="Today Tokens" value={todayTokens.toLocaleString()} />
          <Stat label="This Month" value={monthTokens.toLocaleString()} />
          <Stat label="Error Rate" value={logs.length ? `${Math.round((errors / logs.length) * 100)}%` : '0%'} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={keyFilter} onChange={e => setKeyFilter(e.target.value)} placeholder="API key id exact" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <select value={ownerType} onChange={e => setOwnerType(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
            <option value="">All type</option>
            <option value="internal">internal</option>
            <option value="partner">partner</option>
          </select>
          <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="owner/partner name" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <input value={providerFilter} onChange={e => setProviderFilter(e.target.value)} placeholder="provider" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <input value={modelFilter} onChange={e => setModelFilter(e.target.value)} placeholder="model" className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm" />
          <Button onClick={load}>Apply</Button>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)]">Recent Usage</div>
          <div className="divide-y divide-[var(--color-border)]">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-3 grid grid-cols-7 gap-2 text-xs text-[var(--color-text-muted)]">
                <span className="font-mono truncate text-[var(--color-text)]">{log.model_slug || '-'}</span>
                <span className="truncate">{log.provider || '-'}</span>
                <span className="truncate">{log.key_name || log.api_key_id || '-'}</span>
                <span className="truncate">{log.owner_type || '-'} / {log.owner_name || '-'}</span>
                <span>{log.total_tokens || 0} tokens</span>
                <span>{log.status_code || '-'}</span>
                <span>{log.latency_ms ? `${log.latency_ms}ms` : '-'}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="p-5 text-sm text-[var(--color-text-muted)]">Belum ada usage log.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="p-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]"><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="text-2xl font-bold text-[var(--color-text)]">{value}</p></div>;
}
