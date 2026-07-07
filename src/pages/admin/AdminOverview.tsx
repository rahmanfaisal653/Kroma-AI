import React, { useEffect, useState } from 'react';
import { Users, Database, CreditCard, Wallet, TrendingUp, Activity } from 'lucide-react';
import { adminApi, modelsApi, plansApi } from '../../services/api';

interface Stats {
  users: number;
  apis: number;
  plans: number;
  totalCredits: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  iconClass: string;
  iconColor: string;
}

function StatCard({ label, value, sub, icon, iconClass, iconColor }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] p-5 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-all duration-150 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center ${iconClass}`}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <TrendingUp size={14} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums">{value}</p>
      <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{label}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 opacity-70">{sub}</p>
    </div>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats>({ users: 0, apis: 0, plans: 0, totalCredits: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [apis, users, plans] = await Promise.all([
          modelsApi.getAll().catch(() => []),
          adminApi.getUsers().catch(() => []),
          plansApi.getAll().catch(() => []),
        ]);
        const totalCredits = (Array.isArray(users) ? users : []).reduce(
          (sum: number, u: any) => sum + (Number(u.quota_limit) || 0) - (Number(u.usage_count) || 0), 0
        );
        setStats({
          apis: Array.isArray(apis) ? apis.length : 0,
          users: Array.isArray(users) ? users.length : 0,
          plans: Array.isArray(plans) ? plans.length : 0,
          totalCredits: Math.max(0, Math.round(totalCredits)),
        });
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Overview</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">System health and key metrics</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Activity size={12} className="text-emerald-500" />
          <span className="text-xs font-medium text-emerald-500">System Online</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-4 py-3 rounded-[var(--radius-md)]">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={stats.users}
          sub="registered accounts"
          icon={<Users size={18} />}
          iconClass="kroma-stat-icon-indigo"
          iconColor="var(--color-primary)"
        />
        <StatCard
          label="AI Models"
          value={stats.apis}
          sub="active endpoints"
          icon={<Database size={18} />}
          iconClass="kroma-stat-icon-emerald"
          iconColor="var(--color-success)"
        />
        <StatCard
          label="Billing Plans"
          value={stats.plans}
          sub="available tiers"
          icon={<CreditCard size={18} />}
          iconClass="kroma-stat-icon-amber"
          iconColor="var(--color-warning)"
        />
        <StatCard
          label="Total Credits"
          value={stats.totalCredits.toLocaleString()}
          sub="across all users"
          icon={<Wallet size={18} />}
          iconClass="kroma-stat-icon-sky"
          iconColor="var(--color-info)"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Manage Users', desc: 'View and edit user accounts', href: '/admin/users', color: 'var(--color-primary)' },
          { label: 'AI Models', desc: 'Configure model endpoints', href: '/admin/models', color: 'var(--color-success)' },
          { label: 'Transactions', desc: 'Review pending payments', href: '/admin/billing/transactions', color: 'var(--color-warning)' },
        ].map(link => (
          <a key={link.href} href={link.href}
            className="p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-sm)] transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text)]">{link.label}</p>
              <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: link.color }}>→</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">{link.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
