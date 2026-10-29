#!/usr/bin/env bash
set -uo pipefail

CHECK="$(cd "$(dirname "$0")" && pwd)/replay-controls.mjs"
FIXTURES="$(cd "$(dirname "$0")/../fixtures/replay-controls" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$NAME"
}

SUITE='src/sections.test.ts::sections'

CASES="$(cat <<EOF
shell_clean|clean||0|1 file(s) replayed, 1 unchanged control(s), 0 acknowledged
guard:shell_violation|violation||1|BROKEN scripts/drive.test.sh::walk_passes passes on the base but not after the overlay
guard:before_each|vitest|before-each|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
guard:top_level_side_effect|vitest|top-level-side-effect|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
guard:changed_import|vitest|changed-import|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
guard:unacknowledged_fixture|vitest||1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay;BROKEN ${SUITE} > a page without About misses only About passes on the base but not after the overlay
acknowledged_fixture|vitest|acknowledged|0|1 file(s) replayed, 4 unchanged control(s), 2 acknowledged;ACKNOWLEDGED ${SUITE} > a healthy page has no problems fails after the overlay: HEALTHY lists Display;ACKNOWLEDGED ${SUITE} > a page without About misses only About fails after the overlay: HEALTHY lists Display
partly_acknowledged|vitest|partly-acknowledged|1|1 acknowledged;ACKNOWLEDGED ${SUITE} > a healthy page has no problems fails after the overlay: HEALTHY lists Display;BROKEN ${SUITE} > a page without About misses only About passes on the base but not after the overlay
stale_missing|vitest|stale-missing|1|2 acknowledged;STALE ${SUITE} > a page that does not exist is acknowledged but is not a control of a replayed file
stale_passing|vitest|stale-passing|1|2 acknowledged;STALE ${SUITE} > Fight comes first is acknowledged but passes after the overlay
inherited_acknowledgement|vitest|inherited|0|4 unchanged control(s), 2 acknowledged
acknowledged_collection_crash|vitest|acknowledged-collection-crash|1|0 acknowledged;BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
acknowledged_before_all|vitest|acknowledged-before-all|1|0 acknowledged;BROKEN ${SUITE} > hooked > a healthy page has no problems passes on the base but not after the overlay
acknowledged_file_error|vitest|acknowledged-file-error|1|0 acknowledged;BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay: no section Display
ambiguous_duplicate|vitest|ambiguous-duplicate|1|0 acknowledged;AMBIGUOUS ${SUITE} > a healthy page has no problems is acknowledged but more than one test has that name;BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
ambiguous_collision|vitest|ambiguous-collision|1|0 acknowledged;AMBIGUOUS ${SUITE} > hooked > a healthy page has no problems is acknowledged but more than one test has that name;BROKEN ${SUITE} > hooked > a healthy page has no problems passes on the base but not after the overlay
multiline_file_error|vitest|multiline-file-error|1|0 acknowledged;BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay: cleanup failed
malformed_acknowledgement|vitest|malformed|2|review-ratchet/replay-acknowledged.json at 
EOF
)"

run_case() {
  local name="$1" fixture="$2" variant="$3" status="$4" lines="$5"
  local side="$WORK/$name"
  cp -R "$FIXTURES/$fixture" "$side"
  if [[ -n "$variant" ]]; then cp -R "$side/variants/$variant/." "$side/"; fi
  bash "$FIXTURES/make-repo.sh" "$side" || { echo "setup failed"; return 1; }
  ready
  node "$CHECK" --repo "$side/repo" --base base --head head >"$WORK/$name.out" 2>&1
  local actual=$?
  [[ "$actual" == "$status" ]] || { cat "$WORK/$name.out"; fail "exit $actual, expected $status"; }
  local line
  while IFS= read -r line; do
    grep -qF -- "$line" "$WORK/$name.out" || { cat "$WORK/$name.out"; fail "missing: $line"; }
  done <<<"${lines//;/$'\n'}"
}

failed=0
report() {
  if ("$@") >"$WORK/case.log" 2>&1; then
    echo "PASS $NAME"
  else
    echo "FAIL $NAME"
    failed=1
  fi
  sed 's/^/  /' "$WORK/case.log"
}
while IFS='|' read -r name fixture variant status lines; do
  NAME="$name" report run_case "$name" "$fixture" "$variant" "$status" "$lines"
done <<<"$CASES"
exit $failed
