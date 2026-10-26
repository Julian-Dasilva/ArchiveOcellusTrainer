#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

seconds() {
  printf '{"seconds":{"rifts":230,"pathing":120,"cues":80,"seed":15,"walkway":20}}' >"$WORK/seconds.json"
}

shard() {
  node "$HERE/shard.mjs" "$WORK/seconds.json" "$1" 3 rifts pathing cues seed walkway new_unit
}

verdict() {
  mkdir -p "$WORK/t2/artifacts/t2-browser-1/units/$1"
  printf '{"unit":"%s","seconds":5,"outcome":"%s","checks":{"%sHolds":%s},"observed":{}}' "$1" "$2" "$1" "$([[ $2 == passed ]] && echo true || echo false)" \
    >"$WORK/t2/artifacts/t2-browser-1/units/$1/verdict.json"
}

stages() {
  mkdir -p "$WORK/t2/artifacts/t2-production" "$WORK/t2/artifacts/perf-evidence" "$WORK/t2/artifacts/t2-assets"
  echo "PASS production" >"$WORK/t2/artifacts/t2-production/summary.txt"
  echo "PASS perfbudgets" >"$WORK/t2/artifacts/perf-evidence/summary.txt"
  mkdir -p "$WORK/t2/artifacts/t2-plan"
  printf '{"tier":"t1","units":["seed"],"selections":[]}' >"$WORK/t2/artifacts/t2-plan/plan.json"
  printf 'assets: deleted spotAnims.1172\n{"deleted":["spotAnims.1172"],"added":[],"changed":[]}\n' >"$WORK/t2/artifacts/t2-assets/assets-diff.txt"
  echo "install-beta-sdk: installed osrs-sdk commit abc matches the pin" >"$WORK/t2/artifacts/t2-assets/sdk-pin.txt"
}

summarize() {
  mkdir -p "$WORK/t2/browser"
  cp -R "$WORK/t2/artifacts/t2-browser-1/units" "$WORK/t2/browser/"
  node "$HERE/report.mjs" "$WORK/t2/browser" "$@" >/dev/null 2>&1
  GITHUB_SHA=abc1234 node "$HERE/t2-summary.mjs" "$WORK/t2" >"$WORK/out.txt" 2>&1
}

every_unit_lands_in_one_shard() {
  seconds
  ready
  { shard 1; shard 2; shard 3; } | sort >"$WORK/all.txt"
  [[ "$(tr '\n' ' ' <"$WORK/all.txt")" == "cues new_unit pathing rifts seed walkway " ]] || { cat "$WORK/all.txt"; fail "the shards do not hold every unit exactly once"; }
  [[ "$(shard 1 | tr '\n' ' ')" == "rifts " ]] || { shard 1; fail "the longest unit does not have the first shard to itself"; }
}

passing_units_and_stages_pass() {
  stages
  verdict seed passed
  verdict cues passed
  ready
  summarize seed cues || { cat "$WORK/out.txt"; fail "a passing T2 failed"; }
  grep -qx "## T2 PASS at abc1234" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no PASS heading"; }
  grep -qx "  - deleted spotAnims.1172" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the deleted asset is not listed"; }
  grep -qx -- "- SDK: install-beta-sdk: installed osrs-sdk commit abc matches the pin" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the SDK pin is not shown"; }
}

unit_lost_with_its_shard_fails() {
  stages
  verdict seed passed
  ready
  if summarize seed cues; then cat "$WORK/out.txt"; fail "T2 passed without the cues unit's verdict"; fi
  grep -qx "  - cues missing" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the missing unit is not named"; }
  [[ "$(node -e 'console.log(require(process.argv[1]).passed)' "$WORK/t2/verdict.json")" == false ]] || fail "verdict.json does not record the failure"
}

failed_stage_fails() {
  stages
  echo "FAIL perfbudgets" >"$WORK/t2/artifacts/perf-evidence/summary.txt"
  verdict seed passed
  ready
  if summarize seed; then cat "$WORK/out.txt"; fail "T2 passed with failed perf budgets"; fi
  grep -qx -- "- perf budgets: FAIL" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the failed stage is not shown"; }
}

timing_pairs_count_only_when_planned() {
  stages
  verdict seed passed
  ready
  summarize seed || { cat "$WORK/out.txt"; fail "T2 failed on timing pairs the plan did not select"; }
  grep -qx -- "- perf timing pairs: not selected by the plan" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the unselected pairs are not shown"; }
  printf '{"tier":"t2","units":["seed","perf_timing"],"selections":[]}' >"$WORK/t2/artifacts/t2-plan/plan.json"
  mkdir -p "$WORK/t2/artifacts/perf-timing-evidence"
  echo "FAIL perf" >"$WORK/t2/artifacts/perf-timing-evidence/summary.txt"
  if summarize seed; then cat "$WORK/out.txt"; fail "T2 passed with failed timing pairs the plan selected"; fi
  grep -qx -- "- perf timing pairs: FAIL" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the failed pairs are not shown"; }
}

failed=0
for t in \
  every_unit_lands_in_one_shard \
  passing_units_and_stages_pass \
  unit_lost_with_its_shard_fails \
  failed_stage_fails \
  timing_pairs_count_only_when_planned; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  rm -rf "$WORK/t2"
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
