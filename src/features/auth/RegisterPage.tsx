import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, Copy, Check, Zap, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { ToastContainer } from '../../ui/Toast';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { register, isLoading, clearJustRegistered } = useAuthStore();
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPw) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      const result = await register(email, password);
      if (result.api_key) setApiKey(result.api_key);
      toast.success('Account created!');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Registration failed');
    }
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-6">
        <div className="w-full max-w-sm animate-scale-in">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-[var(--radius-xl)] bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">You're all set!</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Save your API key — you won't see it again.
            </p>
          </div>

          <div className="p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-alt)] border border-[var(--color-border)] space-y-3 mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Your API Key</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-code-bg)] border border-[var(--color-border)] font-mono text-xs text-[var(--color-text)] break-all select-all">
                {apiKey}
              </div>
              <button
                onClick={handleCopyKey}
                className="p-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
              >
                {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          <Button className="w-full" size="lg" icon={<ArrowRight size={15} />}
            onClick={() => { clearJustRegistered(); navigate('/chat', { replace: true }); }}>
            Go to App
          </Button>
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] kroma-auth-panel flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Kroma AI</span>
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Start building<br />in minutes.
          </h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs">
            Get instant access to multiple AI models through a single unified API.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {['Free to start', 'No credit card required', 'Instant API key'].map(f => (
              <div key={f} className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400 shrink-0" />
                <span className="text-white/70 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/30 text-xs">© {new Date().getFullYear()} Kroma AI Gateway</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center"
              style={{ background: 'var(--color-primary-gradient)' }}>
              <Zap size={15} className="text-white" />
            </div>
            <span className="font-semibold text-[var(--color-text)]">Kroma AI</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Create an account</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Get started for free today</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus />

            <div className="relative">
              <Input label="Password" type={showPw ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters" required />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-[34px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <Input label="Confirm Password" type={showPw ? 'text' : 'password'}
              value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              placeholder="Repeat password" required />

            {error && (
              <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-3 py-2.5 rounded-[var(--radius-md)]">
                {error}
              </div>
            )}

            <Button type="submit" loading={isLoading} className="w-full mt-2" size="lg"
              icon={<UserPlus size={15} />}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--color-primary)] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
