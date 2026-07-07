/**
 * Token estimation & context windowing utilities.
 * Uses char-based approximation (~4 chars per token for English).
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: Array<{ content: string | any }>
): number {
  return messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + estimateTokens(text) + 4; // +4 per-message overhead
  }, 0);
}

/**
 * Trim oldest non-system messages so total tokens fit within maxTokens.
 * Always keeps: system prompt + at least the last 2 messages (user + assistant pair).
 */
export function trimMessagesToFit<T extends { role: string; content: string }>(
  messages: T[],
  maxTokens: number
): T[] {
  if (estimateMessagesTokens(messages) <= maxTokens) return messages;

  const system = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  let trimmed = [...nonSystem];
  while (
    trimmed.length > 2 &&
    estimateMessagesTokens([...system, ...trimmed]) > maxTokens
  ) {
    trimmed = trimmed.slice(1);
  }

  return [...system, ...trimmed];
}
