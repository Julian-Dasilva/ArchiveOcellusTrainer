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

workers() {
  env "$@" node "$ROOT/test/workerCap.mjs"
}

ci_keeps_the_runner_default() {
  ready
  local out
  out="$(workers -u VITEST_MAX_WORKERS CI=true)" || { printf '%s\n' "$out"; fail "the worker cap exited non-zero under CI"; }
  [[ "$out" == "default" ]] || { printf '%s\n' "$out"; fail "CI did not keep the runner default"; }
}

a_local_run_caps_workers_at_2() {
  ready
  local out
  out="$(workers -u CI -u VITEST_MAX_WORKERS)" || { printf '%s\n' "$out"; fail "the worker cap exited non-zero"; }
  [[ "$out" == "2" ]] || { printf '%s\n' "$out"; fail "a local run did not cap workers at 2"; }
}

an_override_sets_the_count() {
  ready
  local out
  out="$(workers -u CI VITEST_MAX_WORKERS=4)" || { printf '%s\n' "$out"; fail "the worker cap exited non-zero"; }
  [[ "$out" == "4" ]] || { printf '%s\n' "$out"; fail "VITEST_MAX_WORKERS=4 did not print 4"; }
}

failed=0
for t in \
  ci_keeps_the_runner_default \
  a_local_run_caps_workers_at_2 \
  an_override_sets_the_count; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
