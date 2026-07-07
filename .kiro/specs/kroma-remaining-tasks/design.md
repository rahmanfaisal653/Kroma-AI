# Design Document: Kroma AI Gateway — Remaining Tasks (5.1–7.3)

## Overview

This document covers the technical design for completing the remaining implementation tasks of the Kroma AI Gateway project. The work spans three phases:

- **Phase 5 (Security & Billing)**: Replace the shared-secret `x-admin-key` auth with JWT role-based auth, add Zod input validation, fix streaming billing to count actual tokens, and fix refund logic to cover 4xx and timeout errors.
- **Phase 6 (Chat Features)**: Add a conversation history sidebar with a Zustand store, a settings panel for model parameters, and multimodal image upload support.
- **Phase 7 (Cleanup)**: Delete legacy components/pages/context files, redesign admin pages to use the new design system, and remove the legacy `server.ts` monolith.

The project is a full-stack TypeScript application: Express + SQLite on the server, React + Zustand + Vite on the client.

---

## Architecture

The application follows a layered architecture:

```
Client (React/Vite)
  └── src/features/         ← Feature pages (ChatPage, etc.)
  └── src/stores/           ← Zustand state (auth.store, conversations.store)
  └── src/services/api.ts   ← HTTP client wrappers (adminApi, gatewayApi, etc.)
  └── src/ui/               ← Shared design system components

Server (Express/TSX)
  └── server/index.ts       ← App entry point, route registration
  └── server/middleware/    ← auth, admin, validate, rateLimiter
  └── server/routes/        ← Route handlers (auth, billing, gateway, admin/*)
  └── server/services/      ← Business logic (gateway.service, auth.service, db.service)
```

The key changes in this spec touch every layer:
- **Middleware layer**: new `requireRole` and `validate` middleware
- **Route layer**: swap `requireAdmin` for `requireAuth + requireRole('admin')`, apply Zod schemas
- **Service layer**: update streaming billing and refund logic in `gateway.service.ts`
- **Client stores**: new `conversations.store.ts`
- **Client pages**: update `ChatPage.tsx`, all admin pages
- **Client services**: update `adminApi` to drop `x-admin-key`

---

## Components and Interfaces

### 5.1 — Session-Based Admin Auth

**New middleware: `server/middleware/admin.middleware.ts`**

Replace the existing `requireAdmin` (key-based) with two composable middleware functions:

```typescript
// Existing (to be replaced):
export const requireAdmin = (req, res, next) => { /* checks x-admin-key */ }

// New:
export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
  if ((req.user as any).role !== role) return res.status(403).json({ error: 'Forbidden.' });
  next();
};
```

`requireAuth` already exists in `auth.middleware.ts` and attaches `req.user` from the JWT. The `requireRole` factory reads `req.user.role` which is embedded in the JWT payload (see `generateTokens` in `auth.service.ts`).

**`server/index.ts` — route registration change:**

```typescript
// Before:
app.use('/admin/apis', requireAdmin, adminModelsRoutes);
app.use('/api/admin/users', requireAdmin, adminUsersRoutes);
// ...

// After:
app.use('/admin/apis', requireAuth, requireRole('admin'), adminModelsRoutes);
app.use('/api/admin/users', requireAuth, requireRole('admin'), adminUsersRoutes);
// ...
```

**`src/services/api.ts` — adminApi changes:**

The `http` axios instance (in `src/services/http.ts`) already attaches the JWT `Authorization: Bearer <token>` header via a request interceptor. Therefore, removing `x-admin-key` from `adminApi` calls is sufficient — the JWT will be sent automatically.

```typescript
// Before:
getModels: (adminKey: string) =>
  http.get('/admin/apis', { headers: { 'x-admin-key': adminKey } }).then(r => r.data),

// After:
getModels: () =>
  http.get('/admin/apis').then(r => r.data),
```

All `adminKey` parameters are removed from every `adminApi` method signature.

**Admin pages** — remove `getAdminKey()` calls and update all `adminApi` call sites to drop the `adminKey` argument.

---

### 5.2 — Input Validation with Zod

**New file: `server/middleware/validate.middleware.ts`**

```typescript
import { ZodSchema, ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    req.body = result.data; // replace with parsed/coerced data
    next();
  };
```

**New file: `server/schemas/index.ts`** — centralised Zod schemas:

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const modelCreateSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().min(1),
  target_url: z.string().url(),
  // ... other fields optional
});

export const modelUpdateSchema = modelCreateSchema.partial();

export const buyCreditsSchema = z.object({
  userKey: z.string().min(1),
  amount: z.number().positive()
});

export const transactionCreateSchema = z.object({
  user_key: z.string().min(1),
  user_email: z.string().email(),
  plan_id: z.union([z.string(), z.number()]),
  credits: z.number().positive(),
  price: z.number().positive(),
  // optional fields
  user_name: z.string().optional(),
  plan_name: z.string().optional(),
  bonus_credits: z.number().optional(),
  payment_method: z.string().optional()
});

export const transactionActionSchema = z.object({
  notes: z.string().optional()
});
```

Apply `validate(schema)` in each route file before the handler.

---

### 5.3 — Per-Token Streaming Billing

**`server/routes/gateway.routes.ts` — streaming handler update:**

The current streaming handler pipes SSE chunks directly to the client without counting tokens. The fix accumulates character counts from each chunk and bills after the stream ends.

```typescript
// In the streaming section of dynamicProxyController:
let streamedChars = 0;

streamResponse.data.on('data', (chunk: any) => {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
  if (!text) return;
  // Count characters from delta content in SSE lines
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content || parsed.text || '';
      streamedChars += delta.length;
    } catch { /* skip */ }
  }
  res.write(text);
});

streamResponse.data.on('end', async () => {
  res.write('data: [DONE]\n\n');
  res.end();
  // Bill based on streamed tokens (chars / 4 estimate)
  const streamedTokens = Math.ceil(streamedChars / 4);
  const priceOutput = Number(api.price_output) || 0;
  const tokenCost = Math.round((streamedTokens / 1000) * priceOutput);
  if (tokenCost > 0) {
    await putUserUsage(req.user.id, currentUsageCount + tokenCost);
  }
});
```

The `api` and `currentUsageCount` variables are already in scope from the outer `dynamicProxyController` function.

---

### 5.4 — Refund Logic Fix

**`server/routes/gateway.routes.ts` — refund conditions:**

The current code already refunds on network errors (ECONNABORTED, ECONNREFUSED). The gap is that 4xx upstream errors from the AI provider (e.g., 401 Unauthorized, 429 Rate Limited, 404 Not Found) do not trigger a refund.

The fix: refund on any upstream status ≥ 401 (excluding 400 which is a user input error):

```typescript
if (targetResponse.status >= 400) {
  const isUserError = targetResponse.status === 400;
  if (!isUserError) {
    await refundUsageSafely(req.user.id, basePrice, usageCount);
  }
  return res.status(502).json({
    error: 'AI Server returned an error.',
    detail: targetResponse.data?.error?.message || targetResponse.data?.error,
    status: targetResponse.status,
    credits_refunded: !isUserError
  });
}
```

Timeout/abort refunds are already handled in the `catch` block for `ECONNABORTED`.

---

### 6.1 — Chat History Sidebar

**New file: `src/stores/conversations.store.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  cost?: number;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  messages: ConversationMessage[];
  settings?: ChatSettings;
  createdAt: number;
  updatedAt: number;
}

interface ConversationsState {
  conversations: Conversation[];
  activeId: string | null;
  createConversation: (modelId: string) => string;
  setActive: (id: string) => void;
  addMessage: (id: string, message: ConversationMessage) => void;
  updateTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  updateSettings: (id: string, settings: Partial<ChatSettings>) => void;
  getActive: () => Conversation | null;
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      // ... implementations
    }),
    { name: 'kroma_conversations' }
  )
);
```

**`ChatPage.tsx` layout change:**

The page gains a left sidebar (collapsible on mobile) listing conversations. The sidebar renders a list of `Conversation` items with rename/delete actions. The main chat area remains unchanged in structure.

```
┌─────────────────────────────────────────────────────┐
│  [≡] Kroma Chat                          [Settings] │  ← top bar
├──────────────┬──────────────────────────────────────┤
│ Conversations│  Messages area                       │
│ ─────────── │                                      │
│ + New Chat  │  [Bot] Hello! How can I help?         │
│             │                                      │
│ > Conv 1    │  [User] Tell me about...              │
│   Conv 2    │                                      │
│   Conv 3    │                                      │
├──────────────┴──────────────────────────────────────┤
│  [📎] Message input...                    [Send]    │  ← input bar
└─────────────────────────────────────────────────────┘
```

---

### 6.2 — Settings Panel

**New component: `src/features/chat/ChatSettings.tsx`**

A slide-out drawer (using CSS transform + transition) triggered by a settings icon in the top bar. It renders four controls:

| Field | Type | Range | Default |
|---|---|---|---|
| temperature | number slider | 0–2 | 0.7 |
| top_p | number slider | 0–1 | 1.0 |
| max_tokens | number input | 1–8192 | 2048 |
| system prompt | textarea | — | "" |

Settings are stored per-conversation in `Conversations_Store`. When no per-conversation settings exist, hardcoded defaults are used (as listed above).

The `useChat` hook is updated to accept a `settings` parameter that is merged into the request body:

```typescript
const body: any = {
  messages: allMessages,
  ...(settings?.temperature !== undefined && { temperature: settings.temperature }),
  ...(settings?.top_p !== undefined && { top_p: settings.top_p }),
  ...(settings?.max_tokens !== undefined && { max_tokens: settings.max_tokens }),
};
if (settings?.systemPrompt) {
  body.messages = [{ role: 'system', content: settings.systemPrompt }, ...body.messages];
}
```

---

### 6.3 — File/Image Upload (Multimodal)

**`ChatPage.tsx` input area additions:**

- A paperclip icon button opens a hidden `<input type="file" accept="image/*">`.
- Drag-and-drop is handled via `onDragOver` / `onDrop` on the input container.
- On file selection, the image is read with `FileReader.readAsDataURL()` and stored in local component state as `{ name, dataUrl }`.
- A thumbnail preview is shown above the textarea.
- On send, the message body is constructed with the OpenAI multimodal format:

```typescript
const contentParts: any[] = [{ type: 'text', text: input }];
if (attachedImage) {
  contentParts.push({
    type: 'image_url',
    image_url: { url: attachedImage.dataUrl }
  });
}
// Replace the plain string message with the parts array
body.messages = [...history, { role: 'user', content: contentParts }];
```

Non-image MIME types are rejected with an inline error message.

---

### 7.1 — Remove Code Duplication

Files to delete:

| File | Reason |
|---|---|
| `src/components/TextGenerator.tsx` | Superseded by `ChatPage` |
| `src/components/ImageGenerator.tsx` | Superseded by `ImagesPage` |
| `src/components/Layout.tsx` | Superseded by `src/layouts/AppLayout.tsx` |
| `src/components/AdminLayout.tsx` | Superseded by `src/layouts/AdminLayout.tsx` |
| `src/context/AuthContext.tsx` | Superseded by `src/stores/auth.store.ts` |
| `src/context/ThemeContext.tsx` | Superseded by CSS vars + ThemeToggle |
| `src/pages/Dashboard.tsx` | Superseded by feature pages |
| `src/pages/ApiDetails.tsx` | Superseded by `ModelDetailPage` |
| `src/pages/Pricing.tsx` | Superseded by `BillingPage` |
| `src/pages/Docs.tsx` | Superseded by `DocsPage` |
| `src/pages/Login.tsx` | Superseded by `src/features/auth/LoginPage.tsx` |
| `src/pages/Register.tsx` | Superseded by `src/features/auth/RegisterPage.tsx` |

Before deleting, grep for any remaining imports of these files and remove them.

---

### 7.2 — Admin Panel Redesign

All seven admin pages (`AdminOverview`, `AdminApis`, `AdminUsers`, `AdminPlans`, `AdminPaymentMethods`, `AdminTransactions`, `AdminDocs`) are migrated to:

1. **CSS vars** — replace all `bg-white`, `text-slate-900`, `border-slate-200`, etc. with `var(--color-surface)`, `var(--color-text)`, `var(--color-border)`, etc.
2. **UI components** — replace inline `<button>` elements with `<Button>` from `src/ui/Button.tsx`, status labels with `<Badge>`, confirmation dialogs with `<Modal>`.
3. **Auth** — remove `adminKey` state and `getAdminKey()` calls; use `adminApi` methods without key arguments (JWT is sent automatically by the axios interceptor).
4. **Data fetching** — replace direct `axios.get(...)` calls with `adminApi.*()` methods.

Example transformation for `AdminOverview`:

```tsx
// Before:
<div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
  <p className="text-sm text-slate-500">Total Users</p>
  <p className="text-2xl font-bold text-slate-900">{stats.users}</p>
</div>

// After:
<div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
     className="rounded-2xl p-6">
  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Users</p>
  <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.users}</p>
</div>
```

---

### 7.3 — Delete Legacy Server

1. Delete `server.ts` from the project root.
2. Remove `dev:legacy` and `start:legacy` from `package.json` scripts.

No other changes are needed — `server/index.ts` is already the canonical entry point used by `dev` and `start`.

---

## Data Models

### Conversation (client-side, localStorage)

```typescript
interface ChatSettings {
  temperature: number;   // 0–2, default 0.7
  top_p: number;         // 0–1, default 1.0
  max_tokens: number;    // 1–8192, default 2048
  systemPrompt: string;  // default ""
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;       // plain text or stringified multimodal content
  timestamp: number;
  cost?: number;
  model?: string;
}

interface Conversation {
  id: string;            // uuid
  title: string;         // auto-generated from first 40 chars of first message
  modelId: string;       // maps to ApiModel.id
  messages: ConversationMessage[];
  settings?: ChatSettings;
  createdAt: number;
  updatedAt: number;
}
```

### Zod Validation Schemas (server-side)

See `server/schemas/index.ts` in the Components section above. These are pure TypeScript/Zod — no database changes required.

### JWT Payload (existing, no change)

```typescript
interface JwtPayload {
  id: number;
  email: string;
  role: 'user' | 'admin';
}
```

The `role` field is already present in the JWT (set by `generateTokens` in `auth.service.ts`) and attached to `req.user` by `requireAuth`. The new `requireRole` middleware reads it from there.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Admin role enforcement is consistent

*For any* HTTP request to an admin route, the response status is 403 if and only if the request's JWT payload does not contain `role: 'admin'` (or no JWT is present).

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Validation rejects all invalid inputs

*For any* request body that does not conform to the defined Zod schema for a route, the server SHALL return a 400 status code and SHALL NOT return a 2xx status code.

**Validates: Requirements 2.2, 2.3**

### Property 3: Streaming token cost is proportional to streamed content

*For any* streaming response, the billed token count SHALL equal `ceil(total_streamed_delta_chars / 4)`, and the resulting credit deduction SHALL equal `round((token_count / 1000) * price_output)`.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Refund is issued for all non-user-caused failures

*For any* upstream request that fails with a status code ≥ 401, or with a network timeout/abort, the user's usage count after the request SHALL equal the usage count before the request was initiated.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Conversation persistence round-trip

*For any* conversation created and stored in `Conversations_Store`, serializing it to localStorage and then deserializing it SHALL produce a conversation with identical id, title, modelId, messages, and settings.

**Validates: Requirements 5.1**

### Property 6: Settings fallback chain is complete

*For any* chat request, the parameters sent to the gateway SHALL always have defined values for temperature, top_p, and max_tokens — either from per-conversation settings, global defaults, or hardcoded fallbacks.

**Validates: Requirements 6.5**

---

## Error Handling

| Scenario | Behavior |
|---|---|
| JWT missing on admin route | `requireAuth` returns 401 |
| JWT present but role ≠ admin | `requireRole('admin')` returns 403 |
| Zod validation failure | `validate` middleware returns 400 with field-level errors |
| Upstream 400 (user input error) | Gateway returns 502, no refund |
| Upstream 4xx (non-400) | Gateway returns 502, credits refunded |
| Upstream 5xx | Gateway returns 502, credits refunded |
| Network timeout/abort | Gateway returns 504, credits refunded |
| Non-image file attached | ChatPage shows inline error, rejects attachment |
| New conversation creation fails | Message area is NOT cleared |
| Image FileReader error | ChatPage shows inline error, clears attachment state |

---

## Testing Strategy

This feature set spans server middleware, service logic, client state management, and UI components. The appropriate testing approach varies by layer.

**Property-based tests** are appropriate for:
- Admin role enforcement (pure predicate logic)
- Zod validation (pure schema logic — any invalid input should fail, any valid input should pass)
- Streaming billing calculation (pure arithmetic)
- Refund logic (pure conditional logic)
- Conversation store persistence (localStorage round-trip)

**Unit tests** are appropriate for:
- `requireRole` middleware with mock `req.user`
- `validate` middleware with mock request bodies
- `calculateStreamTokenCost(chars, priceOutput)` helper
- `useConversationsStore` actions (create, rename, delete, addMessage)
- Settings fallback chain in `useChat`

**Integration tests** (example-based) are appropriate for:
- Full admin route request with valid/invalid JWT
- Full POST /api/auth/login with valid/invalid body
- Admin page rendering with mocked `adminApi`

**Property test library**: [fast-check](https://fast-check.io/) for TypeScript (both server and client). Each property test runs a minimum of 100 iterations.

**Tag format**: `// Feature: kroma-remaining-tasks, Property N: <property_text>`
