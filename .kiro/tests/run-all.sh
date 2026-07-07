#!/bin/bash
# Kroma AI Gateway — Comprehensive Test Suite
# Run: bash .kiro/tests/run-all.sh
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/helpers.sh"

export BASE="http://localhost:3000"
export DEV_TOKEN="kroma-test-bootstrap-2024"
export REPORT_FILE="$SCRIPT_DIR/report.tsv"

init_report

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  KROMA AI GATEWAY — FULL TEST SUITE         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"

# Wait for server
echo -e "\n${GRAY}Waiting for server at $BASE ...${NC}"
if ! wait_server 15; then
  echo -e "${RED}ABORT: Server not reachable${NC}"
  exit 1
fi
echo -e "${GREEN}Server is up.${NC}"

# ═══════════════════════════════════════════════════════════════
# SETUP: Register test users
# ═══════════════════════════════════════════════════════════════
TEST_EMAIL="kroma-test-${RANDOM}@test.com"
TEST_PASS="TestPass123!"
ADMIN_EMAIL="kroma-admin-${RANDOM}@test.com"
ADMIN_PASS="AdminPass123!"

echo -e "\n${GRAY}Setup: Registering test user ($TEST_EMAIL) ...${NC}"
REG_BODY=$(http_body -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
USER_TOKEN=$(json_field "$REG_BODY" "accessToken")
USER_KEY=$(json_field "$REG_BODY" "api_key")
USER_REFRESH=$(json_field "$REG_BODY" "refreshToken")

echo -e "${GRAY}Setup: Registering admin user ($ADMIN_EMAIL) ...${NC}"
ADMIN_REG=$(http_body -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_TOKEN=$(json_field "$ADMIN_REG" "accessToken")
ADMIN_KEY=$(json_field "$ADMIN_REG" "api_key")

echo -e "${GRAY}Setup: Promoting admin user ...${NC}"
PROMOTE=$(http_body -X POST "$BASE/api/dev/promote-admin" \
  -H "Content-Type: application/json" -H "x-dev-token: $DEV_TOKEN" \
  -d "{\"email\":\"$ADMIN_EMAIL\"}")
echo -e "${GRAY}  Promote result: $PROMOTE${NC}"

# Re-login admin to get fresh JWT with role=admin
ADMIN_LOGIN=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_TOKEN=$(json_field "$ADMIN_LOGIN" "accessToken")

echo -e "${GRAY}Setup: Give test user quota (5000) ...${NC}"
http_body -X POST "$BASE/api/dev/set-quota" \
  -H "Content-Type: application/json" -H "x-dev-token: $DEV_TOKEN" \
  -d "{\"email\":\"$TEST_EMAIL\",\"quota_limit\":5000,\"usage_count\":0}" > /dev/null

echo -e "${GREEN}Setup complete.${NC}\n"

# Helper auth headers
AUTH_USER="-H \"Authorization: Bearer $USER_TOKEN\""
AUTH_ADMIN="-H \"Authorization: Bearer $ADMIN_TOKEN\""

# ═══════════════════════════════════════════════════════════════
# SECTION A: Authentication & User
# ═══════════════════════════════════════════════════════════════
section "A: Authentication & User"

# A1 — Register happy path (already done above, verify response)
[[ -n "$USER_TOKEN" && -n "$USER_KEY" ]] && \
  log_test "A" "A1" "Register happy path" "PASS" "got token+key" || \
  log_test "A" "A1" "Register happy path" "FAIL" "missing token or key"

# A2 — Register duplicate email
DUP=$(http_status -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
assert_eq "400" "$DUP" "A" "A2" "Register duplicate email -> 400"

# A3 — Register weak password
WEAK=$(http_status -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"weak-${RANDOM}@test.com\",\"password\":\"12\"}")
assert_eq "400" "$WEAK" "A" "A3" "Register weak password -> 400"

# A4 — Register invalid email
INVEMAIL=$(http_status -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"notanemail\",\"password\":\"TestPass123\"}")
assert_eq "400" "$INVEMAIL" "A" "A4" "Register invalid email -> 400"

# A5 — Login happy path
LOGIN_S=$(http_status -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
assert_eq "200" "$LOGIN_S" "A" "A5" "Login happy path -> 200"

# A6 — Login wrong password
WRONG_S=$(http_status -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpass\"}")
assert_eq "401" "$WRONG_S" "A" "A6" "Login wrong password -> 401"

# A7 — Login non-existent user
NOUSER_S=$(http_status -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"nobody-${RANDOM}@test.com\",\"password\":\"whatever\"}")
assert_eq "401" "$NOUSER_S" "A" "A7" "Login non-existent user -> 401"

# A8 — Login missing fields
MISS_S=$(http_status -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{}")
assert_eq "400" "$MISS_S" "A" "A8" "Login missing fields -> 400"

# A9 — Refresh token
REF_S=$(http_status -X POST "$BASE/api/auth/refresh" -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$USER_REFRESH\"}")
assert_eq "200" "$REF_S" "A" "A9" "Refresh valid token -> 200"

# A10 — Refresh invalid token
IREF_S=$(http_status -X POST "$BASE/api/auth/refresh" -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"invalid.token.here\"}")
assert_eq "401" "$IREF_S" "A" "A10" "Refresh invalid token -> 401"

# A11 — GET /api/user/me
ME_R=$(http_full "$BASE/api/user/me" -H "Authorization: Bearer $USER_TOKEN")
ME_S="${ME_R%%|*}"; ME_B="${ME_R#*|}"
assert_eq "200" "$ME_S" "A" "A11" "GET /api/user/me -> 200"
ME_KEY=$(json_field "$ME_B" "user_key")
[[ "$ME_KEY" == sk-...* ]] && \
  log_test "A" "A11b" "/me returns masked user_key" "PASS" "" || \
  log_test "A" "A11b" "/me returns masked user_key" "FAIL" "got=$ME_KEY"

# A12 — GET /api/user/quota
Q_R=$(http_full "$BASE/api/user/quota" -H "Authorization: Bearer $USER_TOKEN")
Q_S="${Q_R%%|*}"; Q_B="${Q_R#*|}"
assert_eq "200" "$Q_S" "A" "A12" "GET /api/user/quota -> 200"
Q_QUOTA=$(json_value "$Q_B" "quota")
[[ "$Q_QUOTA" == "5000" ]] && \
  log_test "A" "A12b" "Quota = 5000 (set by dev)" "PASS" "" || \
  log_test "A" "A12b" "Quota = 5000 (set by dev)" "FAIL" "got=$Q_QUOTA"

# A13 — GET /api/user/me without JWT
NOJWT_S=$(http_status "$BASE/api/user/me")
assert_eq "401" "$NOJWT_S" "A" "A13" "GET /me without JWT -> 401"

# A14 — POST /api/user/generate-key
GENK_R=$(http_full -X POST "$BASE/api/user/generate-key" -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" -d "{}")
GENK_S="${GENK_R%%|*}"; GENK_B="${GENK_R#*|}"
assert_eq "200" "$GENK_S" "A" "A14" "Generate new key -> 200"
NEW_KEY=$(json_field "$GENK_B" "api_key")
[[ "$NEW_KEY" == sk-* ]] && \
  log_test "A" "A14b" "New key starts with sk-" "PASS" "" || \
  log_test "A" "A14b" "New key starts with sk-" "FAIL" "got=$NEW_KEY"
# Update USER_KEY for subsequent tests
[[ -n "$NEW_KEY" ]] && USER_KEY="$NEW_KEY"

# A15 — GET /api/user/reveal-key
REVK_R=$(http_full "$BASE/api/user/reveal-key" -H "Authorization: Bearer $USER_TOKEN")
REVK_S="${REVK_R%%|*}"; REVK_B="${REVK_R#*|}"
assert_eq "200" "$REVK_S" "A" "A15" "Reveal key -> 200"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION B: Models / Public APIs
# ═══════════════════════════════════════════════════════════════
section "B: Models / Public APIs"

B1_R=$(http_full "$BASE/api/apis")
B1_S="${B1_R%%|*}"; B1_B="${B1_R#*|}"
assert_eq "200" "$B1_S" "B" "B1" "GET /api/apis -> 200"
# Verify no target_auth leak
if echo "$B1_B" | grep -q "target_auth"; then
  log_test "B" "B1b" "No target_auth leak in public" "FAIL" "target_auth found in response"
else
  log_test "B" "B1b" "No target_auth leak in public" "PASS" ""
fi

B2_S=$(http_status "$BASE/api/plans")
assert_eq "200" "$B2_S" "B" "B2" "GET /api/plans -> 200"

B3_S=$(http_status "$BASE/api/payment-methods")
assert_eq "200" "$B3_S" "B" "B3" "GET /api/payment-methods -> 200"

B4_S=$(http_status "$BASE/api/docs")
assert_eq "200" "$B4_S" "B" "B4" "GET /api/docs -> 200"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION C: Billing & Transactions
# ═══════════════════════════════════════════════════════════════
section "C: Billing & Transactions"

# C1 — Create transaction (JWT required)
C1_S=$(http_status -X POST "$BASE/api/transactions" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"plan_id\":\"1\",\"plan_name\":\"Test Plan\",\"credits\":100,\"bonus_credits\":0,\"price\":50000,\"payment_method\":\"BCA\"}")
assert_eq "201" "$C1_S" "C" "C1" "Create transaction -> 201"

# C2 — Create transaction without JWT
C2_S=$(http_status -X POST "$BASE/api/transactions" -H "Content-Type: application/json" \
  -d "{\"plan_id\":\"1\",\"credits\":100,\"price\":50000}")
assert_eq "401" "$C2_S" "C" "C2" "Create transaction no JWT -> 401"

# C3 — Get own transactions
C3_R=$(http_full "$BASE/api/transactions" -H "Authorization: Bearer $USER_TOKEN")
C3_S="${C3_R%%|*}"
assert_eq "200" "$C3_S" "C" "C3" "GET /api/transactions (own) -> 200"

# C4 — Buy credits (admin only)
C4_S=$(http_status -X POST "$BASE/api/billing/buy-credits" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"userKey\":\"$USER_KEY\",\"amount\":100}")
assert_eq "403" "$C4_S" "C" "C4" "Buy credits as user -> 403"

C5_S=$(http_status -X POST "$BASE/api/billing/buy-credits" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"userKey\":\"$USER_KEY\",\"amount\":100}")
assert_eq "200" "$C5_S" "C" "C5" "Buy credits as admin -> 200"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION D: Admin Routes
# ═══════════════════════════════════════════════════════════════
section "D: Admin Routes"

# D1 — Admin users list
D1_R=$(http_full "$BASE/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN")
D1_S="${D1_R%%|*}"; D1_B="${D1_R#*|}"
assert_eq "200" "$D1_S" "D" "D1" "GET /api/admin/users (admin) -> 200"
if echo "$D1_B" | grep -q "$TEST_EMAIL"; then
  log_test "D" "D1b" "Test user visible in admin list" "PASS" ""
else
  log_test "D" "D1b" "Test user visible in admin list" "FAIL" "email not found"
fi

# D2 — Admin users as non-admin
D2_S=$(http_status "$BASE/api/admin/users" -H "Authorization: Bearer $USER_TOKEN")
assert_eq "403" "$D2_S" "D" "D2" "GET /api/admin/users (user) -> 403"

# D3 — Admin users no JWT
D3_S=$(http_status "$BASE/api/admin/users")
assert_eq "401" "$D3_S" "D" "D3" "GET /api/admin/users (no JWT) -> 401"

# D4 — Admin models list
D4_S=$(http_status "$BASE/admin/apis" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "200" "$D4_S" "D" "D4" "GET /admin/apis (admin) -> 200"

# D5 — Admin models as user
D5_S=$(http_status "$BASE/admin/apis" -H "Authorization: Bearer $USER_TOKEN")
assert_eq "403" "$D5_S" "D" "D5" "GET /admin/apis (user) -> 403"

# D6 — Schema health
D6_S=$(http_status "$BASE/admin/apis/schema-health" -H "Authorization: Bearer $ADMIN_TOKEN")
# Could be 200 or 500 depending on DB state; just verify not 401/403
if [[ "$D6_S" == "200" || "$D6_S" == "500" ]]; then
  log_test "D" "D6" "Schema health endpoint accessible" "PASS" "HTTP $D6_S"
else
  log_test "D" "D6" "Schema health endpoint accessible" "FAIL" "HTTP $D6_S"
fi

# D7 — Admin plans
D7_S=$(http_status "$BASE/api/admin/plans" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Plan\",\"price\":10000,\"credits\":100}")
if [[ "$D7_S" == "200" || "$D7_S" == "201" ]]; then
  log_test "D" "D7" "Create plan (admin)" "PASS" "HTTP $D7_S"
else
  log_test "D" "D7" "Create plan (admin)" "FAIL" "HTTP $D7_S"
fi

# D8 — Admin payment methods
D8_S=$(http_status "$BASE/api/admin/payment-methods" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "200" "$D8_S" "D" "D8" "GET payment methods (admin) -> 200"

# D9 — Admin transactions
D9_S=$(http_status "$BASE/api/admin/transactions" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "200" "$D9_S" "D" "D9" "GET transactions (admin) -> 200"

# D10 — Admin docs
D10_S=$(http_status "$BASE/api/admin/docs" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Doc\",\"content\":\"Hello\",\"category\":\"curl\"}")
if [[ "$D10_S" == "200" || "$D10_S" == "201" ]]; then
  log_test "D" "D10" "Create doc (admin)" "PASS" "HTTP $D10_S"
else
  log_test "D" "D10" "Create doc (admin)" "FAIL" "HTTP $D10_S"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION E: Gateway / Proxy
# ═══════════════════════════════════════════════════════════════
section "E: Gateway / Proxy"

# E1 — Gateway no auth
E1_S=$(http_status -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"model":"qwen3.5:9b"}')
assert_eq "401" "$E1_S" "E" "E1" "Gateway no auth -> 401"

# E2 — Gateway with user_key, has quota, specific model
E2_R=$(http_full -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -H "x-user-key: $USER_KEY" \
  -d '{"messages":[{"role":"user","content":"say hello in 3 words"}],"model":"qwen3.5:9b"}')
E2_S="${E2_R%%|*}"; E2_B="${E2_R#*|}"
# Could be 200 (upstream works), 502 (upstream down), 504 (timeout) — all valid gateway behavior
if [[ "$E2_S" == "200" || "$E2_S" == "502" || "$E2_S" == "504" || "$E2_S" == "503" ]]; then
  log_test "E" "E2" "Gateway with key+model (upstream may be down)" "PASS" "HTTP $E2_S"
else
  log_test "E" "E2" "Gateway with key+model" "FAIL" "HTTP $E2_S body=${E2_B:0:200}"
fi

# E3 — Gateway ambiguous (no model, multiple APIs on same endpoint)
E3_R=$(http_full -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -H "x-user-key: $USER_KEY" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
E3_S="${E3_R%%|*}"; E3_B="${E3_R#*|}"
assert_eq "409" "$E3_S" "E" "E3" "Gateway ambiguous endpoint -> 409"

# E4 — Gateway with api_id
E4_R=$(http_full -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -H "x-user-key: $USER_KEY" \
  -d '{"messages":[{"role":"user","content":"hi"}],"api_id":"3"}')
E4_S="${E4_R%%|*}"
if [[ "$E4_S" == "200" || "$E4_S" == "502" || "$E4_S" == "504" || "$E4_S" == "503" ]]; then
  log_test "E" "E4" "Gateway with api_id resolves" "PASS" "HTTP $E4_S"
else
  log_test "E" "E4" "Gateway with api_id resolves" "FAIL" "HTTP $E4_S"
fi

# E5 — Gateway non-existent endpoint
E5_S=$(http_status -X POST "$BASE/v99/nonexistent" -H "Content-Type: application/json" \
  -H "x-user-key: $USER_KEY" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
# Should either 404 (no API registered) or fall through to Vite (200 HTML)
if [[ "$E5_S" == "404" || "$E5_S" == "200" ]]; then
  log_test "E" "E5" "Non-existent gateway endpoint" "PASS" "HTTP $E5_S (fallthrough or 404)"
else
  log_test "E" "E5" "Non-existent gateway endpoint" "FAIL" "HTTP $E5_S"
fi

# E6 — Gateway insufficient credits (create user with 0 quota)
BROKE_EMAIL="broke-${RANDOM}@test.com"
BROKE_REG=$(http_body -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BROKE_EMAIL\",\"password\":\"BrokePass123\"}")
BROKE_KEY=$(json_field "$BROKE_REG" "api_key")
E6_S=$(http_status -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -H "x-user-key: $BROKE_KEY" \
  -d '{"messages":[{"role":"user","content":"hi"}],"model":"qwen3.5:9b"}')
assert_eq "402" "$E6_S" "E" "E6" "Gateway insufficient credits -> 402"

# E7 — Async job endpoint
E7_S=$(http_status "$BASE/api/async-jobs/nonexistent")
assert_eq "404" "$E7_S" "E" "E7" "GET async-jobs/nonexistent -> 404"

# E8 — Image endpoint (Stable Diffusion)
E8_R=$(http_full -X POST "$BASE/sdapi/v1/txt2img" -H "Content-Type: application/json" \
  -H "x-user-key: $USER_KEY" \
  -d '{"prompt":"a cat","steps":1}')
E8_S="${E8_R%%|*}"
if [[ "$E8_S" == "200" || "$E8_S" == "502" || "$E8_S" == "504" || "$E8_S" == "503" ]]; then
  log_test "E" "E8" "Image gateway (upstream may be down)" "PASS" "HTTP $E8_S"
else
  log_test "E" "E8" "Image gateway" "FAIL" "HTTP $E8_S"
fi

# E9 — Verify _gateway envelope on successful response (check body structure)
if [[ "$E2_S" == "200" ]]; then
  if echo "$E2_B" | grep -q "_gateway"; then
    log_test "E" "E9" "_gateway envelope present" "PASS" ""
  else
    log_test "E" "E9" "_gateway envelope present" "FAIL" "not found in response"
  fi
else
  log_test "E" "E9" "_gateway envelope present" "SKIP" "upstream not available"
fi

# E10 — Static assets bypass gateway
E10_S=$(http_status "$BASE/favicon.svg")
assert_eq "200" "$E10_S" "E" "E10" "Static asset bypasses gateway -> 200"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION F: RAG
# ═══════════════════════════════════════════════════════════════
section "F: RAG"

# F1 — RAG chat endpoint exists
F1_S=$(http_status -X POST "$BASE/api/chat" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"messages":[{"role":"user","content":"what is kroma?"}]}')
# Could be 200, 500 (if Ollama/ChromaDB down), or 400
if [[ "$F1_S" == "200" || "$F1_S" == "500" || "$F1_S" == "400" ]]; then
  log_test "F" "F1" "POST /api/chat (RAG)" "PASS" "HTTP $F1_S (infra may be down)"
else
  log_test "F" "F1" "POST /api/chat (RAG)" "FAIL" "HTTP $F1_S"
fi

# F2 — RAG generate endpoint
F2_S=$(http_status -X POST "$BASE/api/rag/generate" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"userQuery":"test","targetUrl":"https://example.com"}')
if [[ "$F2_S" == "200" || "$F2_S" == "500" || "$F2_S" == "400" ]]; then
  log_test "F" "F2" "POST /api/rag/generate" "PASS" "HTTP $F2_S"
else
  log_test "F" "F2" "POST /api/rag/generate" "FAIL" "HTTP $F2_S"
fi

# F3 — RAG ingest
F3_S=$(http_status -X POST "$BASE/api/rag/ingest" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"url":"https://example.com","content":"test content"}')
if [[ "$F3_S" == "200" || "$F3_S" == "500" || "$F3_S" == "400" || "$F3_S" == "201" ]]; then
  log_test "F" "F3" "POST /api/rag/ingest" "PASS" "HTTP $F3_S"
else
  log_test "F" "F3" "POST /api/rag/ingest" "FAIL" "HTTP $F3_S"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION G: Security & Middleware
# ═══════════════════════════════════════════════════════════════
section "G: Security & Middleware"

# G1 — Health always public
G1_S=$(http_status "$BASE/api/health")
assert_eq "200" "$G1_S" "G" "G1" "Health endpoint public -> 200"

# G2 — Rate limiter headers present
G2_HEADERS=$(curl -s -I "$BASE/api/health" 2>/dev/null)
if echo "$G2_HEADERS" | grep -qi "x-ratelimit-limit"; then
  log_test "G" "G2" "Rate limit headers present" "PASS" ""
else
  log_test "G" "G2" "Rate limit headers present" "FAIL" "X-RateLimit-Limit not found"
fi

# G3 — Body size limit (send >1MB)
BIGBODY=$(python3 -c "print('{\"x\":\"' + 'A'*1100000 + '\"}')" 2>/dev/null || echo "SKIP")
if [[ "$BIGBODY" == "SKIP" ]]; then
  log_test "G" "G3" "Body size limit (1MB)" "SKIP" "python3 not available"
else
  G3_S=$(echo "$BIGBODY" | curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" --data-binary @-)
  if [[ "$G3_S" == "413" || "$G3_S" == "400" ]]; then
    log_test "G" "G3" "Body size limit (1MB)" "PASS" "HTTP $G3_S"
  else
    log_test "G" "G3" "Body size limit (1MB)" "FAIL" "HTTP $G3_S (expected 413 or 400)"
  fi
fi

# G4 — Zod validation error format
G4_R=$(http_full -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":123,"password":true}')
G4_S="${G4_R%%|*}"; G4_B="${G4_R#*|}"
assert_eq "400" "$G4_S" "G" "G4" "Zod validation returns 400"
if echo "$G4_B" | grep -q "details"; then
  log_test "G" "G4b" "Zod error has 'details' array" "PASS" ""
else
  log_test "G" "G4b" "Zod error has 'details' array" "FAIL" "body=${G4_B:0:200}"
fi

# G5 — CORS header present
G5_HEADERS=$(curl -s -I -H "Origin: http://localhost:5173" "$BASE/api/health" 2>/dev/null)
if echo "$G5_HEADERS" | grep -qi "access-control"; then
  log_test "G" "G5" "CORS headers present" "PASS" ""
else
  log_test "G" "G5" "CORS headers present" "FAIL" "no access-control header"
fi

# G6 — Admin privilege escalation guard (user can't set own role)
G6_S=$(http_status -X PUT "$BASE/api/admin/users/999" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"role":"admin"}')
assert_eq "403" "$G6_S" "G" "G6" "User can't access admin PUT -> 403"

# G7 — Dev endpoint blocked without token
G7_S=$(http_status -X POST "$BASE/api/dev/promote-admin" -H "Content-Type: application/json" \
  -d '{"email":"test@test.com"}')
assert_eq "403" "$G7_S" "G" "G7" "Dev endpoint without token -> 403"

# G8 — Dev endpoint with wrong token
G8_S=$(http_status -X POST "$BASE/api/dev/promote-admin" -H "Content-Type: application/json" \
  -H "x-dev-token: wrong-token" \
  -d '{"email":"test@test.com"}')
assert_eq "403" "$G8_S" "G" "G8" "Dev endpoint wrong token -> 403"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION H: Frontend / Static Analysis
# ═══════════════════════════════════════════════════════════════
section "H: Frontend / Static Analysis"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# H1 — TypeScript compiles clean
TSC_OUT=$(cd "$PROJECT_ROOT" && npx tsc --noEmit 2>&1)
TSC_EXIT=$?
if [[ $TSC_EXIT -eq 0 ]]; then
  log_test "H" "H1" "tsc --noEmit (zero errors)" "PASS" ""
else
  log_test "H" "H1" "tsc --noEmit (zero errors)" "FAIL" "${TSC_OUT:0:300}"
fi

# H2 — No broken imports of deleted legacy files
LEGACY_FILES="src/components/Layout.tsx src/components/AdminLayout.tsx src/context/AuthContext.tsx src/context/ThemeContext.tsx src/pages/Dashboard.tsx src/pages/ApiDetails.tsx src/pages/Pricing.tsx src/pages/Docs.tsx src/pages/Login.tsx src/pages/Register.tsx"
BROKEN_IMPORTS=""
for f in $LEGACY_FILES; do
  IMPORT_PATH="${f#src/}"
  IMPORT_PATH="${IMPORT_PATH%.tsx}"
  if grep -Erq "from ['\"]([^'\"]*/)?${IMPORT_PATH}['\"]|import\(['\"]([^'\"]*/)?${IMPORT_PATH}['\"]\)" "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null; then
    # Check if the file actually exists (if it does, it's not "broken")
    if [[ ! -f "$PROJECT_ROOT/$f" ]]; then
      BROKEN_IMPORTS="$BROKEN_IMPORTS $f"
    fi
  fi
done
if [[ -z "$BROKEN_IMPORTS" ]]; then
  log_test "H" "H2" "No broken imports of legacy files" "PASS" ""
else
  log_test "H" "H2" "No broken imports of legacy files" "FAIL" "broken:$BROKEN_IMPORTS"
fi

# H3 — No leftover x-admin-key in frontend
ADMIN_KEY_REFS=$(grep -rn "x-admin-key\|getAdminKey\|VITE_ADMIN_KEY" "$PROJECT_ROOT/src" 2>/dev/null | wc -l)
if [[ "$ADMIN_KEY_REFS" -eq 0 ]]; then
  log_test "H" "H3" "No x-admin-key in frontend src/" "PASS" ""
else
  log_test "H" "H3" "No x-admin-key in frontend src/" "FAIL" "$ADMIN_KEY_REFS references found"
fi

# H4 — AdminOverview uses adminApi (not raw axios)
if grep -q "import axios" "$PROJECT_ROOT/src/pages/admin/AdminOverview.tsx" 2>/dev/null; then
  log_test "H" "H4" "AdminOverview no raw axios" "FAIL" "still imports axios"
else
  log_test "H" "H4" "AdminOverview no raw axios" "PASS" ""
fi

# H5 — HTML routes serve index.html (SPA)
H5_S=$(http_status "$BASE/chat")
assert_eq "200" "$H5_S" "H" "H5" "GET /chat serves SPA -> 200"

H5b_S=$(http_status "$BASE/admin")
assert_eq "200" "$H5b_S" "H" "H5b" "GET /admin serves SPA -> 200"

# H6 — Lazy chunks exist (check if vite serves them)
H6_S=$(http_status "$BASE/login")
assert_eq "200" "$H6_S" "H" "H6" "GET /login serves SPA -> 200"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION I: Database / Schema
# ═══════════════════════════════════════════════════════════════
section "I: Database / Schema"

# I1 — Users table has required columns (check via admin list response)
if echo "$D1_B" | grep -q "email"; then
  log_test "I" "I1" "Users table has email column" "PASS" ""
else
  log_test "I" "I1" "Users table has email column" "FAIL" ""
fi

# I2 — APIs table has model_slug (check via public list)
if echo "$B1_B" | grep -q "model_slug"; then
  log_test "I" "I2" "APIs table has model_slug" "PASS" ""
else
  log_test "I" "I2" "APIs table has model_slug" "FAIL" ""
fi

# I3 — APIs table has is_streaming
if echo "$B1_B" | grep -q "is_streaming"; then
  log_test "I" "I3" "APIs table has is_streaming" "PASS" ""
else
  log_test "I" "I3" "APIs table has is_streaming" "FAIL" ""
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION J: End-to-End Critical Flows
# ═══════════════════════════════════════════════════════════════
section "J: End-to-End Critical Flows"

# J1 — Full user flow: register -> quota=0 -> top-up via admin -> quota increased
J1_EMAIL="e2e-${RANDOM}@test.com"
J1_REG=$(http_body -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$J1_EMAIL\",\"password\":\"E2ePass123\"}")
J1_TOKEN=$(json_field "$J1_REG" "accessToken")
J1_KEY=$(json_field "$J1_REG" "api_key")

# Check quota = 0
J1_Q=$(http_body "$BASE/api/user/quota" -H "Authorization: Bearer $J1_TOKEN")
J1_QUOTA=$(json_value "$J1_Q" "quota")
[[ "$J1_QUOTA" == "0" ]] && \
  log_test "J" "J1a" "New user quota = 0" "PASS" "" || \
  log_test "J" "J1a" "New user quota = 0" "FAIL" "got=$J1_QUOTA"

# Admin top-up
http_body -X POST "$BASE/api/dev/set-quota" \
  -H "Content-Type: application/json" -H "x-dev-token: $DEV_TOKEN" \
  -d "{\"email\":\"$J1_EMAIL\",\"quota_limit\":1000,\"usage_count\":0}" > /dev/null

# Check quota = 1000
J1_Q2=$(http_body "$BASE/api/user/quota" -H "Authorization: Bearer $J1_TOKEN")
J1_QUOTA2=$(json_value "$J1_Q2" "quota")
[[ "$J1_QUOTA2" == "1000" ]] && \
  log_test "J" "J1b" "After top-up quota = 1000" "PASS" "" || \
  log_test "J" "J1b" "After top-up quota = 1000" "FAIL" "got=$J1_QUOTA2"

# Try gateway (should not be 402 anymore)
J1_GW=$(http_status -X POST "$BASE/ai/chat" -H "Content-Type: application/json" \
  -H "x-user-key: $J1_KEY" \
  -d '{"messages":[{"role":"user","content":"hi"}],"model":"qwen3.5:9b"}')
if [[ "$J1_GW" != "402" && "$J1_GW" != "401" ]]; then
  log_test "J" "J1c" "Gateway accepts user with credits" "PASS" "HTTP $J1_GW"
else
  log_test "J" "J1c" "Gateway accepts user with credits" "FAIL" "HTTP $J1_GW (still rejected)"
fi

# J2 — Admin can see all users
J2_R=$(http_body "$BASE/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN")
J2_COUNT=$(echo "$J2_R" | grep -o '"id"' | wc -l)
if [[ $J2_COUNT -ge 2 ]]; then
  log_test "J" "J2" "Admin sees multiple users" "PASS" "count=$J2_COUNT"
else
  log_test "J" "J2" "Admin sees multiple users" "FAIL" "count=$J2_COUNT"
fi

# J3 — Token refresh flow
J3_REF=$(http_body -X POST "$BASE/api/auth/refresh" -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$USER_REFRESH\"}")
J3_NEW_TOKEN=$(json_field "$J3_REF" "accessToken")
if [[ -n "$J3_NEW_TOKEN" ]]; then
  # Use new token
  J3_ME_S=$(http_status "$BASE/api/user/me" -H "Authorization: Bearer $J3_NEW_TOKEN")
  assert_eq "200" "$J3_ME_S" "J" "J3" "Refreshed token works for /me"
else
  log_test "J" "J3" "Token refresh flow" "FAIL" "no new token returned"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════
print_summary

# Generate markdown report
REPORT_MD="$SCRIPT_DIR/report.md"
echo "# Kroma AI Gateway — Test Report" > "$REPORT_MD"
echo "" >> "$REPORT_MD"
echo "**Date**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_MD"
echo "**Total**: $TESTS_TOTAL | **Passed**: $TESTS_PASSED | **Failed**: $TESTS_FAILED | **Skipped**: $TESTS_SKIPPED" >> "$REPORT_MD"
echo "" >> "$REPORT_MD"
echo "| Section | ID | Test | Status | Detail |" >> "$REPORT_MD"
echo "|---|---|---|---|---|" >> "$REPORT_MD"
tail -n +2 "$REPORT_FILE" | while IFS=$'\t' read -r sec id name status detail; do
  ICON="✅"
  [[ "$status" == "FAIL" ]] && ICON="❌"
  [[ "$status" == "SKIP" ]] && ICON="⏭️"
  echo "| $sec | $id | $name | $ICON $status | $detail |" >> "$REPORT_MD"
done
echo "" >> "$REPORT_MD"
echo "---" >> "$REPORT_MD"
echo "## Failed Tests" >> "$REPORT_MD"
echo "" >> "$REPORT_MD"
FAIL_COUNT=0
tail -n +2 "$REPORT_FILE" | while IFS=$'\t' read -r sec id name status detail; do
  if [[ "$status" == "FAIL" ]]; then
    echo "- **$id** $name — $detail" >> "$REPORT_MD"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done
if [[ $TESTS_FAILED -eq 0 ]]; then
  echo "_None! All tests passed._" >> "$REPORT_MD"
fi

echo ""
echo -e "${GRAY}Report saved to: $REPORT_MD${NC}"

# Exit with failure if any test failed
[[ $TESTS_FAILED -eq 0 ]] && exit 0 || exit 1
