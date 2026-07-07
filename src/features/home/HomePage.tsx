import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, MessageSquare, Key, Shield, BarChart3, ArrowRight, Bot, Image, Layers, Code2, Globe, Sparkles, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { modelsApi } from '../../services/api';
import type { ApiModel } from '../../types';

export default function HomePage() {
  const user = useAuthStore(s => s.user);
  const [models, setModels] = useState<ApiModel[]>([]);

  useEffect(() => {
    modelsApi.getAll().then(setModels).catch(() => {});
  }, []);

  const textModels = models.filter(m => m.type === 'text-to-text');
  const imageModels = models.filter(m => m.type === 'text-to-image');
  const totalModels = models.length;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, var(--color-primary), transparent)' }} />
          <div className="absolute top-20 right-0 w-[300px] h-[300px] rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-12">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ background: 'var(--color-primary-light)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
              <Sparkles size={12} />
              {totalModels > 0 ? `${totalModels} Model AI Aktif` : 'AI Gateway'}
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text)] leading-tight mb-4">
              Satu API, Akses{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'var(--color-primary-gradient)' }}>
                Semua Model AI
              </span>
            </h1>
            <p className="text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed">
              Kroma AI Gateway memberikan akses unified ke berbagai model AI melalui satu endpoint.
              Compatible dengan format OpenAI — drop-in replacement untuk aplikasi Anda.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <Link to="/docs"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white px-6 py-3 rounded-xl transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'var(--color-primary-gradient)' }}>
              <MessageSquare size={15} /> Test API
            </Link>
            <Link to="/keys"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)] px-6 py-3 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-all">
              <Key size={15} /> Buat API Key
            </Link>
          </div>

          {/* Code Example */}
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                </div>
                <span className="text-xs text-slate-400 font-mono ml-2">curl</span>
                <Code2 size={12} className="text-slate-500 ml-auto" />
              </div>
              <pre className="p-5 bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed">
{`curl -X POST ${window.location.origin}/v1/chat/completions \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${textModels[0]?.model_slug || 'gpt-4o'}",
    "messages": [
      {"role": "user", "content": "Halo!"}
    ]
  }'`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-t border-[var(--color-border)]">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: totalModels || '50+', label: 'Model AI', icon: <Bot size={18} /> },
              { value: '99.9%', label: 'Uptime', icon: <Shield size={18} /> },
              { value: '<100ms', label: 'Latency', icon: <Zap size={18} /> },
              { value: '∞', label: 'Rate Limit (Admin)', icon: <Globe size={18} /> },
            ].map((s, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-[var(--color-primary)] mb-1">
                  {s.icon}
                </div>
                <p className="text-2xl font-bold text-[var(--color-text)]">{s.value}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models Showcase */}
      {models.length > 0 && (
        <section className="border-t border-[var(--color-border)]">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Model Tersedia</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Pilih model yang sesuai kebutuhan Anda
              </p>
            </div>

            {/* Text Models */}
            {textModels.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare size={16} className="text-[var(--color-primary)]" />
                  <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Chat & Text</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {textModels.map(m => (
                    <Link key={m.id} to="/docs"
                      className="group p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                          <Bot size={16} className="text-[var(--color-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-text)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                            {m.name}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{m.model_slug || m.type}</p>
                        </div>
                        <ChevronRight size={14} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {m.description && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-2 line-clamp-2">{m.description}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Image Models */}
            {imageModels.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Image size={16} className="text-pink-400" />
                  <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Image Generation</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {imageModels.map(m => (
                    <Link key={m.id} to="/docs"
                      className="group p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-pink-400/40 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                          <Image size={16} className="text-pink-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-text)] truncate group-hover:text-pink-400 transition-colors">
                            {m.name}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{m.model_slug || m.type}</p>
                        </div>
                        <ChevronRight size={14} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {m.description && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-2 line-clamp-2">{m.description}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="border-t border-[var(--color-border)]">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Fitur Unggulan</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Semua yang Anda butuhkan untuk integrasi AI
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: MessageSquare, title: 'Chat Playground', desc: 'Coba berbagai model AI langsung dari browser dengan streaming real-time dan context memory.', color: 'from-indigo-500 to-purple-500' },
              { icon: Key, title: 'API Key Management', desc: 'Generate dan kelola API key. Kompatibel format OpenAI — drop-in replacement.', color: 'from-amber-500 to-orange-500' },
              { icon: Layers, title: 'Multi-Model Routing', desc: 'Satu endpoint untuk semua model. Gateway otomatis route ke provider yang tepat.', color: 'from-emerald-500 to-teal-500' },
              { icon: Shield, title: 'API Key Security', desc: 'API key disimpan hash, full key hanya tampil sekali saat dibuat.', color: 'from-red-500 to-pink-500' },
              { icon: BarChart3, title: 'Usage Analytics', desc: 'Monitor penggunaan API internal dan partner per key.', color: 'from-blue-500 to-cyan-500' },
              { icon: Image, title: 'Provider Status', desc: 'Cek koneksi OpenAI, Ollama, dan LM Studio dari dashboard.', color: 'from-pink-500 to-rose-500' },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i}
                  className="group p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 hover:shadow-lg transition-all">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center shadow-lg mb-4`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <h3 className="font-semibold text-[var(--color-text)] mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="border-t border-[var(--color-border)]">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Mulai Sekarang</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Pilih cara Anda menggunakan Kroma AI</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { to: '/docs', icon: MessageSquare, title: 'Test API', desc: 'Tes endpoint provider dari web' },
              { to: '/models', icon: Image, title: 'Providers', desc: 'Cek OpenAI, Ollama, LM Studio' },
              { to: '/keys', icon: Key, title: 'API Key', desc: 'Untuk akses programmatic' },
              { to: '/docs', icon: Code2, title: 'Dokumentasi', desc: 'Panduan integrasi lengkap' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <Link key={i} to={item.to}
                  className="group flex items-center gap-3 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0 group-hover:bg-[var(--color-primary)]/15 transition-colors">
                    <Icon size={18} className="text-[var(--color-primary)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">{item.title}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
