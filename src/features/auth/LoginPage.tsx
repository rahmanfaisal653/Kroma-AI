import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Zap } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { ToastContainer } from '../../ui/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex lg:w-[45%] kroma-auth-panel flex-col justify-between p-10 relative overflow-hidden">
        {/* Noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Kroma AI</span>
        </div>

        {/* Center content */}
        <div className="relative space-y-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight">
              The AI Gateway<br />built for scale.
            </h2>
            <p className="text-white/60 text-sm leading-relaxed max-w-xs">
              Unified access to multiple AI models with built-in billing, rate limiting, and analytics.
            </p>
          </div>
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {['Multi-model routing', 'RAG pipeline', 'Usage analytics', 'API keys'].map(f => (
              <span key={f} className="text-xs px-3 py-1.5 rounded-full text-white/80 font-medium"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <p className="relative text-white/30 text-xs">
          © {new Date().getFullYear()} Kroma AI Gateway
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center"
              style={{ background: 'var(--color-primary-gradient)' }}>
              <Zap size={15} className="text-white" />
            </div>
            <span className="font-semibold text-[var(--color-text)]">Kroma AI</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Welcome back</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username / Email"
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            <div className="relative">
              <Input
                label="Password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-[34px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-3 py-2.5 rounded-[var(--radius-md)]">
                {error}
              </div>
            )}

            <Button type="submit" loading={isLoading || submitting} className="w-full mt-2" size="lg" icon={<LogIn size={15} />}>
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-[var(--color-primary)] hover:underline font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
