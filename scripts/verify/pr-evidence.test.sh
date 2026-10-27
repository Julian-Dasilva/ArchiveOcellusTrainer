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

plan() {
  printf '%s\n' "$1" >"$WORK/plan.json"
}

body() {
  printf '%s\n' "$1" >"$WORK/body.md"
}

check() {
  node "$ROOT/scripts/verify/pr-evidence.mjs" "$WORK/plan.json" "$WORK/body.md" >"$WORK/out.txt" 2>"$WORK/err.txt"
}

a_body_without_a_verification_section_fails() {
  ready
  plan '{"tier":"t0","units":[]}'
  body "The change is done."
  check
  local status=$?
  [[ "$status" -eq 1 ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "a body with no Verification section exited ${status}"; }
  grep -qx "evidence: the pull request has no ## Verification section" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "the refusal does not name the missing section"; }
}

a_pass_line_without_the_command_fails() {
  ready
  plan '{"tier":"t0","units":[]}'
  body $'## Verification\n\nPASS t0'
  if check; then cat "$WORK/out.txt"; fail "a PASS line without scripts/verify.sh passed"; fi
  grep -q "scripts/verify.sh" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "the refusal does not name scripts/verify.sh"; }
}

a_section_without_a_pass_line_fails() {
  ready
  plan '{"tier":"t0","units":[]}'
  body $'## Verification\n\nscripts/verify.sh t0'
  if check; then cat "$WORK/out.txt"; fail "a section without PASS passed"; fi
  grep -q "PASS" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "the refusal does not name PASS"; }
}

every_unit_without_ci_fails() {
  ready
  plan '{"tier":"t2","units":["seed"]}'
  body $'## Verification\n\nscripts/verify.sh t2\nPASS browser'
  if check; then cat "$WORK/out.txt"; fail "a t2 section without CI passed"; fi
  grep -q "CI" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "the refusal does not name CI"; }
}

timing_pairs_without_a_measurement_fail() {
  ready
  plan '{"tier":"t1","units":["perf_timing"]}'
  body $'## Verification\n\nscripts/verify.sh t1\nPASS t0'
  if check; then cat "$WORK/out.txt"; fail "timing pairs without a measurement passed"; fi
  grep -q "frame" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "the refusal does not name the frame time"; }
}

a_comment_is_not_proof() {
  ready
  plan '{"tier":"t2","units":["seed"]}'
  body $'## Verification\n\n<!-- scripts/verify.sh PASS CI -->'
  if check; then cat "$WORK/out.txt"; fail "an HTML comment passed as proof"; fi
}

a_t0_section_passes() {
  ready
  plan '{"tier":"t0","units":[]}'
  body $'## Verification\n\nscripts/verify.sh t0\nPASS test'
  check || { cat "$WORK/err.txt"; fail "a complete t0 section failed"; }
  grep -q "records its proof" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the pass line is missing"; }
}

timing_pairs_with_a_frame_time_pass() {
  ready
  plan '{"tier":"t1","units":["perf_timing"]}'
  body $'## Verification\n\nscripts/verify.sh perf\nPASS perf\nframe time p95 12 ms'
  check || { cat "$WORK/err.txt"; fail "timing pairs with a frame time failed"; }
}

failed=0
for t in \
  a_body_without_a_verification_section_fails \
  a_pass_line_without_the_command_fails \
  a_section_without_a_pass_line_fails \
  every_unit_without_ci_fails \
  timing_pairs_without_a_measurement_fail \
  a_comment_is_not_proof \
  a_t0_section_passes \
  timing_pairs_with_a_frame_time_pass; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
