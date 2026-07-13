import React, { useEffect, useState } from 'react';
import http from '../../services/http';
import { Edit, Trash2, Loader2, Key } from 'lucide-react';

interface User {
  id: string;
  email: string;
  role: string;
  status?: string;
  user_key: string;
  quota_limit?: number;
  usage_count?: number;
  balance?: number;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingUser, setIsEditingUser] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState<Partial<User>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await http.get('/api/admin/users');
      setUsers(res.data);
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      await http.delete(`/api/admin/users/${id}`);
      fetchData();
    }
  };

  const handleSaveUser = async () => {
    try {
      // Only send fields that the backend whitelist accepts
      const payload: Record<string, any> = {};
      if (userFormData.email !== undefined) payload.email = userFormData.email;
      if (userFormData.role !== undefined) payload.role = userFormData.role;
      if (userFormData.status !== undefined) payload.status = userFormData.status;
      if (userFormData.quota_limit !== undefined) payload.quota_limit = Number(userFormData.quota_limit);
      if (userFormData.usage_count !== undefined) payload.usage_count = Number(userFormData.usage_count);
      if (userFormData.balance !== undefined) payload.balance = Number(userFormData.balance);

      const res = await http.put(`/api/admin/users/${isEditingUser}`, payload);
      console.log('[AdminUsers] Save success:', res.data);
      setIsEditingUser(null);
      fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Failed to save user:', msg);
      alert(`Failed to save user: ${msg}`);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg md:text-xl font-semibold text-slate-800">Users & Tokens Management</h2>
      </div>

      {isEditingUser && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Edit User & Token</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Email/Username</label>
              <input value={userFormData.email || ''} onChange={e => setUserFormData({...userFormData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Role</label>
              <select value={userFormData.role || ''} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-900">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Status</label>
              <select value={userFormData.status || ''} onChange={e => setUserFormData({...userFormData, status: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-900">
                <option value="">Default</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1 col-span-full">
              <label className="text-xs text-slate-500">API Access Key (Kroombase)</label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={userFormData.user_key || ''} onChange={e => setUserFormData({...userFormData, user_key: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-900" placeholder="Enter API Key" />
              </div>
              <p className="text-xs text-slate-500 mt-1">This token is used by the user to authenticate API requests.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Quota Limit <span className="text-slate-400">(total credits maksimum yang bisa digunakan user)</span></label>
              <input type="number" min="0" placeholder="cth: 500 → user bisa pakai sampai 500 credits total" value={userFormData.quota_limit ?? 0} onChange={e => setUserFormData({...userFormData, quota_limit: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Usage Saat Ini <span className="text-slate-400">(credits yang sudah terpakai — reset ke 0 jika ingin beri fresh quota)</span></label>
              <input type="number" min="0" placeholder="cth: 0 → belum ada penggunaan, atau sesuai history" value={userFormData.usage_count ?? 0} onChange={e => setUserFormData({...userFormData, usage_count: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-900" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setIsEditingUser(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900">Cancel</button>
            <button onClick={handleSaveUser} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Save User</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-500 min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">API Key Token</th>
              <th className="px-6 py-4">Quota Limit</th>
              <th className="px-6 py-4">Usage</th>
              <th className="px-6 py-4">Balance</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-6 py-4 font-medium text-slate-900">{u.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${(u.status || u.role) === 'admin' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {u.status || 'default'}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-xs">
                  {u.user_key ? (
                    <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Set: {u.user_key.substring(0, 4)}...</span>
                  ) : (
                    <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded">Not Set</span>
                  )}
                </td>
                <td className="px-6 py-4 text-slate-700">{u.quota_limit ?? '—'}</td>
                <td className="px-6 py-4 text-slate-700">{u.usage_count ?? '—'}</td>
                <td className="px-6 py-4 text-slate-700">{u.balance ?? '—'}</td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button onClick={() => { setIsEditingUser(u.id); setUserFormData(u); }} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteUser(u.id)} disabled={u.role === 'admin' || u.status === 'admin'} className="p-2 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
