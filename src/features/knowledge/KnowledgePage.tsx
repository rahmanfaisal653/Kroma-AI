import React, { useState } from 'react';
import { Search, Upload } from 'lucide-react';
import { knowledgeApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { Input, Textarea } from '../../ui/Input';
import { toast } from '../../ui/Toast';

export default function KnowledgePage() {
  const [source, setSource] = useState('default');
  const [type, setType] = useState('text');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const ingest = async () => {
    if (!text.trim()) return toast.error('Text wajib diisi');
    setLoading(true);
    try {
      const res = await knowledgeApi.ingest({ source, type, text });
      toast.success(`Saved ${res.chunks} chunks`);
      setText('');
    } finally { setLoading(false); }
  };

  const search = async () => {
    if (!query.trim()) return toast.error('Query wajib diisi');
    setLoading(true);
    try {
      const res = await knowledgeApi.search({ query, topK: 5 });
      setResults(res.results || []);
    } finally { setLoading(false); }
  };

  return <div className="h-full overflow-y-auto"><div className="max-w-5xl mx-auto p-6 space-y-6">
    <div><h1 className="text-xl font-bold text-[var(--color-text)]">Knowledge</h1><p className="text-sm text-[var(--color-text-muted)] mt-1">Simpan data teks apa pun ke Chroma untuk RAG. Pakai <code>rag: true</code> saat chat.</p></div>

    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <h2 className="font-semibold">Add source</h2>
      <div className="grid md:grid-cols-2 gap-3"><Input label="Source" value={source} onChange={e => setSource(e.target.value)} /><Input label="Type" value={type} onChange={e => setType(e.target.value)} /></div>
      <Textarea label="Text / data" value={text} onChange={e => setText(e.target.value)} rows={10} placeholder="FAQ, produk, log, catatan, response API, dll." />
      <Button loading={loading} icon={<Upload size={14} />} onClick={ingest}>Save to Chroma</Button>
    </section>

    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <h2 className="font-semibold">Test search</h2>
      <Input label="Query" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari berdasarkan makna" />
      <Button loading={loading} icon={<Search size={14} />} onClick={search}>Search</Button>
      <div className="space-y-3">{results.map((r, i) => <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3"><p className="text-xs text-[var(--color-text-muted)] mb-1">{r.metadata?.source} · distance {Number(r.distance || 0).toFixed(3)}</p><p className="text-sm whitespace-pre-wrap">{r.text}</p></div>)}</div>
    </section>
  </div></div>;
}
