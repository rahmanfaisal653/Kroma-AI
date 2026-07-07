/**
 * Export chat conversations in multiple formats.
 */

import type { ChatMessage } from '../../../types/api';

export type ExportFormat = 'markdown' | 'json' | 'text';

export function exportAsMarkdown(messages: ChatMessage[], title: string): string {
  const lines = [`# ${title}`, `> Exported: ${new Date().toLocaleString()}`, ''];
  for (const msg of messages) {
    const label = msg.role === 'user' ? 'You' : 'AI';
    lines.push(`### ${label}`);
    if (msg.thinking) {
      lines.push('', '<details><summary>Thinking</summary>', '', msg.thinking, '', '</details>');
    }
    lines.push('', msg.content, '');
  }
  return lines.join('\n');
}

export function exportAsJSON(messages: ChatMessage[], title: string): string {
  return JSON.stringify({
    title,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.thinking ? { thinking: m.thinking } : {}),
      timestamp: m.timestamp,
      model: m.model,
    })),
  }, null, 2);
}

export function exportAsPlainText(messages: ChatMessage[], title: string): string {
  const sep = '─'.repeat(40);
  const lines = [title, '='.repeat(title.length), `Exported: ${new Date().toLocaleString()}`, sep, ''];
  for (const msg of messages) {
    const label = msg.role === 'user' ? 'You' : 'AI';
    lines.push(`[${label}]`, msg.content, '');
  }
  return lines.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportConversation(
  messages: ChatMessage[],
  title: string,
  format: ExportFormat
) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
  switch (format) {
    case 'markdown': {
      const content = exportAsMarkdown(messages, title);
      downloadFile(content, `${sanitizedTitle}.md`, 'text/markdown');
      break;
    }
    case 'json': {
      const content = exportAsJSON(messages, title);
      downloadFile(content, `${sanitizedTitle}.json`, 'application/json');
      break;
    }
    case 'text': {
      const content = exportAsPlainText(messages, title);
      downloadFile(content, `${sanitizedTitle}.txt`, 'text/plain');
      break;
    }
  }
}
