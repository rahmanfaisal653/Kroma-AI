import React from 'react';
import { X } from 'lucide-react';

export interface ChatSettings {
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

interface ChatSettingsPanelProps {
  settings: ChatSettings;
  onChange: (s: ChatSettings) => void;
  onClose: () => void;
  contextTokens?: number;
  maxContextTokens?: number;
}

export function ChatSettingsPanel({
  settings,
  onChange,
  onClose,
  contextTokens = 0,
  maxContextTokens,
}: ChatSettingsPanelProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">Chat Settings</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-alt)]">
          <X size={14} className="text-[var(--color-text-muted)]" />
        </button>
      </div>

      {/* System Prompt */}
      <div>
        <label className="text-xs text-[var(--color-text-muted)]">
          System Prompt
          <span className="ml-1 text-[var(--color-text-muted)] opacity-60">
            ({settings.systemPrompt.length}/2000)
          </span>
        </label>
        <textarea
          value={settings.systemPrompt}
          onChange={e => {
            const val = e.target.value.slice(0, 2000); // Hard limit
            onChange({ ...settings, systemPrompt: val });
          }}
          maxLength={2000}
          className="mt-1 w-full text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] p-2 resize-none h-16"
          placeholder="You are a helpful assistant..."
        />
      </div>

      {/* Temperature & Max Tokens */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-[var(--color-text-muted)]">Temperature</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={e => onChange({ ...settings, temperature: parseFloat(e.target.value) || 0.7 })}
            className="mt-1 w-full text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-2 py-1.5"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)]">Max Tokens</label>
          <input
            type="number"
            min="1"
            max="32768"
            step="256"
            value={settings.maxTokens}
            onChange={e => onChange({ ...settings, maxTokens: parseInt(e.target.value) || 1024 })}
            className="mt-1 w-full text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-2 py-1.5"
          />
        </div>
      </div>

      {/* Context usage indicator */}
      {maxContextTokens && maxContextTokens > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)] mb-1">
            <span>Context usage</span>
            <span>{contextTokens} / {maxContextTokens} tokens (est.)</span>
          </div>
          <div className="h-1.5 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] rounded-full transition-all"
              style={{ width: `${Math.min(100, (contextTokens / maxContextTokens) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
