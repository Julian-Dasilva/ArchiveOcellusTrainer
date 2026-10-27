#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

token_refuses_the_release_build() {
  ready
  local status=0
  (
    cd "$ROOT"
    export OSRS_CACHE_DIR="$WORK/cache"
    export OSRS_CACHE_READER="$WORK/reader"
    mkdir -p "$OSRS_CACHE_DIR" "$OSRS_CACHE_READER"
    CF_WEB_ANALYTICS_TOKEN=0123456789abcdef0123456789abcdef perl -e 'alarm shift; exec @ARGV' 5 scripts/release-build.sh
  ) >"$WORK/out.txt" 2>"$WORK/err.txt" || status=$?
  grep -qF "CF_WEB_ANALYTICS_TOKEN is set" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "missing the refusal"; }
  [[ "$status" -eq 1 ]] || fail "exit ${status}"
}

failed=0
for t in token_refuses_the_release_build; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
