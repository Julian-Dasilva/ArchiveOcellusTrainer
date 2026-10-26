#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SHA=0123456789abcdef0123456789abcdef01234567

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

install_gh() {
  mkdir -p "$WORK/bin" "$WORK/fixture"
  cat >"$WORK/bin/gh" <<'EOF'
#!/bin/sh
cmd="$1 $2"
dir=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--dir" ]; then dir="$arg"; fi
  prev="$arg"
done
case "$cmd" in
  "run list") cat "$FIXTURE/runs.json" ;;
  "run download")
    if [ -f "$FIXTURE/verdict.json" ]; then
      mkdir -p "$dir"
      cp "$FIXTURE/verdict.json" "$dir/verdict.json"
      exit 0
    fi
    echo "no artifact" >&2
    exit 1
    ;;
  "run view")
    if [ -f "$FIXTURE/jobs.json" ]; then cat "$FIXTURE/jobs.json"; exit 0; fi
    echo '{"jobs":[]}'
    ;;
  *) echo "unexpected gh $*" >&2; exit 1 ;;
esac
EOF
  chmod +x "$WORK/bin/gh"
}

runs() {
  printf '%s\n' "$1" >"$WORK/fixture/runs.json"
}

ask() {
  FIXTURE="$WORK/fixture" PATH="$WORK/bin:$PATH" node "$ROOT/scripts/verify/ci-verdict.mjs" "$SHA" >"$WORK/out.txt" 2>"$WORK/err.txt"
}

no_run_is_missing() {
  install_gh
  ready
  runs '[]'
  ask
  local status=$?
  [[ "$status" -eq 2 ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "no run exited ${status}"; }
  grep -qx "ci: no test workflow run for ${SHA}" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the missing run is not named"; }
}

a_run_in_progress_is_not_a_verdict() {
  install_gh
  ready
  runs '[{"databaseId":7,"status":"in_progress","conclusion":null,"url":"https://github.com/example/actions/runs/7","headSha":"'"$SHA"'"}]'
  ask
  local status=$?
  [[ "$status" -eq 2 ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "an in-progress run exited ${status}"; }
  grep -qx "ci: https://github.com/example/actions/runs/7 is in_progress" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the in-progress run is not named"; }
}

a_finished_run_without_a_verdict_is_missing() {
  install_gh
  ready
  runs '[{"databaseId":8,"status":"completed","conclusion":"success","url":"https://github.com/example/actions/runs/8","headSha":"'"$SHA"'"}]'
  rm -f "$WORK/fixture/verdict.json"
  ask
  local status=$?
  [[ "$status" -eq 2 ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "a run without a verdict exited ${status}"; }
  grep -qx "ci: https://github.com/example/actions/runs/8 has no t2-verdict artifact" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the missing artifact is not named"; }
}

a_passing_verdict_passes() {
  install_gh
  ready
  runs '[{"databaseId":9,"status":"completed","conclusion":"success","url":"https://github.com/example/actions/runs/9","headSha":"'"$SHA"'"}]'
  printf '%s\n' '{"passed":true}' >"$WORK/fixture/verdict.json"
  printf '%s\n' '{"jobs":[{"name":"summary","conclusion":"success","status":"completed","startedAt":"2026-10-26T20:00:00Z","completedAt":"2026-10-26T20:00:12Z"}]}' >"$WORK/fixture/jobs.json"
  ask || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "a passing verdict failed"; }
  grep -qx "ci: T2 PASS" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "T2 PASS is missing"; }
  grep -qx "https://github.com/example/actions/runs/9" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the run url is missing"; }
  grep -qx "ci: summary success 12s" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the job time is missing"; }
}

a_failing_verdict_fails() {
  install_gh
  ready
  runs '[{"databaseId":10,"status":"completed","conclusion":"failure","url":"https://github.com/example/actions/runs/10","headSha":"'"$SHA"'"}]'
  printf '%s\n' '{"passed":false}' >"$WORK/fixture/verdict.json"
  printf '%s\n' '{"jobs":[]}' >"$WORK/fixture/jobs.json"
  ask
  local status=$?
  [[ "$status" -eq 1 ]] || { cat "$WORK/out.txt" "$WORK/err.txt"; fail "a failing verdict exited ${status}"; }
  grep -qx "ci: T2 FAIL" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "T2 FAIL is missing"; }
}

failed=0
for t in \
  no_run_is_missing \
  a_run_in_progress_is_not_a_verdict \
  a_finished_run_without_a_verdict_is_missing \
  a_passing_verdict_passes \
  a_failing_verdict_fails; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
