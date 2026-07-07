# KROMA AI GATEWAY — REMAINING TASKS

> Sisa pekerjaan dari OVERHAUL_PLAN.md yang belum selesai.
> Diurutkan berdasarkan prioritas dan dependency.

---

## PHASE 5: Security & Billing Fixes

**Goal**: Tutup semua security hole dan fix billing accuracy.

| # | Task | Priority | Est. | Depends On |
|---|------|----------|------|------------|
| 5.1 | **Session-based admin auth** (hapus x-admin-key dari frontend) | CRITICAL | 2h | — |
|     | - Admin login via JWT (role check) | | | |
|     | - Remove `x-admin-key` header dari semua `adminApi` calls di `src/services/api.ts` | | | |
|     | - Admin routes pakai `requireAuth + requireRole('admin')` bukan `requireAdmin(key)` | | | |
|     | - Frontend admin pages ambil dari auth store, bukan prompt key | | | |
| 5.2 | **Input validation (Zod)** untuk semua endpoints | MEDIUM | 2h | — |
|     | - Install `zod` | | | |
|     | - Create `server/middleware/validate.middleware.ts` | | | |
|     | - Add schemas: auth (login/register), models CRUD, billing, transactions | | | |
|     | - Apply to all POST/PUT routes | | | |
| 5.3 | **Per-token streaming billing** | MEDIUM | 1.5h | — |
|     | - Count actual tokens from SSE chunks (tiktoken or char-based estimate) | | | |
|     | - Bill incrementally during stream, not flat rate | | | |
|     | - Update `gateway.service.ts` streaming handler | | | |
| 5.4 | **Fix refund logic** (4xx should also refund) | MEDIUM | 30m | — |
|     | - Currently only refunds on 5xx | | | |
|     | - Add refund for 4xx upstream errors (not user errors like 400 bad request) | | | |
|     | - Refund on timeout/abort too | | | |

---

## PHASE 6: Chat Advanced Features

**Goal**: Chat page setara OpenWebUI — history, multimodal, settings.

| # | Task | Priority | Est. | Depends On |
|---|------|----------|------|------------|
| 6.1 | **Chat history sidebar** (conversation list) | HIGH | 2h | — |
|     | - `src/stores/conversations.store.ts` (Zustand, persisted to localStorage) | | | |
|     | - Sidebar list of past conversations with title auto-gen | | | |
|     | - New chat / delete / rename conversation | | | |
|     | - Load conversation messages on click | | | |
| 6.2 | **Settings panel** (temperature, max tokens, system prompt) | HIGH | 1.5h | — |
|     | - Slide-out drawer or dropdown in chat top bar | | | |
|     | - temperature, top_p, max_tokens, system prompt fields | | | |
|     | - Per-conversation or global default | | | |
|     | - Pass settings to gateway request body | | | |
| 6.3 | **File/image upload** (multimodal) | HIGH | 2h | — |
|     | - Drag & drop or click to attach files | | | |
|     | - Convert image to base64 for vision models | | | |
|     | - Show preview thumbnail in input area | | | |
|     | - Send as `image_url` in messages array | | | |
| 6.4 | **WebSocket streaming** (replace SSE fetch) | MEDIUM | 3h | 5.1 |
|     | - `server/ws.ts` — WebSocket server alongside Express | | | |
|     | - Client hook `useWebSocket()` for real-time token streaming | | | |
|     | - Fallback to SSE if WS not available | | | |

---

## PHASE 7: Code Cleanup & Admin Redesign

**Goal**: Hapus legacy code, redesign admin dengan design system baru.

| # | Task | Priority | Est. | Depends On |
|---|------|----------|------|------------|
| 7.1 | **Remove code duplication** | MEDIUM | 1.5h | — |
|     | - Delete old `src/components/TextGenerator.tsx` & `ImageGenerator.tsx` | | | |
|     | - Delete old `src/pages/` (Dashboard, ApiDetails, Pricing, Docs, Login, Register) | | | |
|     | - Delete old `src/context/AuthContext.tsx` & `ThemeContext.tsx` | | | |
|     | - Delete old `src/components/Layout.tsx` & `AdminLayout.tsx` | | | |
|     | - Ensure no imports reference deleted files | | | |
| 7.2 | **Admin Panel Redesign** | MEDIUM | 3h | 5.1, 7.1 |
|     | - Migrate `AdminOverview` → new design system (CSS vars, new UI components) | | | |
|     | - Migrate `AdminApis` → use `Button`, `Badge`, `Modal` from `src/ui/` | | | |
|     | - Migrate `AdminUsers` → new table design | | | |
|     | - Migrate `AdminPlans`, `AdminPaymentMethods`, `AdminTransactions`, `AdminDocs` | | | |
|     | - All admin pages: dark mode via CSS vars, responsive | | | |
| 7.3 | **Delete legacy server.ts** | LOW | 10m | 5.1 |
|     | - Remove `server.ts` (2400-line monolith) | | | |
|     | - Remove `dev:legacy` and `start:legacy` scripts from package.json | | | |

---

## PHASE 8: Testing & Production Readiness

**Goal**: Confidence untuk deploy.

| # | Task | Priority | Est. | Depends On |
|---|------|----------|------|------------|
| 8.1 | **Backend tests** (Jest/Vitest) | LOW | 3h | 5.2 |
|     | - Unit tests for auth.service (hash, JWT) | | | |
|     | - Unit tests for gateway.service (retry, billing calc) | | | |
|     | - Integration tests for key routes (auth, admin CRUD) | | | |
| 8.2 | **Frontend tests** (Vitest + Testing Library) | LOW | 2h | 7.1 |
|     | - Test auth store (login/logout/hydrate) | | | |
|     | - Test useChat hook (send, stream) | | | |
|     | - Test UI components (Button, Modal render) | | | |
| 8.3 | **Service Worker** (PWA offline) | LOW | 1.5h | 7.1 |
|     | - Cache static assets | | | |
|     | - Offline fallback page | | | |
|     | - Register in main.tsx | | | |

---

## URUTAN EKSEKUSI (Recommended)

```
5.1 (CRITICAL — admin auth)
  ↓
5.2 (input validation)  +  5.3 (streaming billing)  +  5.4 (refund fix)
  ↓
6.1 (chat history)  +  6.2 (settings panel)  +  6.3 (file upload)
  ↓
7.1 (remove legacy code)
  ↓
7.2 (admin redesign)  +  7.3 (delete server.ts)
  ↓
6.4 (WebSocket)  — optional upgrade
  ↓
8.1 + 8.2 + 8.3 (tests & PWA) — nice to have
```

---

## CATATAN

- Total estimasi: ~24 jam kerja
- CRITICAL hanya 1 item (5.1 — admin session auth)
- HIGH ada 3 items (6.1, 6.2, 6.3 — chat features)
- Setiap phase bisa di-deploy mandiri
- Phase 8 bisa dilakukan kapan saja setelah Phase 7
