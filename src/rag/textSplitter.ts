export const splitTextIntoChunks = (text: string, maxChunkChars = 1000): string[] => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
  const chunks: string[] = [];
  let current = '';

  const splitLongSentence = (sentence: string): string[] => {
    const words = sentence.split(/\s+/).filter(Boolean);
    const parts: string[] = [];
    let cursor = '';
    for (const word of words) {
      const next = cursor ? `${cursor} ${word}` : word;
      if (next.length <= maxChunkChars) {
        cursor = next;
      } else {
        if (cursor) parts.push(cursor);
        cursor = word;
      }
    }
    if (cursor) parts.push(cursor);
    return parts;
  };

  for (const sentenceRaw of sentences) {
    const sentence = sentenceRaw.trim();
    if (!sentence) continue;
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= maxChunkChars) {
      current = next;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    if (sentence.length <= maxChunkChars) {
      current = sentence;
    } else {
      chunks.push(...splitLongSentence(sentence));
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

