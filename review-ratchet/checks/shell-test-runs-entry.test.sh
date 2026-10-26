#!/usr/bin/env bash
set -uo pipefail

CHECK="$(cd "$(dirname "$0")" && pwd)/shell-test-runs-entry.mjs"
FIXTURES="$(cd "$(dirname "$0")/../fixtures/substituted-policy" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# shell-test-runs-entry.mjs credits a case's failure under a mutation only to an assertion after the case's ready line, so a case calls ready once its setup is done.
fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$NAME"
}

POSITION='scripts/build.fixture.sh: passes when scripts/build.sh breaks "errexit is on before prepare_reader runs", so the test does not run the policy it guards'
OTHER_CASES='scripts/netlify-build.fixture.sh fails with exit 1 when scripts/netlify-build.sh breaks "errexit stops the build at the first failed command" without reporting the cases it reports as it is, so no case shows that the test checks the policy'
CRASH='scripts/netlify-build.fixture.sh fails with exit 1 when scripts/netlify-build.sh breaks "errexit stops the build at the first failed command" without a case that prints its ready line in both runs and then fails with an ASSERTION FAILED line, so the failure does not show that the test checks the policy'

# Each row is name|fixture|exit|line|setup. setup runs inside a copy of the fixture before the check, and line must appear in the check's output.
CASES="$(cat <<EOF
clean|clean|0|shell-test-runs-entry: 0 finding(s) in 1 shell test(s)|
violation|violation|1|${POSITION}|
historical_own_errexit|historical-a3c10e6|1|scripts/netlify-build.fixture.sh: passes when scripts/netlify-build.sh breaks "errexit stops the build at the first failed command", so the test does not run the policy it guards|
historical_copied_set_line|historical-9d9143b|1|scripts/netlify-build.fixture.sh: passes when scripts/netlify-build.sh breaks "errexit is on before prepare_reader runs", so the test does not run the policy it guards|
prefixed_reader|clean|1|${POSITION}|cp "\$FIXTURES/variants/prefixed.fixture.sh" scripts/build.fixture.sh
split_string_reader|clean|1|${POSITION}|cp "\$FIXTURES/variants/split-string.fixture.sh" scripts/build.fixture.sh
glob_in_variable|clean|1|${POSITION}|cp "\$FIXTURES/variants/alias-glob.fixture.sh" scripts/build.fixture.sh
glob_in_here_document|clean|1|${POSITION}|cp "\$FIXTURES/variants/heredoc-glob.fixture.sh" scripts/build.fixture.sh
interpreter_option|clean|1|${POSITION}|cp "\$FIXTURES/variants/interpreter-option.fixture.sh" scripts/build.fixture.sh
embedded_copy|clean|1|${POSITION}|cp "\$FIXTURES/variants/embedded-copy.fixture.sh" scripts/build.fixture.sh
unrelated_setup_error|historical-9d9143b|2|${OTHER_CASES}|cp "\$FIXTURES/variants/unrelated-setup-error.fixture.sh" scripts/netlify-build.fixture.sh
setup_assertion|historical-9d9143b|2|${OTHER_CASES}|cp "\$FIXTURES/variants/setup-assertion.fixture.sh" scripts/netlify-build.fixture.sh
setup_reported_as_case|historical-9d9143b|2|${OTHER_CASES}|cp "\$FIXTURES/variants/setup-reported-as-case.fixture.sh" scripts/netlify-build.fixture.sh
crash_inside_case|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/crash-inside-case.fixture.sh" scripts/netlify-build.fixture.sh
marker_before_cases|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/marker-before-cases.fixture.sh" scripts/netlify-build.fixture.sh
setup_assertion_inside_case|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/setup-assertion-inside-case.fixture.sh" scripts/netlify-build.fixture.sh
ready_after_setup|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/ready-after-setup.fixture.sh" scripts/netlify-build.fixture.sh
assertion_before_ready|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/assertion-before-ready.fixture.sh" scripts/netlify-build.fixture.sh
misnamed_ready|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/misnamed-ready.fixture.sh" scripts/netlify-build.fixture.sh
ready_only_when_broken|historical-9d9143b|2|${CRASH}|cp "\$FIXTURES/variants/ready-only-when-broken.fixture.sh" scripts/netlify-build.fixture.sh
unlisted_test|clean|2|scripts/other.test.sh is not listed in review-ratchet/guarded-policies.json, so no mutation checks it|cp scripts/build.fixture.sh scripts/other.test.sh
mutation_text_absent|clean|2|cannot break "errexit stops the build at the first failed command" in scripts/build.sh: "set -euo pipefail\\n" occurs 0 times|sed -i.bak 's/^set -euo pipefail\$/set -eu -o pipefail/' scripts/build.sh && rm scripts/build.sh.bak
failing_test|clean|2|scripts/build.fixture.sh fails with exit 3 before any mutation|printf 'exit 3\n' >scripts/build.fixture.sh
failing_case_as_is|clean|2|scripts/build.fixture.sh reports FAIL failed_install_is_not_reused before any mutation|printf 'echo "FAIL failed_install_is_not_reused"\n' >scripts/build.fixture.sh
passes_only_when_broken|clean|2|scripts/build.fixture.sh fails with exit 1 before any mutation|printf 'grep -q "^set -uo pipefail" scripts/build.sh\n' >scripts/build.fixture.sh
mutation_breaks_syntax|clean|2|cannot break "errexit stops the build at the first failed command" in scripts/build.sh: the mutant fails bash -n|sed -i.bak 's/"replace": "set -uo pipefail/"replace": "fi/' review-ratchet/guarded-policies.json && rm review-ratchet/guarded-policies.json.bak
typescript_mutation_breaks_syntax|typescript|2|cannot break "an empty file is refused" in scripts/size.ts: the mutant fails esbuild|sed -i.bak 's/"replace": "statSync(file).size < 0 ?/"replace": "statSync(file).size === ?/' review-ratchet/guarded-policies.json && rm review-ratchet/guarded-policies.json.bak
mutation_text_twice|clean|2|cannot break "errexit stops the build at the first failed command" in scripts/build.sh: "set -euo pipefail\\n" occurs 2 times|printf 'set -euo pipefail\n' >>scripts/build.sh
missing_policy_file|clean|2|cannot read review-ratchet/guarded-policies.json|rm review-ratchet/guarded-policies.json
EOF
)"

run_case() {
  local name="$1" fixture="$2" status="$3" line="$4" setup="$5"
  local tree="$WORK/$name"
  cp -R "$FIXTURES/$fixture" "$tree"
  (cd "$tree" && eval "$setup") || { echo "setup failed"; return 1; }
  ready
  node "$CHECK" "$tree" >"$WORK/$name.out" 2>&1
  local actual=$?
  [[ "$actual" == "$status" ]] || { cat "$WORK/$name.out"; fail "exit $actual, expected $status"; }
  grep -qxF -- "$line" "$WORK/$name.out" || grep -qxF -- "shell-test-runs-entry: $line" "$WORK/$name.out" || { cat "$WORK/$name.out"; fail "missing: $line"; }
}

hanging_test() {
  local tree="$WORK/hanging"
  cp -R "$FIXTURES/clean" "$tree"
  printf 'sleep 30\n' >"$tree/scripts/build.fixture.sh"
  ready
  node "$CHECK" --timeout 1 "$tree" >"$WORK/hanging.out" 2>&1
  local actual=$?
  [[ "$actual" == 2 ]] || { cat "$WORK/hanging.out"; fail "exit $actual, expected 2"; }
  grep -qxF "shell-test-runs-entry: scripts/build.fixture.sh timed out after 1s before any mutation" "$WORK/hanging.out" || { cat "$WORK/hanging.out"; fail "missing the timeout line"; }
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
while IFS='|' read -r name fixture status line setup; do
  NAME="$name" report run_case "$name" "$fixture" "$status" "$line" "$setup"
done <<<"$CASES"
NAME=hanging_test report hanging_test
exit $failed
