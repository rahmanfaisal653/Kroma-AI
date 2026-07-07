import React from 'react';
import { User, Moon, Sun, Shield } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useThemeStore } from '../../stores/theme.store';
import { Button } from '../../ui/Button';

export default function SettingsPage() {
  const user = useAuthStore(s => s.user);
  const { theme, toggle } = useThemeStore();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Settings</h1>

        <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] space-y-4">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-medium text-[var(--color-text)]">Owner</h3>
          </div>
          <p className="text-sm text-[var(--color-text)]">{user?.email || '—'}</p>
        </div>

        <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] space-y-4">
          <div className="flex items-center gap-2">
            {theme === 'dark' ? <Moon size={18} className="text-[var(--color-primary)]" /> : <Sun size={18} className="text-[var(--color-primary)]" />}
            <h3 className="font-medium text-[var(--color-text)]">Appearance</h3>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text)]">Currently using {theme} mode</p>
            <Button variant="secondary" size="sm" onClick={toggle} icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}>Switch</Button>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-medium text-[var(--color-text)]">Security</h3>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">Provider dikelola dari menu Providers. API key internal/partner dikelola dari menu API Keys.</p>
        </div>
      </div>
    </div>
  );
}
