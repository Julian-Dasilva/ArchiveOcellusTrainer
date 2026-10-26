#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$ROOT"

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

the_base_tree_can_import_the_worker_cap() {
  ready
  local src="$WORK/base"
  mkdir -p "$src/test"
  # shellcheck disable=SC1091
  . scripts/verify/parity-harness.sh
  install_parity_harness "$src" || fail "the harness did not install"
  (
    cd "$src/test/parity" && node --input-type=module -e '
      import { maxWorkers } from "../workerCap.mjs";
      if (maxWorkers({ CI: "1" }) !== undefined) process.exit(1);
      if (maxWorkers({}) !== 2) process.exit(1);
    '
  ) || fail "the head parity config cannot import the worker cap from the base tree"
}

the_parity_stage_installs_that_harness() {
  ready
  grep -q 'install_parity_harness "$src"' scripts/verify.sh || fail "stage_parity does not install the harness onto the base tree"
}

failed=0
for t in \
  the_base_tree_can_import_the_worker_cap \
  the_parity_stage_installs_that_harness; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
