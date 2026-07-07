import React from 'react';
import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Blocks, Users, CreditCard, Wallet, Receipt,
  FileText, Settings, Sun, Moon, LogOut, ShieldCheck
} from 'lucide-react';
import { Sidebar } from '../ui/Sidebar';
import { ToastContainer } from '../ui/Toast';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';

export function AdminLayout() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const { theme, toggle } = useThemeStore();

  const sections = [
    {
      items: [
        { label: 'Overview', path: '/admin', icon: <LayoutDashboard size={16} /> },
      ]
    },
    {
      title: 'Management',
      items: [
        { label: 'AI Models', path: '/admin/models', icon: <Blocks size={16} /> },
        { label: 'Users', path: '/admin/users', icon: <Users size={16} /> },
        { label: 'Docs', path: '/admin/docs', icon: <FileText size={16} /> },
      ]
    },
    {
      title: 'Billing',
      items: [
        { label: 'Plans', path: '/admin/billing/plans', icon: <CreditCard size={16} /> },
        { label: 'Methods', path: '/admin/billing/methods', icon: <Wallet size={16} /> },
        { label: 'Transactions', path: '/admin/billing/transactions', icon: <Receipt size={16} /> },
      ]
    },
    {
      title: 'System',
      items: [
        { label: 'Settings', path: '/admin/settings', icon: <Settings size={16} /> },
      ]
    },
  ];

  return (
    <div className="kroma-admin flex h-screen bg-[var(--color-bg)] overflow-hidden">
      <Sidebar
        sections={sections}
        header={
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 bg-gradient-to-br from-rose-500 to-orange-500">
              <ShieldCheck size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text)] leading-none">Admin</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Control Panel</p>
            </div>
          </div>
        }
        footer={
          <div className="space-y-1">
            <button
              onClick={toggle}
              className="flex items-center gap-2 px-2.5 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-alt)] transition-colors w-full"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {user && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-alt)] transition-colors group">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-rose-500 to-orange-500">
                  <span className="text-[10px] font-bold text-white">
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

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}
