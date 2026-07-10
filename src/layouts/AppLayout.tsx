import React from 'react';
import { Outlet } from 'react-router-dom';
import {
  Blocks, Key, Activity, FileText, Settings, Sun, Moon, LogOut, Database, Home, PanelTop
} from 'lucide-react';
import { Sidebar } from '../ui/Sidebar';
import { ToastContainer } from '../ui/Toast';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';

export function AppLayout() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const { theme, toggle } = useThemeStore();
  const sections = [
    {
      title: 'Navigation',
      items: [
        { label: 'Introduction', path: '/gateway', icon: <PanelTop size={16} /> },
        { label: 'Dashboard', path: '/home', icon: <Home size={16} /> },
        { label: 'Providers', path: '/models', icon: <Blocks size={16} /> },
        { label: 'API Keys', path: '/keys', icon: <Key size={16} /> },
        { label: 'Usage', path: '/usage', icon: <Activity size={16} /> },
        { label: 'Knowledge', path: '/knowledge', icon: <Database size={16} /> },
        { label: 'Docs', path: '/docs', icon: <FileText size={16} /> },
        { label: 'Settings', path: '/settings', icon: <Settings size={16} /> },
      ]
    },
  ];

  return (
    <div className="kroma-user relative flex h-screen bg-[var(--color-bg)] overflow-hidden">
      <Sidebar
        sections={sections}
        header={
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 flex items-center justify-center shrink-0 p-0.5">
              <img src="/brand/kroma-k.png" alt="Kroma" className="kroma-logo-mark h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text)] leading-none">Kroma AI</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Gateway</p>
            </div>
          </div>
        }
        footer={
          <div className="space-y-1">
            <button
              onClick={toggle}
              className="flex items-center gap-2 px-2.5 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-alt)] transition-colors w-full"
            >
              {theme === 'dark'
                ? <Sun size={14} />
                : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {user && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-alt)] transition-colors group">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                  <span className="text-[10px] font-bold text-[var(--color-text)]">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 text-xs text-[var(--color-text-muted)] truncate min-w-0">
                  {user.email}
                </span>
                <button
                  onClick={logout}
                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors opacity-0 group-hover:opacity-100"
                  title="Logout"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
          </div>
        }
      />

      <main className="relative z-10 flex-1 overflow-hidden flex flex-col min-w-0 kroma-page-enter">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}
