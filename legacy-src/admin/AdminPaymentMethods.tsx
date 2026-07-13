import React, { useEffect, useRef, useState } from 'react';
import http from '../../services/http';
import {
  Plus, Edit, Trash2, Loader2, X, CheckCircle2,
  AlertCircle, CreditCard, QrCode, Eye, EyeOff,
  ToggleLeft, ToggleRight, Upload
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  name: string;
  type: string;   // plain string, e.g. "Transfer Bank", "QRIS", "GoPay"
  icon: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_url: string;
  min_amount: number;
  active: boolean;
}

const EMPTY: Partial<PaymentMethod> = {
  name: '', type: '', icon: '', bank_name: '',
  account_number: '', account_name: '', qr_url: '', min_amount: 0, active: true
};

const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-700">
        {label} {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── QR File Upload ───────────────────────────────────────────────────────────

function QrUpload({ value, onChange }: { value: string; onChange: (base64: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">Klik atau drag & drop gambar QR</p>
        <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, WEBP — maks. 2MB</p>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileInput} />
      </div>

      {value && (
        <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
          <img
            src={value}
            alt="QR Preview"
            className="w-28 h-28 object-contain rounded-lg border border-slate-200 bg-white p-1 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 mb-1">QR tersimpan ✓</p>
            <p className="text-[10px] text-slate-400 break-all leading-relaxed">
              {value.startsWith('data:') ? `[Base64 image — ${Math.round(value.length / 1024)}KB]` : value}
            </p>
            <button
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="mt-2 text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Hapus
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Method Card ──────────────────────────────────────────────────────────────

function MethodCard({ method, onEdit, onDelete, onToggle }: {
  method: PaymentMethod;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [showQr, setShowQr] = useState(false);

  return (
    <div className={`relative bg-white rounded-2xl border-2 p-5 shadow-sm flex flex-col gap-3 transition-all ${
      method.active ? 'border-slate-200' : 'border-slate-100 opacity-55'
    }`}>
      {/* Actions top-right */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button onClick={onToggle} title={method.active ? 'Nonaktifkan' : 'Aktifkan'}
          className={`transition-colors ${method.active ? 'text-teal-500 hover:text-teal-700' : 'text-slate-300 hover:text-slate-500'}`}>
          {method.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
        <button onClick={onEdit} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Icon + name + type badge */}
      <div className="flex items-center gap-3 pr-20">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">
          {method.icon || '💳'}
        </div>
        <div>
          <h3 className="font-bold text-slate-900 leading-tight">{method.name}</h3>
          {method.type && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {method.type}
            </span>
          )}
        </div>
      </div>

      {/* Account info (always show if present) */}
      {(method.bank_name || method.account_number) && (
        <>
          {method.bank_name && <p className="text-xs text-slate-500">{method.bank_name}</p>}
          {method.account_number && (
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-sm font-mono font-bold text-slate-800 tracking-wider">{method.account_number}</p>
              {method.account_name && <p className="text-xs text-slate-400 mt-0.5">a/n {method.account_name}</p>}
            </div>
          )}
        </>
      )}

      {/* QR image (show if present) */}
      {method.qr_url && (
        <div>
          <button onClick={() => setShowQr(!showQr)}
            className="text-xs flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium">
            <QrCode className="w-3.5 h-3.5" />
            {showQr ? 'Sembunyikan QR' : 'Lihat QR Code'}
            {showQr ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          {showQr && (
            <img src={method.qr_url} alt={`QR ${method.name}`}
              className="mt-2 w-36 h-36 object-contain rounded-xl border border-slate-200 bg-white p-1" />
          )}
        </div>
      )}

      {/* Min amount */}
      {method.min_amount > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1 self-start">
          Min. Rp {method.min_amount.toLocaleString('id-ID')}
        </p>
      )}

      {!method.active && (
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 self-start">
          Nonaktif
        </span>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function MethodModal({ open, editingId, formData, onChange, onSave, onClose, saving, error }: {
  open: boolean;
  editingId: string | null;
  formData: Partial<PaymentMethod>;
  onChange: (d: Partial<PaymentMethod>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  if (!open) return null;
  const set = (patch: Partial<PaymentMethod>) => onChange({ ...formData, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {editingId === 'new' ? 'Tambah Metode Pembayaran' : 'Edit Metode Pembayaran'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Isi kolom yang relevan, kosongkan yang tidak dipakai</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-8 py-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          {/* ── Section 1: Identitas ── */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Identitas</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="Nama Tampilan" hint="*">
                  <input className={inputCls} placeholder="e.g. Transfer BCA, QRIS GoPay, OVO"
                    value={formData.name || ''} onChange={e => set({ name: e.target.value })} />
                </Field>
              </div>
              <Field label="Icon" hint="— emoji">
                <input className={inputCls} placeholder="🏦 📱 💚 ₿"
                  value={formData.icon || ''} onChange={e => set({ icon: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Tipe / Kategori" hint="— teks bebas, opsional">
                <input className={inputCls} placeholder="e.g. Transfer Bank, QRIS, E-Wallet, Crypto"
                  value={formData.type || ''} onChange={e => set({ type: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* ── Section 2: Info Rekening (2-col layout) ── */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Info Rekening / Nomor HP</p>
            <div className="space-y-4">
              <Field label="Nama Bank / Platform" hint="— opsional">
                <input className={inputCls} placeholder="e.g. Bank Central Asia (BCA), GoPay, OVO, DANA"
                  value={formData.bank_name || ''} onChange={e => set({ bank_name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nomor Rekening / Nomor HP" hint="— opsional">
                  <input className={inputCls} placeholder="e.g. 1234567890 / 08123456789"
                    value={formData.account_number || ''} onChange={e => set({ account_number: e.target.value })} />
                </Field>
                <Field label="Nama Pemilik Rekening" hint="— opsional">
                  <input className={inputCls} placeholder="e.g. Muhammad Faisal R."
                    value={formData.account_name || ''} onChange={e => set({ account_name: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          {/* ── Section 3: QR Code + Minimum (side-by-side) ── */}
          <div className="grid grid-cols-2 gap-5 items-start">
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5" /> QR Code — opsional
              </p>
              <QrUpload value={formData.qr_url || ''} onChange={base64 => set({ qr_url: base64 })} />
            </div>

            <div className="space-y-4">
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Batas Minimum</p>
                <Field label="Minimum Pembelian (Rp)" hint="— 0 = tidak ada batas">
                  <input type="number" min="0" className={inputCls}
                    placeholder="e.g. 20000"
                    value={formData.min_amount || 0} onChange={e => set({ min_amount: Number(e.target.value) })} />
                </Field>
                {(formData.min_amount || 0) > 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    = Rp {Number(formData.min_amount).toLocaleString('id-ID')} minimum
                  </p>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Status</p>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => set({ active: !formData.active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.active ? 'bg-teal-500' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${formData.active ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <div>
                    <span className={`text-sm font-semibold ${formData.active ? 'text-teal-700' : 'text-slate-400'}`}>
                      {formData.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formData.active ? 'Tampil di halaman Pricing user' : 'Disembunyikan dari user'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-2xl">
          <p className="text-xs text-slate-400">Kolom bertanda * wajib diisi</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2 text-sm text-slate-500 hover:text-slate-900 font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Batal</button>
            <button onClick={onSave} disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId === 'new' ? 'Tambah Metode' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Auth handled by http interceptor (JWT Bearer token)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PaymentMethod>>(EMPTY);
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
      const res = await http.get('/api/admin/payment-methods');
      setMethods(res.data);
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Gagal memuat data.');
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditingId('new'); setFormData({ ...EMPTY, active: true });
    setSaveError(null); setModalOpen(true);
  };
  const openEdit = (m: PaymentMethod) => {
    setEditingId(m.id); setFormData({ ...m });
    setSaveError(null); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditingId(null); setSaveError(null); };

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      if (editingId === 'new') {
        await http.post('/api/admin/payment-methods', formData);
        showToast('success', 'Metode ditambahkan.');
      } else {
        await http.put(`/api/admin/payment-methods/${editingId}`, formData);
        showToast('success', 'Metode diperbarui.');
      }
      closeModal(); fetchData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const base = err.response?.data?.error || err.message || 'Gagal menyimpan.';
      setSaveError(detail ? `${base} → ${JSON.stringify(detail)}` : base);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus metode pembayaran ini?')) return;
    try {
      await http.delete(`/api/admin/payment-methods/${id}`);
      showToast('success', 'Metode dihapus.'); fetchData();
    } catch { showToast('error', 'Gagal menghapus.'); }
  };

  const handleToggle = async (m: PaymentMethod) => {
    try {
      await http.put(`/api/admin/payment-methods/${m.id}`, { active: !m.active });
      showToast('success', `${m.name} ${!m.active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      fetchData();
    } catch { showToast('error', 'Gagal mengubah status.'); }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Metode Pembayaran</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {methods.length} metode · {methods.filter(m => m.active).length} aktif
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
          <Plus className="w-4 h-4" /> Tambah Metode
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : methods.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">Belum ada metode pembayaran</p>
          <p className="text-slate-400 text-sm mt-1">Tambahkan metode agar user bisa memilih cara pembayaran.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {methods.map(m => (
            <MethodCard key={m.id} method={m}
              onEdit={() => openEdit(m)}
              onDelete={() => handleDelete(m.id)}
              onToggle={() => handleToggle(m)}
            />
          ))}
        </div>
      )}

      <MethodModal
        open={modalOpen} editingId={editingId}
        formData={formData} onChange={setFormData}
        onSave={handleSave} onClose={closeModal}
        saving={saving} error={saveError}
      />
    </div>
  );
}
