/**
 * Chat message utility functions — IDs, titles, token estimation.
 */

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateTitleFromMessage(content: string, maxLen = 40): string {
  const text = content.trim();
  if (!text) return 'New Chat';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}
