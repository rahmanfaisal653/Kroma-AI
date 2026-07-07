# Kroma AI Gateway

Fullstack AI gateway untuk mengelola akses model AI, billing kredit, admin API catalog, dan fitur RAG/knowledge base.

## Fitur Utama

- AI Gateway dengan autentikasi JWT atau API key eksternal.
- Catalog API/model publik, konfigurasi upstream hanya untuk admin.
- Billing kredit, transaksi, quota, dan usage tracking per user.
- Admin dashboard untuk users, APIs, plans, docs, payment methods, dan transactions.
- RAG endpoint untuk chat berbasis knowledge, generate dari URL, dan ingest dokumen.
- Kroombase REST sebagai database remote.

## Stack

- Frontend: React 19, Vite, TypeScript, Zustand.
- Backend: Express, TypeScript, Helmet, CORS, JWT, bcrypt.
- RAG: Ollama embeddings/chat, ChromaDB vector store, scraper HTML.
- Database: Kroombase REST API.

## Menjalankan Project

```bash
npm install
npm run dev
```

Server berjalan di `http://localhost:3000`. Vite dev/HMR berjalan lewat konfigurasi project.

Production mode:

```bash
npm run build
npm run start
```

## Environment

Buat `.env` berdasarkan kebutuhan deployment. Jangan commit credential.

Variabel penting:

- `KROOMBASE_BASE_URL` - base URL REST Kroombase.
- `KROOMBASE_API_KEY` - API key Kroombase.
- `JWT_SECRET` dan `JWT_REFRESH_SECRET` - secret token auth.
- `FRONTEND_URL` - origin frontend untuk CORS production.
- `OLLAMA_BASE_URL`, `OLLAMA_EMBED_MODEL`, `OLLAMA_CHAT_MODEL` - konfigurasi RAG.
- `CHROMA_URL` dan `CHROMA_COLLECTION` - konfigurasi vector store.
- `DEV_BOOTSTRAP_TOKEN` - token untuk endpoint test/dev saja.
- `ALLOW_PRIVATE_GATEWAY_TARGETS=true` - hanya jika gateway memang perlu proxy ke host private/internal.

## Endpoint Ringkas

- `GET /api/health` - health check.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` - auth.
- `GET /api/user/me`, `GET /api/user/quota`, `GET /api/user/reveal-key` - user profile/key/quota.
- `GET /api/apis`, `GET /api/plans`, `GET /api/docs` - public catalog.
- `GET/POST/PUT/DELETE /api/admin/*` - admin management.
- `POST /api/chat`, `POST /api/rag/generate`, `POST /api/rag/ingest` - RAG.
- Dynamic gateway endpoints mengikuti `endpoint` yang dikonfigurasi di tabel `apis`.

## Testing

Static checks:

```bash
npm run lint
npm run build
```

Integration suite membutuhkan server development aktif dan dev bootstrap token:

```bash
DEV_BOOTSTRAP_TOKEN=... npm run dev
bash .kiro/tests/run-all.sh
```

Catatan: suite integration membuat data test di database remote. Gunakan prefix test dan lakukan cleanup setelah selesai.

## Keamanan Operasional

- `/api/apis` publik tidak mengekspos `target_url` atau `target_auth`.
- `/api/user/me` hanya mengembalikan API key masked; full key hanya lewat `/api/user/reveal-key` atau saat generate key.
- Gateway menolak target private/local secara default untuk mengurangi risiko SSRF.
- Dynamic gateway memakai rate limiter khusus untuk endpoint mahal.
