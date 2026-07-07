import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, ArrowRight, ChevronRight, Code2, Shield, BarChart3,
  Layers, Key, BookOpen,
  Github, MessageCircle, Activity,
  Terminal
} from 'lucide-react';

/* ────────────────────────────────────────────
   Scroll-reveal hook (IntersectionObserver)
   ──────────────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('lp-fade-up'); obs.unobserve(el); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal();
  return <div ref={ref} className={`opacity-0 ${className}`}>{children}</div>;
}

/* ────────────────────────────────────────────
   Data
   ──────────────────────────────────────────── */
const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Models', href: '#models' },
];

const FEATURES = [
  { icon: Layers, title: 'Unified AI API', desc: 'Satu endpoint untuk semua model AI. Switch model cukup ganti parameter, tanpa ubah kode.', gradient: 'from-indigo-500 to-violet-500' },
  { icon: Zap, title: 'Streaming Response', desc: 'Real-time streaming response untuk chat completions. User tidak perlu tunggu sampai selesai.', gradient: 'from-amber-400 to-orange-500' },
  { icon: BarChart3, title: 'Credit System', desc: 'Sistem credit bawaan. Setiap request dikenakan biaya sesuai model dan token yang dipakai.', gradient: 'from-emerald-400 to-teal-500' },
  { icon: Code2, title: 'OpenAI Compatible', desc: 'Format API kompatibel dengan OpenAI. Drop-in replacement untuk aplikasi yang sudah ada.', gradient: 'from-blue-400 to-cyan-500' },
  { icon: Shield, title: 'API Key & Auth', desc: 'Generate API key untuk akses programmatic. Rate limiting dan autentikasi bawaan.', gradient: 'from-red-400 to-pink-500' },
  { icon: Activity, title: 'Usage Tracking', desc: 'Track setiap request: token usage, cost, dan model yang dipakai. Semua tercatat.', gradient: 'from-purple-400 to-fuchsia-500' },
];

const MODELS = [
  { name: 'GPT-4o', provider: 'OpenAI', icon: '🟢', color: '#10b981' },
  { name: 'Claude 3.5', provider: 'Anthropic', icon: '🟠', color: '#f59e0b' },
  { name: 'Gemini Pro', provider: 'Google', icon: '🔵', color: '#3b82f6' },
  { name: 'Llama 3', provider: 'Meta', icon: '🟣', color: '#8b5cf6' },
  { name: 'Mistral', provider: 'Mistral AI', icon: '🔴', color: '#ef4444' },
  { name: 'DeepSeek', provider: 'DeepSeek', icon: '⚪', color: '#94a3b8' },
];

const CODE_EXAMPLE = `curl -X POST https://your-domain.com/v1/chat/completions \\\\
  -H "Authorization: Bearer *** \\\\
  -H "Content-Type: application/json" \\\\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Halo!"}
    ],
    "stream": true
  }'`;

const CODE_RESPONSE = `{
  "id": "chatcmpl-kroma-9x8f2",
  "model": "gpt-4o",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Quantum computing uses qubits that can exist in multiple states simultaneously (superposition) and be linked together (entanglement), enabling certain calculations exponentially faster than classical computers."
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 24, "completion_tokens": 38, "total_tokens": 62 }
}`;

/* ────────────────────────────────────────────
   Components
   ──────────────────────────────────────────── */

function FloatingBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute top-[-10%] left-[15%] w-[500px] h-[500px] rounded-full lp-float-slow lp-glow"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 70%)' }} />
      <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full lp-float lp-glow"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)', animationDelay: '2s' }} />
      <div className="absolute bottom-[10%] left-[30%] w-[350px] h-[350px] rounded-full lp-float-slow lp-glow"
        style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.06), transparent 70%)', animationDelay: '4s' }} />
    </div>
  );
}

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 lp-glass">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg text-white">Kroma AI</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(l => (
            <a key={l.label} href={l.href}
              className="text-sm text-white/50 hover:text-white transition-colors no-underline">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/60 hover:text-white transition-colors no-underline px-3 py-2">
            Login
          </Link>
          <Link to="/register" className="lp-btn-primary !py-2 !px-5 !text-sm !shadow-none">
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex items-center justify-center lp-dot-grid">
      <FloatingBlobs />
      <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-20 pb-16 text-center">
        {/* Trust badge */}
        <div className="lp-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium mb-8 lp-glass">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/70">All systems operational</span>
          <ChevronRight size={12} className="text-white/40" />
        </div>

        {/* Headline */}
        <h1 className="lp-fade-up-d1 text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-6 tracking-tight">
          One API Gateway for{' '}
          <br className="hidden sm:block" />
          <span className="lp-gradient-text">Every AI Model</span>
        </h1>

        {/* Subheadline */}
        <p className="lp-fade-up-d2 text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          Access, manage, and scale AI models through a single fast and reliable API.
          OpenAI-compatible. Drop-in replacement.
        </p>

        {/* CTAs */}
        <div className="lp-fade-up-d3 flex items-center justify-center gap-4 mb-14 flex-wrap">
          <Link to="/register" className="lp-btn-primary">
            Get Started Free <ArrowRight size={15} />
          </Link>
          <Link to="/docs" className="lp-btn-secondary">
            <BookOpen size={15} /> View Documentation
          </Link>
        </div>

        {/* Terminal preview */}
        <div className="lp-fade-up-d4 max-w-2xl mx-auto">
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl"
            style={{ boxShadow: '0 0 60px rgba(99,102,241,0.08), 0 20px 60px rgba(0,0,0,0.4)' }}>
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded bg-white/[0.04]">
                <Terminal size={10} className="text-white/30" />
                <span className="text-[10px] text-white/40 font-mono">Terminal</span>
              </div>
            </div>
            {/* Code */}
            <pre className="p-5 bg-[#0a0a10] text-[11px] sm:text-xs font-mono text-left overflow-x-auto leading-relaxed">
              <code>
                <span className="text-emerald-400">$</span>
                <span className="text-white/70"> {CODE_EXAMPLE.split('\n')[0]}</span>{'\n'}
                {CODE_EXAMPLE.split('\n').slice(1).map((line, i) => (
                  <React.Fragment key={i}>
                    <span className="text-white/40">{line}</span>{'\n'}
                  </React.Fragment>
                ))}
              </code>
            </pre>
          </div>
        </div>

        {/* Quick info */}
        <div className="lp-fade-up-d5 flex items-center justify-center gap-6 mt-10 text-xs text-white/30 flex-wrap">
          <span className="flex items-center gap-1.5"><Zap size={12} /> OpenAI Compatible</span>
          <span className="flex items-center gap-1.5"><Layers size={12} /> Multi-Model</span>
          <span className="flex items-center gap-1.5"><Key size={12} /> API Key Auth</span>
        </div>
      </div>
    </section>
  );
}

function ProductShowcase() {
  const ref = useReveal();
  return (
    <section className="relative border-t border-white/[0.04]">
      <div ref={ref} className="opacity-0 lp-section">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Product</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Everything You Need to Ship AI Apps
          </h2>
          <p className="text-white/40 max-w-xl mx-auto">
            A complete dashboard to monitor, manage, and optimize your AI infrastructure.
          </p>
        </div>

        {/* Dashboard mockup */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden lp-glass-card !hover:transform-none"
          style={{ boxShadow: '0 0 80px rgba(99,102,241,0.06)' }}>
          {/* Mock header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.06]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="px-4 py-1 rounded-full bg-white/[0.04] text-[10px] text-white/30 font-mono">
                app.kroma.ai/dashboard
              </div>
            </div>
          </div>

          {/* Mock dashboard content */}
          <div className="p-6 bg-[#0a0a10]">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Requests', value: '1.2M', change: '+12%', color: '#818cf8' },
                { label: 'Tokens Used', value: '48.3M', change: '+8%', color: '#67e8f9' },
                { label: 'Avg Latency', value: '87ms', change: '-3%', color: '#34d399' },
                { label: 'Credits Left', value: '42,150', change: '', color: '#fbbf24' },
              ].map((s, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-white">{s.value}</span>
                    {s.change && <span className="text-[10px] font-medium" style={{ color: s.color }}>{s.change}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart mockup */}
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-white/50">API Requests (7 days)</span>
                <div className="flex gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">7D</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-white/30">30D</span>
                </div>
              </div>
              {/* SVG chart bars */}
              <div className="flex items-end gap-1.5 h-24">
                {[35, 52, 45, 68, 72, 58, 85].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t transition-all duration-500"
                    style={{
                      height: `${h}%`,
                      background: i === 6
                        ? 'linear-gradient(to top, #6366f1, #818cf8)'
                        : 'rgba(99,102,241,0.15)',
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <span key={d} className="text-[9px] text-white/20 flex-1 text-center">{d}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative border-t border-white/[0.04]">
      <div className="lp-section">
        <RevealSection className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Built for Production AI Workloads
          </h2>
          <p className="text-white/40 max-w-xl mx-auto">
            Everything you need to integrate, scale, and manage AI models in your applications.
          </p>
        </RevealSection>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <RevealSection key={i}>
                <div className="lp-glass-card rounded-2xl p-6 h-full">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 shadow-lg`}
                    style={{ boxShadow: `0 4px 20px rgba(99,102,241,0.15)` }}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              </RevealSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ModelsSection() {
  return (
    <section id="models" className="relative border-t border-white/[0.04]">
      <div className="lp-section">
        <RevealSection className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Models</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Access Leading AI Models
          </h2>
          <p className="text-white/40 max-w-xl mx-auto">
            One endpoint. Every major AI provider. Switch models with a single parameter change.
          </p>
        </RevealSection>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {MODELS.map((m, i) => (
            <RevealSection key={i}>
              <div className="lp-glass-card rounded-2xl p-5 text-center">
                <div className="text-3xl mb-3">{m.icon}</div>
                <p className="text-sm font-semibold text-white mb-1">{m.name}</p>
                <p className="text-[11px] text-white/30">{m.provider}</p>
              </div>
            </RevealSection>
          ))}
        </div>

        <RevealSection className="text-center mt-8">
          <p className="text-sm text-white/30">
            + more models added regularly.{' '}
            <a href="#features" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Request a model →
            </a>
          </p>
        </RevealSection>
      </div>
    </section>
  );
}

function DevExperienceSection() {
  return (
    <section className="relative border-t border-white/[0.04]">
      <div className="lp-section">
        <RevealSection className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Developer Experience</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ship AI Features in Minutes
          </h2>
          <p className="text-white/40 max-w-xl mx-auto">
            OpenAI-compatible API. If your app works with OpenAI, it works with Kroma.
          </p>
        </RevealSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Request */}
          <RevealSection>
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden h-full">
              <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">POST</span>
                <span className="text-[11px] font-mono text-white/40">/v1/chat/completions</span>
              </div>
              <pre className="p-5 bg-[#0a0a10] text-[11px] font-mono overflow-x-auto leading-relaxed text-white/60">
                <code>{CODE_EXAMPLE}</code>
              </pre>
            </div>
          </RevealSection>

          {/* Response */}
          <RevealSection>
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden h-full">
              <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">200 OK</span>
                <span className="text-[11px] font-mono text-white/40">Response</span>
              </div>
              <pre className="p-5 bg-[#0a0a10] text-[11px] font-mono overflow-x-auto leading-relaxed text-white/60">
                <code>{CODE_RESPONSE}</code>
              </pre>
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────
   FinalCTA
   ──────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative border-t border-white/[0.04]">
      <div className="lp-section text-center relative overflow-hidden">
        <FloatingBlobs />
        <div className="relative z-10">
          <RevealSection>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Build Faster with{' '}
              <span className="lp-gradient-text">Kroma AI</span>
            </h2>
            <p className="text-white/40 max-w-lg mx-auto mb-8">
              Join developers and teams who ship AI features faster with Kroma AI Gateway.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link to="/register" className="lp-btn-primary">
                Start Building <ArrowRight size={15} />
              </Link>
              <Link to="/login" className="lp-btn-secondary">
                Login
              </Link>
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Models', href: '#models' },
        { label: 'Pricing', href: '#pricing' },
      ]
    },
    {
      title: 'Developers',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'API Reference', href: '/docs' },
        { label: 'Status', href: '#' },
      ]
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Contact', href: '#' },
        { label: 'Terms', href: '#' },
        { label: 'Privacy', href: '#' },
      ]
    },
  ];

  return (
    <footer className="border-t border-white/[0.04]">
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Zap size={13} className="text-white" />
              </div>
              <span className="font-bold text-white">Kroma AI</span>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              The AI API Gateway built for developers and teams who need reliable, scalable AI infrastructure.
            </p>
          </div>

          {cols.map(col => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-white/30 hover:text-white/70 transition-colors no-underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-6 border-t border-white/[0.04] flex-wrap gap-4">
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} Kroma AI. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-white/20 hover:text-white/50 transition-colors" aria-label="GitHub">
              <Github size={16} />
            </a>
            <a href="#" className="text-white/20 hover:text-white/50 transition-colors" aria-label="Twitter">
              <MessageCircle size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────
   Main
   ──────────────────────────────────────────── */
export default function LandingPage() {
  // Force dark background for this page
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.style.backgroundColor = '#0B0B0F';
    document.body.style.scrollBehavior = 'smooth';
    return () => {
      document.body.style.backgroundColor = '';
      document.body.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#0B0B0F', color: '#f0f0ff' }}>
      <Navbar />
      <HeroSection />
      <ProductShowcase />
      <FeaturesSection />
      <ModelsSection />
      <DevExperienceSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
