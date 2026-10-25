#!/usr/bin/env bash
set -uo pipefail

CHECK="$(cd "$(dirname "$0")" && pwd)/check-types.mjs"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
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

clean_tree() {
  T="$(mktemp -d "$WORK/case.XXXXXX")"
  mkdir -p "$T/src/content/ocellus/js/p4" "$T/src/content/ocellus/tests" "$T/src/sim/sdk" "$T/test"
  cat >"$T/src/sim/brands.ts" <<'EOF'
export type Tick = number & { readonly brand: "tick" };
EOF
  cat >"$T/src/sim/schedule.ts" <<'EOF'
import type { Tick } from "./brands";
export const at = (t: Tick): Tick => t;
EOF
  cat >"$T/src/sim/sdk/binding.ts" <<'EOF'
import type { Player } from "osrs-sdk";
import type { Tick } from "../brands";
export const turn = (player: Player, t: Tick): [Player, Tick] => [player, t];
EOF
  cat >"$T/src/content/ocellus/js/P4Types.ts" <<'EOF'
export type Tick = number & { readonly brand: "tick" };
export const STAGES = ["inner-void", "outer-void"] as const;
EOF
  cat >"$T/src/content/ocellus/js/p4/floor.ts" <<'EOF'
import { at } from "../../../../sim/schedule";
export const floor = at;
EOF
  cat >"$T/src/content/ocellus/js/p4/schedule.ts" <<'EOF'
import type { Tick } from "../P4Types";
export const first = { at: 0 } satisfies { at: number };
export function later(t: Tick): number { return t + 1; }
EOF
  cat >"$T/src/content/ocellus/js/OcellusRegion.ts" <<'EOF'
import { later } from "./p4/schedule";
export const region = later;
EOF
  cat >"$T/src/content/ocellus/tests/cycle.test.ts" <<'EOF'
import { region } from "../js/OcellusRegion";
import type { Tick } from "../js/P4Types";
export const used: [typeof region, Tick | null] = [region, null];
EOF
  cat >"$T/src/content/ocellus/tests/public-forms.test.ts" <<'EOF'
import region = require("../js/OcellusRegion");
export const load = () => import("../js/OcellusRegion");
export type Region = typeof import("../js/OcellusRegion").region;
export const types = require("../js/P4Types");
export const used = region;
EOF
  cat >"$T/src/content/ocellus/tests/public-forms.js" <<'EOF'
export { region } from "../js/OcellusRegion";
EOF
  cat >"$T/test/setupFiles.ts" <<'EOF'
export const canvas = {} as unknown as HTMLCanvasElement;
EOF
}

plant() {
  mkdir -p "$(dirname "$T/$1")"
  printf '%s\n' "${2//@ROOT@/$T}" >"$T/$1"
}

expect_clean() {
  clean_tree
  ready
  node "$CHECK" "$T" >"$T/out.txt" 2>&1 || { cat "$T/out.txt"; fail "check-types failed on the clean tree"; }
  grep -q "check-types: 0 finding(s)" "$T/out.txt" || { cat "$T/out.txt"; fail "check-types did not report 0 findings"; }
}

expect_finding() {
  local file="$1" body="$2" rule="$3"
  clean_tree
  plant "$file" "$body"
  ready
  if node "$CHECK" "$T" >"$T/out.txt" 2>&1; then
    fail "check passed although ${file} contains: ${body}"
  fi
  grep -q "^${file}:[0-9]*:[0-9]* ${rule}" "$T/out.txt" || { cat "$T/out.txt"; fail "missing '${rule}' finding for ${file}"; }
}

expect_compile_error() {
  local file="$1" from="$2" to="$3" error="$4" source
  T="$(mktemp -d "$WORK/case.XXXXXX")"
  cp -R "$REPO/src" "$REPO/test" "$REPO/tsconfig.json" "$T/" && ln -s "$REPO/node_modules" "$T/node_modules" || return 1
  source="$(cat "$T/$file")"
  [[ "$source" == *"$from"* ]] || fail "${file} no longer contains: ${from}"
  printf '%s\n' "${source/"$from"/"$to"}" >"$T/$file"
  ready
  if (cd "$T" && node_modules/.bin/tsc --noEmit -p .) >"$T/out.txt" 2>&1; then
    fail "tsc accepted ${to} in ${file}"
  fi
  grep -F "${file}(" "$T/out.txt" | grep -qF "$error" || { cat "$T/out.txt"; fail "missing '${error}' in ${file}"; }
}

clean_tree_passes() { expect_clean; }
helmet_factory_rejects_a_weapon() {
  expect_compile_error src/content/ocellus/js/OcellusLoadout.ts \
    "inquisitorsGreatHelm: () => new InquisitorsGreatHelm()" "inquisitorsGreatHelm: () => new OcellusScythe()" \
    "error TS2322: Type 'OcellusScythe' is not assignable to type 'Helmet'."
}
void_masks_reject_a_swapped_mask() {
  expect_compile_error src/content/ocellus/js/p4/floor.ts \
    '"inner-void": voidMask("inner-void")' '"inner-void": voidMask("outer-void")' \
    "error TS2322: Type 'TileSet<\"outer-void\">' is not assignable to type 'TileSet<\"inner-void\">'."
}
explicit_any_fails() { expect_finding src/content/ocellus/js/p4/roll.ts 'export const x: any = 1;' "explicit any"; }
as_cast_fails() { expect_finding src/content/ocellus/js/p4/roll.ts 'export const x = (1 as number);' "type assertion with as"; }
double_cast_fails() { expect_finding src/App.tsx 'export const x = ("1" as unknown as number);' "type assertion with as"; }
angle_bracket_cast_fails() { expect_finding src/content/ocellus/js/p4/roll.ts 'export const x = <number>(1);' "angle-bracket type assertion"; }
non_null_fails() { expect_finding src/content/ocellus/js/p4/roll.ts 'export const f = (s?: string) => s!.length;' "non-null assertion"; }
definite_assignment_fails() { expect_finding src/content/ocellus/js/p4/roll.ts 'export class C { n!: number; }' "definite assignment assertion"; }
ts_ignore_fails() { expect_finding src/content/ocellus/js/p4/roll.ts $'// @ts-ignore\nexport const x: number = "1";' "compiler suppression comment"; }
ts_expect_error_fails() { expect_finding src/content/ocellus/tests/roll.test.ts $'/* @ts-expect-error */\nexport const x: number = "1";' "compiler suppression comment"; }
ts_nocheck_fails() { expect_finding src/assets.ts $'// @ts-nocheck\nexport const x = 1;' "compiler suppression comment"; }
test_import_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'import { later } from "../js/p4/schedule";' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
app_import_of_internal_fails() { expect_finding src/DrillControls.tsx 'export { later } from "./content/ocellus/js/p4/schedule";' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
test_helper_import_of_internal_fails() { expect_finding test/helper.ts 'import { later } from "../src/content/ocellus/js/p4/schedule";' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
import_equals_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'import schedule = require("../js/p4/schedule");' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
dynamic_import_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'export const load = () => import("../js/p4/schedule");' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
import_type_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'export type Later = typeof import("../js/p4/schedule").later;' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
require_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'export const schedule = require("../js/p4/schedule");' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
js_reexport_of_internal_fails() { expect_finding src/content/ocellus/tests/helper.js 'export { later } from "../js/p4/schedule";' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
declaration_file_import_of_internal_fails() { expect_finding src/globals.d.ts 'export type Later = typeof import("./content/ocellus/js/p4/schedule").later;' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
backtick_import_of_internal_fails() { expect_finding src/content/ocellus/tests/schedule.test.ts 'export const load = () => import(`../js/p4/schedule`);' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
test_file_inside_the_fight_fails() { expect_finding src/content/ocellus/js/p4/schedule.test.ts 'export const later = 1;' "test file inside the fight"; }
absolute_import_of_internal_fails() { expect_finding src/App.tsx 'export { later } from "@ROOT@/src/content/ocellus/js/p4/schedule";' "import of fight internal src/content/ocellus/js/p4/schedule.ts"; }
sim_import_of_content_fails() { expect_finding src/sim/schedule.ts 'import type { Tick } from "../content/ocellus/js/P4Types";' "sim import from outside src/sim src/content/ocellus/js/P4Types.ts"; }
sim_import_of_app_fails() { expect_finding src/sim/schedule.ts 'export const app = () => import("../ArchiveOcellusApp");' "sim import from outside src/sim src/ArchiveOcellusApp"; }
sim_core_import_of_the_sdk_fails() { expect_finding src/sim/schedule.ts 'import type { Player } from "osrs-sdk";' "sim core import of the SDK osrs-sdk"; }
sim_core_import_of_an_sdk_package_fails() { expect_finding src/sim/tiles.ts 'export const react = () => import("osrs-sdk-react");' "sim core import of the SDK osrs-sdk-react"; }
sim_core_import_of_the_sim_sdk_fails() { expect_finding src/sim/schedule.ts 'export { turn } from "./sdk/binding";' "sim core import of src/sim/sdk src/sim/sdk/binding.ts"; }
sourced_value_without_a_wiki_answer_fails() {
  expect_compile_error src/content/ocellus/js/OcellusTimings.ts \
    '"one-tile shard", noWiki("the Void Rift infobox leaves size empty (rev 15380527)"), cache("npc 16678 size")' '"one-tile shard", cache("npc 16678 size")' \
    "error TS2345: Argument of type '[Source]' is not assignable to parameter of type 'Citations<Source>'."
}
no_wiki_answer_followed_by_a_wiki_reference_fails() {
  expect_compile_error src/content/ocellus/js/OcellusTimings.ts \
    '"one-tile shard", noWiki("the Void Rift infobox leaves size empty (rev 15380527)"), cache("npc 16678 size")' '"one-tile shard", noWiki("the Void Rift infobox leaves size empty (rev 15380527)"), VOID_RIFT_PAGE' \
    "is not assignable to parameter of type 'Citations<Source>'."
}

fight_log_registry_with_an_unlisted_id_fails() {
  expect_compile_error src/content/ocellus/js/OcellusTimings.ts \
    '  L8: { recorded: "2026-10-23", fight: "raid"' '  L9: { recorded: "2026-10-23", fight: "raid"' \
    "is not assignable to type 'Readonly<Record<FightLog,"
}

failed=0
for t in \
  clean_tree_passes \
  explicit_any_fails \
  as_cast_fails \
  double_cast_fails \
  angle_bracket_cast_fails \
  non_null_fails \
  definite_assignment_fails \
  ts_ignore_fails \
  ts_expect_error_fails \
  ts_nocheck_fails \
  test_import_of_internal_fails \
  app_import_of_internal_fails \
  test_helper_import_of_internal_fails \
  import_equals_of_internal_fails \
  dynamic_import_of_internal_fails \
  import_type_of_internal_fails \
  require_of_internal_fails \
  js_reexport_of_internal_fails \
  declaration_file_import_of_internal_fails \
  backtick_import_of_internal_fails \
  test_file_inside_the_fight_fails \
  absolute_import_of_internal_fails \
  sim_import_of_content_fails \
  sim_import_of_app_fails \
  sim_core_import_of_the_sdk_fails \
  sim_core_import_of_an_sdk_package_fails \
  sim_core_import_of_the_sim_sdk_fails \
  helmet_factory_rejects_a_weapon \
  void_masks_reject_a_swapped_mask \
  sourced_value_without_a_wiki_answer_fails \
  no_wiki_answer_followed_by_a_wiki_reference_fails \
  fight_log_registry_with_an_unlisted_id_fails; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
