import React, { useState, useEffect } from 'react';
import { CreditCard, Wallet, Receipt, ArrowRight, CheckCircle, Zap, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useQuota } from '../../hooks/useQuota';
import { plansApi, paymentMethodsApi, billingApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/Toast';
import type { Plan, PaymentMethod, Transaction } from '../../types';

export default function BillingPage() {
  const user = useAuthStore(s => s.user);
  const { quota, refresh: refreshQuota } = useQuota();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customCredits, setCustomCredits] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      plansApi.getAll().catch(() => []),
      paymentMethodsApi.getAll().catch(() => []),
      user ? billingApi.getTransactions().catch(() => []) : Promise.resolve([])
    ]).then(([p, m, t]) => {
      setPlans(p); setMethods(m); setTransactions(t);
      setLoading(false);
    });
  }, [user?.id]);

  const handlePurchase = async (method: PaymentMethod) => {
    if (!user) return;
    
    try {
      if (customMode) {
        const credits = parseInt(customCredits);
        if (!credits || credits <= 0) {
          toast.error('Jumlah credits harus lebih dari 0');
          return;
        }
        if (credits > 50000) {
          toast.error('Maksimal pembelian 50.000 credits');
          return;
        }
        
        await billingApi.createTransaction({
          user_key: '',
          user_email: user.email,
          user_name: user.email.split('@')[0],
          plan_id: '',
          plan_name: `Custom ${credits} Credits`,
          credits: credits,
          bonus_credits: 0,
          price: credits * 100,
          payment_method: method.name,
          custom_credits: credits
        });
      } else {
        if (!selectedPlan) return;
        await billingApi.createTransaction({
          user_key: '',
          user_email: user.email,
          user_name: user.email.split('@')[0],
          plan_id: String(selectedPlan.id),
          plan_name: selectedPlan.name,
          credits: selectedPlan.credits,
          bonus_credits: selectedPlan.bonus_credits || 0,
          price: selectedPlan.price,
          payment_method: method.name
        });
      }
      
      toast.success('Transaction submitted! Awaiting confirmation.');
      setSelectedPlan(null);
      setCustomMode(false);
      setCustomCredits('');
      refreshQuota();
      const t = await billingApi.getTransactions().catch(() => []);
      setTransactions(t);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit transaction');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const usedPct = quota ? Math.min(100, Math.round((quota.usage / quota.quota) * 100)) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Billing & Credits</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Manage your credits and payment history</p>
        </div>

        {/* Balance card */}
        <div className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 border border-[var(--color-border)]"
          style={{ background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-alt) 100%)' }}>
          <div className="absolute top-0 right-0 w-48 h-48 opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"
            style={{ background: 'var(--color-primary-gradient)' }} />
          <div className="relative flex items-start justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Available Credits</p>
              <p className="text-4xl font-bold text-[var(--color-text)] tabular-nums">
                {quota ? Math.max(0, quota.remaining).toLocaleString() : '—'}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Used: {quota?.usage?.toLocaleString() || 0}</span>
                  <span>Total: {quota?.quota?.toLocaleString() || 0}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden w-48">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${usedPct}%`, background: 'var(--color-primary-gradient)' }} />
                </div>
              </div>
            </div>
            <div className="w-12 h-12 rounded-[var(--radius-lg)] flex items-center justify-center kroma-stat-icon-indigo">
              <Wallet size={22} style={{ color: 'var(--color-primary)' }} />
            </div>
          </div>
        </div>

        {/* Plans */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Top Up Credits</h2>
            <span className="text-xs text-[var(--color-text-muted)]">{plans.length} plans available</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Custom Credits Card */}
            <button onClick={() => { setCustomMode(true); setSelectedPlan(null); }}
              className="relative p-5 rounded-[var(--radius-lg)] border text-left transition-all duration-150 group kroma-card-hover bg-[var(--color-surface)] border-[var(--color-border)] border-dashed">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-[var(--radius-md)] kroma-stat-icon-indigo flex items-center justify-center">
                  <CreditCard size={14} style={{ color: 'var(--color-primary)' }} />
                </div>
                <h3 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors text-sm">
                  Custom Amount
                </h3>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Masukkan jumlah credits sesuai kebutuhan (max 50.000)
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-2">
                Rate: Rp 100 / credit
              </p>
            </button>
            
            {plans.map(plan => (
              <button key={plan.id} onClick={() => { setSelectedPlan(plan); setCustomMode(false); }}
                className="relative p-5 rounded-[var(--radius-lg)] border text-left transition-all duration-150 group kroma-card-hover bg-[var(--color-surface)] border-[var(--color-border)]">
                {plan.popular && (
                  <div className="absolute -top-2.5 left-4">
                    <Badge variant="warning" dot>Popular</Badge>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-[var(--radius-md)] kroma-stat-icon-indigo flex items-center justify-center">
                    <Zap size={14} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <h3 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors text-sm">
                    {plan.name}
                  </h3>
                </div>
                <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums">
                  Rp {plan.price?.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {plan.credits?.toLocaleString()} credits
                  {plan.bonus_credits > 0 && (
                    <span className="text-emerald-500 font-medium"> +{plan.bonus_credits} bonus</span>
                  )}
                </p>
                {plan.features && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                    {(Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || '[]')).slice(0, 2).map((f: string) => (
                      <div key={f} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                        <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--color-text)]">Transaction History</h2>
              <TrendingUp size={14} className="text-[var(--color-text-muted)]" />
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 10).map((tx, i) => (
                    <tr key={tx.id} className={i > 0 ? 'border-t border-[var(--color-border)]' : ''}>
                      <td className="px-4 py-3 text-[var(--color-text)] font-medium">{tx.plan_name}</td>
                      <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">Rp {tx.price?.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Badge variant={tx.status === 'CONFIRMED' ? 'success' : tx.status === 'REJECTED' ? 'danger' : 'warning'} dot>
                          {tx.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment modal */}
        <Modal open={!!selectedPlan || customMode} onClose={() => { setSelectedPlan(null); setCustomMode(false); setCustomCredits(''); }}
          title="Select Payment Method"
          description={customMode ? 'Custom Credits Purchase' : selectedPlan ? `${selectedPlan.name} — Rp ${selectedPlan.price?.toLocaleString()}` : undefined}
          size="md">
          {(selectedPlan || customMode) && (
            <div className="space-y-4">
              {customMode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--color-text)]">Jumlah Credits</label>
                  <input
                    type="number"
                    value={customCredits}
                    onChange={(e) => setCustomCredits(e.target.value)}
                    placeholder="Masukkan jumlah credits (max 50.000)"
                    min="1"
                    max="50000"
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  {customCredits && parseInt(customCredits) > 0 && (
                    <div className="text-xs text-[var(--color-text-muted)]">
                      Total: Rp {(Math.min(parseInt(customCredits) || 0, 50000) * 100).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {methods.map(method => (
                  <button key={method.id} onClick={() => handlePurchase(method)}
                    disabled={customMode && (!customCredits || parseInt(customCredits) <= 0 || parseInt(customCredits) > 50000)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-all group disabled:opacity-50 disabled:cursor-not-allowed">
                    <div className="w-9 h-9 rounded-[var(--radius-md)] kroma-stat-icon-indigo flex items-center justify-center shrink-0">
                      <CreditCard size={16} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-[var(--color-text)]">{method.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{method.bank_name} · {method.account_number}</p>
                    </div>
                    <ArrowRight size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
