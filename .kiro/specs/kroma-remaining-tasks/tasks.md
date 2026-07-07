# Implementation Plan: Kroma AI Gateway — Remaining Tasks (5.1–7.3)

## Overview

This plan converts the design for Phases 5–7 into discrete, incremental coding tasks. Each task builds on the previous ones. Tasks are ordered by dependency: security fixes first (5.1 is a blocker for admin pages), then chat features, then cleanup.

## Tasks

- [ ] 1. Implement session-based admin authentication (5.1)
  - Add `requireRole(role: string)` middleware factory to `server/middleware/admin.middleware.ts`; remove the old `requireAdmin` export
  - Update `server/index.ts` to replace all `requireAdmin` usages with `requireAuth, requireRole('admin')` on every admin route
  - Update `server/types/express.d.ts` to ensure `req.user` includes a `role` field
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [ ]* 1.1 Write property test for requireRole middleware
    - **Property 1: Admin role enforcement is consistent**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Generate random role strings using fast-check; verify requireRole('admin') calls next() only when role === 'admin' and returns 403 otherwise

  - [ ] 1.2 Update adminApi in src/services/api.ts to remove x-admin-key
    - Remove `getAdminHeaders`, remove all `adminKey` parameters from every `adminApi` method
    - Remove `{ headers: { 'x-admin-key': adminKey } }` from all HTTP calls in `adminApi`
    - The JWT is already sent automatically by the axios interceptor in `src/services/http.ts`
    - _Requirements: 1.4_

  - [ ] 1.3 Update all admin pages to remove getAdminKey() calls
    - Remove `adminKey` state, `getAdminKey()` calls, and key prompt UI from all files in `src/pages/admin/`
    - Update all `adminApi.*()` call sites to drop the `adminKey` argument
    - _Requirements: 1.5_

- [ ] 2. Checkpoint — Ensure admin auth compiles and routes respond correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement Zod input validation (5.2)
  - Create `server/schemas/index.ts` with Zod schemas: `loginSchema`, `registerSchema`, `modelCreateSchema`, `modelUpdateSchema`, `buyCreditsSchema`, `transactionCreateSchema`, `transactionActionSchema`
  - Create `server/middleware/validate.middleware.ts` with the `validate(schema)` factory function
  - _Requirements: 2.1, 2.4_

  - [ ]* 3.1 Write property test for validate middleware
    - **Property 2: Validation rejects all invalid inputs**
    - **Validates: Requirements 2.2, 2.3**
    - Use fast-check to generate objects that violate each schema (wrong types, missing required fields); verify all get 400 and none get 2xx; also generate valid objects and verify next() is called

  - [ ] 3.2 Apply validate middleware to all POST and PUT routes
    - `server/routes/auth.routes.ts`: apply `validate(loginSchema)` to POST /login, `validate(registerSchema)` to POST /register
    - `server/routes/billing.routes.ts`: apply `validate(buyCreditsSchema)` to POST /buy-credits, `validate(transactionCreateSchema)` to POST /transactions
    - `server/routes/admin/models.routes.ts`: apply `validate(modelCreateSchema)` to POST, `validate(modelUpdateSchema)` to PUT
    - `server/routes/admin/transactions.routes.ts`: apply `validate(transactionActionSchema)` to PUT confirm/reject
    - _Requirements: 2.5_

- [ ] 4. Fix per-token streaming billing (5.3)
  - In `server/routes/gateway.routes.ts`, update the streaming handler inside `dynamicProxyController` to accumulate `streamedChars` from each SSE delta chunk
  - After the stream `end` event, calculate `streamedTokens = Math.ceil(streamedChars / 4)` and `tokenCost = Math.round((streamedTokens / 1000) * (Number(api.price_output) || 0))`
  - Call `putUserUsage(req.user.id, currentUsageCount + tokenCost)` after stream ends
  - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.1 Write property test for streaming token cost calculation
    - **Property 3: Streaming token cost is proportional to streamed content**
    - **Validates: Requirements 3.1, 3.2**
    - Extract the token cost calculation into a pure helper function `calculateStreamCost(chars: number, priceOutput: number): number`; use fast-check to generate random char counts and price values; verify `result === Math.round((Math.ceil(chars / 4) / 1000) * priceOutput)`

- [ ] 5. Fix refund logic for 4xx and timeout errors (5.4)
  - In `server/routes/gateway.routes.ts`, update the `targetResponse.status >= 400` block to only skip the refund when `targetResponse.status === 400`
  - Verify the existing `catch` block for network errors (ECONNABORTED, ECONNREFUSED) already calls `refundUsageSafely` — add it if missing
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.1 Write property test for refund logic
    - **Property 4: Refund is issued for all non-user-caused failures**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Extract refund decision into a pure function `shouldRefund(statusCode: number): boolean`; use fast-check to generate random status codes; verify shouldRefund returns true for all codes ≥ 401 and for network errors, and false for 400

- [ ] 6. Checkpoint — Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create conversations store (6.1 — part 1)
  - Create `src/stores/conversations.store.ts` using Zustand with the `persist` middleware (localStorage key: `kroma_conversations`)
  - Implement actions: `createConversation(modelId)`, `setActive(id)`, `addMessage(id, message)`, `updateTitle(id, title)`, `deleteConversation(id)`, `updateSettings(id, settings)`, `getActive()`
  - Auto-generate title from `message.slice(0, 40)` when `addMessage` is called on a conversation with no messages yet
  - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [ ]* 7.1 Write property test for conversation store persistence round-trip
    - **Property 5: Conversation persistence round-trip**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate random conversation objects; store them via the store; read back from localStorage; verify structural equality of id, title, modelId, messages, and settings

  - [ ]* 7.2 Write property test for title auto-generation
    - **Property: Title is first 40 chars of first message**
    - **Validates: Requirements 5.2**
    - Use fast-check to generate random strings of varying lengths; call addMessage with each; verify title equals `message.slice(0, 40)`

  - [ ]* 7.3 Write property test for conversation message preservation on switch
    - **Property: Switching conversations preserves all messages**
    - **Validates: Requirements 5.8**
    - Generate multiple conversations with random messages; switch active conversation; verify all conversations retain their original messages

- [ ] 8. Integrate conversation sidebar into ChatPage (6.1 — part 2)
  - Update `ChatPage.tsx` to render a left sidebar listing conversations from `useConversationsStore`
  - Add "New Chat" button: on click, call `createConversation(activeModel.id)` and `setActive(newId)` only on success, then clear the message area
  - Add rename (inline edit on double-click) and delete (trash icon) per conversation item
  - On conversation click, call `setActive(id)` and load that conversation's messages into the `useChat` hook state — do NOT clear messages of other conversations
  - _Requirements: 5.3, 5.4, 5.6, 5.7, 5.8_

- [ ] 9. Implement chat settings panel (6.2)
  - Create `src/features/chat/ChatSettings.tsx` — a slide-out drawer with controls for temperature (0–2), top_p (0–1), max_tokens (1–8192), and system prompt (textarea)
  - Add a settings icon button to the ChatPage top bar that toggles the drawer
  - On settings change, call `updateSettings(activeId, newSettings)` in `useConversationsStore`
  - Update `useChat` hook to accept a `settings` parameter and merge it into the request body (temperature, top_p, max_tokens, system prompt as a system message)
  - Implement fallback chain: per-conversation settings → global defaults → hardcoded values (temperature: 0.7, top_p: 1.0, max_tokens: 2048, systemPrompt: "")
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.1 Write property test for settings always defined in request body
    - **Property 6: Settings fallback chain is complete**
    - **Validates: Requirements 6.5**
    - Use fast-check to generate optional settings objects (some fields undefined, some null, some valid); verify that the merged request body always has defined numeric values for temperature, top_p, and max_tokens

- [ ] 10. Implement file/image upload (6.3)
  - Add a hidden `<input type="file" accept="image/*">` and a paperclip icon button to the ChatPage input area
  - Add drag-and-drop handlers (`onDragOver`, `onDrop`) to the input container
  - On file selection, use `FileReader.readAsDataURL()` to convert to base64; store as `{ name, dataUrl }` in component state; show thumbnail preview
  - Reject non-image MIME types with an inline error message
  - On send, if an image is attached, construct the message content as an array: `[{ type: 'text', text: input }, { type: 'image_url', image_url: { url: dataUrl } }]`
  - Clear the attached image from state after the message is sent
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Checkpoint — Ensure all chat feature tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Remove legacy code (7.1)
  - Search for all imports of the files to be deleted using grep/TypeScript diagnostics before deleting
  - Delete: `src/components/TextGenerator.tsx`, `src/components/ImageGenerator.tsx`
  - Delete: `src/components/Layout.tsx`, `src/components/AdminLayout.tsx`
  - Delete: `src/context/AuthContext.tsx`, `src/context/ThemeContext.tsx`
  - Delete: `src/pages/Dashboard.tsx`, `src/pages/ApiDetails.tsx`, `src/pages/Pricing.tsx`, `src/pages/Docs.tsx`, `src/pages/Login.tsx`, `src/pages/Register.tsx`
  - Run `tsc --noEmit` to verify no TypeScript errors reference deleted files
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 13. Redesign admin pages to use the new design system (7.2)
  - For each admin page in `src/pages/admin/` (AdminOverview, AdminApis, AdminUsers, AdminPlans, AdminPaymentMethods, AdminTransactions, AdminDocs):
    - Replace hardcoded Tailwind color classes (`bg-white`, `text-slate-*`, `border-slate-*`) with CSS custom properties (`var(--color-surface)`, `var(--color-text)`, `var(--color-border)`, etc.)
    - Replace inline `<button>` elements with `<Button>` from `src/ui/Button.tsx`
    - Replace status labels with `<Badge>` from `src/ui/Badge.tsx`
    - Replace confirmation dialogs with `<Modal>` from `src/ui/Modal.tsx`
    - Replace direct `axios.get(...)` calls with `adminApi.*()` methods (no adminKey argument)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 14. Delete legacy server.ts and remove legacy npm scripts (7.3)
  - Delete `server.ts` from the project root
  - Remove `dev:legacy` and `start:legacy` entries from the `scripts` section of `package.json`
  - Verify the application starts correctly with `npm run dev` (uses `server/index.ts`)
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 15. Final checkpoint — Ensure all tests pass and application starts
  - Run `tsc --noEmit` to verify zero TypeScript errors
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4", "5"] },
    { "wave": 4, "tasks": ["6"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["9"] },
    { "wave": 8, "tasks": ["10"] },
    { "wave": 9, "tasks": ["11"] },
    { "wave": 10, "tasks": ["12"] },
    { "wave": 11, "tasks": ["13"] },
    { "wave": 12, "tasks": ["14"] },
    { "wave": 13, "tasks": ["15"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster implementation pass
- Task 1 (admin auth) must be completed before Task 13 (admin redesign) since the redesign depends on the updated `adminApi` signatures
- Task 12 (legacy deletion) must be completed before Task 13 (admin redesign) to avoid importing deleted files
- The `fast-check` package must be installed as a dev dependency before running property tests: `npm install --save-dev fast-check`
- Property tests reference design document properties by number (e.g., Property 1, Property 2, etc.)
- Each property test should be tagged: `// Feature: kroma-remaining-tasks, Property N: <property_text>`
