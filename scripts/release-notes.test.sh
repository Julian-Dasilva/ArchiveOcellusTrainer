#!/usr/bin/env bash
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/release-notes.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# shell-test-runs-entry.mjs credits a case's failure under a mutation only to an assertion after the case's ready line, so a case calls ready once its setup is done.
fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

changelog() {
  CHANGELOG="$WORK/$t.ts"
  printf 'export const CHANGELOG = [\n%s\n];\n' "$1" >"$CHANGELOG"
}

expect_rejected() {
  local reason="$1"
  ready
  if node "$SCRIPT" "$CHANGELOG" >"$WORK/out.txt" 2>"$WORK/err.txt"; then
    cat "$WORK/out.txt"
    fail "release-notes accepted the changelog"
  fi
  [[ ! -s "$WORK/out.txt" ]] || { cat "$WORK/out.txt"; fail "release-notes printed notes for a rejected changelog"; }
  grep -qF "$reason" "$WORK/err.txt" || { cat "$WORK/err.txt"; fail "missing '${reason}'"; }
}

newest_release_prints_as_markdown() {
  changelog '{ version: "2026.11.02.2", notes: ["Second fix.", "Third fix."] },
{ version: "2026.11.02", notes: ["First fix.", "Older fix."] },'
  ready
  node "$SCRIPT" "$CHANGELOG" >"$WORK/out.txt" 2>"$WORK/err.txt" || { cat "$WORK/err.txt"; fail "release-notes rejected a valid changelog"; }
  [[ "$(cat "$WORK/out.txt")" == $'## 2026.11.02.2\n\n- Second fix.\n- Third fix.' ]] || { cat "$WORK/out.txt"; fail "unexpected notes"; }
}

shipped_changelog_passes() {
  ready
  node "$SCRIPT" >"$WORK/out.txt" 2>"$WORK/err.txt" || { cat "$WORK/err.txt"; fail "release-notes rejected the shipped changelog"; }
  head -1 "$WORK/out.txt" | grep -qE '^## [0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[0-9]+)?$' || { cat "$WORK/out.txt"; fail "the notes do not start with the version heading"; }
}

dashed_date_is_rejected() {
  changelog '{ version: "2026-11-02", notes: ["A fix.", "Another fix."] },'
  expect_rejected 'newest version "2026-11-02" is not YYYY.MM.DD or YYYY.MM.DD.N'
}

short_year_is_rejected() {
  changelog '{ version: "26.11.02", notes: ["A fix.", "Another fix."] },'
  expect_rejected 'newest version "26.11.02" is not YYYY.MM.DD or YYYY.MM.DD.N'
}

zero_suffix_is_rejected() {
  changelog '{ version: "2026.11.02.0", notes: ["A fix.", "Another fix."] },'
  expect_rejected 'newest version "2026.11.02.0" is not YYYY.MM.DD or YYYY.MM.DD.N'
}

notes_since_a_version_include_every_later_release() {
  changelog '{ version: "2026.10.27", notes: ["Full fight."] },
{ version: "2026.10.26.2", notes: ["Explosions."] },
{ version: "2026.10.26.1", notes: ["Start panel."] },
{ version: "2026.10.26", notes: ["3D view."] },'
  ready
  node "$SCRIPT" --since 2026.10.26 "$CHANGELOG" >"$WORK/out.txt" 2>"$WORK/err.txt" || { cat "$WORK/err.txt"; fail "release-notes rejected --since"; }
  [[ "$(cat "$WORK/out.txt")" == $'## 2026.10.27\n\n- Full fight.\n\n## 2026.10.26.2\n\n- Explosions.\n\n## 2026.10.26.1\n\n- Start panel.' ]] || { cat "$WORK/out.txt"; fail "notes since 2026.10.26"; }
}

repeated_version_is_rejected() {
  changelog '{ version: "2026.11.02", notes: ["A fix.", "Another fix."] },
{ version: "2026.10.30", notes: ["Old fix.", "Older fix."] },
{ version: "2026.11.02", notes: ["First fix.", "Older fix."] },'
  expect_rejected "newest version 2026.11.02 repeats an earlier release"
}

failed=0
for t in \
  newest_release_prints_as_markdown \
  shipped_changelog_passes \
  dashed_date_is_rejected \
  short_year_is_rejected \
  zero_suffix_is_rejected \
  notes_since_a_version_include_every_later_release \
  repeated_version_is_rejected; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
