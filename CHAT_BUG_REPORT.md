# Chat Bug Report & Fix Plan

**Date:** 2026-05-19
**Author:** Cascade (automated audit)
**Status:** CRITICAL — Multiple infinite loops & duplicate sends

---

## Executive Summary

The chat feature has **3 critical bugs** and **5 moderate issues** caused primarily by:
1. React StrictMode double-mounting effects
2. Missing dependency guards in useEffect hooks
3. Calling async side-effects inside setState updaters
4. Bidirectional sync creating feedback loops

---

## BUG 1: Messages Appear Automatically in New Chat (CRITICAL)

### Symptom
When creating a new chat, old messages from the previous conversation appear immediately.

### Root Cause (3 cascading issues)

**1a. `handleNewChat` doesn't clear store messages properly**

```typescript
// ChatPage.tsx:139-142
const handleNewChat = useCallback(() => {
  clearMessages();          // clears useChat hook state
  createConversation(modelId); // creates new convo in store
}, [clearMessages, createConversation, modelId]);
```

Problem: `clearMessages()` clears the hook's `messages[]`, but the **bidirectional sync effect** (line 97-105) runs AFTER, and it may re-sync old messages back because `messages` reference hasn't yet updated when the effect fires.

**1b. Bidirectional sync triggers on `messages` as dep, causing re-sync of stale data**

```typescript
// ChatPage.tsx:97-105 — deps include [isLoading, activeId, messages]
useEffect(() => {
  if (prevLoadingRef.current && !isLoading && activeId && messages.length > 0) {
    syncMessages(activeId, messages as any);
  }
  prevLoadingRef.current = isLoading;
}, [isLoading, activeId, messages]); // ← 'messages' causes re-runs on every render
```

Problem: `messages` is a new array reference on every state change, so this effect runs very frequently. When `activeId` changes (new chat created), the old messages from the previous conversation haven't been cleared yet because React batches state updates.

**1c. Auto-create conversation effect creates infinite loop**

```typescript
// ChatPage.tsx:84-88
useEffect(() => {
  if (conversations.length === 0) createConversation(modelId);
  else if (!activeId && conversations.length > 0) setActive(conversations[0].id);
}, [conversations.length, activeId]);
```

Problem: `createConversation` updates `conversations.length` AND `activeId`, causing this effect to re-fire. With StrictMode, it fires twice, potentially creating 2 conversations.

### Fix Plan
- Add a `hasInitialized` ref guard to prevent double-init
- Remove `messages` from bidirectional sync deps; use only `isLoading` transition
- Clear messages BEFORE switching activeId in handleNewChat
- Add a conversation switch lock to prevent sync during transition

---

## BUG 2: Double/Triple Prompt Sends (CRITICAL)

### Symptom
When sending a prompt, the AI receives 2 or more copies and responds 2+ times.

### Root Cause (2 issues)

**2a. `sendMessage` calls `sendCore` INSIDE `setMessages` updater**

```typescript
// useChat.ts:248-253
setMessages(prev => {
  const next = [...prev, userMsg];
  sendCore(next, overrides);   // ← FIRE-AND-FORGET INSIDE setState!
  return next;
});
```

**THIS IS THE MAIN BUG.** React StrictMode calls setState updaters **twice** in development. Since `sendCore` is called inside the updater, it fires twice → 2 API requests → 2 assistant responses.

Even without StrictMode, calling an async side-effect inside a setState updater is an anti-pattern because:
- The updater may be called multiple times by React's concurrent features
- The updater should be a pure function

**2b. Same pattern in `regenerate` and `editAndRegenerate`**

```typescript
// useChat.ts:258-270
const regenerate = useCallback(async (messageId?: string) => {
  setMessages(prev => {
    // ...
    sendCore(trimmed, overridesRef.current); // ← ALSO INSIDE setState
    return trimmed;
  });
}, [sendCore]);

// useChat.ts:274-289
const editAndRegenerate = useCallback(async (messageId: string, newContent: string) => {
  setMessages(prev => {
    // ...
    sendCore(trimmed, overridesRef.current); // ← ALSO INSIDE setState
    return trimmed;
  });
}, [sendCore]);
```

### Fix Plan
- Move `sendCore` call OUTSIDE the `setMessages` updater
- Use a ref or flushSync to ensure messages are updated before calling sendCore
- Add a `isSendingRef` guard to prevent concurrent sends
- Verify the fix works with and without StrictMode

---

## BUG 3: useEffect Infinite Loops (CRITICAL)

### Symptom
Console shows excessive re-renders, state updates run endlessly, component re-renders on every frame.

### Root Causes

**3a. `useAutoScroll` deps is raw `[messages, isLoading]` array**

```typescript
// useAutoScroll.ts:26-33
useEffect(() => {
  // auto-scroll logic
}, deps); // deps = [messages, isLoading] — 'messages' is NEW array ref every time
```

`messages` is a state array from `useState`. Every time `setMessages` is called (which happens on every streaming chunk), the reference changes, causing this effect to fire on every streaming token. This creates a scroll → setState → re-render → scroll loop.

**3b. `activeConvo` is derived from `getActive()` on every render**

```typescript
// ChatPage.tsx:56
const activeConvo = getActive();
```

`getActive()` calls `get()` inside Zustand, which always returns a fresh reference when `conversations` change. Since the sync effect writes to conversations, it triggers a re-read of `activeConvo`, which may trigger the system prompt load effect (line 91-95), which writes to settings, causing another re-render.

**3c. Missing `conversations` dependency in `handleSelectConvo` callback**

```typescript
// ChatPage.tsx:137
}, [activeId, messages, conversations, setActive, syncMessages, setMessages, clearMessages]);
```

`conversations` (full array) in the dependency array means this callback is recreated on every conversation store update, cascading to any component receiving it as prop.

**3d. `chatPrefs.getMemoriesAsContext` in handleSend deps**

```typescript
// ChatPage.tsx:113
const memoryContext = chatPrefs.getMemoriesAsContext();
```

`chatPrefs` is a Zustand store object. On every render, `chatPrefs` may have a new reference, making the `handleSend` callback recreate.

---

## BUG 4: 3 Models Share Same Endpoint `/ai/chat` (MODERATE)

### Symptom
Qwen3.5 9B, Qwen2.5 7B, Qwen3 8B all share endpoint `/ai/chat`. The gateway middleware matches the first one found, so the wrong model may be proxied.

### Root Cause
```typescript
// server/index.ts — dynamicGatewayMiddleware
const results = await lookupApiByEndpoint(req.path);
if (results && results.length > 0) {
  return requireApiKey(req, res, () => dynamicProxyController(req, res));
}
```

`lookupApiByEndpoint` returns all 3 models. The gateway uses `results[0]` which may not match the model the user intended.

### Fix Plan
The frontend `chatStream` should include `model` in the request body. The gateway should match by `model_slug` when multiple APIs share the same endpoint.

---

## BUG 5: No Race Condition Guard on Send (MODERATE)

### Symptom
If user clicks send rapidly or presses Enter multiple times, multiple requests fire simultaneously.

### Root Cause
`handleSend` checks `isLoading` but there's no debounce or mutex. Between the time the user clicks and `setIsLoading(true)` takes effect (async), multiple clicks can go through.

### Fix Plan
Add `isSendingRef` guard in useChat + disable send button immediately on click.

---

## BUG 6: `handleSend` is async but called from `onSend` without error handling (MODERATE)

### Symptom
If URL scraping fails with an unhandled promise rejection, the send may silently fail.

### Root Cause
```typescript
const handleSend = useCallback(async () => {   // async!
  // ...
  const scrapedContext = await scrapeFromMessage(input);  // can throw
  // ...
```

`onSend` in ChatInput calls `handleSend()` synchronously from `handleKeyDown` without `.catch()`.

### Fix Plan
Wrap handleSend body in try/catch.

---

## BUG 7: localStorage Conversation Bloat (MODERATE)

### Symptom
Over time, localStorage fills up and conversations fail to save.

### Root Cause
`syncMessages` saves FULL conversation content to localStorage on every stream completion. Large conversations (100+ messages with thinking) can exceed the 5-10MB localStorage limit.

### Fix Plan
- Add message count limit per conversation in storage
- Compress stored conversations (omit thinking for old messages)
- Show warning when approaching storage limit

---

## BUG 8: Memory Leak — AbortController Not Cleaned (LOW)

### Symptom
If component unmounts during streaming, the stream continues in background.

### Root Cause
`useChat` doesn't abort on unmount. No cleanup function in ChatPage.

### Fix Plan
Add useEffect cleanup in useChat that aborts on unmount.

---

## VULNERABILITY 1: chatStream sends to arbitrary endpoint (LOW-MODERATE)

### Symptom
Frontend sends `fetch(endpoint, ...)` where `endpoint` comes from `activeModel?.endpoint`. A compromised model record could redirect requests.

### Root Cause
```typescript
// api.ts:95
return fetch(endpoint, { ... });
```

`endpoint` is from the API record. If an admin sets it to an external URL, the frontend would send the user's JWT to that URL.

### Fix Plan
Prefix all endpoints with the origin: `fetch(window.location.origin + endpoint, ...)`

---

## VULNERABILITY 2: No input sanitization for system prompt (LOW)

### Symptom
User-supplied system prompt is sent directly to the AI without any sanitization or length limit.

### Fix Plan
Add max length validation (e.g., 2000 chars) for system prompt.

---

## Complete Fix Execution Plan

### Phase 1: CRITICAL — Stop Infinite Loops & Double Sends (Priority: IMMEDIATE)

| # | Fix | File | Details |
|---|-----|------|---------|
| 1.1 | Move sendCore OUT of setState updater | `useChat.ts` | Use sequential: setMessages → then sendCore |
| 1.2 | Add isSendingRef mutex | `useChat.ts` | Prevent concurrent sends |
| 1.3 | Fix auto-create conversation loop | `ChatPage.tsx` | Add hasInitialized ref guard |
| 1.4 | Fix bidirectional sync loop | `ChatPage.tsx` | Remove `messages` from deps, use message count ref |
| 1.5 | Fix useAutoScroll deps | `useAutoScroll.ts` | Use messages.length instead of messages ref |
| 1.6 | Add unmount cleanup | `useChat.ts` | Abort on unmount |

### Phase 2: MODERATE — Correctness Fixes

| # | Fix | File | Details |
|---|-----|------|---------|
| 2.1 | Fix handleNewChat ordering | `ChatPage.tsx` | Clear messages → clear activeId → create new |
| 2.2 | Fix handleSelectConvo deps | `ChatPage.tsx` | Use refs for messages/conversations |
| 2.3 | Fix endpoint prefix for chatStream | `api.ts` | Always prefix with origin |
| 2.4 | Add try/catch to handleSend | `ChatPage.tsx` | Wrap async send in error boundary |
| 2.5 | Fix multi-model same endpoint | `gateway.routes.ts` | Match by model_slug when ambiguous |

### Phase 3: LOW — Hardening

| # | Fix | File | Details |
|---|-----|------|---------|
| 3.1 | Add system prompt length limit | `ChatSettingsPanel.tsx` | Max 2000 chars |
| 3.2 | Add localStorage size guard | `conversations.store.ts` | Warn + trim old convos |
| 3.3 | Stabilize callback deps | `ChatPage.tsx` | Use refs for stable callbacks |
| 3.4 | Remove StrictMode double-fire sensitivity | `useChat.ts` | Ensure idempotent effects |

### Testing Checklist

After fixes, verify:
- [ ] New chat starts with 0 messages
- [ ] Sending 1 prompt produces exactly 1 AI response
- [ ] Regenerate produces exactly 1 new response
- [ ] Switching conversations loads correct messages
- [ ] No infinite loops in React DevTools Profiler
- [ ] No duplicate API calls in Network tab
- [ ] Stop button works during streaming
- [ ] Browser console has no warnings/errors
- [ ] Works correctly with StrictMode enabled
- [ ] Works correctly with StrictMode disabled

---

## Root Cause Summary

| Bug | Root Cause | Severity |
|-----|-----------|----------|
| Auto-chat messages | Bidirectional sync re-syncs stale data during conversation switch | CRITICAL |
| Double sends | `sendCore()` called inside `setMessages` updater — runs 2x in StrictMode | CRITICAL |
| Infinite loops | `messages` array ref in useEffect deps + cascading state updates | CRITICAL |
| Wrong model proxied | 3 models share `/ai/chat` endpoint, gateway picks first | MODERATE |
| Race condition | No mutex on send, rapid clicks fire multiple requests | MODERATE |
| Unhandled async | `handleSend` is async but errors aren't caught | MODERATE |
| Storage bloat | Full messages saved to localStorage with no limit | MODERATE |
| Memory leak | AbortController not cleaned on unmount | LOW |
