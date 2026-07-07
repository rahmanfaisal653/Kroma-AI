import React from 'react';
import {
  MessageSquare, Sparkles, ChevronDown, Settings2, Trash2, Download,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ChatSettingsPanel, type ChatSettings } from './ChatSettingsPanel';
import type { ApiModel } from '../../../types/api';
import type { ExportFormat } from '../utils/exportChat';

interface ChatTopBarProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  activeModel: ApiModel | undefined;
  textModels: ApiModel[];
  modelsLoading: boolean;
  showModelSelect: boolean;
  onToggleModelSelect: () => void;
  onSelectModel: (id: string) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  settings: ChatSettings;
  onSettingsChange: (s: ChatSettings) => void;
  contextTokens: number;
  maxContextTokens?: number;
  hasMessages: boolean;
  onClearChat: () => void;
  onExport?: (format: ExportFormat) => void;
}

export function ChatTopBar({
  showHistory,
  onToggleHistory,
  activeModel,
  textModels,
  modelsLoading,
  showModelSelect,
  onToggleModelSelect,
  onSelectModel,
  showSettings,
  onToggleSettings,
  settings,
  onSettingsChange,
  contextTokens,
  maxContextTokens,
  hasMessages,
  onClearChat,
  onExport,
}: ChatTopBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Toggle sidebar */}
      <button
        onClick={onToggleHistory}
        className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
        title="Toggle history"
      >
        <MessageSquare size={16} />
      </button>

      {/* Model selector */}
      <div className="relative">
        <button
          onClick={onToggleModelSelect}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-border-hover)] transition-colors"
        >
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <span>{activeModel?.name || 'Select model'}</span>
          <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        </button>
        {showModelSelect && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-20 py-1 max-h-60 overflow-y-auto">
            {textModels.map(m => (
              <button
                key={m.id}
                onClick={() => onSelectModel(String(m.id))}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-alt)] transition-colors',
                  String(m.id) === String(activeModel?.id) && 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                )}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{m.model_slug || m.endpoint}</div>
              </button>
            ))}
            {textModels.length === 0 && (
              <div className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
                {modelsLoading ? 'Loading models...' : 'No text models available'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-1">
        {/* Settings */}
        <div className="relative">
          <button
            onClick={onToggleSettings}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              showSettings
                ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
            )}
            title="Chat settings"
          >
            <Settings2 size={16} />
          </button>
          {showSettings && (
            <ChatSettingsPanel
              settings={settings}
              onChange={onSettingsChange}
              onClose={onToggleSettings}
              contextTokens={contextTokens}
              maxContextTokens={maxContextTokens}
            />
          )}
        </div>

        {/* Export */}
        {hasMessages && onExport && (
          <div className="relative group/export">
            <button
              className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
              title="Export chat"
            >
              <Download size={16} />
            </button>
            <div className="hidden group-hover/export:block absolute right-0 top-full mt-1 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-20 py-1">
              {(['markdown', 'json', 'text'] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                >
                  Export as .{fmt === 'markdown' ? 'md' : fmt === 'text' ? 'txt' : fmt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clear */}
        {hasMessages && (
          <button
            onClick={onClearChat}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-alt)] transition-colors"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
