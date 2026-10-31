#!/usr/bin/env bash
set -uo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PIN=1111111111111111111111111111111111111111
OTHER=2222222222222222222222222222222222222222
REAL_NPM="$(command -v npm)"
export REAL_NPM OSRS_SDK_COMMIT="$PIN" OSRS_SDK_REPO=https://example.invalid/osrs-sdk.git
export npm_config_offline=true npm_config_cache="$WORK/npm-cache"

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

# The network and the SDK's own build are the external boundaries.
mkdir "$WORK/bin"
cat >"$WORK/bin/sdk-source" <<'EOF'
#!/usr/bin/env bash
mkdir -p "$1/packages/osrs-sdk-assets" "$1/packages/osrs-sdk-react"
echo '{"name":"osrs-sdk","version":"0.1.8","workspaces":["packages/osrs-sdk-assets","packages/osrs-sdk-react"]}' >"$1/package.json"
echo '{"name":"osrs-sdk-assets","version":"0.1.8"}' >"$1/packages/osrs-sdk-assets/package.json"
echo '{"name":"osrs-sdk-react","version":"0.1.0"}' >"$1/packages/osrs-sdk-react/package.json"
for dir in "$1" "$1/packages/osrs-sdk-assets" "$1/packages/osrs-sdk-react"; do echo 'module.exports = {};' >"$dir/index.js"; done
EOF
cat >"$WORK/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  init) mkdir -p "$3"; echo "$PPID" >"$APP/installer.pid" ;;
  -C)
    case "$3" in
      fetch) echo "${@: -1}" >>"$T/fetches" ;;
      checkout) sdk-source "$2" ;;
      rev-parse) tail -n 1 "$T/fetches" ;;
    esac
    ;;
esac
EOF
cat >"$WORK/bin/npm" <<'EOF'
#!/usr/bin/env bash
case "$PWD:$1" in
  "$APP:ci") echo ci >>"$T/registry-installs"; rm -rf node_modules ;;
  */osrscachereader.*:ci) ;;
  */osrs-sdk:ci)
    if [[ "${BUILD_RESULT:-}" == hold ]]; then
      node - "$APP" "$PWD" <<'NODE'
const fs = require('node:fs');
const [app, work] = process.argv.slice(2);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
  setTimeout(() => {
    fs.mkdirSync(`${work}/late-write`, {recursive: true});
    fs.writeFileSync(`${app}/child-finished`, 'done');
    process.exit(0);
  }, 250);
});
fs.writeFileSync(`${app}/build-ready`, work);
setInterval(() => {
  if (!stopping && fs.existsSync(`${app}/build-release`)) process.exit(0);
}, 25);
NODE
    fi
    ;;
  */osrs-sdk:run)
    echo build >>"$T/builds"
    case "${BUILD_RESULT:-success}" in
      failure) exit 42 ;;
      interrupt) kill -INT "$(cat "$APP/installer.pid")"; exit 130 ;;
    esac
    ;;
  *) exec "$REAL_NPM" "$@" ;;
esac
EOF
chmod +x "$WORK/bin/sdk-source" "$WORK/bin/git" "$WORK/bin/npm"
export PATH="$WORK/bin:$PATH"

setup() {
  T="$(mktemp -d "$WORK/case.XXXXXX")"
  APP="$T/app"
  export T APP HOME="$T/home" VERIFY_DIR="$T/verify" TMPDIR="$T/tmp" XDG_CACHE_HOME="$T/cache"
  unset OSRS_SDK_PACKS NETLIFY_CACHE_DIR NODE_COMPILE_CACHE
  mkdir -p "$APP/scripts" "$HOME" "$TMPDIR" "$XDG_CACHE_HOME"
  cp "$SCRIPTS/install-beta-sdk.sh" "$SCRIPTS/verify.sh" "$APP/scripts/"
  echo '{"name":"app","version":"0.0.0","private":true,"scripts":{"build":"node build.js"}}' >"$APP/package.json"
  echo 'for (const name of ["osrs-sdk", "osrs-sdk-assets", "osrs-sdk-react"]) require(name);' >"$APP/build.js"
  : >"$T/builds"
  : >"$T/fetches"
  : >"$T/registry-installs"
}

packs() {
  local dir="$1" commit="$2" src
  src="$(mktemp -d "$T/src.XXXXXX")"
  sdk-source "$src"
  mkdir -p "$dir"
  (
    cd "$src" || exit 1
    export NODE_COMPILE_CACHE="$T/fixture-node-compile-cache"
    [[ -z "$commit" ]] || "$REAL_NPM" pkg set "gitHead=$commit" --workspaces --include-workspace-root
    "$REAL_NPM" pack --pack-destination "$dir" --silent
    "$REAL_NPM" pack --workspace osrs-sdk-assets --pack-destination "$dir" --silent
    "$REAL_NPM" pack --workspace osrs-sdk-react --pack-destination "$dir" --silent
  ) >/dev/null || return 1
}

installed_from_packs() {
  packs "$T/old-packs" "$1" || return 1
  (cd "$APP" && "$REAL_NPM" install --no-save --no-audit --no-fund "$T"/old-packs/*.tgz >/dev/null)
}

installed_commits() {
  (cd "$APP" && node -p '["osrs-sdk", "osrs-sdk-assets", "osrs-sdk-react"].map((name) => require(`./node_modules/${name}/package.json`).gitHead).join(" ")')
}

count() {
  wc -l <"$1" | tr -d ' '
}

run_verify() {
  bash "$APP/scripts/verify.sh" build >"$T/out.txt" 2>&1 || { cat "$T/out.txt"; fail "verify.sh build failed"; }
}

install_sdk() {
  bash "$APP/scripts/install-beta-sdk.sh" >"$T/out.txt" 2>&1 || { cat "$T/out.txt"; fail "install-beta-sdk.sh failed"; }
}

expect_reinstalled_at_the_pin() {
  [[ "$(count "$T/registry-installs")" == 1 ]] || { cat "$T/out.txt"; fail "verify ran npm ci $(count "$T/registry-installs") times, expected 1"; }
  [[ "$(count "$T/fetches")" == 1 ]] || { cat "$T/out.txt"; fail "verify fetched the SDK $(count "$T/fetches") times, expected 1"; }
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "node_modules holds SDK packages from: $(installed_commits)"
}

expect_built_at_the_pin() {
  [[ "$(cat "$T/fetches")" == "$PIN" ]] || { cat "$T/out.txt"; fail "fetched '$(cat "$T/fetches")', expected the pin alone"; }
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "node_modules holds SDK packages from: $(installed_commits)"
}

install_at_the_pin_is_reused() {
  setup
  bash "$APP/scripts/install-beta-sdk.sh" >"$T/first-install.txt" 2>&1 || { cat "$T/first-install.txt"; return 1; }
  ready
  run_verify
  [[ "$(count "$T/fetches")" == 1 ]] || fail "verify fetched the SDK again"
  [[ "$(count "$T/registry-installs")" == 0 ]] || fail "verify ran npm ci over an install at the pin"
  grep -qxF "install-beta-sdk: installed osrs-sdk commit $PIN matches the pin" "$T/out.txt" || { cat "$T/out.txt"; fail "verify did not name the SDK commit it runs on"; }
}

unrecorded_install_is_replaced() {
  setup
  installed_from_packs "" || return 1
  ready
  run_verify
  expect_reinstalled_at_the_pin
}

install_from_another_commit_is_replaced() {
  setup
  installed_from_packs "$OTHER" || return 1
  ready
  run_verify
  expect_reinstalled_at_the_pin
}

unreadable_installed_manifest_is_replaced() {
  setup
  installed_from_packs "$PIN" || return 1
  echo '{' >"$APP/node_modules/osrs-sdk/package.json"
  ready
  bash "$APP/scripts/verify.sh" build >"$T/out.txt" 2>&1
  local status=$?
  expect_reinstalled_at_the_pin
  [[ $status == 0 ]] || { cat "$T/out.txt"; fail "verify.sh build failed"; }
}

unrecorded_packs_are_refused() {
  setup
  packs "$T/prebuilt" "" || return 1
  ready
  OSRS_SDK_PACKS="$T/prebuilt" install_sdk
  expect_built_at_the_pin
}

packs_from_another_commit_are_refused() {
  setup
  packs "$T/prebuilt" "$OTHER" || return 1
  ready
  OSRS_SDK_PACKS="$T/prebuilt" install_sdk
  expect_built_at_the_pin
}

packs_at_the_pin_are_used() {
  setup
  packs "$T/prebuilt" "$PIN" || return 1
  ready
  OSRS_SDK_PACKS="$T/prebuilt" install_sdk
  [[ "$(count "$T/fetches")" == 0 ]] || fail "built the SDK although the packs are at the pin"
  grep -qxF "install-beta-sdk: installed osrs-sdk commit $PIN matches the pin" "$T/out.txt" || { cat "$T/out.txt"; fail "the install did not name the SDK commit it installed"; }
}

expect_no_installer_leftovers() {
  local entries
  entries="$(ls -A "$TMPDIR")"
  [[ -z "$entries" ]] || fail "TMPDIR contains installer leftovers: $entries"
  entries="$(ls -A "$XDG_CACHE_HOME/archive-ocellus/sdk-packs" 2>/dev/null | grep -v -x "$PIN")"
  [[ -z "$entries" ]] || fail "cache contains unpublished build leftovers: $entries"
}

successful_install_leaves_no_temp_directory() {
  setup
  ready
  install_sdk
  expect_built_at_the_pin
  expect_no_installer_leftovers
}

failed_build_leaves_no_temp_directory() {
  setup
  ready
  BUILD_RESULT=failure bash "$APP/scripts/install-beta-sdk.sh" >"$T/out.txt" 2>&1
  local status=$?
  [[ $status == 42 ]] || { cat "$T/out.txt"; fail "build failure returned $status, expected 42"; }
  [[ "$(count "$T/builds")" == 1 ]] || fail "failed build did not execute"
  expect_no_installer_leftovers
}

interrupted_build_leaves_no_temp_directory() {
  setup
  ready
  BUILD_RESULT=interrupt bash "$APP/scripts/install-beta-sdk.sh" >"$T/out.txt" 2>&1
  local status=$?
  [[ $status == 130 ]] || { cat "$T/out.txt"; fail "SIGINT returned $status, expected 130"; }
  [[ "$(count "$T/builds")" == 1 ]] || fail "interrupted build did not execute"
  expect_no_installer_leftovers
}

second_install_reuses_cached_packs_without_a_clone() {
  setup
  ready
  install_sdk
  rm -rf "$APP/node_modules"
  install_sdk
  [[ "$(count "$T/fetches")" == 1 ]] || fail "second install fetched the SDK again"
  [[ "$(count "$T/builds")" == 1 ]] || fail "second install rebuilt the SDK"
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "cache reuse did not install the pin"
  expect_no_installer_leftovers
}

concurrent_installs_publish_one_valid_cache_entry() {
  setup
  local first_app="$APP" second_app="$T/second-app" first_pid second_pid first_status second_status
  cp -R "$APP" "$second_app"
  ready
  bash "$first_app/scripts/install-beta-sdk.sh" >"$T/first.txt" 2>&1 &
  first_pid=$!
  APP="$second_app" bash "$second_app/scripts/install-beta-sdk.sh" >"$T/second.txt" 2>&1 &
  second_pid=$!
  wait "$first_pid"; first_status=$?
  wait "$second_pid"; second_status=$?
  [[ $first_status == 0 && $second_status == 0 ]] || { cat "$T/first.txt" "$T/second.txt"; fail "concurrent installs returned $first_status and $second_status"; }
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "first concurrent install has wrong pin"
  APP="$second_app"
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "second concurrent install has wrong pin"
  local cache="$XDG_CACHE_HOME/archive-ocellus/sdk-packs" fetches builds
  [[ "$(ls -A "$cache")" == "$PIN" ]] || fail "concurrent installs did not leave exactly one cache entry"
  [[ "$(ls -A "$cache/$PIN" | wc -l | tr -d ' ')" == 3 ]] || fail "cache entry contains more than the three packs"
  fetches="$(count "$T/fetches")"
  builds="$(count "$T/builds")"
  rm -rf "$APP/node_modules"
  install_sdk
  [[ "$(count "$T/fetches")" == "$fetches" ]] || fail "concurrent cache entry did not avoid a later clone"
  [[ "$(count "$T/builds")" == "$builds" ]] || fail "concurrent cache entry did not avoid a later build"
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "published cache did not install the pin"
  expect_no_installer_leftovers
}


seed_damaged_cache() {
  local damage="$1" entry="$XDG_CACHE_HOME/archive-ocellus/sdk-packs/$PIN" file
  packs "$entry" "$PIN" || fail "could not seed cache"
  file="$entry/osrs-sdk-0.1.8.tgz"
  case "$damage" in
    other-commit) packs "$entry" "$OTHER" || fail "could not seed wrong pin" ;;
    missing) rm "$file" ;;
    early-truncation) head -c 10 "$file" >"$file.part"; mv "$file.part" "$file" ;;
    late-truncation)
      mkdir -p "$T/padded/package"
      printf '{"name":"osrs-sdk","version":"0.1.8","gitHead":"%s"}\n' "$PIN" >"$T/padded/package/package.json"
      node -e 'require("node:fs").writeFileSync(process.argv[1], require("node:crypto").randomBytes(65536))' "$T/padded/package/padding"
      tar -czf "$file" -C "$T/padded" package/package.json package/padding
      head -c "$(( $(wc -c <"$file") / 2 ))" "$file" >"$file.part"
      mv "$file.part" "$file"
      local manifest
      manifest="$(tar -xzOf "$file" package/package.json 2>/dev/null)"
      [[ "$manifest" == *"$PIN"* ]] || fail "fixture lost manifest before truncation"
      ;;
  esac
}

expect_damaged_cache_repaired() {
  ready
  install_sdk
  [[ "$(count "$T/builds")" == 1 ]] || fail "damaged entry did not trigger one rebuild"
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "repair did not install the pin"
  rm -rf "$APP/node_modules"
  install_sdk
  [[ "$(count "$T/builds")" == 1 ]] || fail "repaired entry was not reusable"
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "repaired cache did not install the pin again"
  expect_no_installer_leftovers
}

cached_packs_from_another_commit_are_rebuilt() {
  setup
  seed_damaged_cache other-commit
  expect_damaged_cache_repaired
}

cached_pack_missing_is_rebuilt() {
  setup
  seed_damaged_cache missing
  expect_damaged_cache_repaired
}

cached_pack_truncated_before_manifest_is_rebuilt() {
  setup
  seed_damaged_cache early-truncation
  expect_damaged_cache_repaired
}

cached_pack_truncated_after_manifest_is_rebuilt() {
  setup
  seed_damaged_cache late-truncation
  expect_damaged_cache_repaired
}

start_held_builder() {
  set -m
  BUILD_RESULT=hold bash "$APP/scripts/install-beta-sdk.sh" >"$T/builder.txt" 2>&1 &
  builder=$!
  set +m
  trap "kill -KILL -- -$builder 2>/dev/null || true; wait $builder 2>/dev/null || true" EXIT
  node - "$APP/build-ready" <<'NODE'
const fs = require('node:fs');
const deadline = Date.now() + 20000;
const timer = setInterval(() => {
  if (fs.existsSync(process.argv[2])) { clearInterval(timer); process.exit(0); }
  if (Date.now() > deadline) { console.error('builder did not start'); process.exit(1); }
}, 25);
NODE
  [[ $? == 0 ]] || { cat "$T/builder.txt"; fail "builder did not reach SDK dependency install"; }
}

process_group_term_waits_for_writers_and_cleans_build() {
  setup
  local builder status
  start_held_builder
  ready
  kill -TERM -- "-$builder"
  wait "$builder"; status=$?
  [[ -f "$APP/child-finished" ]] || { cat "$T/builder.txt"; fail "installer exited before its child finished writing"; }
  [[ $status == 143 ]] || fail "group TERM returned $status, expected 143"
  expect_no_installer_leftovers
}

next_run_sweeps_a_killed_builder() {
  setup
  local builder work
  start_held_builder
  work="$(cat "$APP/build-ready")"
  ready
  kill -KILL -- "-$builder"
  wait "$builder" 2>/dev/null || true
  [[ -d "$work" ]] || fail "KILL fixture left no build directory to recover"
  install_sdk
  [[ ! -d "$work" ]] || fail "next install left the dead builder directory"
  expect_no_installer_leftovers
}

guard:live_builder_is_not_swept() {
  setup
  local builder work first_app="$APP" second_app="$T/second-app"
  start_held_builder
  work="$(cat "$APP/build-ready")"
  cp -R "$APP" "$second_app"
  ready
  APP="$second_app" install_sdk
  [[ -d "$work" ]] || fail "concurrent install swept a live builder"
  touch "$first_app/build-release"
  wait "$builder" || { cat "$T/builder.txt"; fail "live builder could not finish after concurrent install"; }
  [[ "$(installed_commits)" == "$PIN $PIN $PIN" ]] || fail "live builder installed the wrong pin"
  expect_no_installer_leftovers
}

netlify_default_cache_is_exported_to_children() {
  setup
  cp "$SCRIPTS/netlify-build.sh" "$APP/scripts/"
  mkdir "$T/bin"
  cat >"$T/bin/mkdir" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "${NETLIFY_CACHE_DIR:-unset}" >"$APP/child-cache"
exit 44
SH
  chmod +x "$T/bin/mkdir"
  ready
  PATH="$T/bin:$PATH" NETLIFY_CACHE_DIR= bash "$APP/scripts/netlify-build.sh" >"$T/out.txt" 2>&1
  [[ "$(cat "$APP/child-cache" 2>/dev/null)" == /opt/build/cache ]] || { cat "$T/out.txt"; fail "Netlify did not export its default cache root to child commands"; }
}

failed=0
for t in \
  install_at_the_pin_is_reused \
  unrecorded_install_is_replaced \
  install_from_another_commit_is_replaced \
  unreadable_installed_manifest_is_replaced \
  unrecorded_packs_are_refused \
  packs_from_another_commit_are_refused \
  packs_at_the_pin_are_used \
  successful_install_leaves_no_temp_directory \
  failed_build_leaves_no_temp_directory \
  interrupted_build_leaves_no_temp_directory \
  second_install_reuses_cached_packs_without_a_clone \
  concurrent_installs_publish_one_valid_cache_entry \
  cached_packs_from_another_commit_are_rebuilt \
  cached_pack_missing_is_rebuilt \
  cached_pack_truncated_before_manifest_is_rebuilt \
  cached_pack_truncated_after_manifest_is_rebuilt \
  process_group_term_waits_for_writers_and_cleans_build \
  next_run_sweeps_a_killed_builder \
  guard:live_builder_is_not_swept \
  netlify_default_cache_is_exported_to_children; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
