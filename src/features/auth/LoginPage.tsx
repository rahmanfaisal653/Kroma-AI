import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, TerminalSquare } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { toast, ToastContainer } from '../../ui/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <div className="grid min-h-screen lg:grid-cols-[1fr_440px]">
      <section className="hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] p-10 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/kroma-ai-wordmark.png" alt="Kroma AI" className="h-8 w-auto kroma-logo-mark" />
          <span className="rounded border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-muted)]">v1.0.0-stable</span>
        </Link>

        <div className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">owner console</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Secure access to your AI gateway.</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">Manage provider routing, partner API keys, and usage logs from one internal dashboard.</p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <Panel icon={<ShieldCheck size={16} />} title="Keys" value="kg_ auth" />
            <Panel icon={<TerminalSquare size={16} />} title="API" value="/v1" />
            <Panel icon={<LogIn size={16} />} title="Access" value="owner" />
          </div>
        </div>

        <p className="font-mono text-xs text-[var(--color-text-muted)]">Kroma AI Gateway · internal login</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/brand/kroma-ai-wordmark.png" alt="Kroma AI" className="h-8 w-auto kroma-logo-mark" />
          </div>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="mb-6">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">sign in</p>
              <h2 className="mt-2 text-2xl font-semibold">Owner dashboard</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Use the official Kroma AI credential.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Username / Email" type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" required autoFocus />
              <div className="relative">
                <Input label="Password" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="*******" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-[34px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {error && <div className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}

              <Button type="submit" loading={isLoading || submitting} className="w-full" size="lg" icon={<LogIn size={15} />}>Sign in</Button>
            </form>
          </div>
          <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">No public registration. <Link to="/" className="underline">Back to landing</Link></p>
        </div>
      </section>
    </div>
    <ToastContainer />
  </div>;
}

function Panel({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3"><div className="mb-2 text-[var(--color-text-muted)]">{icon}</div><p className="text-xs text-[var(--color-text-muted)]">{title}</p><p className="font-mono text-sm font-semibold">{value}</p></div>;
}
