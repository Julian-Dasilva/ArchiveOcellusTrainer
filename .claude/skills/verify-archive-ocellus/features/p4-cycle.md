# P4 cycle

Phase 4 starts after GET READY. Ocellus (NPC 16677) is hidden for 4 ticks, then appears on his tile and takes damage from P4 tick 4, shouts "End..." at 5, and the first inner void forms at 8. The fight then repeats a 60-tick cycle of inner void, transition, outer void and transition, with the boss overhead on its own track. Every boss step adds one row to the fight log. Choosing a focus reloads the drill at once with only that mechanic acting while the cycle still runs in full. The void floor ([void-floor.md](./void-floor.md)), the lifeforce hit and orb ([lifeforce-orb.md](./lifeforce-orb.md)), the personal explosions ([explosions.md](./explosions.md)), the transition attack ([transition-attack.md](./transition-attack.md)), and the boss overheads, Soul Split heal and void rifts ([overheads-rifts.md](./overheads-rifts.md)) act.

## Sub-features

- `cycle-lead-in` hides the boss for P4 ticks 0 to 3, shows him and lets him take damage from tick 4 ([p4-recorded-fights.md](./p4-recorded-fights.md)), and shows "End..." over him from tick 5 for 3 ticks.
- `cycle-stages` enters the inner void at 8, the first transition at 30, the outer void at 39, the second transition at 59 and the next inner void at 68.
- `cycle-overheads` switches the boss overhead to Deflect Melee at 8, Soul Split at 33, none at 38, Deflect Range at 39, Soul Split at 61 and none at 67, independent of the floor stage. The boss shows no overhead on the tick before each void.
- `cycle-transition-attacks` names each transition attack variant; `specialSelection=replay-v2` replays V2's order, vortex at 37 and spike disk at 65.
- `cycle-log` keeps one row per boss step from P4 tick 0, with no gaps.
- `boss-3d` draws NPC 16677 in the default 3D view with the boss HP bar at 1312 / 5250.
- `drill-focus` reloads the drill as soon as a focus is chosen. The Restart button reloads it with the typed seed, or a fresh one.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and wait; the cycle runs on its own.
- Add URL options for a fixed run, for example `?seed=1&specialSelection=replay-v2`. Every choice in `OcellusTimings.ts` is a URL key, and its option keys are the values.
- Pick a focus in the `Focus` selector at the bottom left. The drill reloads with it. To change the seed, edit `Seed` and press `Restart`.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=1&specialSelection=replay-v2`.

- **Hidden lead-in.** A new browser's first screenshot takes about 10 s, which is longer than the hidden ticks. Take one screenshot of `about:blank` before you open the trainer. Then wait for P4 tick 0 with `>= 0` and `--timeout 90000`, then run `agent-browser screenshot "$PWD/.verify/<run>/hidden.png"` and read `snapshot()`. `fight.run.tick` is 3 or less and `fight.boss.visible` is `false`. The screenshot shows the arena and the player with no boss model.
- **Boss present.** Wait for P4 tick 12. Run `agent-browser wait --fn "(window.__archiveOcellusProbe?.snapshot().fight?.run.tick ?? -1) >= 12" --timeout 30000`, then `agent-browser screenshot "$PWD/.verify/<run>/boss.png"`. The screenshot shows the boss model on his 3x3 tile south of the player, ahead of the camera, and the `Ocellus 1312 / 5250 (25.0%)` bar. A `fillText` recorder installed when the page opens keeps every bar text the canvas draws, by P4 tick; through tick 12 it reads only `1312 / 5250 (25.0%)`, a quarter of the default 5,250 rounded down. `snapshot().fight.boss.npcId` is `16677` and `snapshot().fight.boss.visible` is `true`.
- **Cycle.** The player must step off each explosion mark, pray against each transition attack and reach the safe 5x5 before the flood's damage starts at 44, or the run ends long before 70. After the walk and edge checks the player stands on the edge tile (8, 1). On each inner mark tick (17 to 27) it steps with `click_after_tick` after the tick before ([explosions.md](./explosions.md)), alternately on the canvas centre, one tile south, and `EDGE_CLICK_DOWN_PX` (160) below it, past the north edge, which stops it on (8, 1) again. Column 8 from y 1 to 5 is floor outside the 5x5, so a step that overshoots is still safe, and the player is back on (8, 1) after the sixth step. After tick 33 `click_after_tick` clicks Protect from Magic ([transition-attack.md](./transition-attack.md)). Wait for P4 tick 39, compute the canvas centre from `agent-browser get box "#world"`, and click `RING_CLICK_RIGHT_PX` (140) right of and `RING_CLICK_UP_PX` (40) above it with `mouse move/down/up`. That walks the player to (5, 3), the middle of the 5x5's north row, where it waits out the flood. On each outer mark tick (48 to 58) `click_after_tick` steps one tile west or east, west first. Those steps drift by up to two tiles, and from (5, 3) every tile they reach is inside the 5x5. One run stepped to (4, 3), (5, 3), (3, 3), (5, 3), (3, 3) and (5, 3). After tick 61 `click_after_tick` clicks Protect from Range. The bow shot across the flood runs on its own `void-floor` reload ([void-floor.md](./void-floor.md), shoot across the flood). Wait for P4 tick 70 with the same command and `>= 70`, `--timeout 90000`. Run `agent-browser --json eval "window.__archiveOcellusProbe.log()"`. The `stage-entered` events up to tick 70 are `[[0,"lead-in"],[8,"inner-void"],[30,"after-inner"],[39,"outer-void"],[59,"after-outer"],[68,"inner-void"]]`, the `overhead-switched` events are `[[8,"deflect-melee"],[33,"soul-split"],[38,null],[39,"deflect-range"],[61,"soul-split"],[67,null],[68,"deflect-melee"]]`, the `special-hit` beats are vortex at 37 and spike disk at 65, and the row ticks run 0, 1, 2 and on without a gap.
- **Focus.** Type the box's seed back with `agent-browser fill "#seed" 1`, then run `agent-browser select "#focus" transition-attacks` and do not click Restart. Choosing a focus reloads the drill. The page reloads with `focus=transition-attacks` in its URL and the selector shows `Transition attacks`. After P4 tick 40, `log().header.choices.focus.key` is `transition-attacks` and the only beat kinds in the rows are `boss-shouts`, `boss-landing-starts`, `special-tell`, `special-sound`, `special-hit` and `soul-split-heal`.
- **Scripted.** `scripts/verify.sh browser` runs these steps in the `p4_cycle` and `focus` units and records `bossHiddenInLeadIn`, `bossDrawnOncePresent`, `bossBarReadsEntryHpOncePresent`, `stagesOnSchedule`, `overheadsOnSchedule`, `transitionAttacksReplayed`, `logHasEveryTick`, `bossIsExpectedNpc` and `focusApplied` in their units' `verdict.json`. In `p4_cycle` the lead-in capture runs right after the page opens, before the walk check on the same page.

## Gotchas

- The camera trails the player by about a tick, so a click two ticks after a step lands relative to where the player was. Side steps on every mark drift: one run stepped to (7, 1), (9, 1), (7, 1) and on instead of back to (8, 1), and its ring click from (9, 1) reached the flood tile (8, 3). Step where a drift of two tiles stays safe, or end the series on a click past the edge.
- P4 tick 0 is the first boss step after GET READY, not world tick 0. Wait on `snapshot().fight.run.tick`, not on `snapshot().tick`.
- Without `seed` in the URL each load draws a fresh seed, so the default `random-uniform` transition attack variants differ between loads. Pin `seed` and `specialSelection` for literal checks.
- The boss HP bar stays visible while the boss is hidden, as in the V2 footage. Only the model disappears.
- The NPC bundle carries 18 animations and is about 27 MB, so the first load takes longer than before. The death animation 14872 is not declared, because one of its frame sounds is missing from cache 2746 and the asset build stops on it.
- The `Restart` button reloads the page. Read the reloaded state only after the URL check passes, or the probe answers for the old page.
