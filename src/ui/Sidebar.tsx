import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface SidebarProps {
  sections: SidebarSection[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sidebar({ sections, header, footer }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-30 p-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-md)] md:hidden"
        aria-label="Open menu"
      >
        <PanelLeftOpen size={16} className="text-[var(--color-text-muted)]" />
      </button>

      <aside className={cn(
        'flex flex-col h-full',
        'bg-[var(--color-sidebar-bg)] border-r border-[var(--color-border)]',
        'transition-all duration-200 shrink-0',
        collapsed ? 'w-[60px]' : 'w-[220px]',
        'fixed md:relative z-50 md:z-auto',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center px-3 py-3 border-b border-[var(--color-border)]',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <div className="flex-1 min-w-0">{header}</div>
          )}
          <button
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileOpen(false);
              } else {
                setCollapsed(!collapsed);
              }
            }}
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors shrink-0"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed
              ? <PanelLeftOpen size={15} />
              : <PanelLeftClose size={15} />
            }
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {sections.map((section, i) => (
            <div key={i}>
              {section.title && !collapsed && (
                <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] select-none">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/admin'}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)]',
                      'text-sm transition-all duration-150 relative group',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'kroma-nav-active font-medium'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge !== undefined && (
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                        {item.badge}
                      </span>
                    )}
                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-xs text-[var(--color-text)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none shadow-[var(--shadow-md)] transition-opacity z-50">
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {footer && (
          <div className="border-t border-[var(--color-border)] px-2 py-3">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
