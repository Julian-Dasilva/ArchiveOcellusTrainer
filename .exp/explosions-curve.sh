#!/usr/bin/env bash
# Prototype: in-frame glow and shard shares on the explosions drill, driven as drive_explosions drives it.
REPO="${REPO:-/Users/jdas/.treehouse/ArchiveOcellusTrainer-dc17c4/1/ArchiveOcellusTrainer}"
OUT="$1"; RUNS="${2:-1}"; HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"
export VERIFY_PORT="${VERIFY_PORT:-8083}" VERIFY_DIR="$OUT/serve"
source <(sed -e '/^case "\${1:-}" in/,$d' -e 's#^cd "\$(dirname "\$0")/.."#cd '"$REPO"'#' scripts/verify.sh)
mkdir -p "$VERIFY_DIR"
BROWSER_SESSION="proto-exp-$$"
UNIT_LOG="$OUT/proto.log"
trap 'ab close >/dev/null 2>&1; stop' EXIT
serve && doctor || exit 1
ab set viewport 1280 800 >/dev/null
inner=($EXPLOSION_INNER_MARKS) outer=($EXPLOSION_OUTER_MARKS)
sample() { ab eval "window.__glowBox = $EXPLOSION_GLOW_BOX; window.__shardBox = $EXPLOSION_OVERHEAD_BOX; window.__sampleTicks = [$1];" >/dev/null && ab eval "$(cat "$HERE/sampler2.js")" >/dev/null; }
for run in $(seq 1 "$RUNS"); do
  open_ticking "?seed=${ORB_SEED}&focus=${EXPLOSION_DRILL}"
  fight_tick_at_least 0 120000; start_frame_clock; canvas_centre
  sample "14,15,16,17,18,28,29,30,47,48,49"
  click_after_tick $((inner[0] - 1)) "$DODGE_CLICK_SIDE_PX" "$STEP_CLICK_DOWN_PX"
  step_on_marks "-$DODGE_CLICK_SIDE_PX" "${inner[@]:1}"
  click_after_tick "${outer[0]}" "$DODGE_CLICK_SIDE_PX" "$STEP_CLICK_DOWN_PX"
  fight_tick_at_least 50 60000
  ab --json eval "window.__samples" | json data.result > "$OUT/explosions-$run.json"; echo >> "$OUT/explosions-$run.json"
  ab open "${URL}?seed=1&focus=${EXPLOSION_DRILL}&drillStart=cycle-start" >/dev/null
  canvas_centre
  click_after_tick 0 0 "-$UNDER_BOSS_CLICK_UP_PX"
  start_frame_clock; sample "16,17,18"
  fight_tick_at_least 19 30000
  ab --json eval "window.__samples" | json data.result > "$OUT/under-$run.json"; echo >> "$OUT/under-$run.json"
  ab open "${URL}${EXPLOSION_RUN_END_QUERY}" >/dev/null
  fight_tick_at_least 0 120000; start_frame_clock; canvas_centre
  click_after_tick "$EXPLOSION_KILL_CLICK_TICK" 0 "-$HOVER_BOSS_BODY_UP_PX"
  click_after_tick $((inner[0] - 1)) "$DODGE_CLICK_SIDE_PX" "$STEP_CLICK_DOWN_PX"
  sample "16,17,18"
  ab wait --fn "window.__archiveOcellusProbe.snapshot().fight?.run.kind === 'ended'" --timeout 30000 >/dev/null
  ab wait 1500 >/dev/null
  ab --json eval "window.__samples" | json data.result > "$OUT/runend-$run.json"; echo >> "$OUT/runend-$run.json"
done
