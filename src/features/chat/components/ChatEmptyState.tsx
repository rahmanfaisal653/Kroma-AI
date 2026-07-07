import React from 'react';
import { Sparkles } from 'lucide-react';

interface ChatEmptyStateProps {
  modelName?: string;
  modelDescription?: string;
}

export function ChatEmptyState({ modelName, modelDescription }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
        <Sparkles size={28} className="text-[var(--color-primary)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">
        {modelName ? `Chat with ${modelName}` : 'Start a conversation'}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-md">
        {modelDescription || 'Select a model and send a message to begin.'}
      </p>
    </div>
  );
}
