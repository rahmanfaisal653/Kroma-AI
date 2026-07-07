#!/bin/bash
# Shared helpers for kroma test suite
# Usage: source this file at the top of any test script

BASE="${BASE:-http://localhost:3000}"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m'

# Counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test results (appended to global REPORT_FILE)
REPORT_FILE="${REPORT_FILE:-/tmp/kroma_test_report.tsv}"

# Initialize report file (called once at start of run-all.sh)
init_report() {
  echo -e "section\tid\tname\tstatus\tdetail" > "$REPORT_FILE"
}

# Log a test result. Args: section_id, test_id, name, status (PASS|FAIL|SKIP), detail
log_test() {
  local section="$1" id="$2" name="$3" status="$4" detail="${5:-}"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  case "$status" in
    PASS) TESTS_PASSED=$((TESTS_PASSED + 1)); echo -e "  ${GREEN}✓${NC} $id $name ${GRAY}$detail${NC}" ;;
    FAIL) TESTS_FAILED=$((TESTS_FAILED + 1)); echo -e "  ${RED}✗${NC} $id $name ${RED}$detail${NC}" ;;
    SKIP) TESTS_SKIPPED=$((TESTS_SKIPPED + 1)); echo -e "  ${YELLOW}-${NC} $id $name ${GRAY}$detail${NC}" ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\n' "$section" "$id" "$name" "$status" "$detail" >> "$REPORT_FILE"
}

# Section header
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Run a curl, return only status code (silent body)
http_status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

# Run a curl, return body (status discarded; use http_full for both)
http_body() {
  curl -s "$@"
}

# Run a curl, return "STATUS|BODY" delimited
http_full() {
  local tmpf=$(mktemp)
  local status
  status=$(curl -s -o "$tmpf" -w "%{http_code}" "$@")
  local body
  body=$(cat "$tmpf")
  rm -f "$tmpf"
  echo "$status|$body"
}

# Extract JSON field via grep+sed (jq not guaranteed). Args: json_string field_name
json_field() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"$field\":\s*\"[^\"]*\"" | head -1 | sed -E "s/\"$field\":\s*\"//;s/\"$//"
}

# Extract JSON numeric/boolean field
json_value() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"$field\":\s*[^,}]+" | head -1 | sed -E "s/\"$field\":\s*//"
}

# Assert that two values are equal. Args: expected actual section id name
assert_eq() {
  local expected="$1" actual="$2" section="$3" id="$4" name="$5"
  if [[ "$expected" == "$actual" ]]; then
    log_test "$section" "$id" "$name" "PASS" "expected=$expected"
  else
    log_test "$section" "$id" "$name" "FAIL" "expected=$expected got=$actual"
  fi
}

# Assert HTTP status. Args: expected_status method url section id name [extra_curl_args...]
assert_http() {
  local expected="$1" method="$2" url="$3" section="$4" id="$5" name="$6"
  shift 6
  local actual
  actual=$(http_status -X "$method" "$BASE$url" "$@")
  assert_eq "$expected" "$actual" "$section" "$id" "$name"
}

# Wait for server up. Args: max_seconds
wait_server() {
  local max="${1:-30}" i=0
  while [[ $i -lt $max ]]; do
    if curl -s -o /dev/null "$BASE/api/health"; then return 0; fi
    sleep 1; i=$((i + 1))
  done
  echo -e "${RED}Server did not start in ${max}s${NC}"
  return 1
}

# Print a summary banner
print_summary() {
  echo ""
  echo -e "${BLUE}================ TEST SUMMARY ================${NC}"
  echo -e "  Total:   $TESTS_TOTAL"
  echo -e "  ${GREEN}Passed:  $TESTS_PASSED${NC}"
  echo -e "  ${RED}Failed:  $TESTS_FAILED${NC}"
  echo -e "  ${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
  echo -e "${BLUE}=============================================${NC}"
}
