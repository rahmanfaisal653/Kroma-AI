# Kroma AI Gateway - Comprehensive Test Plan

## Test Strategy
- **Cyclomatic Complexity Focus**: Test semua jalur independen (happy path + error paths + edge cases)
- **State Transition Testing**: Auth state, theme state, conversation state
- **Persistence Testing**: LocalStorage, session recovery after reload/restart
- **Integration Testing**: FE ↔ BE sync, API calls, error handling

---

## 1. AUTHENTICATION FLOW (CC: 8 paths)

### 1.1 Register Flow
- [ ] **R1**: Register dengan valid email/password → success → lihat API key → redirect ke /chat
- [ ] **R2**: Register dengan email yang sudah ada → error message
- [ ] **R3**: Register dengan password < 6 char → validation error
- [ ] **R4**: Register dengan password mismatch → validation error
- [ ] **R5**: Register lalu refresh halaman → session persist, tetap login

### 1.2 Login Flow
- [ ] **L1**: Login dengan valid credentials → redirect sesuai role (user→/chat, admin→/admin)
- [ ] **L2**: Login dengan wrong password → error message
- [ ] **L3**: Login dengan non-existent email → error message
- [ ] **L4**: Login lalu refresh → session persist
- [ ] **L5**: Login sebagai admin → akses /admin → success
- [ ] **L6**: Login sebagai user → akses /admin → redirect ke /chat

### 1.3 Logout Flow
- [ ] **O1**: Logout → redirect ke /login, clear session
- [ ] **O2**: Logout lalu klik back button → tidak bisa akses protected route
- [ ] **O3**: Logout saat di /admin → redirect ke /login

---

## 2. CHAT FUNCTIONALITY (CC: 12 paths)

### 2.1 Send Message
- [ ] **C1**: Send message ke model yang active → success, response muncul
- [ ] **C2**: Send message ke model inactive → error message
- [ ] **C3**: Send message tanpa target_url → error "No valid target_url"
- [ ] **C4**: Send empty message → button disabled, tidak terkirim
- [ ] **C5**: Send message lalu retry setelah error → message terkirim ulang

### 2.2 Conversation Management
- [ ] **C6**: New chat → conversation baru terbuat
- [ ] **C7**: Multiple conversations → list di sidebar
- [ ] **C8**: Click conversation → load history
- [ ] **C9**: Delete conversation → hilang dari list
- [ ] **C10**: Rename conversation → title berubah
- [ ] **C11**: Search conversation → filter results
- [ ] **C12**: Conversation persist setelah logout/login

---

## 3. THEME & UI (CC: 4 paths)

- [ ] **T1**: Toggle dark/light mode di sidebar → semua halaman berubah
- [ ] **T2**: Toggle di settings page → same result
- [ ] **T3**: Theme persist setelah reload
- [ ] **T4**: Theme persist setelah logout/login

---

## 4. USER PAGES (CC: 10 paths)

### 4.1 Models Page
- [ ] **M1**: View all models → list tampil
- [ ] **M2**: Filter by category (Text/Image/Video/Audio) → filter bekerja
- [ ] **M3**: Search models → filter by name
- [ ] **M4**: Click model → detail page

### 4.2 API Keys Page
- [ ] **K1**: View API key (masked) → tampil
- [ ] **K2**: Reveal key → unmasked
- [ ] **K3**: Copy key → clipboard
- [ ] **K4**: Regenerate key → key baru, old key invalid

### 4.3 Billing Page
- [ ] **B1**: View balance → tampil
- [ ] **B2**: View plans → list tampil
- [ ] **B3**: Click plan → purchase flow (if implemented)
- [ ] **B4**: View transaction history → list tampil

### 4.4 Images Page
- [ ] **I1**: Select image model → dropdown bekerja
- [ ] **I2**: Enter prompt → input bekerja
- [ ] **I3**: Generate image → (if model configured)

---

## 5. ADMIN PAGES (CC: 15 paths)

### 5.1 AI Models Management
- [ ] **A1**: View all APIs → table tampil
- [ ] **A2**: Add new API → form terbuka, save success
- [ ] **A3**: Edit API → form terisi, update success
- [ ] **A4**: Toggle API status (active/inactive) → status berubah
- [ ] **A5**: Delete API → confirmation, deleted
- [ ] **A6**: Test connection → success/fail message
- [ ] **A7**: Configure Universal settings → save success

### 5.2 Users Management
- [ ] **A8**: View all users → table tampil
- [ ] **A9**: Edit user role → role berubah
- [ ] **A10**: Edit user quota → quota berubah
- [ ] **A11**: Delete user → confirmation, deleted
- [ ] **A12**: View user API key → masked/unmasked

### 5.3 Transactions Management
- [ ] **A13**: View all transactions → table tampil
- [ ] **A14**: Filter by status → filter bekerja
- [ ] **A15**: Confirm pending transaction → status berubah, user dapat credits
- [ ] **A16**: Reject transaction → status berubah, user tidak dapat credits

---

## 6. PERSISTENCE & RECOVERY (CC: 6 paths)

- [ ] **P1**: Reload halaman → state persist (auth, theme, conversation)
- [ ] **P2**: Restart dev server → session masih valid
- [ ] **P3**: Clear localStorage → redirect ke login
- [ ] **P4**: Network error → graceful error message
- [ ] **P5**: API timeout → retry or error message
- [ ] **P6**: Concurrent login dari 2 tab → sync behavior

---

## 7. EDGE CASES (CC: 5 paths)

- [ ] **E1**: Access protected route tanpa login → redirect ke /login
- [ ] **E2**: Access /admin sebagai user → redirect ke /chat
- [ ] **E3**: Access /chat sebagai admin → redirect ke /admin
- [ ] **E4**: Direct URL ke /chat/:modelId dengan invalid model → error handling
- [ ] **E5**: Very long message input → input validation/truncation

---

## Execution Priority
1. **Critical**: Auth flow (R1, L1, O1), Chat send (C1, C3), Admin model config (A3, A7)
2. **High**: Persistence (P1, P2), Theme (T1, T3), Conversation (C6, C8)
3. **Medium**: User pages (M1, K1, B1), Admin CRUD (A2, A8, A13)
4. **Low**: Edge cases (E1-E5), Filter/search (M2, M3)

---

## Test Environment
- **URL**: http://localhost:3000
- **Test User**: test@example.com / test123456 (role: admin)
- **Browser**: Automated browser with vision analysis
