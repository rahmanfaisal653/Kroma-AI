# Requirements Document

## Introduction

This document covers the remaining implementation tasks for the Kroma AI Gateway project, spanning three phases: Security & Billing Fixes (Phase 5), Chat Advanced Features (Phase 6), and Code Cleanup (Phase 7). The goal is to close security holes, improve billing accuracy, add advanced chat capabilities, and remove legacy code to leave the codebase clean and maintainable.

## Glossary

- **Admin_Middleware**: The Express middleware at `server/middleware/admin.middleware.ts` that guards admin routes
- **Auth_Store**: The Zustand store at `src/stores/auth.store.ts` that holds the authenticated user's JWT and profile
- **Admin_API**: The `adminApi` object in `src/services/api.ts` that makes HTTP calls to admin endpoints
- **Admin_Pages**: The React pages under `src/pages/admin/` (AdminOverview, AdminApis, AdminUsers, AdminPlans, AdminPaymentMethods, AdminTransactions, AdminDocs)
- **Gateway_Service**: The server-side service at `server/services/gateway.service.ts` that proxies AI requests and handles billing
- **Conversations_Store**: A new Zustand store at `src/stores/conversations.store.ts` that persists chat history to localStorage
- **Chat_Settings**: Per-conversation or global parameters: temperature, top_p, max_tokens, and system prompt
- **Design_System**: The set of CSS custom properties (`var(--color-*)`) and shared UI components in `src/ui/` (Button, Badge, Modal, Input, Select)
- **SSE**: Server-Sent Events — the current streaming mechanism used by the gateway
- **Zod**: A TypeScript-first schema validation library used for request body validation
- **Vision_Model**: An AI model that accepts image inputs alongside text in the messages array

---

## Requirements

### Requirement 1: Session-Based Admin Authentication

**User Story:** As a system administrator, I want admin routes to be protected by my JWT session role instead of a shared secret key, so that admin access is tied to authenticated user identity and the x-admin-key header is eliminated.

#### Acceptance Criteria

1. THE Admin_Middleware SHALL verify the authenticated user's JWT role equals `admin` using a dedicated `requireRole('admin')` middleware function instead of comparing an `x-admin-key` header value
2. WHEN an authenticated user with role `admin` accesses an admin route, THE Admin_Middleware SHALL allow the request to proceed
3. WHEN an unauthenticated request or a request from a non-admin user reaches an admin route, THE Admin_Middleware SHALL return a 403 Forbidden response with no 2xx status code
4. THE Admin_API SHALL send the JWT Bearer token from Auth_Store in the `Authorization` header for all admin requests instead of an `x-admin-key` header
5. THE Admin_Pages SHALL read the authenticated user's token from Auth_Store and SHALL NOT prompt the user to enter an admin key
6. WHEN the server registers admin routes in `server/index.ts`, THE Server SHALL apply `requireAuth` as the first middleware and `requireRole('admin')` as the second middleware in sequence, instead of `requireAdmin`

### Requirement 2: Input Validation with Zod

**User Story:** As a backend developer, I want all POST and PUT API endpoints to validate their request bodies against defined schemas, so that malformed or malicious input is rejected before reaching business logic.

#### Acceptance Criteria

1. THE Server SHALL have a `validate` middleware at `server/middleware/validate.middleware.ts` that accepts a Zod schema and returns an Express middleware function
2. WHEN a request body fails schema validation, THE Validate_Middleware SHALL return a 400 Bad Request response with a descriptive error message listing the validation failures and SHALL NOT return any 2xx status code
3. WHEN a request body passes schema validation, THE Validate_Middleware SHALL call `next()` to continue request processing
4. THE Server SHALL define Zod schemas for: auth login, auth register, model create/update, billing buy-credits, and transaction create/confirm/reject
5. THE Server SHALL apply the `validate` middleware to all POST and PUT routes that accept a request body

### Requirement 3: Per-Token Streaming Billing

**User Story:** As a platform operator, I want streaming AI responses to be billed based on the actual tokens streamed rather than a flat rate, so that billing accurately reflects resource consumption.

#### Acceptance Criteria

1. WHEN the Gateway_Service handles a streaming SSE response, THE Gateway_Service SHALL count tokens from each SSE chunk using a character-based estimate (characters divided by 4)
2. WHEN a streaming response completes, THE Gateway_Service SHALL calculate the total token cost from the accumulated token count and the model's price configuration
3. THE Gateway_Service SHALL update the user's usage count based on the token-derived cost after the stream completes
4. WHEN a streaming request is aborted before completion, THE Gateway_Service SHALL bill only for the tokens received up to the point of abort

### Requirement 4: Refund Logic Fix

**User Story:** As a platform operator, I want users to be refunded credits when upstream AI requests fail due to server-side or network errors, so that users are not charged for failed requests they did not cause.

#### Acceptance Criteria

1. WHEN an upstream AI request returns a 5xx HTTP status code, THE Gateway_Service SHALL refund the pre-charged usage cost to the user
2. WHEN an upstream AI request returns a 4xx HTTP status code that is not a user-caused error (i.e., status codes 401, 402, 403, 404, 429, 500–599 from the upstream provider), THE Gateway_Service SHALL refund the pre-charged usage cost to the user
3. WHEN an upstream AI request times out or is aborted by the network, THE Gateway_Service SHALL refund the pre-charged usage cost to the user
4. WHEN an upstream AI request returns a 400 Bad Request caused by invalid user input, THE Gateway_Service SHALL NOT refund the usage cost

### Requirement 5: Chat History Sidebar

**User Story:** As a user, I want a sidebar that lists my past conversations so that I can switch between them, start new ones, rename them, and delete them without losing context.

#### Acceptance Criteria

1. THE Conversations_Store SHALL persist a list of conversations to localStorage, where each conversation has an id, title, model id, and array of messages
2. WHEN a user sends the first message in a new conversation, THE Conversations_Store SHALL auto-generate a title from the first 40 characters of that message
3. WHEN a user clicks a conversation in the sidebar, THE ChatPage SHALL load that conversation's messages and model selection
4. WHEN a user clicks "New Chat" and the new conversation is successfully created, THE ChatPage SHALL display a new empty conversation and clear the message area
5. WHEN a user renames a conversation, THE Conversations_Store SHALL update the conversation's title and persist the change to localStorage
6. WHEN a user deletes a conversation, THE Conversations_Store SHALL remove it from the list and persist the change to localStorage
7. THE ChatPage SHALL display the conversation sidebar alongside the message area
8. WHILE switching between existing conversations, THE ChatPage SHALL NOT clear the message area of the conversation being switched away from

### Requirement 6: Chat Settings Panel

**User Story:** As a user, I want a settings panel in the chat interface where I can configure model parameters, so that I can control the AI's behavior for each conversation.

#### Acceptance Criteria

1. THE ChatPage SHALL include a settings panel accessible via a button in the top bar
2. THE Settings_Panel SHALL expose controls for: temperature (0–2), top_p (0–1), max_tokens (integer), and system prompt (text)
3. WHEN a user changes a setting, THE Settings_Panel SHALL persist the value to the active conversation in Conversations_Store
4. WHEN a chat request is sent, THE ChatPage SHALL include the active conversation's settings in the gateway request body
5. WHERE no per-conversation settings are configured, THE ChatPage SHALL use global default values for all parameters; WHERE global defaults are unavailable or invalid, THE ChatPage SHALL use hardcoded fallback values within valid parameter ranges

### Requirement 7: File and Image Upload (Multimodal)

**User Story:** As a user, I want to attach images to my chat messages so that I can use vision-capable AI models to analyze or describe them.

#### Acceptance Criteria

1. THE ChatPage input area SHALL support attaching image files via drag-and-drop or a file picker button
2. WHEN an image file is attached, THE ChatPage SHALL convert it to a base64 data URL and display a thumbnail preview in the input area
3. WHEN a message with an attached image is sent, THE ChatPage SHALL include the image as an `image_url` content part in the messages array sent to the gateway
4. IF a non-image file type is attached, THEN THE ChatPage SHALL display an error and reject the attachment
5. WHEN the message is sent, THE ChatPage SHALL clear the attached image from the input area

### Requirement 8: Remove Code Duplication

**User Story:** As a developer, I want legacy components and pages that have been superseded by the new feature-based architecture to be deleted, so that the codebase has no dead code or conflicting implementations.

#### Acceptance Criteria

1. THE Codebase SHALL NOT contain `src/components/TextGenerator.tsx` or `src/components/ImageGenerator.tsx`
2. THE Codebase SHALL NOT contain the legacy pages: `src/pages/Dashboard.tsx`, `src/pages/ApiDetails.tsx`, `src/pages/Pricing.tsx`, `src/pages/Docs.tsx`, `src/pages/Login.tsx`, or `src/pages/Register.tsx`
3. THE Codebase SHALL NOT contain `src/context/AuthContext.tsx` or `src/context/ThemeContext.tsx`
4. THE Codebase SHALL NOT contain `src/components/Layout.tsx` or `src/components/AdminLayout.tsx`
5. WHEN the legacy files are deleted, THE Application SHALL compile without TypeScript errors referencing the deleted files; WHERE a legacy file does not cause TypeScript errors, THE Developer MAY choose to delete it as part of this cleanup

### Requirement 9: Admin Panel Redesign

**User Story:** As an administrator, I want all admin pages to use the new design system with CSS custom properties and shared UI components, so that the admin panel has a consistent look, supports dark mode, and no longer depends on the removed x-admin-key mechanism.

#### Acceptance Criteria

1. THE Admin_Pages SHALL use CSS custom properties (`var(--color-*)`) for all colors instead of hardcoded Tailwind color classes
2. THE Admin_Pages SHALL use `Button`, `Badge`, and `Modal` components from `src/ui/` instead of inline button and modal implementations
3. THE Admin_Pages SHALL fetch data using `adminApi` from `src/services/api.ts` with JWT authentication (as updated in Requirement 1) and SHALL NOT call `getAdminKey()` or pass an admin key parameter once JWT authentication is implemented
4. WHEN the system is in dark mode, THE Admin_Pages SHALL render correctly using CSS custom property values without additional dark-mode-specific class overrides
5. THE Admin_Pages SHALL be responsive and render correctly on both desktop and mobile viewports

### Requirement 10: Delete Legacy Server

**User Story:** As a developer, I want the legacy monolithic `server.ts` file and its associated npm scripts removed, so that there is a single, canonical server entry point.

#### Acceptance Criteria

1. THE Codebase SHALL NOT contain the file `server.ts` at the project root
2. THE `package.json` SHALL NOT contain the `dev:legacy` script
3. THE `package.json` SHALL NOT contain the `start:legacy` script
4. WHEN the legacy server file is deleted, THE Application SHALL start correctly using only `server/index.ts`
