#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

scope() {
  node "$ROOT/scripts/verify/affected-tests.mjs" "$@" >"$WORK/out.txt" 2>"$WORK/err.txt"
}

expect_kind() {
  local kind
  kind="$(sed -n '1p' "$WORK/out.txt")"
  [[ "$kind" == "$1" ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "expected $1, got ${kind}"; }
}

docs_select_no_unit_test() {
  ready
  scope README.md || { cat "$WORK/err.txt"; fail "docs exited non-zero"; }
  expect_kind none
}

a_runner_file_selects_the_suite() {
  ready
  scope vitest.config.mts || { cat "$WORK/err.txt"; fail "a runner file exited non-zero"; }
  expect_kind all
}

a_source_file_selects_related_tests() {
  ready
  scope src/content/ocellus/js/p4/explosions.ts || { cat "$WORK/err.txt"; fail "a source file exited non-zero"; }
  expect_kind related
}

no_paths_select_the_suite() {
  ready
  scope || { cat "$WORK/err.txt"; fail "no paths exited non-zero"; }
  expect_kind all
}

failed=0
for t in \
  docs_select_no_unit_test \
  a_runner_file_selects_the_suite \
  a_source_file_selects_related_tests \
  no_paths_select_the_suite; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
