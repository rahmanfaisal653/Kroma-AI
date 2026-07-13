import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Key, BarChart3, FileText, Image, ArrowRight, Zap, TrendingUp, Clock } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { modelsApi } from '../../services/api';
import type { ApiModel } from '../../types';

interface QuickStat {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const [models, setModels] = useState<ApiModel[]>([]);

  useEffect(() => {
    modelsApi.getAll().then(setModels).catch(() => {});
  }, []);

  const quotaLimit = Number(user?.quota_limit) || 0;
  const usageCount = Number(user?.usage_count) || 0;
  const remaining = Math.max(0, quotaLimit - usageCount);
  const usagePercent = quotaLimit > 0 ? Math.round((usageCount / quotaLimit) * 100) : 0;

  const textModels = models.filter(m => m.type === 'text-to-text');
  const imageModels = models.filter(m => m.type === 'text-to-image');

  const stats: QuickStat[] = [
    { label: 'Credit Tersisa', value: remaining.toLocaleString(), icon: <Zap size={16} />, color: 'text-emerald-400' },
    { label: 'Terpakai', value: usagePercent + '%', icon: <TrendingUp size={16} />, color: 'text-amber-400' },
    { label: 'Model Tersedia', value: String(models.length), icon: <BarChart3 size={16} />, color: 'text-blue-400' },
  ];

  const quickLinks = [
    { to: '/chat', icon: MessageSquare, title: 'Chat Playground', desc: 'Mulai percakapan dengan AI', color: 'from-indigo-500 to-purple-500' },
    { to: '/images', icon: Image, title: 'Image Generation', desc: 'Generate gambar dari teks', color: 'from-pink-500 to-rose-500' },
    { to: '/keys', icon: Key, title: 'API Keys', desc: 'Kelola API key Anda', color: 'from-amber-500 to-orange-500' },
    { to: '/docs', icon: FileText, title: 'Dokumentasi', desc: 'Panduan integrasi API', color: 'from-emerald-500 to-teal-500' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {user?.email} — Berikut ringkasan akun Anda
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {stats.map((s, i) => (
            <div key={i} className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="flex items-center gap-3">
                <div className={`${s.color}`}>{s.icon}</div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
                  <p className="text-xl font-bold text-[var(--color-text)]">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Usage bar */}
        {quotaLimit > 0 && (
          <div className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Penggunaan Credit</span>
              <span className="text-xs text-[var(--color-text-muted)]">{usageCount.toLocaleString()} / {quotaLimit.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-surface-alt)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, usagePercent)}%`,
                  background: usagePercent > 80 ? '#ef4444' : usagePercent > 60 ? '#f59e0b' : 'var(--color-primary)',
                }}
              />
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">Aksi Cepat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickLinks.map((link, i) => {
              const Icon = link.icon;
              return (
                <Link key={i} to={link.to}
                  className="group p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-lg shrink-0`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[var(--color-text)] mb-0.5 group-hover:text-[var(--color-primary)] transition-colors">
                        {link.title}
                      </h3>
                      <p className="text-xs text-[var(--color-text-muted)]">{link.desc}</p>
                    </div>
                    <ArrowRight size={16} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Available models */}
        {models.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">Model Tersedia</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {textModels.slice(0, 6).map(m => (
                <Link key={m.id} to={`/chat/${m.id}`}
                  className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                      <MessageSquare size={14} className="text-[var(--color-primary)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                        {m.name}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{m.model_slug || m.type}</p>
                    </div>
                  </div>
                </Link>
              ))}
              {imageModels.slice(0, 3).map(m => (
                <Link key={m.id} to={`/images/${m.id}`}
                  className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                      <Image size={14} className="text-pink-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                        {m.name}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{m.model_slug || m.type}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
