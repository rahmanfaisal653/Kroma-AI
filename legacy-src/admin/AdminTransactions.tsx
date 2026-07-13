import React, { useState, useEffect } from 'react';
import http from '../../services/http';
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, RefreshCw, Receipt } from 'lucide-react';

interface Transaction {
  id: string;
  user_key: string;
  user_email: string;
  user_name: string;
  plan_id: string;
  plan_name: string;
  credits: number;
  bonus_credits: number;
  price: number;
  payment_method: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  notes: string;
}

// Auth handled by http interceptor (JWT Bearer token)

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTransactions = (status?: string, pageNum = 1) => {
    setLoading(true); setError(null);
    const params: any = { page: pageNum, limit: 50 };
    if (status && status !== 'all') params.status = (status as string).toUpperCase();
    http.get('/api/admin/transactions', { params })
      .then(res => {
        const payload = res.data;
        // Handle both old (array) and new (paginated) format
        if (Array.isArray(payload)) {
          setTransactions(payload);
          setTotalPages(1);
          setTotal(payload.length);
        } else {
          setTransactions(payload?.data || []);
          setTotalPages(payload?.pagination?.totalPages || 1);
          setTotal(payload?.pagination?.total || 0);
        }
      })
      .catch(err => setError(err.response?.data?.error || 'Gagal memuat transaksi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); fetchTransactions(filterStatus === 'all' ? undefined : filterStatus, 1); }, [filterStatus]);

  const handleConfirm = async (id: string) => {
    setActionLoading(id + '_confirm');
    try {
      const res = await http.put(`/api/admin/transactions/${id}/confirm`, { notes: 'Dikonfirmasi oleh admin' });
      fetchTransactions(filterStatus === 'all' ? undefined : filterStatus, page);
      alert(`✅ Transaksi dikonfirmasi! +${res.data.credits_added} credits ditambahkan.`);
    } catch (err: any) {
      alert('❌ Gagal: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id + '_reject');
    try {
      await http.put(`/api/admin/transactions/${rejectModal.id}/reject`, { notes: rejectNote || 'Ditolak oleh admin' });
      setRejectModal(null); setRejectNote('');
      fetchTransactions(filterStatus === 'all' ? undefined : filterStatus, page);
    } catch (err: any) {
      alert('❌ Gagal: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const pending = transactions.filter(t => t.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-600" /> Kelola Transaksi
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Konfirmasi pembelian credits pengguna</p>
        </div>
        <button onClick={() => fetchTransactions(filterStatus === 'all' ? undefined : filterStatus)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Menunggu', value: transactions.filter(t => t.status === 'PENDING').length, color: 'amber' },
          { label: 'Dikonfirmasi', value: transactions.filter(t => t.status === 'CONFIRMED').length, color: 'emerald' },
          { label: 'Ditolak', value: transactions.filter(t => t.status === 'REJECTED').length, color: 'red' },
        ].map(s => (
          <div key={s.label} className={`bg-white border border-${s.color}-100 rounded-xl p-4 shadow-sm`}>
            <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'pending', 'confirmed', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterStatus === s ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {s === 'all' ? 'Semua' : s === 'pending' ? 'Menunggu' : s === 'confirmed' ? 'Dikonfirmasi' : 'Ditolak'}
            {s === 'pending' && pending > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Tidak ada transaksi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">ID</th>
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-5 py-3 text-left">Paket</th>
                  <th className="px-5 py-3 text-left">Credits</th>
                  <th className="px-5 py-3 text-left">Harga</th>
                  <th className="px-5 py-3 text-left">Metode</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">#{tx.id}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{tx.user_name || '—'}</p>
                      <p className="text-xs text-slate-400">{tx.user_email}</p>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{tx.plan_name}</td>
                    <td className="px-5 py-3">
                      {(Number(tx.credits) + Number(tx.bonus_credits)).toLocaleString('id-ID')}
                      {Number(tx.bonus_credits) > 0 && (
                        <span className="ml-1 text-orange-500 text-xs">+{Number(tx.bonus_credits).toLocaleString('id-ID')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">Rp {Number(tx.price).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-3">{tx.payment_method}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-5 py-3">
                      {tx.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirm(tx.id)}
                            disabled={actionLoading === tx.id + '_confirm'}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {actionLoading === tx.id + '_confirm' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            Konfirmasi
                          </button>
                          <button
                            onClick={() => { setRejectModal({ id: tx.id }); setRejectNote(''); }}
                            className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <XCircle className="w-3 h-3" /> Tolak
                          </button>
                        </div>
                      )}
                      {tx.status !== 'PENDING' && (
                        <span className="text-xs text-slate-400">{tx.notes || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Tolak Transaksi #{rejectModal.id}</h3>
            </div>
            <div className="p-6 space-y-3">
              <label className="text-sm font-medium text-slate-700">Alasan penolakan</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Contoh: Bukti transfer tidak jelas..."
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-500/30 focus:border-red-400 outline-none resize-none"
              />
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={!!actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-gray-500">
            {total} transaksi — Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchTransactions(filterStatus === 'all' ? undefined : filterStatus, p); }}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >← Prev</button>
            <button
              onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchTransactions(filterStatus === 'all' ? undefined : filterStatus, p); }}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
      <CheckCircle2 className="w-3 h-3" /> Dikonfirmasi
    </span>
  );
  if (status === 'REJECTED') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
      <XCircle className="w-3 h-3" /> Ditolak
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-semibold">
      <Clock className="w-3 h-3" /> Menunggu
    </span>
  );
}
