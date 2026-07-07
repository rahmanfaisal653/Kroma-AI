# KROMA AI GATEWAY — OVERHAUL PLAN

> Dokumen ini adalah master plan untuk merombak total codebase sambil mempertahankan tujuan awal web.

---

## PEMAHAMAN SISTEM AWAL

### Tujuan Awal Web
Kroma adalah **AI Gateway** — platform terpusat dimana:
1. **Admin** mendaftarkan berbagai AI service (text, image, video, audio) dan mengkontrol semuanya dari panel
2. **User** bisa:
   - Chat/generate langsung di web (playground)
   - Mengambil API key untuk dipakai di aplikasi mereka sendiri
   - Membeli credits untuk mengakses AI services

### Alur Kerja Saat Ini
```
User Register → Login → Dashboard (lihat AI services) → Pilih AI → Playground / Ambil API Key
                                                       → Beli Credits di Pricing
Admin Login → Panel Admin → Kelola AI APIs, Users, Plans, Payment Methods, Transactions, Docs
```

### Arsitektur Saat Ini
- **Frontend**: React 19 + Vite + TailwindCSS v4 + Lucide + Framer Motion
- **Backend**: Express.js monolith (`server.ts` ~2400 baris)
- **Database**: Kroombase (REST-based external DB)
- **AI Proxy**: Gateway meneruskan request user ke AI backend yang dikonfigurasi admin
- **RAG**: ChromaDB + Ollama untuk knowledge base
- **Auth**: Plain text password (NO hashing)

### Masalah Utama Yang Teridentifikasi
- 30 masalah (6 critical security, 8 high, 9 medium, 7 low)
- Monolith server.ts tidak modular
- Duplikasi code massive di frontend
- Memory leaks di backend
- Security holes (plain password, exposed admin key, open debug endpoints)
- UI tidak konsisten antara light/dark mode
- Tidak ada session management yang proper

---

## KONSEP BARU (TERINSPIRASI OpenWebUI)

### Visi UI Baru
- **Sidebar-based layout** (seperti OpenWebUI/ChatGPT) — bukan header navigation
- **Chat-first experience** — playground sebagai halaman utama
- **Model switcher** — user bisa ganti AI model dari dropdown
- **Clean, minimal UI** — warna netral, focus pada content
- **API Key management terintegrasi** — setiap AI punya section untuk ambil API key
- **Responsive** — mobile sidebar collapsible

### Fitur yang Dipertahankan
- [x] Multi-AI support (text, image, video, audio) — semua dikontrol admin
- [x] Credit-based billing system
- [x] API key per user untuk external access
- [x] Admin panel lengkap (APIs, Users, Plans, Payments, Transactions)
- [x] RAG/Knowledge base ingestion
- [x] Dynamic — semua AI configurable dari admin panel

### Fitur Baru yang Ditambahkan
- [ ] Password hashing (bcrypt)
- [ ] JWT-based auth dengan refresh token
- [ ] Proper session management dengan expiry
- [ ] Rate limiting
- [ ] Modular backend architecture
- [ ] Shared hooks & utilities di frontend
- [ ] Proper dark/light theme (CSS variables, bukan class* selectors)
- [ ] Memory-safe caching (LRU/TTL)
- [ ] Accurate token billing untuk streaming
- [ ] WebSocket untuk real-time chat streaming

---

## PHASE PLAN

### PHASE 1: Foundation & Security (Backend Refactor)
**Goal**: Backend modular, aman, dan efisien.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1.1 | Split `server.ts` menjadi modular structure | HIGH | ⬜ |
|     | - `src/server/index.ts` (app entry) | | |
|     | - `src/server/config.ts` (env & constants) | | |
|     | - `src/server/middleware/auth.ts` | | |
|     | - `src/server/middleware/adminGuard.ts` | | |
|     | - `src/server/middleware/rateLimiter.ts` | | |
|     | - `src/server/routes/auth.routes.ts` | | |
|     | - `src/server/routes/api.routes.ts` | | |
|     | - `src/server/routes/admin.routes.ts` | | |
|     | - `src/server/routes/gateway.routes.ts` | | |
|     | - `src/server/services/db.service.ts` (Kroombase client) | | |
|     | - `src/server/services/billing.service.ts` | | |
|     | - `src/server/services/gateway.service.ts` | | |
|     | - `src/server/services/async-job.service.ts` | | |
|     | - `src/server/utils/cache.ts` (LRU with TTL) | | |
|     | - `src/server/utils/crypto.ts` (bcrypt helpers) | | |
| 1.2 | Implement bcrypt password hashing | CRITICAL | ⬜ |
| 1.3 | JWT auth with access + refresh tokens | CRITICAL | ⬜ |
| 1.4 | Protect reveal-key with auth middleware | CRITICAL | ⬜ |
| 1.5 | Remove admin key from frontend (session-based admin) | CRITICAL | ⬜ |
| 1.6 | Remove/protect debug endpoints | CRITICAL | ⬜ |
| 1.7 | Add rate limiting middleware | HIGH | ⬜ |
| 1.8 | Replace in-memory Maps with LRU cache (TTL auto-evict) | HIGH | ⬜ |
| 1.9 | Fix billing: per-token streaming billing | MEDIUM | ⬜ |
| 1.10 | Fix refund logic (4xx should also refund) | MEDIUM | ⬜ |
| 1.11 | Add input validation (zod/joi) for all endpoints | MEDIUM | ⬜ |

### PHASE 2: Frontend Architecture (Clean Foundation)
**Goal**: Modular, reusable, dan consistent.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 2.1 | Setup new folder structure | HIGH | ⬜ |
|     | - `src/hooks/` (shared custom hooks) | | |
|     | - `src/services/` (API client layer) | | |
|     | - `src/types/` (shared TypeScript interfaces) | | |
|     | - `src/stores/` (state management) | | |
|     | - `src/layouts/` (layout components) | | |
|     | - `src/features/` (feature-based modules) | | |
|     | - `src/ui/` (reusable UI primitives) | | |
| 2.2 | Create shared TypeScript types | HIGH | ⬜ |
|     | - `types/api.ts`, `types/user.ts`, `types/billing.ts` | | |
| 2.3 | Create API service layer (single axios instance with interceptors) | HIGH | ⬜ |
|     | - Auto-attach JWT token | | |
|     | - Auto-refresh on 401 | | |
|     | - Error normalization | | |
| 2.4 | Create shared hooks | HIGH | ⬜ |
|     | - `useApiKey()` — key management logic | | |
|     | - `useAsyncJob()` — polling logic | | |
|     | - `useQuota()` — quota/usage tracking | | |
|     | - `useChat()` — chat message management | | |
|     | - `useModels()` — available AI models | | |
| 2.5 | Create reusable UI components | HIGH | ⬜ |
|     | - `Button`, `Input`, `Select`, `Modal`, `Drawer` | | |
|     | - `Toast`, `Badge`, `Avatar`, `Tooltip` | | |
|     | - `Sidebar`, `SidebarItem` | | |
| 2.6 | Implement proper theme system (CSS variables) | MEDIUM | ⬜ |
|     | - Replace all `theme === 'dark' ? ... : ...` patterns | | |
|     | - Use `:root` and `[data-theme="dark"]` CSS vars | | |
| 2.7 | Remove all code duplication | MEDIUM | ⬜ |
|     | - Merge TextGenerator & ImageGenerator shared logic | | |
|     | - Consolidate admin key helpers | | |
|     | - Consolidate form patterns (InputField, etc.) | | |

### PHASE 3: New UI & Routes (OpenWebUI-inspired)
**Goal**: UI bersih, modern, chat-first experience.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 3.1 | **New User Layout** — Sidebar-based | HIGH | ⬜ |
|     | ```                                    | | |
|     | ┌─────────┬──────────────────────────┐ | | |
|     | │ Sidebar │  Main Content Area       │ | | |
|     | │         │                          │ | | |
|     | │ [Models]│  Chat / Playground       │ | | |
|     | │ [Chats] │                          │ | | |
|     | │ [Keys]  │                          │ | | |
|     | │ [Docs]  │                          │ | | |
|     | │         │                          │ | | |
|     | │─────────│──────────────────────────│ | | |
|     | │ [User]  │  Input Area              │ | | |
|     | │ [Theme] │                          │ | | |
|     | └─────────┴──────────────────────────┘ | | |
|     | ```                                    | | |
| 3.2 | **New Route Structure (User)** | HIGH | ⬜ |
|     | - `/` → Redirect to `/chat` | | |
|     | - `/chat` → Chat playground (default AI) | | |
|     | - `/chat/:modelId` → Chat with specific AI model | | |
|     | - `/images` → Image generation playground | | |
|     | - `/images/:modelId` → Image gen with specific model | | |
|     | - `/models` → Browse all available AI models | | |
|     | - `/models/:id` → Model details + API docs | | |
|     | - `/keys` → API Key management | | |
|     | - `/billing` → Credits, plans, transactions | | |
|     | - `/docs` → API Documentation | | |
|     | - `/settings` → User settings, profile | | |
| 3.3 | **New Route Structure (Admin)** | HIGH | ⬜ |
|     | - `/admin` → Overview dashboard | | |
|     | - `/admin/models` → AI model management | | |
|     | - `/admin/users` → User management | | |
|     | - `/admin/billing/plans` → Pricing plans | | |
|     | - `/admin/billing/methods` → Payment methods | | |
|     | - `/admin/billing/transactions` → Transaction review | | |
|     | - `/admin/docs` → Documentation management | | |
|     | - `/admin/settings` → System settings | | |
| 3.4 | **Chat Page** (main feature) | HIGH | ⬜ |
|     | - Model selector dropdown di top | | |
|     | - Chat history sidebar (conversation list) | | |
|     | - Message bubbles with markdown rendering | | |
|     | - Streaming indicator | | |
|     | - File/image upload untuk multimodal | | |
|     | - Settings panel (temperature, etc.) | | |
| 3.5 | **Image Generation Page** | HIGH | ⬜ |
|     | - Gallery view of generated images | | |
|     | - Prompt input with advanced settings | | |
|     | - Model selector (multiple image AIs) | | |
|     | - Download & share functionality | | |
| 3.6 | **Models Page** (API marketplace) | MEDIUM | ⬜ |
|     | - Card grid of all available AIs | | |
|     | - Filter by type (text/image/video/audio) | | |
|     | - Each card shows: name, type, price, status | | |
|     | - Click → model detail + playground + API docs | | |
| 3.7 | **API Keys Page** | MEDIUM | ⬜ |
|     | - Generate/revoke API keys | | |
|     | - Usage stats per key | | |
|     | - Copy-friendly display | | |
|     | - Rate limit info | | |
| 3.8 | **Billing Page** | MEDIUM | ⬜ |
|     | - Current balance display | | |
|     | - Purchase credits (plans) | | |
|     | - Transaction history | | |
|     | - Usage breakdown by model | | |
| 3.9 | **Auth Pages** (Login/Register) | MEDIUM | ⬜ |
|     | - Clean minimal design | | |
|     | - Consistent with new UI system | | |
| 3.10 | **Admin Panel Overhaul** | MEDIUM | ⬜ |
|      | - Consistent with new design system | | |
|      | - Dark mode support via CSS variables | | |
|      | - Responsive mobile layout | | |

### PHASE 4: Performance & Polish
**Goal**: Production-ready, performant.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 4.1 | Lazy loading routes (React.lazy + Suspense) | MEDIUM | ⬜ |
| 4.2 | Optimize bundle size (code splitting) | MEDIUM | ⬜ |
| 4.3 | Add error boundaries | MEDIUM | ⬜ |
| 4.4 | Add loading skeletons (not just spinners) | LOW | ⬜ |
| 4.5 | Service worker for offline capability | LOW | ⬜ |
| 4.6 | Add proper logging (pino/winston) on backend | MEDIUM | ⬜ |
| 4.7 | Health check endpoint | LOW | ⬜ |
| 4.8 | Database connection pooling/retry | MEDIUM | ⬜ |
| 4.9 | Add comprehensive error handling | MEDIUM | ⬜ |
| 4.10 | Write tests (vitest for frontend, jest for backend) | LOW | ⬜ |

---

## FOLDER STRUCTURE (TARGET)

```
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env
├── .env.example
│
├── server/                          ← Backend (modular)
│   ├── index.ts                     ← Entry point
│   ├── app.ts                       ← Express app setup
│   ├── config.ts                    ← Environment & constants
│   ├── middleware/
│   │   ├── auth.middleware.ts       ← JWT verification
│   │   ├── admin.middleware.ts      ← Admin role guard
│   │   ├── rateLimiter.middleware.ts
│   │   └── validate.middleware.ts   ← Request validation (zod)
│   ├── routes/
│   │   ├── auth.routes.ts           ← Login, Register, Refresh
│   │   ├── user.routes.ts           ← User profile, keys
│   │   ├── models.routes.ts         ← Public API listing
│   │   ├── billing.routes.ts        ← Plans, transactions
│   │   ├── gateway.routes.ts        ← AI proxy gateway
│   │   ├── rag.routes.ts            ← RAG ingestion/chat
│   │   └── admin/
│   │       ├── models.routes.ts
│   │       ├── users.routes.ts
│   │       ├── plans.routes.ts
│   │       ├── payments.routes.ts
│   │       ├── transactions.routes.ts
│   │       └── docs.routes.ts
│   ├── services/
│   │   ├── db.service.ts            ← Kroombase REST client
│   │   ├── auth.service.ts          ← Password hashing, JWT
│   │   ├── billing.service.ts       ← Credit deduction/refund
│   │   ├── gateway.service.ts       ← AI proxy logic
│   │   ├── asyncJob.service.ts      ← Job queue management
│   │   └── cache.service.ts         ← LRU cache with TTL
│   ├── utils/
│   │   ├── errors.ts                ← Custom error classes
│   │   ├── logger.ts                ← Structured logging
│   │   └── validators.ts            ← Zod schemas
│   └── types/
│       └── index.ts                 ← Server-side types
│
├── src/                             ← Frontend (modular)
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                    ← CSS variables for theming
│   │
│   ├── types/                       ← Shared TypeScript types
│   │   ├── api.ts
│   │   ├── user.ts
│   │   ├── billing.ts
│   │   └── chat.ts
│   │
│   ├── services/                    ← API client layer
│   │   ├── http.ts                  ← Axios instance + interceptors
│   │   ├── auth.service.ts
│   │   ├── models.service.ts
│   │   ├── billing.service.ts
│   │   ├── chat.service.ts
│   │   └── admin.service.ts
│   │
│   ├── hooks/                       ← Shared hooks
│   │   ├── useAuth.ts
│   │   ├── useTheme.ts
│   │   ├── useChat.ts
│   │   ├── useModels.ts
│   │   ├── useApiKey.ts
│   │   ├── useAsyncJob.ts
│   │   ├── useQuota.ts
│   │   └── useToast.ts
│   │
│   ├── stores/                      ← State management (zustand/context)
│   │   ├── auth.store.ts
│   │   ├── theme.store.ts
│   │   └── chat.store.ts
│   │
│   ├── ui/                          ← Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Modal.tsx
│   │   ├── Drawer.tsx
│   │   ├── Toast.tsx
│   │   ├── Badge.tsx
│   │   ├── Avatar.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Skeleton.tsx
│   │   └── index.ts                 ← Barrel export
│   │
│   ├── layouts/                     ← Layout components
│   │   ├── AppLayout.tsx            ← Sidebar + main area
│   │   ├── AdminLayout.tsx
│   │   └── AuthLayout.tsx           ← Login/Register wrapper
│   │
│   ├── features/                    ← Feature modules
│   │   ├── chat/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── ChatSidebar.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   └── ChatSettings.tsx
│   │   ├── images/
│   │   │   ├── ImagesPage.tsx
│   │   │   ├── ImageGallery.tsx
│   │   │   ├── ImagePrompt.tsx
│   │   │   └── ImageSettings.tsx
│   │   ├── models/
│   │   │   ├── ModelsPage.tsx
│   │   │   ├── ModelCard.tsx
│   │   │   └── ModelDetail.tsx
│   │   ├── keys/
│   │   │   ├── KeysPage.tsx
│   │   │   └── KeyCard.tsx
│   │   ├── billing/
│   │   │   ├── BillingPage.tsx
│   │   │   ├── PlanCard.tsx
│   │   │   ├── PaymentModal.tsx
│   │   │   └── TransactionList.tsx
│   │   ├── docs/
│   │   │   ├── DocsPage.tsx
│   │   │   └── CodeBlock.tsx
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   └── admin/
│   │       ├── overview/
│   │       ├── models/
│   │       ├── users/
│   │       ├── billing/
│   │       └── docs/
│   │
│   └── lib/
│       └── utils.ts                 ← cn() helper etc.
```

---

## TECH STACK (UPDATED)

| Layer | Current | New |
|-------|---------|-----|
| Frontend Framework | React 19 | React 19 (keep) |
| Build Tool | Vite 6 | Vite 6 (keep) |
| Styling | TailwindCSS v4 + inline conditions | TailwindCSS v4 + CSS Variables |
| State | Context API | Zustand (lightweight) |
| Icons | Lucide | Lucide (keep) |
| Animation | Framer Motion | Framer Motion (keep) |
| HTTP Client | Axios (raw) | Axios + service layer |
| Backend | Express monolith | Express modular |
| Auth | Plain text + localStorage | bcrypt + JWT + httpOnly cookies |
| Validation | None | Zod |
| Caching | `new Map()` | LRU cache with TTL |
| Logging | `console.log` | Pino |
| New deps | - | zustand, zod, bcryptjs, jsonwebtoken, pino |

---

## EXECUTION ORDER

```
PHASE 1 (Backend) ──────────────────────────────────────────────
  Step 1: Create modular folder structure
  Step 2: Extract config & types
  Step 3: Create DB service (Kroombase client wrapper)
  Step 4: Implement auth service (bcrypt + JWT)
  Step 5: Create middleware (auth, admin, rate limit, validate)
  Step 6: Extract routes one by one from server.ts
  Step 7: Extract services (billing, gateway, async jobs)
  Step 8: Implement LRU cache
  Step 9: Remove debug endpoints / protect them
  Step 10: Test all endpoints work correctly

PHASE 2 (Frontend Foundation) ──────────────────────────────────
  Step 1: Create types, services, hooks folders
  Step 2: Implement HTTP service layer with interceptors
  Step 3: Create shared types
  Step 4: Create UI primitives (Button, Input, Modal, etc.)
  Step 5: Implement CSS variable theme system
  Step 6: Create shared hooks (useChat, useModels, etc.)
  Step 7: Setup zustand stores (auth, theme, chat)

PHASE 3 (New UI) ───────────────────────────────────────────────
  Step 1: Create new layouts (AppLayout with sidebar)
  Step 2: Build Chat feature module
  Step 3: Build Image generation feature module
  Step 4: Build Models browsing feature
  Step 5: Build API Keys page
  Step 6: Build Billing page
  Step 7: Build Auth pages (Login/Register)
  Step 8: Build Admin panel
  Step 9: Setup new routes in App.tsx
  Step 10: Remove old components

PHASE 4 (Polish) ───────────────────────────────────────────────
  Step 1: Add lazy loading & code splitting
  Step 2: Add error boundaries
  Step 3: Add loading skeletons
  Step 4: Performance audit & optimization
  Step 5: Final cleanup & documentation
```

---

## DESIGN SYSTEM (UI GUIDELINES)

### Colors (CSS Variables)
```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --sidebar-bg: #f8fafc;
  --sidebar-active: #ede9fe;
}

[data-theme="dark"] {
  --bg-primary: #0f0f14;
  --bg-secondary: #1a1a24;
  --bg-tertiary: #24242e;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: #2e2e3a;
  --accent: #818cf8;
  --accent-hover: #6366f1;
  --sidebar-bg: #12121a;
  --sidebar-active: #1e1b4b;
}
```

### Typography
- Font: Inter (system fallback)
- Headings: font-semibold, tracking-tight
- Body: text-sm (14px), text-secondary
- Monospace: JetBrains Mono / system-mono

### Component Style
- Border radius: rounded-xl (12px) for cards, rounded-lg (8px) for inputs
- Shadows: minimal, only on elevated elements
- Borders: 1px solid var(--border)
- Spacing: consistent 4px grid (p-4, gap-4, etc.)

---

## CATATAN PENTING

1. **JANGAN** hapus data/logic bisnis yang sudah benar — hanya refactor struktur
2. **SELALU** backward-compatible dengan Kroombase DB schema
3. **ADMIN** harus tetap bisa menambah/edit/hapus AI services secara dinamis
4. **USER** flow tidak boleh terputus — register → login → use AI → buy credits
5. Setiap phase harus bisa di-deploy mandiri (tidak blocking)
6. Test manual setelah setiap major step sebelum lanjut

---

## MULAI DARI MANA?

Kita mulai dari **PHASE 1 Step 1** — membuat folder structure backend modular. Ini foundation yang harus ada dulu sebelum yang lain.

Konfirmasi dari user diperlukan sebelum eksekusi dimulai.
