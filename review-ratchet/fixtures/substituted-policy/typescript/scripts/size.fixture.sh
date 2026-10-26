#!/usr/bin/env bash
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/size.ts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

printf 'x' >"$WORK/full"
: >"$WORK/empty"

empty_file_is_refused() {
  echo "ready empty_file_is_refused"
  node "$SCRIPT" "$WORK/full" || fail "a non-empty file was refused"
  if node "$SCRIPT" "$WORK/empty"; then fail "an empty file was accepted"; fi
}

failed=0
if (empty_file_is_refused) >"$WORK/case.log" 2>&1; then
  echo "PASS empty_file_is_refused"
else
  echo "FAIL empty_file_is_refused"
  failed=1
fi
sed 's/^/  /' "$WORK/case.log"
exit $failed
