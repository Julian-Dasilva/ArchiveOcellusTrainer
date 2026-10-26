#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
HEAD_1499=9f5b1b36d5970d1dd7b98d392d25f6ef29ad1e458efe9a43d39cfb51648ce8c9

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

dumps() {
  printf '{"full-correct-1":{"log":{"rows":[{"tick":1,"hp":1500}]}},"rifts-correct":{"log":{"rows":[]}}}' >"$WORK/base.json"
  printf '{"full-correct-1":{"log":{"rows":[{"tick":1,"hp":%s}]}},"rifts-correct":{"log":{"rows":[]}}}' "$1" >"$WORK/head.json"
}

expect() {
  printf '%s' "$1" >"$WORK/expected.json"
}

compare() {
  node "$HERE/parity.mjs" "$WORK/base.json" "$WORK/head.json" "$WORK/expected.json" >"$WORK/out.txt" 2>&1
}

matching_fights_pass() {
  dumps 1500
  expect '{}'
  ready
  compare || { cat "$WORK/out.txt"; fail "matching fights failed"; }
  grep -qx "parity: 2 of 2 seeded fights match the base" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no match count"; }
}

unexpected_difference_fails() {
  dumps 1499
  expect '{}'
  ready
  if compare; then cat "$WORK/out.txt"; fail "a fight that differs without an expectation passed"; fi
  grep -qxF "parity: full-correct-1 differs at full-correct-1.log.rows[0].hp: base 1500, head 1499; head sha256 $HEAD_1499" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the differing fight, value and head sha256 are not named"; }
  grep -qxF "parity: full-correct-1 differs without an entry for that head in $WORK/expected.json" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the unexpected fight is not named"; }
}

difference_passes_only_with_its_expected_head() {
  dumps 1499
  expect "{\"full-correct-1\":{\"head\":\"$HEAD_1499\",\"why\":\"the boss starts on 1499 hitpoints\"}}"
  ready
  compare || { cat "$WORK/out.txt"; fail "a difference named with its head sha256 failed"; }
  grep -qxF "parity: full-correct-1 differs as $WORK/expected.json expects: the boss starts on 1499 hitpoints" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the expected difference is not named"; }
  dumps 1498
  if compare; then cat "$WORK/out.txt"; fail "a fight that differs from its expected head passed"; fi
  grep -qxF "parity: full-correct-1 differs without an entry for that head in $WORK/expected.json" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the changed head is not named"; }
}

expectation_without_a_reason_is_refused() {
  dumps 1499
  expect "{\"full-correct-1\":{\"head\":\"$HEAD_1499\",\"why\":\" \"}}"
  ready
  compare
  [[ $? -eq 2 ]] || { cat "$WORK/out.txt"; fail "an expectation without a reason was not refused"; }
  grep -qxF "parity: $WORK/expected.json: full-correct-1.why is empty" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the refusal does not name the entry"; }
}

missing_fight_fails() {
  dumps 1500
  expect '{}'
  printf '{"full-correct-1":{"log":{"rows":[{"tick":1,"hp":1500}]}}}' >"$WORK/head.json"
  ready
  if compare; then fail "a fight missing at the head passed"; fi
  grep -qF 'parity: rifts-correct differs at rifts-correct: base {"log":{"rows":[]}}, head nothing; head sha256 ' "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the missing fight is not named"; }
}

failed=0
for t in \
  matching_fights_pass \
  unexpected_difference_fails \
  difference_passes_only_with_its_expected_head \
  expectation_without_a_reason_is_refused \
  missing_fight_fails; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
