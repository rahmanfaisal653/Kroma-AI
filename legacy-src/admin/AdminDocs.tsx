import React, { useEffect, useState } from 'react';
import http from '../../services/http';
import { InputField } from '../../components/InputField';
import {
  Plus, Edit, Trash2, Loader2, X, FileText, Code2, Terminal, MessageSquare, Image, BookOpen
} from 'lucide-react';

interface DocItem {
  id: string;
  title: string;
  category: string;
  content: string;
  description: string;
  slug: string;
  section: string;
  sort_order: number;
  published: number;
}

const EMPTY_DOC: Partial<DocItem> = {
  title: '', category: 'prose', content: '', description: '', slug: '', section: 'chat', sort_order: 0, published: 1
};

const SECTION_TABS = [
  { id: 'all', label: 'Semua', icon: FileText },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'image', label: 'Image', icon: Image },
];

const CATEGORY_OPTIONS = [
  { value: 'prose', label: 'Prosa (Markdown)' },
  { value: 'curl', label: 'cURL' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
];

const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm";

export default function AdminDocs() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<DocItem>>(EMPTY_DOC);
  const [saving, setSaving] = useState(false);
  const [filterSection, setFilterSection] = useState('all');

  useEffect(() => { fetchDocs(); }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await http.get('/api/admin/docs');
      setDocs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch docs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (doc: DocItem) => {
    setEditingId(doc.id);
    setFormData({ ...doc });
  };

  const handleNew = () => {
    setEditingId('new');
    setFormData({ ...EMPTY_DOC, section: filterSection === 'all' ? 'chat' : filterSection });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus dokumentasi ini?')) return;
    try {
      await http.delete(`/api/admin/docs/${id}`);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert('Gagal menghapus dokumentasi');
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) return alert('Judul dan Konten wajib diisi');
    setSaving(true);
    try {
      const payload = {
        ...formData,
        slug: formData.slug || formData.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''),
        published: formData.published ? 1 : 0,
        sort_order: Number(formData.sort_order) || 0,
      };
      if (editingId === 'new') {
        const res = await http.post('/api/admin/docs', payload);
        setDocs(prev => [res.data, ...prev]);
      } else {
        await http.put(`/api/admin/docs/${editingId}`, payload);
        setDocs(prev => prev.map(d => d.id === editingId ? ({ ...d, ...payload } as unknown as DocItem) : d));
      }
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan dokumentasi');
    } finally {
      setSaving(false);
    }
  };

  const filteredDocs = filterSection === 'all'
    ? docs
    : docs.filter(d => d.section === filterSection);

  const categoryIcon = (cat: string) => {
    if (cat === 'curl') return <Terminal className="w-4 h-4" />;
    if (cat === 'prose') return <BookOpen className="w-4 h-4" />;
    return <Code2 className="w-4 h-4" />;
  };

  const categoryColor = (cat: string) => {
    if (cat === 'curl') return 'bg-emerald-100 text-emerald-600';
    if (cat === 'prose') return 'bg-blue-100 text-blue-600';
    return 'bg-amber-100 text-amber-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dokumentasi API</h1>
          <p className="text-slate-500 text-sm mt-1">Kelola bagian dokumentasi dan contoh kode.</p>
        </div>
        <button onClick={handleNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          Tambah Bagian
        </button>
      </div>

      {/* Section filter tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {SECTION_TABS.map(tab => {
          const Icon = tab.icon;
          const count = tab.id === 'all' ? docs.length : docs.filter(d => d.section === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterSection(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filterSection === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              <span className="text-xs text-slate-400">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(doc => (
            <div key={doc.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow flex flex-col gap-3 group relative">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${categoryColor(doc.category)}`}>
                    {categoryIcon(doc.category)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{doc.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{doc.section}</span>
                      <span className="text-xs text-slate-400">#{doc.sort_order}</span>
                      {doc.published === 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500">Draft</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(doc)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(doc.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {doc.description && <p className="text-xs text-slate-500 line-clamp-2">{doc.description}</p>}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 font-mono text-xs text-slate-600 overflow-hidden h-20 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50 pointer-events-none" />
                <pre className="whitespace-pre-wrap">{doc.content?.slice(0, 300)}</pre>
              </div>
            </div>
          ))}

          {filteredDocs.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Tidak ada dokumentasi untuk bagian ini.</p>
            </div>
          )}
        </div>
      )}

      {/* Drawer for editing */}
      {editingId && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30" onClick={() => setEditingId(null)} />
          <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-40 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">{editingId === 'new' ? 'Bagian Baru' : 'Edit Bagian'}</h2>
              <button onClick={() => setEditingId(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Bagian" hint="Tab mana">
                  <select className={inputCls} value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})}>
                    <option value="chat">Chat</option>
                    <option value="image">Image</option>
                  </select>
                </InputField>
                <InputField label="Kategori" hint="Tipe konten">
                  <select className={inputCls} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </InputField>
              </div>

              <InputField label="Judul" hint="*">
                <input className={inputCls} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="contoh: Autentikasi" />
              </InputField>

              <div className="grid grid-cols-2 gap-4">
                <InputField label="Slug" hint="ID URL-friendly">
                  <input className={inputCls} value={formData.slug || ''} onChange={e => setFormData({...formData, slug: e.target.value})} placeholder="auto-generate" />
                </InputField>
                <InputField label="Urutan" hint="Urutan tampil">
                  <input type="number" className={inputCls} value={formData.sort_order ?? 0} onChange={e => setFormData({...formData, sort_order: Number(e.target.value)})} />
                </InputField>
              </div>

              <InputField label="Deskripsi" hint="Subtitle singkat">
                <textarea rows={2} className={inputCls} value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Penjelasan singkat..." />
              </InputField>

              <InputField label="Konten" hint="* Markdown atau kode">
                <textarea rows={16} className={inputCls + ' font-mono text-xs'} value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})} placeholder="# Tulis markdown atau paste kode..." />
              </InputField>

              <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!formData.published} onChange={e => setFormData({...formData, published: e.target.checked ? 1 : 0})} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-slate-700">Dipublikasikan (terlihat oleh user)</span>
              </label>
            </div>

            <div className="pt-6 border-t border-slate-100 mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
