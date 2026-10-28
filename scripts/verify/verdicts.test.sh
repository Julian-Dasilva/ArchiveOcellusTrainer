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

field() {
  node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(JSON.stringify(process.argv[2].split(".").reduce((o, k) => o?.[k], v)))' "$1" "$2"
}

# The click_correction unit: one check, three captures and no page-error check of its own. $1 is the second mousedown's
# world tick; 40, the first's, passes.
correction_unit() {
  UNIT="$WORK/$t/units/click_correction"
  mkdir -p "$UNIT"
  printf 'png' >"$UNIT/click-correction.png"
  printf '[]' >"$UNIT/click-correction-page-errors.json"
  printf '{"downs":[{"tick":40},{"tick":%s}],"orderRows":[{"worldTick":41,"orders":[{"x":8,"y":3},{"x":3,"y":2}]}],"tiles":[{"x":3,"y":2},{"x":3,"y":2},{"x":3,"y":2}]}' "$1" >"$UNIT/click-correction.json"
}

verdict_file() {
  mkdir -p "$WORK/$t/units/$1"
  printf '%s' "$2" >"$WORK/$t/units/$1/verdict.json"
}

judge() {
  CORRECTION_EXPECTED="$(sed -n "s/^CORRECTION_EXPECTED='\\(.*\\)'$/\\1/p" "$HERE/../verify.sh")" node "$HERE/judge.mjs" click_correction "$UNIT" "$1" 9 >"$WORK/out.txt" 2>&1
}

report() {
  node "$HERE/report.mjs" "$WORK/$t" "$@" >"$WORK/out.txt" 2>&1
}

passing_unit_records_every_check() {
  correction_unit 40
  ready
  judge 0 || { cat "$WORK/out.txt"; fail "a passing unit exited non-zero"; }
  [[ "$(field "$UNIT/verdict.json" outcome)" == '"passed"' ]] || fail "outcome $(field "$UNIT/verdict.json" outcome)"
  [[ "$(field "$UNIT/verdict.json" checks)" == '{"lastClickInATickWins":true}' ]] || fail "checks $(field "$UNIT/verdict.json" checks)"
  grep -qx "PASS unit click_correction: 1 checks in 9 s" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no PASS line"; }
}

failing_check_is_named() {
  correction_unit 41
  ready
  if judge 0; then fail "a unit with a failing check exited zero"; fi
  [[ "$(field "$UNIT/verdict.json" failed)" == '["lastClickInATickWins"]' ]] || fail "failed $(field "$UNIT/verdict.json" failed)"
  grep -qx "FAIL unit click_correction: lastClickInATickWins" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the failing check is not named"; }
}

page_error_fails_the_selected_unit() {
  correction_unit 40
  printf '["Uncaught Error: boom"]' >"$UNIT/click-correction-page-errors.json"
  ready
  if judge 0; then cat "$WORK/out.txt"; fail "a unit with a recorded page error exited zero"; fi
  grep -qx "FAIL unit click_correction: noPageErrors" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the page error is not named"; }
  [[ "$(field "$UNIT/verdict.json" pageErrors)" == '{"click-correction-page-errors.json":["Uncaught Error: boom"]}' ]] || fail "pageErrors $(field "$UNIT/verdict.json" pageErrors)"
  if report click_correction; then cat "$WORK/out.txt"; fail "the stage passed a selected unit with a recorded page error"; fi
  [[ "$(field "$WORK/$t/browser-checks.json" units.click_correction.failed)" == '["noPageErrors"]' ]] || fail "browser-checks.json does not record the page error"
}

page_errors_that_are_not_a_list_fail_the_unit() {
  correction_unit 40
  printf '{"message":"boom"}' >"$UNIT/click-correction-page-errors.json"
  ready
  if judge 0; then cat "$WORK/out.txt"; fail "a page-errors capture that is not a list passed"; fi
  grep -qx "FAIL unit click_correction: noPageErrors" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the malformed capture is not named"; }
}

missing_capture_aborts_the_unit() {
  correction_unit 40
  rm "$UNIT/click-correction.json"
  ready
  if judge 0; then fail "a unit with a missing capture exited zero"; fi
  [[ "$(field "$UNIT/verdict.json" cause)" == '"captures"' ]] || fail "cause $(field "$UNIT/verdict.json" cause)"
  [[ "$(field "$UNIT/verdict.json" detail)" == '["click-correction.json"]' ]] || fail "detail $(field "$UNIT/verdict.json" detail)"
}

failed_drive_aborts_with_its_log() {
  correction_unit 40
  printf 'verify: the click correction page never started ticking\n' >"$UNIT/unit.log"
  ready
  if judge 1; then fail "a unit whose drive failed exited zero"; fi
  [[ "$(field "$UNIT/verdict.json" cause)" == '"drive"' ]] || fail "cause $(field "$UNIT/verdict.json" cause)"
  grep -qx "FAIL unit click_correction: aborted in its drive: verify: the click correction page never started ticking" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the abort does not name the logged step"; }
}

unit_without_a_verdict_fails_the_stage() {
  verdict_file click_correction '{"unit":"click_correction","seconds":9,"outcome":"passed","checks":{"lastClickInATickWins":true},"observed":{}}'
  ready
  if report click_correction stored_view; then cat "$WORK/out.txt"; fail "the stage passed with a selected unit that never reported"; fi
  grep -qx "FAIL unit stored_view: no verdict" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the unit without a verdict is not named"; }
  [[ "$(field "$WORK/$t/browser-checks.json" units.stored_view.outcome)" == '"missing"' ]] || fail "browser-checks.json does not record the missing unit"
}

cross_check_waits_for_its_units() {
  verdict_file supplies '{"unit":"supplies","seconds":9,"outcome":"passed","checks":{"suppliesCarried":true},"observed":{"hoverText":{"brew-heal.png":{"width":1280,"action":[900,950],"name":[955,1100]}}}}'
  ready
  report supplies || { cat "$WORK/out.txt"; fail "the stage failed on a check it could not judge"; }
  grep -qx "NOT JUDGED check hoverTextOnCanvas: needs units keybinds" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the unjudged cross-unit check is not listed"; }
  [[ "$(field "$WORK/$t/browser-checks.json" notJudged.hoverTextOnCanvas)" == '["keybinds"]' ]] || fail "browser-checks.json does not record the unjudged check"
}

cross_check_judges_once_its_units_ran() {
  verdict_file supplies '{"unit":"supplies","seconds":9,"outcome":"passed","checks":{"suppliesCarried":true},"observed":{"hoverText":{"brew-heal.png":{"width":1280,"action":[900,950],"name":[955,1278]}}}}'
  verdict_file keybinds '{"unit":"keybinds","seconds":9,"outcome":"passed","checks":{"keyBoundAndSaved":true},"observed":{"hoverText":{"keybinds.png":{"width":1280,"action":null,"name":null}}}}'
  ready
  if report supplies keybinds; then cat "$WORK/out.txt"; fail "hover text that runs past the canvas edge passed"; fi
  grep -qx "FAIL check hoverTextOnCanvas across 2 units" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the cross-unit check was not judged"; }
}

failed=0
for t in \
  passing_unit_records_every_check \
  failing_check_is_named \
  page_error_fails_the_selected_unit \
  page_errors_that_are_not_a_list_fail_the_unit \
  missing_capture_aborts_the_unit \
  failed_drive_aborts_with_its_log \
  unit_without_a_verdict_fails_the_stage \
  cross_check_waits_for_its_units \
  cross_check_judges_once_its_units_ran; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
