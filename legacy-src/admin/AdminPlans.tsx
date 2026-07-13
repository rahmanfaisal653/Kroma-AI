import React, { useEffect, useState } from 'react';
import http from '../../services/http';
import { InputField } from '../../components/InputField';
import {
  Plus, Edit, Trash2, Loader2, X, Star, Zap,
  CheckCircle2, AlertCircle, Gift, CreditCard
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number;  // integer (e.g. 15000) — no currency symbols
  credits: number;
  bonus_credits: number;
  processing_fee: number;
  billing_cycle: 'one-time' | 'monthly' | 'yearly';
  stripe_product_id: string;
  features: string[];
  popular: boolean;
}

const EMPTY_PLAN: Partial<Plan> = {
  name: '', price: 0, credits: 0, bonus_credits: 0, processing_fee: 0,
  billing_cycle: 'one-time', stripe_product_id: '',
  features: [], popular: false
};

const inputCls = "w-full rounded-lg px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent shadow-sm";
const inputStyle: React.CSSProperties = { background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' };

// ─── Plan Card (preview exactly as user sees it) ──────────────────────────────

interface PlanCardProps {
  plan: Plan;
  onEdit: () => void;
  onDelete: () => void;
}

const CYCLE_LABEL: Record<string, string> = {
  'one-time': 'one-time purchase',
  'monthly': '/ month',
  'yearly': '/ year'
};

// PlanCard: tile-style matching exactly what user sees on the Pricing page
function PlanCard({ plan, onEdit, onDelete }: PlanCardProps) {
  return (
    <div className={`relative rounded-xl border-2 py-5 px-3 text-center transition-all flex flex-col items-center gap-2 ${
      plan.popular
        ? 'border-indigo-300 bg-gradient-to-b from-indigo-50 to-white shadow-md shadow-indigo-100'
        : 'border-slate-200 bg-white shadow-sm'
    }`}>
      {/* Bonus badge — top-left, same as user tile */}
      {plan.bonus_credits > 0 && (
        <span className="absolute -top-2 -left-1 bg-orange-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm z-10">
          <Gift className="w-2.5 h-2.5" />
          +{plan.bonus_credits >= 1000
            ? `${Math.round(plan.bonus_credits / 1000)}K`
            : plan.bonus_credits}
        </span>
      )}

      {/* Admin action buttons — top-right */}
      <div className="absolute top-1.5 right-1.5 flex gap-0.5">
        <button onClick={onEdit} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
          <Edit className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Plan name */}
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest leading-tight px-4 mt-1">
        {plan.name || 'Unnamed'}
      </p>

      {/* Price — main focal point */}
      <p className="text-2xl font-extrabold text-slate-900 leading-none">
        Rp {plan.price >= 1000
          ? `${(plan.price / 1000).toLocaleString('id-ID')}K`
          : plan.price.toLocaleString('id-ID')}
      </p>

      {/* Credits */}
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Zap className="w-3 h-3 text-indigo-400" />
        <span className="font-semibold text-slate-700">
          {plan.credits >= 1000
            ? `${(plan.credits / 1000).toLocaleString('id-ID')}K`
            : plan.credits.toLocaleString('id-ID')}
        </span>
        <span>credits</span>
      </div>

      {/* Processing fee badge */}
      {plan.processing_fee > 0 && (
        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          +Rp {plan.processing_fee.toLocaleString('id-ID')} fee
        </span>
      )}

      {/* Popular badge */}
      {plan.popular && (
        <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
          <Star className="w-2.5 h-2.5 fill-current" /> POPULER
        </span>
      )}

      {/* Features mini-list */}
      {plan.features?.length > 0 && (
        <div className="w-full border-t border-slate-100 pt-2 mt-1 text-left space-y-1">
          {plan.features.slice(0, 2).map((f, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-slate-500">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />{f}
            </div>
          ))}
          {plan.features.length > 2 && (
            <p className="text-[10px] text-slate-400">+{plan.features.length - 2} more</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal Form ───────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  editingId: string | null;
  formData: Partial<Plan>;
  onChange: (d: Partial<Plan>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}

function PlanModal({ open, editingId, formData, onChange, onSave, onClose, saving, error }: ModalProps) {
  if (!open) return null;
  const set = (patch: Partial<Plan>) => onChange({ ...formData, ...patch });
  const isNew = editingId === 'new';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? 'Create Pricing Plan' : 'Edit Pricing Plan'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <InputField label="Plan Name" hint="*">
              <input className={inputCls} placeholder="e.g. Starter, Pro, Enterprise" value={formData.name || ''} onChange={e => set({ name: e.target.value })} />
            </InputField>
            <InputField label="Price" hint="*">
              <input type="number" min="0" className={inputCls} placeholder='e.g. 15000 (tanpa simbol mata uang)' value={formData.price ?? 0} onChange={e => set({ price: Number(e.target.value) })} />
            </InputField>
          </div>

          <InputField label="Billing Cycle">
            <select className={inputCls} value={formData.billing_cycle || 'one-time'} onChange={e => set({ billing_cycle: e.target.value as Plan['billing_cycle'] })}>
              <option value="one-time">One-time purchase (top-up)</option>
              <option value="monthly">Monthly subscription</option>
              <option value="yearly">Yearly subscription</option>
            </select>
          </InputField>

          <div className="grid grid-cols-2 gap-4">
            <InputField label="Credits" hint="— otomatis dari harga (Rp 10 = 1 credit)">
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-semibold">
                {(Math.floor(Number(formData.price || 0) / 10)).toLocaleString('id-ID')} credits
              </div>
            </InputField>
            <InputField label="Bonus Credits" hint="(bonus gratis, 0 = tidak ada)">
              <input type="number" min="0" className={inputCls} placeholder="e.g. 100" value={formData.bonus_credits || 0} onChange={e => set({ bonus_credits: Number(e.target.value) })} />
            </InputField>
          </div>

          <InputField label="Processing Fee" hint="— biaya transaksi tambahan, 0 = gratis (ditampilkan di Order Summary user)">
            <input type="number" min="0" className={inputCls} placeholder="e.g. 2500 (Rp 2.500 biaya transaksi)" value={formData.processing_fee || 0} onChange={e => set({ processing_fee: Number(e.target.value) })} />
          </InputField>

          <InputField label="Features" hint="— comma-separated, shown on plan card">
            <input className={inputCls} placeholder="HD output, Priority queue, API access" value={Array.isArray(formData.features) ? formData.features.join(', ') : formData.features || ''} onChange={e => set({ features: e.target.value as any })} />
          </InputField>

          <InputField label="Stripe / Payment Product ID" hint="— optional, for webhook matching">
            <input className={inputCls} placeholder="prod_xxxxxxxxxxxx" value={formData.stripe_product_id || ''} onChange={e => set({ stripe_product_id: e.target.value })} />
          </InputField>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set({ popular: !formData.popular })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.popular ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${formData.popular ? 'translate-x-4.5' : 'translate-x-1'}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-slate-800">Mark as Popular</span>
              <p className="text-xs text-slate-400">Shows "POPULAR" badge and highlights the card with gradient.</p>
            </div>
          </div>

          {/* Live preview */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Live Preview — as seen by user</p>
            <div className="grid grid-cols-2 gap-4 items-start">
              {/* Tile preview */}
              <div>
                <p className="text-[10px] text-slate-400 mb-2 text-center">Pricing tile</p>
                <PlanCard
                  plan={{
                    id: 'preview',
                    name: formData.name || 'Plan Name',
                    price: Number(formData.price) || 0,
                    credits: Number(formData.credits) || 0,
                    bonus_credits: Number(formData.bonus_credits) || 0,
                    processing_fee: Number(formData.processing_fee) || 0,
                    billing_cycle: formData.billing_cycle || 'one-time',
                    stripe_product_id: formData.stripe_product_id || '',
                    features: Array.isArray(formData.features)
                      ? formData.features
                      : (formData.features as unknown as string || '').split(',').map(s => s.trim()).filter(Boolean),
                    popular: formData.popular || false
                  }}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              </div>
              {/* Order summary preview */}
              <div>
                <p className="text-[10px] text-slate-400 mb-2 text-center">Order Summary</p>
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Credit Amount</span>
                    <span className="font-medium text-slate-900">{(Number(formData.credits)||0).toLocaleString('id-ID')} credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Bonus Credits</span>
                    <span className={`font-medium ${(formData.bonus_credits||0) > 0 ? 'text-teal-600' : 'text-slate-400'}`}>
                      {(formData.bonus_credits||0) > 0 ? `+${Number(formData.bonus_credits).toLocaleString('id-ID')}` : 'Rp 0'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Processing Fee</span>
                    <span className="font-medium text-slate-900">
                      {(formData.processing_fee||0) > 0
                        ? `Rp ${Number(formData.processing_fee).toLocaleString('id-ID')}`
                        : 'Rp 0'}
                    </span>
                  </div>
                  <div className="border-t border-teal-200 pt-2 flex justify-between font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{(Math.floor(Number(formData.price||0) / 10) + (Number(formData.bonus_credits)||0)).toLocaleString('id-ID')} credits</span>
                  </div>
                  <button className="w-full bg-teal-600 text-white py-1.5 rounded-lg font-semibold text-xs mt-1 opacity-80 cursor-default">
                    Pay Rp {(Number(formData.price||0) + Number(formData.processing_fee||0)).toLocaleString('id-ID')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 font-medium">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? 'Create Plan' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await http.get('/api/plans');
      setPlans(res.data);
    } catch (err: any) {
      console.error('Failed to fetch plans:', err.response?.data || err.message);
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditingId('new');
    setFormData({ ...EMPTY_PLAN });
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setFormData({ ...plan });
    setSaveError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingId(null); setSaveError(null); };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        ...formData,
        features: typeof formData.features === 'string'
          ? (formData.features as string).split(',').map(s => s.trim()).filter(Boolean)
          : formData.features,
        credits: Math.floor(Number(formData.price || 0) / 10),
        bonus_credits: Number(formData.bonus_credits) || 0,
        processing_fee: Number(formData.processing_fee) || 0
      };

      if (editingId === 'new') {
        await http.post('/api/admin/plans', payload);
        showToast('success', 'Plan created successfully.');
      } else {
        await http.put(`/api/admin/plans/${editingId}`, payload);
        showToast('success', 'Plan updated.');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const base = err.response?.data?.error || err.message || 'Failed to save plan.';
      // Show the real Kroombase error so we can diagnose the issue
      const msg = detail ? `${base} → ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : base;
      setSaveError(msg);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    try {
      await http.delete(`/api/admin/plans/${id}`);
      showToast('success', 'Plan deleted.');
      fetchData();
    } catch { showToast('error', 'Failed to delete plan.'); }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pricing Plans</h2>
          <p className="text-sm text-slate-500 mt-0.5">{plans.length} plan{plans.length !== 1 ? 's' : ''} · Cards show exactly how users see them</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">No plans yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first pricing plan to display on the Pricing page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => openEdit(plan)}
              onDelete={() => handleDelete(plan.id)}
            />
          ))}
        </div>
      )}

      <PlanModal
        open={modalOpen}
        editingId={editingId}
        formData={formData}
        onChange={setFormData}
        onSave={handleSave}
        onClose={closeModal}
        saving={saving}
        error={saveError}
      />
    </div>
  );
}

