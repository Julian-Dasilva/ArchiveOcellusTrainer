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
shell_clean|clean||0|1 file(s) replayed, 1 unchanged control(s), 0 test(s) reading changed declarations
guard:shell_violation|violation||1|BROKEN scripts/drive.test.sh::walk_passes passes on the base but not after the overlay
shared_fixture|vitest||0|1 file(s) replayed, 2 unchanged control(s), 2 test(s) reading changed declarations;NOT A CONTROL ${SUITE} > a healthy page has no problems reads HEALTHY, which the head changed;NOT A CONTROL ${SUITE} > a page without About misses only About reads HEALTHY, which the head changed
transitive_helper|vitest|transitive-helper|0|1 file(s) replayed, 2 unchanged control(s), 2 test(s) reading changed declarations;NOT A CONTROL ${SUITE} > a page without About misses only About reads healthyPage, which the head changed
unchanged_fixture|vitest|unchanged-fixture|1|BROKEN ${SUITE} > an empty page misses Fight passes on the base but not after the overlay;BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay: no section Display
guard:before_each|vitest|before-each|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
guard:top_level_side_effect|vitest|top-level-side-effect|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
guard:changed_import|vitest|changed-import|1|BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay
all_exempt_collection_crash|vitest|all-exempt-collection-crash|1|0 unchanged control(s);BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay: no section Display
all_exempt_import_crash|vitest|all-exempt-import-crash|1|0 unchanged control(s);BROKEN ${SUITE} > a healthy page has no problems passes on the base but not after the overlay: 
read_declaration_crash|vitest|read-declaration-crash|1|0 unchanged control(s);BROKEN ${SUITE} > Display follows Fight passes on the base but not after the overlay: no section Display
all_exempt_assertion_failure|vitest|all-exempt-assertion-failure|0|1 file(s) replayed, 0 unchanged control(s), 1 test(s) reading changed declarations;NOT A CONTROL ${SUITE} > a healthy page has no problems reads HEALTHY, which the head changed
sibling_declarator|vitest|sibling-declarator|1|2 unchanged control(s), 0 test(s) reading changed declarations;BROKEN ${SUITE} > an empty page misses Fight passes on the base but not after the overlay
type_only_read|vitest|type-only-read|1|2 unchanged control(s), 0 test(s) reading changed declarations;BROKEN ${SUITE} > an empty page misses Fight passes on the base but not after the overlay
write_only_read|vitest|write-only-read|1|2 unchanged control(s), 0 test(s) reading changed declarations;BROKEN ${SUITE} > an empty page misses Fight passes on the base but not after the overlay
describe_local_helper|vitest|describe-local-helper|0|1 file(s) replayed, 1 unchanged control(s), 1 test(s) reading changed declarations;NOT A CONTROL ${SUITE} > a healthy page has no problems reads HEALTHY, which the head changed
describe_local_value|vitest|describe-local-value|0|1 file(s) replayed, 1 unchanged control(s), 1 test(s) reading changed declarations;NOT A CONTROL ${SUITE} > a healthy page has no problems reads HEALTHY, which the head changed
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
