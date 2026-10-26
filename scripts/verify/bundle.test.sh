#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

WRITE_BUNDLE='
  const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
  const { dirname, join } = require("node:path");
  const [recorded, dir] = process.argv.slice(1);
  for (const [file, base64] of Object.entries(JSON.parse(readFileSync(recorded, "utf8")).complete)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), Buffer.from(base64, "base64"));
  }
'

complete_bundle() {
  ROOT="$WORK/$t"
  mkdir -p "$ROOT"
  cp -R "$REPO/scripts" "$ROOT/scripts"
  for entry in package.json osrs-assets.config.ts tsconfig.json src test node_modules; do ln -s "$REPO/$entry" "$ROOT/$entry"; done
  (cd "$ROOT" && scripts/install-beta-sdk.sh --check) || fail "node_modules does not hold the pinned SDK; run npm ci and scripts/install-beta-sdk.sh"
  (cd "$ROOT" && node_modules/.bin/tsx test/assetBundles.mjs sounds.soundpack >"$WORK/$t-bundles.json" && node -e "$WRITE_BUNDLE" "$WORK/$t-bundles.json" public/osrs-assets) ||
    fail "the bundle could not be written"
}

bundle() {
  VERIFY_DIR="$WORK/$t-evidence" "$ROOT/scripts/verify.sh" bundle >"$WORK/out.txt" 2>&1
}

payload() {
  local file
  file="$(node -e 'const { assets } = require(process.argv[1]); const key = Object.keys(assets).find((key) => key.startsWith(`${process.argv[2]}-`)); if (key) process.stdout.write(assets[key].file)' "$ROOT/public/osrs-assets/manifest.json" "$1")"
  [[ -n "$file" && -f "$ROOT/public/osrs-assets/$file" ]] || fail "the bundle has no $1 payload"
  printf '%s' "$ROOT/public/osrs-assets/$file"
}

complete_bundle_passes() {
  bundle || { cat "$WORK/out.txt"; fail "the complete bundle failed"; }
  grep -qx "PASS bundle" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no PASS bundle line"; }
}

broken_payload_fails() {
  local kind="$1" file
  shift
  complete_bundle
  ready
  complete_bundle_passes
  file="$(payload "$kind")"
  rm "$file"
  [[ $# -eq 0 ]] || "$@" "$file"
  if bundle; then cat "$WORK/out.txt"; fail "a bundle whose $kind payload was removed and replaced by '$*' passed"; fi
  grep -qx "FAIL bundle" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no FAIL bundle line"; }
}

missing_npc_payload_fails() { broken_payload_fails npc; }
missing_model_payload_fails() { broken_payload_fails model; }
missing_item_payload_fails() { broken_payload_fails player-item; }
missing_spotanim_payload_fails() { broken_payload_fails spotanim; }
empty_payload_fails() { broken_payload_fails spotanim touch; }
directory_payload_fails() { broken_payload_fails spotanim mkdir; }
guard:dangling_symlink_payload_fails() { broken_payload_fails spotanim ln -s missing.bin; }

failed=0
for t in \
  missing_npc_payload_fails \
  missing_model_payload_fails \
  missing_item_payload_fails \
  missing_spotanim_payload_fails \
  empty_payload_fails \
  directory_payload_fails \
  guard:dangling_symlink_payload_fails; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
