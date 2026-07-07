import React, { useState } from 'react';
import { Plus, MessageSquare, Edit3, Trash2, Search, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Conversation } from '../../../stores/conversations.store';

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = searchQuery
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const handleEditStart = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setEditingId(id);
      setEditValue(conv.title);
    }
  };

  const handleEditSave = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-56 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-xl">
      {/* New chat button */}
      <div className="p-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] transition-colors"
        >
          <Plus size={14} /> New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pb-1">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full text-xs pl-7 pr-7 py-1.5 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtered.map(c => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
              c.id === activeId
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
            )}
            onClick={() => onSelect(c.id)}
          >
            <MessageSquare size={14} className="shrink-0" />
            {editingId === c.id ? (
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                className="flex-1 text-xs bg-transparent border-b border-[var(--color-border)] outline-none"
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate text-xs">{c.title}</span>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={e => { e.stopPropagation(); handleEditStart(c.id); }}
                className="p-0.5 hover:text-[var(--color-primary)]"
              >
                <Edit3 size={11} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                className="p-0.5 hover:text-red-500"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
            {searchQuery ? 'No matching chats' : 'No conversations yet'}
          </div>
        )}
      </div>
    </div>
  );
}
