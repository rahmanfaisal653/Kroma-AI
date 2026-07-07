# UI Fix & Chat Response Styling Plan

**Date**: 2026-05-19
**Status**: READY TO EXECUTE (waiting for API infra to be up)

---

## Problem 1: Timeout After Scrape

### Root Cause
`handleSend` in `ChatPage.tsx` (line 160-165) does:
```typescript
const urls = extractUrls(input);
if (urls.length > 0) {
  const scrapedContext = await scrapeFromMessage(input); // ← BLOCKS here
  // ...
}
sendMessage(input, overrides); // ← Only runs AFTER scrape completes
```

If scraper takes long (SCRAPER_API_URL at `10.50.224.205:14500` is slow/down), the entire send is blocked. After scrape finishes (or times out), the `sendMessage` call goes through but by then the user has waited 30+ seconds and thinks it's "timeout".

Additionally, `scrapeFromMessage` has NO timeout — it uses the default `http` axios timeout of 30s. If scraper is down, user waits 30s before the chat even starts.

### Fix Plan
1. Add a **10-second timeout** to scrape calls in `useScraper.ts`
2. Make scraping **non-blocking** — send the message immediately, inject scraped context as a follow-up system message if scrape completes in time
3. OR simpler: add `AbortController` with 8s timeout to scrape, and if it fails, just send without context (current try/catch already handles this, but timeout is too long)

### Implementation
**File: `src/features/chat/hooks/useScraper.ts`**
```typescript
// Add timeout to scrape request
const response = await scrapeApi.scrapeUrl(url, { timeout: 8000 }); // 8s max
```

**File: `src/services/api.ts`**
```typescript
export const scrapeApi = {
  scrapeUrl: (url: string, opts?: { timeout?: number }) =>
    http.post<ScrapeResponse>('/api/scrape', { url }, { timeout: opts?.timeout || 10000 }).then(r => r.data),
};
```

---

## Problem 2: JSON Response Bocor ke Chatbox

### Root Cause
Current fix in `ChatBubble.tsx` only detects **pure JSON** (entire content is valid JSON). But the actual leak is different:

The AI upstream (Ollama/Qwen) sometimes returns responses where:
1. The SSE stream contains raw JSON objects mixed with text
2. The `normalizeResponse` in gateway doesn't properly extract content from non-standard formats
3. The streaming parser in `useChat.ts` accumulates `parsed.choices?.[0]?.delta?.content` but some Ollama responses use `parsed.message?.content` or `parsed.response` format

### Specific Ollama Response Format
Ollama's `/api/chat` endpoint returns:
```json
{"model":"qwen3.5:9b","created_at":"...","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"qwen3.5:9b","created_at":"...","message":{"role":"assistant","content":"!"},"done":false}
{"model":"qwen3.5:9b","created_at":"...","message":{"role":"assistant","content":""},"done":true}
```

This is NOT OpenAI SSE format (`data: {...}\n\n`). It's newline-delimited JSON (NDJSON).

The gateway's streaming handler expects OpenAI format (`data:` prefix), so when Ollama sends raw NDJSON, the frontend receives the raw JSON lines as content.

### Fix Plan (2 parts)

**Part A: Fix gateway streaming to handle Ollama NDJSON format**
**File: `server/routes/gateway.routes.ts`** — in the streaming `data` handler:
```typescript
streamResponse.data.on('data', (chunk) => {
  const text = chunk.toString('utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  
  for (const line of lines) {
    // OpenAI SSE format: "data: {...}"
    if (line.startsWith('data:')) {
      const jsonStr = line.slice(5).trim();
      if (jsonStr === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        streamedChars += delta.length;
      } catch {}
      res.write(line + '\n\n');
    }
    // Ollama NDJSON format: raw JSON per line
    else if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line);
        const content = parsed.message?.content || parsed.response || '';
        streamedChars += content.length;
        // Convert to OpenAI SSE format for frontend
        const ssePayload = {
          choices: [{ delta: { content } }],
          done: parsed.done || false,
        };
        if (parsed.done) {
          res.write('data: [DONE]\n\n');
        } else if (content) {
          res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
        }
      } catch {
        // Not JSON, forward as-is wrapped in SSE
        res.write(`data: ${JSON.stringify({ text: line })}\n\n`);
      }
    }
  }
});
```

**Part B: Fix frontend streaming parser to handle both formats**
**File: `src/hooks/useChat.ts`** — in the streaming reader:
```typescript
// Current: only handles "data:" prefix
// Fix: also handle raw NDJSON lines (Ollama format)
for (const line of lines) {
  const data = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
  if (data === '[DONE]') break;
  if (!data || !data.startsWith('{')) continue;
  try {
    const parsed = JSON.parse(data);
    const deltaContent = parsed.choices?.[0]?.delta?.content 
      || parsed.message?.content 
      || parsed.response 
      || '';
    // ...
  }
}
```

**Part C: Strengthen ChatBubble JSON detection**
**File: `src/features/chat/components/ChatBubble.tsx`**
- Also detect partial JSON patterns like `{"model":"...","message":...}` lines
- Strip any leading/trailing JSON metadata that leaked through

---

## Problem 3: Chat Response Styling (Tables, HR, Headings, Paragraphs)

### Current State
`ChatBubble.tsx` uses:
```tsx
<div className="prose prose-sm dark:prose-invert max-w-none">
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
    {displayContent}
  </ReactMarkdown>
</div>
```

Tailwind's `prose` class provides basic styling, but:
- Tables lack proper borders and padding
- HR (`---`) has no vertical spacing
- Headings (H1-H4) are too close to surrounding text
- Paragraphs have inconsistent spacing
- Lists need better indentation

### Fix Plan
Add custom CSS for the chat prose area in `src/index.css`:

```css
/* Chat markdown response styling */
.chat-prose {
  line-height: 1.65;
}

.chat-prose h1 { font-size: 1.25rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
.chat-prose h2 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.4rem; }
.chat-prose h3 { font-size: 1rem; font-weight: 600; margin: 0.85rem 0 0.35rem; }
.chat-prose h4 { font-size: 0.9rem; font-weight: 600; margin: 0.75rem 0 0.3rem; }

.chat-prose p { margin: 0.5rem 0; }
.chat-prose p:first-child { margin-top: 0; }
.chat-prose p:last-child { margin-bottom: 0; }

.chat-prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1rem 0;
}

.chat-prose ul, .chat-prose ol {
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.chat-prose li { margin: 0.2rem 0; }
.chat-prose li::marker { color: var(--color-text-muted); }

.chat-prose table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.8rem;
}
.chat-prose th {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
}
.chat-prose td {
  border: 1px solid var(--color-border);
  padding: 0.35rem 0.6rem;
  color: var(--color-text);
}
.chat-prose tr:nth-child(even) td {
  background: var(--color-surface-alt);
}

.chat-prose blockquote {
  border-left: 3px solid var(--color-primary);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.chat-prose a {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-prose strong { font-weight: 600; color: var(--color-text); }
.chat-prose em { font-style: italic; }

/* Inline code (not in code blocks) */
.chat-prose :not(pre) > code {
  background: var(--color-surface-alt);
  color: var(--color-primary);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
  font-family: 'JetBrains Mono', monospace;
}
```

Then update `ChatBubble.tsx`:
```tsx
// Replace:
<div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">

// With:
<div className="chat-prose max-w-none">
```

---

## Problem 4: Scraper Blocks Subsequent Messages

### Root Cause
After a scrape attempt (successful or failed), the `isSendingRef` in `useChat.ts` might get stuck if:
1. Scrape takes long → user thinks it failed → tries to send again
2. `handleSend` is still `await`-ing `scrapeFromMessage` → `isLoading` is false (scrape isn't chat loading) → user can click send again
3. But `sendMessage` hasn't been called yet → second click goes through → now 2 messages queue

### Fix Plan
- Set a local `isScraping` state that disables the send button during scrape
- Add visual indicator "Scraping URL..." in the input area
- Timeout scrape at 8s max

---

## Execution Order

### Phase 1: Can do NOW (no API needed)
| # | Task | File(s) | Est. |
|---|------|---------|------|
| 1.1 | Add chat-prose CSS styles | `src/index.css` | 5min |
| 1.2 | Update ChatBubble to use `chat-prose` class | `ChatBubble.tsx` | 2min |
| 1.3 | Add scrape timeout (8s) to api.ts | `src/services/api.ts` | 2min |
| 1.4 | Add scrape timeout to useScraper.ts | `useScraper.ts` | 2min |
| 1.5 | Disable send button during scrape | `ChatPage.tsx` | 5min |
| 1.6 | Strengthen JSON detection in ChatBubble | `ChatBubble.tsx` | 5min |

### Phase 2: Needs API up for testing
| # | Task | File(s) | Est. |
|---|------|---------|------|
| 2.1 | Fix gateway streaming for Ollama NDJSON | `gateway.routes.ts` | 15min |
| 2.2 | Fix useChat streaming parser for both formats | `useChat.ts` | 10min |
| 2.3 | Test each Qwen model (3.5 9B, 2.5 7B, 3 8B) | Manual | 10min |
| 2.4 | Verify no JSON leak in any response format | Manual | 5min |
| 2.5 | Verify tables, HR, headings render correctly | Manual | 5min |

### Phase 3: Polish
| # | Task | File(s) | Est. |
|---|------|---------|------|
| 3.1 | Add "Scraping..." indicator in ChatInput | `ChatInput.tsx` | 5min |
| 3.2 | Test scrape → chat flow (no timeout) | Manual | 5min |
| 3.3 | Final visual QA all pages | Manual | 10min |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Add `.chat-prose` styles (tables, HR, headings, paragraphs) |
| `src/features/chat/components/ChatBubble.tsx` | Use `chat-prose`, strengthen JSON detection |
| `src/services/api.ts` | Add timeout option to `scrapeApi.scrapeUrl` |
| `src/features/chat/hooks/useScraper.ts` | Pass 8s timeout to scrape calls |
| `src/features/chat/ChatPage.tsx` | Disable send during scrape, show indicator |
| `server/routes/gateway.routes.ts` | Handle Ollama NDJSON streaming format |
| `src/hooks/useChat.ts` | Parse both OpenAI SSE and Ollama NDJSON in stream reader |

---

## Testing Checklist (after API is up)

- [ ] Send normal text prompt → response renders with proper headings, paragraphs
- [ ] Ask AI to generate a table → table has borders, padding, alternating rows
- [ ] Ask AI to use `---` separator → HR has proper spacing
- [ ] Ask AI to respond with code → code block renders with syntax highlight + copy
- [ ] Send message with URL → scrape completes within 8s or skips gracefully
- [ ] Send message after scrape → no timeout, responds normally
- [ ] Test Qwen 3.5 9B streaming → no JSON leak
- [ ] Test Qwen 2.5 7B streaming → no JSON leak
- [ ] Test Qwen 3 8B streaming → no JSON leak
- [ ] Rapid send after scrape → no double messages
- [ ] Long conversation (20+ messages) → no performance degradation

---

## FULL IMPLEMENTATION DETAILS (Copy-Paste Ready)

Below is the exact code to write/modify for each task. When API is back up, execute these in order.

---

### Task 1.1: Add chat-prose CSS styles

**File**: `src/index.css`
**Action**: APPEND the following at the end of the file (after existing content):

```css
/* ============================================
   Chat Markdown Response Styling
   ============================================ */

.chat-prose {
  line-height: 1.65;
  font-size: 0.875rem;
  color: var(--color-text);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.chat-prose h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 1.25rem 0 0.5rem;
  color: var(--color-text);
  line-height: 1.3;
}
.chat-prose h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 1rem 0 0.4rem;
  color: var(--color-text);
  line-height: 1.35;
}
.chat-prose h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0.85rem 0 0.35rem;
  color: var(--color-text);
}
.chat-prose h4 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0.75rem 0 0.3rem;
  color: var(--color-text-secondary);
}

.chat-prose p {
  margin: 0.5rem 0;
}
.chat-prose > *:first-child { margin-top: 0; }
.chat-prose > *:last-child { margin-bottom: 0; }

.chat-prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1rem 0;
}

.chat-prose ul, .chat-prose ol {
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.chat-prose ul { list-style-type: disc; }
.chat-prose ol { list-style-type: decimal; }
.chat-prose li {
  margin: 0.2rem 0;
}
.chat-prose li::marker {
  color: var(--color-text-muted);
}
.chat-prose li > ul, .chat-prose li > ol {
  margin: 0.15rem 0;
}

.chat-prose table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.8rem;
  display: block;
  overflow-x: auto;
}
.chat-prose thead {
  position: sticky;
  top: 0;
}
.chat-prose th {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.chat-prose td {
  border: 1px solid var(--color-border);
  padding: 0.35rem 0.6rem;
  color: var(--color-text);
  vertical-align: top;
}
.chat-prose tr:nth-child(even) td {
  background: var(--color-surface-alt);
}
.chat-prose tr:hover td {
  background: var(--color-primary-light);
}

.chat-prose blockquote {
  border-left: 3px solid var(--color-primary);
  padding: 0.25rem 0 0.25rem 0.75rem;
  margin: 0.5rem 0;
  color: var(--color-text-secondary);
  font-style: italic;
}
.chat-prose blockquote p {
  margin: 0.25rem 0;
}

.chat-prose a {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.chat-prose a:hover {
  color: var(--color-primary-hover);
}

.chat-prose strong { font-weight: 600; color: var(--color-text); }
.chat-prose em { font-style: italic; }

/* Inline code (not inside pre/code blocks) */
.chat-prose :not(pre) > code {
  background: var(--color-surface-alt);
  color: var(--color-primary);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  border: 1px solid var(--color-border);
}

/* Pre blocks (handled by CodeBlock component, but fallback) */
.chat-prose pre {
  margin: 0.5rem 0;
  border-radius: 0.5rem;
  overflow-x: auto;
}

/* Images in chat */
.chat-prose img {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
}
```

---

### Task 1.2: Update ChatBubble to use chat-prose class

**File**: `src/features/chat/components/ChatBubble.tsx`
**Action**: Find and replace the prose div class:

**Find**:
```tsx
<div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
```

**Replace with**:
```tsx
<div className="chat-prose max-w-none">
```

---

### Task 1.3: Add scrape timeout to api.ts

**File**: `src/services/api.ts`
**Action**: Find and replace the scrapeApi definition:

**Find**:
```typescript
export const scrapeApi = {
  scrapeUrl: (url: string) =>
    http.post<ScrapeResponse>('/api/scrape', { url }).then(r => r.data),
};
```

**Replace with**:
```typescript
export const scrapeApi = {
  scrapeUrl: (url: string, opts?: { timeout?: number }) =>
    http.post<ScrapeResponse>('/api/scrape', { url }, {
      timeout: opts?.timeout || 8000, // 8s max — don't block chat
    }).then(r => r.data),
};
```

---

### Task 1.4: Add scrape timeout to useScraper.ts

**File**: `src/features/chat/hooks/useScraper.ts`
**Action**: Find and replace the scrapeApi call inside `scrapeFromMessage`:

**Find**:
```typescript
const response: ScrapeResponse = await scrapeApi.scrapeUrl(url);
```

**Replace with**:
```typescript
const response: ScrapeResponse = await scrapeApi.scrapeUrl(url, { timeout: 8000 });
```

---

### Task 1.5: Disable send button during scrape + show indicator

**File**: `src/features/chat/ChatPage.tsx`
**Action 1**: Add `isScraping` state after existing state declarations (around line 42):

After `const [attachedImageName, setAttachedImageName] = useState('');` add:
```typescript
const [isScraping, setIsScraping] = useState(false);
```

**Action 2**: Wrap the scrape section in handleSend with isScraping:

**Find** (inside handleSend):
```typescript
      // Auto-scrape URLs found in the message
      const urls = extractUrls(input);
      if (urls.length > 0) {
        clearScrapeResults();
        const scrapedContext = await scrapeFromMessage(input);
        if (scrapedContext) {
          overrides.scrapedContext = scrapedContext;
        }
      }
```

**Replace with**:
```typescript
      // Auto-scrape URLs found in the message (with timeout protection)
      const urls = extractUrls(input);
      if (urls.length > 0) {
        clearScrapeResults();
        setIsScraping(true);
        try {
          const scrapedContext = await scrapeFromMessage(input);
          if (scrapedContext) {
            overrides.scrapedContext = scrapedContext;
          }
        } catch {
          // Scrape failed/timed out — send without context
        } finally {
          setIsScraping(false);
        }
      }
```

**Action 3**: Pass `isScraping` to ChatInput to disable during scrape:

**Find** (in the render, ChatInput component):
```tsx
        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={abortCurrentRequest}
          isLoading={isLoading}
          disabled={!activeModel}
```

**Replace with**:
```tsx
        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={abortCurrentRequest}
          isLoading={isLoading || isScraping}
          disabled={!activeModel}
```

---

### Task 1.6: Strengthen JSON detection in ChatBubble

**File**: `src/features/chat/components/ChatBubble.tsx`
**Action**: Replace the existing `displayContent` useMemo with this improved version:

**Find**:
```typescript
  // Sanitize content: detect raw JSON and wrap in code fence
  const displayContent = React.useMemo(() => {
    const content = message.content || '';
    if (!content.trim()) return content;

    // Detect if content is raw JSON (starts with { or [ and is valid JSON)
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        JSON.parse(trimmed);
        // It's valid JSON — wrap in code fence for proper rendering
        return '```json\n' + trimmed + '\n```';
      } catch {
        // Not valid JSON, render as-is
      }
    }
    return content;
  }, [message.content]);
```

**Replace with**:
```typescript
  // Sanitize content: detect raw JSON and Ollama metadata leaks
  const displayContent = React.useMemo(() => {
    const content = message.content || '';
    if (!content.trim()) return content;

    const trimmed = content.trim();

    // Case 1: Entire content is a single JSON object/array
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed);
        // If it looks like an API response (has model, choices, message fields), wrap it
        if (parsed.model || parsed.choices || parsed.message || parsed.data) {
          return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
        }
        // Generic valid JSON — also wrap
        return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
      } catch {
        // Not valid JSON as a whole — check for NDJSON lines
      }
    }

    // Case 2: Content has multiple JSON lines (Ollama NDJSON leak)
    // Pattern: multiple lines each starting with { and containing "model":
    const lines = trimmed.split('\n');
    if (lines.length > 1 && lines.every(l => l.trim().startsWith('{') || l.trim() === '')) {
      const jsonLines = lines.filter(l => l.trim().startsWith('{'));
      if (jsonLines.length > 1) {
        // Try to extract actual content from Ollama format
        let extracted = '';
        for (const line of jsonLines) {
          try {
            const obj = JSON.parse(line);
            const text = obj.message?.content || obj.response || obj.choices?.[0]?.delta?.content || '';
            extracted += text;
          } catch {
            // Not JSON, skip
          }
        }
        if (extracted) return extracted;
        // If extraction failed, wrap as code
        return '```json\n' + trimmed + '\n```';
      }
    }

    // Case 3: Content starts with text but has JSON blob embedded
    // e.g., "Here is the result:\n{...json...}"
    // Leave as-is — ReactMarkdown will handle it, and if the JSON is in a code fence it's fine

    return content;
  }, [message.content]);
```

---

### Task 2.1: Fix gateway streaming for Ollama NDJSON format

**File**: `server/routes/gateway.routes.ts`
**Action**: Replace the streaming `data` event handler. Find the section that starts with:

```typescript
streamResponse.data.on('data', (chunk: any) => {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
  if (!text) return;
```

**Replace the ENTIRE `data` handler** (up to the matching `});`) with:

```typescript
        streamResponse.data.on('data', (chunk: any) => {
          const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
          if (!text) return;

          const lines = text.split(/\r?\n/).filter(Boolean);

          for (const line of lines) {
            // --- OpenAI SSE format: "data: {...}" ---
            if (line.startsWith('data:')) {
              const jsonStr = line.slice(5).trim();
              if (jsonStr === '[DONE]') {
                // Don't write [DONE] here — it's written in the 'end' handler
                continue;
              }
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed?.choices?.[0]?.delta?.content || parsed?.text || '';
                streamedChars += delta.length;
              } catch {
                // Count raw chars as fallback
                streamedChars += jsonStr.length;
              }
              // Forward as-is (already in SSE format)
              res.write(line + '\n\n');
              continue;
            }

            // --- Ollama NDJSON format: raw JSON per line ---
            if (line.startsWith('{')) {
              try {
                const parsed = JSON.parse(line);
                const content = parsed.message?.content || parsed.response || '';
                const done = parsed.done === true;

                streamedChars += content.length;

                if (done) {
                  // Ollama signals done — don't write [DONE] here, let 'end' handler do it
                  continue;
                }

                if (content) {
                  // Convert to OpenAI SSE format for the frontend
                  const ssePayload = JSON.stringify({
                    choices: [{ index: 0, delta: { content } }]
                  });
                  res.write(`data: ${ssePayload}\n\n`);
                }
              } catch {
                // Not valid JSON — forward wrapped in SSE
                res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: line } }] })}\n\n`);
                streamedChars += line.length;
              }
              continue;
            }

            // --- Plain text (rare) — wrap in SSE ---
            if (line.trim()) {
              res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: line } }] })}\n\n`);
              streamedChars += line.length;
            }
          }
        });
```

---

### Task 2.2: Fix useChat streaming parser for both formats

**File**: `src/hooks/useChat.ts`
**Action**: In the streaming reader section, find the line parsing logic. Find:

```typescript
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data:'));

            for (const line of lines) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                const deltaContent = parsed.choices?.[0]?.delta?.content || '';
                const deltaThinking = parsed.choices?.[0]?.delta?.thinking || '';
```

**Replace with**:

```typescript
            const chunk = decoder.decode(value, { stream: true });
            // Handle both OpenAI SSE ("data: ...") and raw NDJSON lines
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
              // Extract JSON payload from either format
              let data: string;
              if (line.startsWith('data:')) {
                data = line.slice(5).trim();
              } else if (line.startsWith('{')) {
                data = line.trim();
              } else {
                continue; // Skip non-data lines (e.g., empty, comments)
              }

              if (data === '[DONE]') break;
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                // Support multiple response formats:
                // OpenAI: parsed.choices[0].delta.content
                // Ollama: parsed.message.content or parsed.response
                const deltaContent = parsed.choices?.[0]?.delta?.content
                  || parsed.message?.content
                  || parsed.response
                  || '';
                const deltaThinking = parsed.choices?.[0]?.delta?.thinking || '';
```

(The rest of the loop body stays the same — it uses `deltaContent` and `deltaThinking`)

---

### Task 3.1: Add "Scraping..." indicator in ChatInput

**File**: `src/features/chat/components/ChatInput.tsx`
**Action**: The `isLoading` prop already covers this since we pass `isLoading || isScraping` from ChatPage. The existing loading state shows the stop button. But we can improve the placeholder text.

In ChatPage.tsx, update the placeholder prop:

**Find**:
```tsx
          placeholder={activeModel ? `Message ${activeModel.name}...` : 'Select a model first...'}
```

**Replace with**:
```tsx
          placeholder={
            isScraping ? 'Scraping URL content...' :
            activeModel ? `Message ${activeModel.name}...` :
            'Select a model first...'
          }
```

---

## Summary of All Changes

| # | File | Type | Description |
|---|------|------|-------------|
| 1.1 | `src/index.css` | APPEND | Add `.chat-prose` CSS (tables, HR, headings, lists, blockquotes) |
| 1.2 | `src/features/chat/components/ChatBubble.tsx` | REPLACE | `prose prose-sm` → `chat-prose` |
| 1.3 | `src/services/api.ts` | REPLACE | Add timeout option to scrapeApi |
| 1.4 | `src/features/chat/hooks/useScraper.ts` | REPLACE | Pass 8s timeout |
| 1.5 | `src/features/chat/ChatPage.tsx` | MODIFY | Add isScraping state, wrap scrape in try/finally, pass to ChatInput |
| 1.6 | `src/features/chat/components/ChatBubble.tsx` | REPLACE | Stronger JSON/NDJSON detection |
| 2.1 | `server/routes/gateway.routes.ts` | REPLACE | Handle Ollama NDJSON in streaming handler |
| 2.2 | `src/hooks/useChat.ts` | REPLACE | Parse both SSE and NDJSON in stream reader |
| 3.1 | `src/features/chat/ChatPage.tsx` | REPLACE | Placeholder shows "Scraping..." during scrape |

---

## Execution Command

When ready to execute, tell me: **"eksekusi UI_FIX_PLAN"** and I will apply all changes in order, then run `tsc --noEmit` to verify.
