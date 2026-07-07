# Chat Feature Plan — Kroma AI Gateway

> Last updated: 2026-05-19
> Status: Planning phase

---

## Overview

Rencana pengembangan fitur chat AI yang mencakup 5 tahap, dari basic chat hingga advanced features.
Semua implementasi harus **dinamis**, **tidak hardcode**, dan selalu **refactor** kode existing.

---

## Current State (Pre-Implementation)

### Yang Sudah Berfungsi
- [x] Input chat + textarea
- [x] Bubble user/AI dengan styling
- [x] Kirim ke backend via gateway
- [x] Streaming SSE (token-by-token)
- [x] Conversation list sidebar (zustand + localStorage)
- [x] Delete/rename conversation
- [x] Model selector dropdown
- [x] Markdown renderer (ReactMarkdown + remarkGfm)
- [x] ThinkingBlock untuk Qwen3.5 (thinking vs content separated)
- [x] Server-side stream normalization (Ollama/RAG/OpenAI → unified OpenAI delta)
- [x] Image attachment (base64)
- [x] Settings panel (temperature, max_tokens, system prompt)

### Yang Bermasalah / Belum Ada
- [ ] Loading indicator hanya muncul sebelum assistant message di-push (semua model)
- [ ] Stop generating tidak berfungsi (AbortController tidak di-pass ke fetch)
- [ ] Open chat lama hanya clear messages, tidak load dari store
- [ ] System prompt tidak di-persist per conversation
- [ ] Tidak ada context management (token limit)
- [ ] Auto-title hanya ambil 40 char pertama (bukan AI-generated)
- [ ] Tidak ada regenerate, copy, edit message
- [ ] RAG/document belum terintegrasi di chat UI
- [ ] Tidak ada feedback, memory, analytics, export

---

## Tahap 1 — Basic Chat (Fix & Polish)

### 1.1 Fix Loading State untuk Semua Model
**Problem:** "Thinking..." indicator hanya muncul saat `messages.last.role === 'user'`. Begitu assistant message di-push (content kosong), indicator hilang.

**Solution:**
- Tampilkan animated dots INSIDE assistant bubble saat `content === '' && isLoading`
- Berlaku untuk SEMUA model (bukan hanya Qwen3.5)

**Files:**
- `src/features/chat/ChatPage.tsx` — Render inline loader di assistant bubble
- `src/hooks/useChat.ts` — Tidak perlu perubahan

**Testing:**
```
1. Login sebagai user
2. Pilih model Qwen2.5 → kirim pesan → pastikan ada animasi "thinking" sebelum content muncul
3. Pilih model Qwen3 → kirim pesan → pastikan ada animasi "thinking"
4. Pilih model Qwen3.5 → kirim pesan → pastikan ThinkingBlock muncul (expandable) LALU content muncul
5. Verifikasi: animasi berhenti setelah response selesai
```

---

### 1.2 Fix ThinkingBlock Auto-Expand/Collapse
**Problem:** ThinkingBlock selalu collapsed, user harus klik manual.

**Solution:**
- Auto-expand saat streaming thinking tokens (isStreaming=true)
- Auto-collapse setelah content mulai muncul (opsional, user bisa toggle manual)

**Files:**
- `src/ui/ThinkingBlock.tsx` — Add `defaultExpanded` prop, auto-expand logic

**Testing:**
```
1. Pilih Qwen3.5 → kirim pesan
2. Pastikan ThinkingBlock otomatis expand saat thinking tokens streaming
3. Pastikan setelah content muncul, ThinkingBlock masih bisa di-toggle manual
4. Pastikan ThinkingBlock TIDAK muncul untuk Qwen2.5/Qwen3 (karena tidak ada thinking)
```

---

### 1.3 Error Display + Retry
**Problem:** Error hanya tampil sebagai text bar di bawah, tidak ada tombol retry.

**Solution:**
- Tampilkan error message di dalam assistant bubble
- Tambah tombol "Retry" yang re-send last user message

**Files:**
- `src/features/chat/ChatPage.tsx` — Error bubble + retry button
- `src/hooks/useChat.ts` — Add `retryLast()` method

**Testing:**
```
1. Matikan backend/Ollama server
2. Kirim pesan → pastikan error tampil di bubble (bukan hanya bar)
3. Klik "Retry" → pastikan pesan di-resend
4. Nyalakan kembali server → pastikan retry berhasil
```

---

## Tahap 2 — Streaming (Fix & Enhance)

### 2.1 Fix Stop Generating
**Problem:** `abortRef` ada di useChat tapi tidak di-pass ke `fetch()` sebagai AbortSignal.

**Solution:**
- Buat `AbortController` sebelum fetch
- Pass `signal` ke `fetch()` options di `gatewayApi.chatStream`
- Saat user klik Stop, call `abort()` → stream terhenti

**Files:**
- `src/hooks/useChat.ts` — Create AbortController, pass signal
- `src/services/api.ts` — Accept signal param di `chatStream`

**Testing:**
```
1. Pilih Qwen3.5 (response panjang)
2. Kirim pesan → tunggu thinking mulai streaming
3. Klik "Stop" → pastikan streaming langsung berhenti
4. Pastikan partial content yang sudah diterima tetap tampil
5. Pastikan bisa kirim pesan baru setelah stop
```

---

### 2.2 Stop Button UX
**Problem:** Tombol Stop selalu tampil atau tidak tampil sama sekali.

**Solution:**
- Tampilkan Stop button HANYA saat `isLoading === true`
- Replace Send button dengan Stop button saat streaming
- Animasi transition

**Files:**
- `src/features/chat/ChatPage.tsx` — Conditional render Send vs Stop

**Testing:**
```
1. Verifikasi Send button tampil normal
2. Kirim pesan → Send berubah jadi Stop (animated)
3. Stream selesai → kembali jadi Send
4. Klik Stop → kembali jadi Send
```

---

### 2.3 Streaming Feedback (Token Counter)
**Problem:** User tidak tahu berapa banyak yang sudah di-generate.

**Solution:**
- Tampilkan real-time character/word count di bawah assistant bubble saat streaming
- Hilang setelah streaming selesai, diganti cost info

**Files:**
- `src/features/chat/ChatPage.tsx` — Inline counter component

**Testing:**
```
1. Kirim pesan → pastikan counter muncul (e.g., "142 chars")
2. Counter bertambah real-time saat tokens masuk
3. Setelah stream selesai → counter hilang, tampil "{cost} credits" jika ada
```

---

## Tahap 3 — History (Fix & Complete)

### 3.1 Fix Open Chat Lama
**Problem:** `handleSelectConvo` memanggil `clearMessages()` tapi tidak load messages dari conversation store ke useChat state.

**Solution:**
- Saat select conversation, load `conversation.messages` ke `useChat.setMessages()`
- Map dari conversations store format ke ChatMessage format

**Files:**
- `src/features/chat/ChatPage.tsx` — Fix `handleSelectConvo`
- `src/hooks/useChat.ts` — Expose `setMessages` (sudah ada)

**Testing:**
```
1. Buat conversation baru → kirim beberapa pesan
2. Buat conversation kedua → kirim pesan
3. Klik conversation pertama → pastikan messages MUNCUL (bukan kosong)
4. Klik conversation kedua → pastikan messages berganti
5. Refresh browser → buka conversation → pastikan messages masih ada (localStorage)
```

---

### 3.2 Persist Thinking Content
**Problem:** `addMessage` di conversations store hanya save `{ role, content }` tanpa `thinking`.

**Solution:**
- Saat sync messages ke store, include `thinking` field
- Display thinking saat open old conversation

**Files:**
- `src/features/chat/ChatPage.tsx` — Include thinking in addMessage call
- `src/stores/conversations.store.ts` — Already has thinking in type

**Testing:**
```
1. Chat dengan Qwen3.5 → ada thinking content
2. Buat chat baru
3. Kembali ke chat sebelumnya → pastikan ThinkingBlock masih tampil dengan content
```

---

### 3.3 Bidirectional Sync
**Problem:** Messages di useChat dan conversations store bisa out-of-sync.

**Solution:**
- useChat menjadi single source of truth saat active
- Saat streaming selesai (isLoading → false), full-sync ke store
- Saat switch conversation, load dari store ke useChat

**Files:**
- `src/features/chat/ChatPage.tsx` — Refactor sync logic
- `src/hooks/useChat.ts` — Add `loadMessages(msgs)` method

**Testing:**
```
1. Kirim 3 pesan berturut-turut
2. Switch conversation dan kembali → semua 3 pesan ada
3. Kirim pesan baru → switch → kembali → 4 pesan ada
4. Refresh page → semua conversations intact
```

---

### 3.4 Auto-Scroll Improvement
**Problem:** Auto-scroll paksa ke bawah meskipun user sedang baca atas.

**Solution:**
- Detect jika user scroll ke atas (> 100px dari bottom)
- Jika ya, JANGAN auto-scroll, tampilkan "↓ New messages" button
- Jika di bottom, tetap auto-scroll

**Files:**
- `src/features/chat/ChatPage.tsx` — Scroll detection + floating button

**Testing:**
```
1. Kirim pesan panjang → scroll ke atas saat streaming
2. Pastikan TIDAK di-paksa scroll ke bawah
3. Pastikan "New messages ↓" button muncul
4. Klik button → scroll ke bawah
5. Jika di bottom, pastikan auto-scroll normal
```

---

### 3.5 Conversation Search
**Problem:** Tidak bisa cari conversation lama.

**Solution:**
- Tambah search input di atas conversation list
- Filter by title (client-side, instant)

**Files:**
- `src/features/chat/ChatPage.tsx` — Search input + filter logic

**Testing:**
```
1. Buat 5+ conversations dengan judul berbeda
2. Ketik di search → pastikan list terfilter real-time
3. Hapus search → semua muncul kembali
```

---

## Tahap 4 — Quality (New Features)

### 4.1 System Prompt Persistence
**Problem:** System prompt di settings tidak di-persist per conversation.

**Solution:**
- Save system prompt ke conversation metadata
- Load saat switch conversation
- Global default di user settings

**Files:**
- `src/stores/conversations.store.ts` — Add `systemPrompt` field to Conversation
- `src/features/chat/ChatPage.tsx` — Load/save system prompt per convo

**Testing:**
```
1. Set system prompt "You are a pirate" → kirim pesan → AI jawab sebagai pirate
2. Buat conversation baru → system prompt kosong (default)
3. Kembali ke convo pertama → system prompt masih "pirate"
4. Refresh → masih persistent
```

---

### 4.2 Context Management (Token Windowing)
**Problem:** Semua messages dikirim ke AI tanpa limit → bisa exceed model max_tokens.

**Solution:**
- Hitung estimasi token (chars / 4) per message
- Jika total > model max_tokens * 0.7 → trim oldest messages (keep system + last N)
- Tampilkan "context: 2048/4096 tokens" indicator

**Files:**
- `src/hooks/useChat.ts` — Add token counting + trimming logic
- `src/features/chat/ChatPage.tsx` — Context indicator UI

**Testing:**
```
1. Kirim 20+ pesan pendek dalam satu conversation
2. Perhatikan context indicator bertambah
3. Saat mendekati limit, pastikan pesan lama di-trim dari context (tapi masih tampil di UI)
4. Pastikan AI masih bisa merespons (tidak error context too long)
```

---

### 4.3 Auto-Title with AI
**Problem:** Title hanya 40 char pertama, tidak deskriptif.

**Solution:**
- Setelah response pertama, kirim request ke backend: generate 5-word title
- Endpoint baru: `POST /api/ai/generate-title`
- Fallback: tetap pakai rule-based jika AI gagal

**Files:**
- `server/routes/ai.routes.ts` — NEW: `/api/ai/generate-title`
- `src/features/chat/ChatPage.tsx` — Call after first response
- `src/stores/conversations.store.ts` — Update title async

**Testing:**
```
1. Buat conversation baru → kirim "explain quantum computing"
2. Setelah AI jawab, pastikan title berubah dari "New Chat" ke sesuatu seperti "Quantum Computing Explanation"
3. Jika AI/server down, pastikan fallback ke "explain quantum compu..."
```

---

### 4.4 Regenerate Response
**Problem:** Tidak bisa re-generate jika jawaban AI buruk.

**Solution:**
- Tombol "Regenerate" di bawah setiap assistant message
- Re-send messages sampai message sebelumnya → replace assistant message

**Files:**
- `src/features/chat/ChatPage.tsx` — Regenerate button + handler
- `src/hooks/useChat.ts` — Add `regenerate(messageId)` method

**Testing:**
```
1. Kirim pesan → AI jawab
2. Klik "Regenerate" → jawaban baru muncul (replace yang lama)
3. Pastikan loading state benar saat regenerating
4. Pastikan bisa regenerate berkali-kali
```

---

### 4.5 Copy Message
**Problem:** Tidak bisa copy response AI.

**Solution:**
- Hover message → tampil action buttons (Copy, Regenerate)
- Copy menggunakan `navigator.clipboard.writeText()`
- Feedback: "Copied!" toast/tooltip

**Files:**
- `src/features/chat/ChatPage.tsx` — Action buttons overlay

**Testing:**
```
1. Hover assistant message → tombol Copy muncul
2. Klik Copy → text ter-copy ke clipboard
3. Paste di tempat lain → verifikasi content benar (plain text, bukan markdown)
4. Hover user message → tombol Copy juga muncul
```

---

### 4.6 Code Syntax Highlighting
**Problem:** Code blocks di markdown tidak berwarna.

**Solution:**
- Install `react-syntax-highlighter` atau gunakan `rehype-highlight`
- Custom code block renderer di ReactMarkdown
- Tambah "Copy code" button di code block

**Files:**
- `src/features/chat/ChatPage.tsx` — Custom code component for ReactMarkdown
- `package.json` — Add dependency

**Testing:**
```
1. Minta AI "write a python hello world"
2. Pastikan code block berwarna (syntax highlighted)
3. Pastikan ada "Copy code" button di pojok code block
4. Klik "Copy code" → code ter-copy tanpa line numbers
```

---

### 4.7 Edit User Message
**Problem:** Tidak bisa edit pesan yang sudah dikirim.

**Solution:**
- Klik edit icon di user message → transform ke input
- Submit → remove semua messages setelah edit → regenerate

**Files:**
- `src/features/chat/ChatPage.tsx` — Inline edit mode
- `src/hooks/useChat.ts` — Add `editAndRegenerate(messageId, newContent)` method

**Testing:**
```
1. Kirim "what is 2+2"
2. Klik edit di message tersebut → berubah jadi input
3. Ubah ke "what is 3+3" → submit
4. Pastikan response lama dihapus dan response baru muncul
5. Pastikan history setelah edit juga terhapus
```

---

## Tahap 5 — Advanced

### 5.1 RAG/Document Integration
**Problem:** RAG backend ada tapi belum ada UI untuk upload/ingest/use.

**Solution:**
- Toggle "Use Knowledge Base" di chat settings
- Upload file button → POST `/api/rag/ingest` (admin only)
- Saat toggle ON, messages dikirim ke `/api/chat` (RAG endpoint) instead of gateway

**Dependencies:** ChromaDB harus running

**Files:**
- `src/features/chat/ChatPage.tsx` — Knowledge toggle + file upload UI
- `src/services/api.ts` — Add RAG API methods
- `server/index.ts` — RAG routes sudah ada

**Testing:**
```
1. Upload dokumen via UI (admin) → pastikan ingest berhasil
2. Toggle "Use Knowledge" ON → tanya tentang konten dokumen → jawaban relevan
3. Toggle OFF → tanya hal yang sama → jawaban umum (tanpa konteks)
4. Non-admin user tidak bisa upload tapi bisa toggle knowledge
```

---

### 5.2 Auto-Scrape URL in Chat
**Problem:** User harus manual copy-paste konten website. Jika user kirim link di chat, AI tidak tahu isi halaman tersebut.

**Solution:**
Saat user mengirim pesan yang mengandung URL, sistem otomatis:
1. **Detect URL** dari pesan user (regex `https?://...`)
2. **Scrape** konten halaman via `SCRAPER_API_URL` (sudah di `.env`)
3. **Inject** hasil scrape sebagai context ke system/user message sebelum dikirim ke AI
4. AI menjawab BERDASARKAN konten halaman + pertanyaan user

**Alur Detail:**
```
User: "rangkum isi dari https://example.com/article"
        │
        ▼
[Frontend: useChat.ts]
  1. Detect URL di message content (regex)
  2. Jika ada URL → call POST /api/scrape { url }
  3. Terima { text: "..." } dari server
  4. Kirim ke AI:
     messages: [
       { role: "system", content: "Berikut konten halaman yang di-request user:\n\n{scraped_text}" },
       { role: "user", content: "rangkum isi dari https://example.com/article" }
     ]
        │
        ▼
[Server: /api/scrape]
  1. Validasi URL (whitelist protocol http/https)
  2. Call scrapeAndCleanUrl(SCRAPER_API_URL, targetUrl) — sudah ada di src/rag/scraperService.ts
  3. Return { text, url, chars, truncated }
  4. Fallback: direct fetch jika scraper service down
        │
        ▼
[AI responds based on scraped content]
```

**UX Flow:**
```
User types: "apa isi dari https://example.com/news"
  → Chat shows user message
  → Shows indicator: "🔗 Scraping https://example.com/news..."
  → Scrape selesai → indicator berubah: "✓ Scraped 2,450 chars"
  → AI mulai streaming response berdasarkan konten halaman
  → Scraped content bisa di-expand (collapsible, seperti ThinkingBlock)
```

**Existing Infrastructure:**
- `src/rag/scraperService.ts` — `scrapeAndCleanUrl()` sudah ada, production-ready
- `.env` → `SCRAPER_API_URL=http://localhost:14500/scrape` sudah ada
- Fallback ke direct fetch jika scraper API down (sudah di-handle)

**New Files:**
- `server/routes/scrape.routes.ts` — NEW: `POST /api/scrape` endpoint (protected by requireAuth)
- `server/index.ts` — Register scrape route

**Modified Files:**
- `src/hooks/useChat.ts` — URL detection + pre-scrape before sending to AI
- `src/features/chat/ChatPage.tsx` — Scrape status indicator UI + scraped content preview
- `src/services/api.ts` — Add `scrapeUrl()` API method
- `src/ui/ScrapedContentBlock.tsx` — NEW: Collapsible scraped content display (mirip ThinkingBlock)

**Server Endpoint Spec:**
```typescript
// POST /api/scrape
// Headers: Authorization: Bearer <JWT>
// Body: { url: string }
// Response: {
//   success: boolean,
//   url: string,
//   text: string,        // cleaned plain text
//   chars: number,       // character count
//   truncated: boolean,  // true if text was truncated to fit context
//   error?: string       // only if failed
// }
```

**Context Injection Strategy:**
```
- Max scraped context: 8000 chars (configurable via env MAX_SCRAPE_CONTEXT_CHARS)
- Jika > limit → truncate dengan "...[truncated]" marker
- Inject sebagai system message (bukan user message) agar tidak polusi history
- Cache hasil scrape per URL per session (jangan scrape ulang URL yang sama)
```

**Edge Cases:**
```
- Multiple URLs di satu pesan → scrape semua, gabung context
- URL invalid/unreachable → tampilkan warning tapi tetap kirim pesan tanpa context
- Scraper API down → fallback ke direct fetch (sudah di scraperService.ts)
- URL mengarah ke file bukan HTML (PDF, image) → skip scraping, tampilkan note
- Rate limit: max 5 scrapes per menit per user
```

**Testing:**
```
1. Kirim "rangkum https://id.wikipedia.org/wiki/Indonesia"
   → Pastikan indicator "Scraping..." muncul
   → Pastikan AI merangkum konten halaman tersebut
   → Pastikan scraped content bisa di-expand

2. Kirim pesan tanpa URL → pastikan scraping TIDAK trigger

3. Kirim URL invalid "https://thisdomaindoesnotexist12345.com"
   → Pastikan warning muncul: "Failed to scrape URL"
   → Pastikan AI masih merespons (tanpa context)

4. Kirim pesan dengan 2 URL → pastikan kedua URL di-scrape

5. Kirim URL yang sama 2x → pastikan scrape kedua pakai cache (tidak hit scraper lagi)

6. Matikan scraper API (localhost:14500) → pastikan fallback ke direct fetch

7. Kirim URL ke file PDF → pastikan skip scraping dengan note

8. Scrape 6 URL berturut-turut → pastikan rate limit aktif setelah ke-5
```

---

### 5.3 Model-Specific Settings
**Problem:** Settings (temperature, max_tokens) sama untuk semua model.

**Solution:**
- Simpan default settings per model di database (`apis` table sudah punya `default_temperature`, `max_tokens`)
- Saat switch model, load default settings dari API config
- User bisa override per-conversation

**Files:**
- `src/features/chat/ChatPage.tsx` — Load model defaults on model switch
- `src/hooks/useModels.ts` — Expose model config

**Testing:**
```
1. Select Qwen2.5 → pastikan temperature/max_tokens sesuai DB config
2. Override temperature ke 0.9
3. Switch ke Qwen3.5 → pastikan kembali ke default Qwen3.5
4. Switch balik ke Qwen2.5 → pastikan override 0.9 masih ada (per-convo)
```

---

### 5.4 Feedback (Thumbs Up/Down)
**Problem:** Tidak ada cara rate kualitas response.

**Solution:**
- New Kroombase table: `feedback` (id, user_id, conversation_id, message_index, rating, comment, created_at)
- Thumbs up/down button per assistant message
- Admin dashboard: view feedback analytics

**Dependencies:** Kroombase (new table)

**Files:**
- `server/routes/feedback.routes.ts` — NEW: CRUD for feedback
- `src/features/chat/ChatPage.tsx` — Feedback buttons
- Admin page — feedback overview

**Testing:**
```
1. Klik thumbs up di response → rating tersimpan
2. Klik thumbs down → rating berubah
3. Admin panel → lihat feedback statistics
4. User tidak bisa lihat feedback user lain
```

---

### 5.5 Memory (Cross-Conversation)
**Problem:** AI tidak ingat preferensi user dari chat sebelumnya.

**Solution:**
- New Kroombase table: `memories` (id, user_id, fact, category, created_at)
- Setelah conversation selesai, extract key facts → save ke memories
- Inject relevant memories ke system prompt di setiap chat baru
- Manual memory management UI

**Dependencies:** Kroombase (new table), opsional ChromaDB untuk vector search memories

**Files:**
- `server/routes/memory.routes.ts` — NEW: CRUD + auto-extract
- `src/hooks/useChat.ts` — Inject memories to system prompt
- `src/features/settings/MemoryPage.tsx` — NEW: Manage memories

**Testing:**
```
1. Chat: "my name is Faisal, I prefer Indonesian language"
2. Buka conversation baru → chat: "what's my name?"
3. AI harus jawab "Faisal" (dari memory)
4. Buka Memory page → pastikan fact "name is Faisal" tersimpan
5. Delete memory → buat chat baru → AI tidak ingat lagi
```

---

### 5.6 Analytics
**Problem:** Tidak ada insight penggunaan.

**Solution:**
- Dashboard page: credits used per day/week, messages count, model usage distribution
- Data dari existing `transactions` table + message count dari localStorage

**Files:**
- `src/features/analytics/AnalyticsPage.tsx` — NEW: Charts + stats
- `src/services/api.ts` — Fetch transactions for user

**Testing:**
```
1. Chat beberapa kali dengan berbagai model
2. Buka Analytics page → pastikan chart credits/day benar
3. Pastikan breakdown per-model terlihat
4. Admin bisa lihat all-user analytics
```

---

### 5.7 Export Chat
**Problem:** Tidak bisa export conversation.

**Solution:**
- Export button di conversation header
- Format options: Markdown, JSON, Plain Text
- Download sebagai file

**Files:**
- `src/features/chat/ChatPage.tsx` — Export button + format selector
- `src/utils/exportChat.ts` — NEW: Format converters

**Testing:**
```
1. Buat conversation dengan beberapa messages
2. Klik Export → pilih Markdown → file .md terdownload
3. Buka file → pastikan format benar (# role, content)
4. Export JSON → pastikan structure valid
5. Export Plain Text → pastikan readable
```

---

## Execution Phases

### Phase A — Critical Bug Fixes (Highest Priority)
```
1.1 → 1.2 → 2.1 → 3.1
```
Estimated: 4 tasks, fokus fix UX dasar

### Phase B — Core Quality  
```
3.2 → 3.3 → 4.4 → 4.5 → 4.6
```
Estimated: 5 tasks, user experience improvement

### Phase C — Enhanced UX
```
2.2 → 2.3 → 3.4 → 3.5 → 4.1 → 4.2 → 4.3 → 4.7
```
Estimated: 8 tasks, polish + smart features

### Phase D — Advanced Features
```
5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7
```
Estimated: 7 tasks, new capabilities (butuh Kroombase tables baru + scraper integration)

---

## Testing Checklist (End-to-End)

### Pre-Testing Setup
```bash
# 1. Pastikan server running
npx tsx server/index.ts

# 2. Pastikan Ollama running dengan model
curl http://localhost:11434/api/tags

# 3. Pastikan ChromaDB accessible (untuk RAG)
curl http://localhost:8000/api/v1/heartbeat

# 4. Pastikan Scraper API running
curl http://localhost:14500/health

# 5. Login sebagai admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"password"}'
```

### Per-Model Regression Test
```
Untuk setiap model (Qwen2.5, Qwen3, Qwen3.5):
[ ] Kirim simple math question → response benar & bersih (bukan JSON)
[ ] Kirim long question → streaming terlihat bertahap
[ ] Stop mid-stream → content partial tersimpan
[ ] Thinking indicator tampil (Qwen3.5: ThinkingBlock, others: loading dots)
[ ] Response rendered sebagai Markdown (bold, code, lists)
[ ] Copy message works
[ ] Conversation tersimpan di sidebar
[ ] Switch conversation → messages reload
[ ] Refresh browser → conversations persistent
```

### URL Scraping Test (setelah 5.2 implemented)
```
[ ] Kirim pesan dengan URL → scrape otomatis + AI jawab berdasarkan konten
[ ] Kirim pesan tanpa URL → tidak ada scraping
[ ] URL unreachable → warning + AI tetap jawab
[ ] Multiple URLs → semua di-scrape
[ ] Scraper API down → fallback ke direct fetch
[ ] Scraped content tampil collapsible di chat
```

### Security Regression Test
```
[ ] Unauthenticated request ke /ai/chat → 401
[ ] Invalid JWT → 401
[ ] Expired JWT → 401 (refresh flow)
[ ] Rate limiting active
[ ] No raw error stack in response (production)
```

---

## Architecture Principles

1. **Tidak ada hardcode** — Semua config dari DB/env/settings
2. **Dinamis** — Model detection, response format, UI rendering
3. **Refactor always** — Setiap perubahan harus improve existing code
4. **Type-safe** — TypeScript strict, no `any` tanpa justifikasi
5. **Separation of concerns** — Hook logic vs UI logic vs service logic
6. **Progressive enhancement** — Fitur baru tidak break fitur lama
