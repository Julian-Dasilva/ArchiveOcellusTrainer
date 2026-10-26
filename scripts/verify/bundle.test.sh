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
  import { loadConfig } from "osrs-sdk-assets";
  import { mkdirSync, writeFileSync } from "node:fs";
  const { assets } = await loadConfig();
  const dir = "public/osrs-assets";
  mkdirSync(dir, { recursive: true });
  const m = { cache: { source: "openrs2:2746" }, assets: {}, playerItems: {}, spotAnims: {}, soundEffects: { file: "sounds.soundpack" } };
  const add = (key) => {
    m.assets[key] = { file: `${key}.bin` };
    writeFileSync(`${dir}/${key}.bin`, "x");
    return key;
  };
  for (const { id } of Object.values(assets.npcs)) add(`npc-${id}`);
  for (const { id } of Object.values(assets.models)) add(`model-${id}`);
  for (const { id } of Object.values(assets.items)) m.playerItems[`item:${id}`] = add(`player-item-${id}`);
  for (const { id } of Object.values(assets.spotAnims)) m.spotAnims[id] = add(`spotanim-${id}`);
  const sounds = Object.values(assets.sounds).map(({ id }) => id);
  const pack = Buffer.alloc(6 + 4 * sounds.length);
  pack.writeUInt16BE(sounds.length, 4);
  sounds.forEach((id, n) => pack.writeUInt16BE(id, 6 + 4 * n));
  writeFileSync(`${dir}/sounds.soundpack`, pack);
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(m));
'

complete_bundle() {
  ROOT="$WORK/$t"
  mkdir -p "$ROOT"
  cp -R "$REPO/scripts" "$ROOT/scripts"
  for entry in package.json osrs-assets.config.ts tsconfig.json src node_modules; do ln -s "$REPO/$entry" "$ROOT/$entry"; done
  (cd "$ROOT" && scripts/install-beta-sdk.sh --check) || fail "node_modules does not hold the pinned SDK; run npm ci and scripts/install-beta-sdk.sh"
  (cd "$ROOT" && node --input-type=module -e "$WRITE_BUNDLE") || fail "the bundle could not be written"
  local sprite
  for sprite in $(cd "$ROOT" && node scripts/extract-sprites.mjs --check | sed -n 's/^extract-sprites: missing //p' | tr ',' ' '); do
    mkdir -p "$ROOT/$(dirname "$sprite")" && printf 'png' >"$ROOT/$sprite"
  done
}

bundle() {
  VERIFY_DIR="$WORK/$t-evidence" "$ROOT/scripts/verify.sh" bundle >"$WORK/out.txt" 2>&1
}

payload() {
  local files=("$ROOT"/public/osrs-assets/"$1"-*.bin)
  [[ -f "${files[0]}" ]] || fail "the bundle has no $1 payload"
  printf '%s' "${files[0]}"
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
