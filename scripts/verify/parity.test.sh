#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export PARITY_FIGHT_CODE="src/content/ src/sim/"

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

compare() {
  node "$HERE/parity.mjs" "$WORK/base.json" "$WORK/head.json" "$@" >"$WORK/out.txt" 2>&1
}

matching_fights_pass() {
  dumps 1500
  ready
  compare README.md || { cat "$WORK/out.txt"; fail "matching fights failed"; }
  grep -qx "parity: 2 of 2 seeded fights match the base" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no match count"; }
}

difference_outside_fight_code_fails() {
  dumps 1499
  ready
  if compare README.md src/ui/Menu.tsx; then cat "$WORK/out.txt"; fail "a fight changed by a change outside the fight code passed"; fi
  grep -qxF 'parity: full-correct-1 differs at full-correct-1.log.rows[0].hp: base 1500, head 1499' "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the differing fight and value are not named"; }
  grep -qx "parity: 1 of 2 seeded fights match the base" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no match count"; }
}

difference_in_fight_code_is_expected() {
  dumps 1499
  ready
  compare README.md src/sim/combat.ts || { cat "$WORK/out.txt"; fail "a fight changed by fight code failed"; }
  grep -qxF 'parity: full-correct-1 differs at full-correct-1.log.rows[0].hp: base 1500, head 1499' "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the expected difference is not printed"; }
  grep -qxF "parity: expected, the change touches fight code (src/sim/combat.ts)" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the fight code path is not named"; }
}

missing_fight_fails() {
  dumps 1500
  printf '{"full-correct-1":{"log":{"rows":[{"tick":1,"hp":1500}]}}}' >"$WORK/head.json"
  ready
  if compare README.md; then cat "$WORK/out.txt"; fail "a fight missing at the head passed"; fi
  grep -qxF 'parity: rifts-correct differs at rifts-correct: base {"log":{"rows":[]}}, head nothing' "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the missing fight is not named"; }
}

failed=0
for t in \
  matching_fights_pass \
  difference_outside_fight_code_fails \
  difference_in_fight_code_is_expected \
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
