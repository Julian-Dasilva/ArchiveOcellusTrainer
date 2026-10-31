#!/usr/bin/env bash
set -uo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
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

# git and npm are the build's external commands. The application install marks that the reader step finished and fails, so the build stops there.
mkdir "$WORK/bin"
cat >"$WORK/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  init) mkdir -p "$3" ;;
  -C) [[ "$3" != fetch ]] || echo fetch >>"$T/fetches" ;;
esac
EOF
cat >"$WORK/bin/npm" <<'EOF'
#!/usr/bin/env bash
if [[ "$PWD" != "$NETLIFY_CACHE_DIR"/* ]]; then
  : >"$T/reached-app-install"
  exit 1
fi
[[ ! -e "$T/npm-fails" ]] || exit 1
mkdir node_modules
EOF
chmod +x "$WORK/bin/git" "$WORK/bin/npm"

setup() {
  T="$(mktemp -d "$WORK/case.XXXXXX")"
  mkdir -p "$T/app/scripts"
  cp "$SCRIPTS/netlify-build.sh" "$T/app/scripts/"
  cp "$SCRIPTS/../osrs-assets.config.ts" "$T/app/"
  CACHE_ROOT="$T/cache/archive-ocellus"
  READER="${CACHE_ROOT}/osrscachereader-1111111111111111111111111111111111111111"
}

build() {
  rm -f "$T/reached-app-install"
  T="$T" PATH="$WORK/bin:$PATH" NETLIFY_CACHE_DIR="$T/cache" \
    OSRS_CACHE_READER_REPO="https://example.invalid/osrscachereader.git" \
    OSRS_CACHE_READER_COMMIT="1111111111111111111111111111111111111111" \
    bash "$T/app/scripts/netlify-build.sh"
  [[ -e "$T/reached-app-install" ]]
}

failed_install_is_not_reused() {
  setup
  : >"$T/npm-fails"
  ready
  if build; then fail "build continued although the reader's npm ci failed"; fi
  [[ ! -e "$READER" ]] || fail "a failed install left $READER"
  rm "$T/npm-fails"
  build || fail "retry failed"
  [[ -d "$READER/node_modules" ]] || fail "retry did not install the reader"
  [[ "$(ls "$CACHE_ROOT")" == "osrscachereader-1111111111111111111111111111111111111111" ]] || fail "cache root holds: $(ls "$CACHE_ROOT" | tr '\n' ' ')"
}

installed_reader_is_reused() {
  setup
  ready
  build || fail "first build failed"
  build || fail "second build failed"
  local fetched
  fetched="$(wc -l <"$T/fetches" | tr -d ' ')"
  [[ "$fetched" == 1 ]] || fail "fetched $fetched times, expected 1"
}

changed_pin_removes_the_old_reader() {
  setup
  mkdir -p "$CACHE_ROOT/osrscachereader-0000000000000000000000000000000000000000" "$CACHE_ROOT/openrs2/2746"
  ready
  build || fail "build failed"
  [[ "$(ls "$CACHE_ROOT" | tr '\n' ' ')" == "openrs2 osrscachereader-1111111111111111111111111111111111111111 " ]] || fail "cache root holds: $(ls "$CACHE_ROOT" | tr '\n' ' ')"
}

only_configured_openrs2_cache_is_kept() {
  setup
  sed 's/openrs2: 2746/openrs2: 2747/' "$T/app/osrs-assets.config.ts" >"$T/config"
  mv "$T/config" "$T/app/osrs-assets.config.ts"
  mkdir -p "$CACHE_ROOT/openrs2/2746" "$CACHE_ROOT/openrs2/2747" "$CACHE_ROOT/openrs2/2748"
  echo keep >"$CACHE_ROOT/openrs2/2747/data"
  ready
  build || fail "build failed"
  [[ "$(ls "$CACHE_ROOT/openrs2")" == 2747 ]] || fail "cache ids other than the configured id remain"
  [[ "$(cat "$CACHE_ROOT/openrs2/2747/data")" == keep ]] || fail "the configured cache was changed"
}

failed=0
for t in \
  failed_install_is_not_reused \
  installed_reader_is_reused \
  changed_pin_removes_the_old_reader \
  only_configured_openrs2_cache_is_kept; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
