#!/usr/bin/env bash
# Prototype: in-frame glow and shard shares on the explosions drill, driven as drive_explosions drives it.
REPO="${REPO:-/Users/jdas/.treehouse/ArchiveOcellusTrainer-dc17c4/1/ArchiveOcellusTrainer}"
OUT="$1"; RUNS="${2:-1}"; HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"
export VERIFY_PORT="${VERIFY_PORT:-8083}" VERIFY_DIR="$OUT/serve"
source <(sed -e '/^case "\${1:-}" in/,$d' -e 's#^cd "\$(dirname "\$0")/.."#cd '"$REPO"'#' scripts/verify.sh)
mkdir -p "$VERIFY_DIR" "$ROOT/.verify"
BROWSER_SESSION="proto-exp-$$"
UNIT_LOG="$OUT/proto.log"
trap 'ab close >/dev/null 2>&1; stop' EXIT
serve && doctor || exit 1
ab set viewport 1280 800 >/dev/null
inner=($EXPLOSION_INNER_MARKS) outer=($EXPLOSION_OUTER_MARKS)
sample() { ab eval "window.__glowBox = $EXPLOSION_GLOW_BOX; window.__shardBox = $EXPLOSION_OVERHEAD_BOX; window.__sampleTicks = [$1];" >/dev/null && ab eval "$(cat "$HERE/sampler2.js")" >/dev/null; }
for run in $(seq 1 "$RUNS"); do
  ab open "${URL}${EXPLOSION_RUN_END_QUERY}" >/dev/null
  fight_tick_at_least 0 120000; start_frame_clock; canvas_centre
  click_after_tick "$EXPLOSION_KILL_CLICK_TICK" 0 "-$HOVER_BOSS_BODY_UP_PX"
  click_after_tick $((inner[0] - 1)) "$DODGE_CLICK_SIDE_PX" "$STEP_CLICK_DOWN_PX"
  sample "16,17,18"
  ab wait --fn "window.__archiveOcellusProbe.snapshot().fight?.run.kind === 'ended'" --timeout 30000 >/dev/null
  ab wait 2500 >/dev/null
  ab --json eval "window.__samples" | json data.result > "$OUT/runend-$run.json"; echo >> "$OUT/runend-$run.json"
done
