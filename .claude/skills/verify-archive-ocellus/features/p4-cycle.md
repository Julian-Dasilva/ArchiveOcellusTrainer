# P4 cycle

Phase 4 opens on the standing north-west quadrant, carried from the third fall, after GET READY. P4 tick 0 is the fall's tick, and the fight log's first row is P4 tick 1. Ocellus (NPC 16677) is hidden for 4 ticks, then appears on his tile and takes damage from P4 tick 4, shouts "End..." at 5, and the first inner void forms at 8. The fight then repeats a 60-tick cycle of inner void, transition, outer void and transition, with the boss overhead on its own track. Every boss step adds one row to the fight log. Every page runs the whole cycle: the void floor ([void-floor.md](./void-floor.md)), the lifeforce hit and orb ([lifeforce-orb.md](./lifeforce-orb.md)), the personal explosions ([explosions.md](./explosions.md)), the transition attack ([transition-attack.md](./transition-attack.md)), and the boss overheads, Soul Split heal and void rifts ([overheads-rifts.md](./overheads-rifts.md)) all act.

## Sub-features

- `cycle-lead-in` hides the boss for P4 ticks 0 to 3, shows him and lets him take damage from tick 4 ([p4-recorded-fights.md](./p4-recorded-fights.md)), and shows "End..." over him from tick 5 for 3 ticks.
- `cycle-stages` enters the inner void at 8, the first transition at 30, the outer void at 39, the second transition at 59 and the next inner void at 68.
- `cycle-overheads` switches the boss overhead to Deflect Melee at 8, Soul Split at 33, none at 38, Deflect Range at 39, Soul Split at 61 and none at 67, independent of the floor stage. The boss shows no overhead on the tick before each void.
- `cycle-transition-attacks` names each transition attack variant, drawn from the seed: on seed 1 both attacks of the first cycle, at 37 and 65, are the black disk.
- `cycle-log` keeps one row per boss step from P4 tick 1, with no gaps.
- `boss-3d` draws NPC 16677 in the default 3D view with the boss HP bar at 1313 / 5250, the HP the third fall leaves.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/`, press Start and wait; the cycle runs on its own.
- Add `seed` to the link for a fixed run, for example `?seed=1&practice=1`. The page reads no other fight choice from the link.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=1&practice=1` (`DRILL_QUERY`).

- **Hidden lead-in.** A new browser's first screenshot takes about 10 s, which is longer than the hidden ticks. Take one screenshot of `about:blank` before you open the trainer. Then wait for P4 tick 0 with `>= 0` and `--timeout 90000`, then run `agent-browser screenshot "$PWD/.verify/<run>/hidden.png"` and read `snapshot()`. `fight.run.tick` is 3 or less (`CYCLE_LAST_HIDDEN_TICK`) and `fight.boss.visible` is `false`. The screenshot shows the arena and the player with no boss model.
- **Boss present.** Wait for P4 tick 12. Run `agent-browser wait --fn "(window.__archiveOcellusProbe?.snapshot().fight?.run.tick ?? -1) >= 12" --timeout 30000`, then `agent-browser screenshot "$PWD/.verify/<run>/boss.png"`. The screenshot shows the boss model on his 3x3 tile south of the player, ahead of the camera, and the `Ocellus 1313 / 5250 (25.0%)` bar. A `fillText` recorder installed when the page opens keeps every bar text the canvas drew, by P4 tick; through tick 12 it reads only `BOSS_BAR_AT_ENTRY`, `1313 / 5250 (25.0%)`. `snapshot().fight.boss.npcId` is `16677` and `snapshot().fight.boss.visible` is `true`.
- **Cycle.** The page runs with `practice=1`, so the player does not dodge the explosion marks or pray against the transition attacks; Practice restores full HP on each hit that would kill them. After the walk and edge checks the player stands on the edge tile (8, 1). On P4 tick 39 (`CYCLE_RING_TICK`), click (5, 3), the middle of the 5x5's north row, at its `tileCentre`, so the player waits out the flood in the 5x5. Wait for P4 tick 70 (`CYCLE_LAST_TICK`) with the same command and `>= 70`, `--timeout 90000`. Run `agent-browser --json eval "window.__archiveOcellusProbe.log()"`. The `stage-entered` events up to tick 70 are `CYCLE_STAGE_ENTRIES`, `[[8,"inner-void"],[30,"after-inner"],[39,"outer-void"],[59,"after-outer"],[68,"inner-void"]]`, the `overhead-switched` events are `CYCLE_OVERHEAD_SWITCHES`, `[[8,"deflect-melee"],[33,"soul-split"],[38,null],[39,"deflect-range"],[61,"soul-split"],[67,null],[68,"deflect-melee"]]`, the `special-hit` beats are `CYCLE_SPECIAL_HITS`, the black disk at 37 and at 65, and the row ticks run 1, 2, 3 and on without a gap.
- **No void before the fight.** `before.png`, taken before any click, has under 0.3% of the void colour `VOID_PIXEL` inside the 61-pixel box around the arena centre (5, 5), whose page pixel `before-centre.json` holds. The fallen quadrants around the platform are as dark as the void, so the share reads the 5x5 alone.
- **Scripted.** `scripts/verify.sh browser --unit p4_cycle` runs these steps and records `bossHiddenInLeadIn`, `bossDrawnOncePresent`, `bossBarReadsEntryHpOncePresent`, `stagesOnSchedule`, `overheadsOnSchedule`, `transitionAttacksOnSchedule`, `logHasEveryTick`, `bossIsExpectedNpc` and `noVoidBeforeTheFight` in `units/p4_cycle/verdict.json`. The lead-in capture runs right after the page opens, before the walk check on the same page.

## Gotchas

- P4 tick 0 is the third fall's tick, not world tick 0, and it has no fight log row. Wait on `snapshot().fight.run.tick`, not on `snapshot().tick`.
- Without `seed` in the link each load draws a fresh seed, so the default `random-uniform` transition attack variants differ between loads. Pin `seed` for literal checks.
- The boss HP bar stays visible while the boss is hidden, as in the V2 footage. Only the model disappears.
- The NPC bundle carries 18 animations and is about 27 MB, so the first load takes longer than before. The death animation 14872 is not declared, because one of its frame sounds is missing from cache 2746 and the asset build stops on it.
- The `Restart` button reloads the page on the same seed. Read the reloaded state only after the new page has loaded, or the probe answers for the old page.
- `stage-entered` has no row for the lead-in, because the lead-in starts on P4 tick 0, before the first row.
