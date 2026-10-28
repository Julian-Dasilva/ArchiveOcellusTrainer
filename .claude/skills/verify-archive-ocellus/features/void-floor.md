# Void floor

The floor turns to void twice in each 60-tick cycle. The inner void covers the 5x5 under and around Ocellus from P4 tick 8 to 29. The outer void floods every other platform tile from 39 to 58. Both draw as starry near-black tiles inside a glowing purple rim in the default 3D view. A player who starts a tick on void takes 9 to 11 damage that tick: on the flood from 44, five ticks after it forms, and on the inner square from 10 by default. The 5x5 stays safe during the flood, including the tiles under the boss. Void blocks neither walking nor line of sight, so a ranged shot from the flood reaches the boss.

## Sub-features

- `void-inner` draws the 5x5 as void from P4 tick 8 and clears it at 30.
- `void-flood` draws every platform tile outside the 5x5 as void from 39 and clears it at 59.
- `void-flood-damage` lands a `floor-hit` row on each tick from 44 that the player starts on the flood, with amounts from the seeded `floorDamage` stream, until the flood clears or the player dies.
- `void-ring-safe` lands no `floor-hit` while the player starts each tick inside the 5x5 during the flood.
- `void-walkable` lets the player walk across the flood into the 5x5.
- `void-ranged-sight` lets the ranged setup fire the blowpipe from a flood tile outside the 5x5, across the flood, and land the dart on the boss.
- `void-inner-choice` selects the inner void's rule with the `innerVoidFloor` choice: `one-tick-grace` (default, damage from 10), `outer-rule` (from 13) or `harmless`. The page always uses the default; Vitest drives the other two.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and stand on spawn: the flood reaches the spawn tile and its damage starts at P4 tick 44.
- Walk into the 5x5 before P4 tick 44 to stand in the safe ring.
- Stay on the flood past tick 44 and click the boss: the blowpipe fires from where you stand and the floor keeps hitting you until you walk in.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with no page open yet.

- **Stand on the flood.** Open `?seed=75` (`VOID_FLOOR_QUERY`), with no Practice, and wait until `snapshot().tick` is at least 8. Wait for P4 tick 12 and screenshot `void-inner.png`. It shows the starry 5x5 with its purple rim under the boss while the player stands north of it. Every mechanic acts on this page, so the player must survive the inner series and get the drained HP back before the flood decides the run. On the tick before each of marks 17, 19, 21 and 23 (`ORB_CLAIM_DODGE_MARKS`), click two tiles along the player's row, alternating direction, with `step_on_marks`. Click the orb's tile (9, 4) after P4 tick 24 (`ORB_GLOW_TICK`) and spawn (5, 1) after tick 30 (`VOID_RETURN_TICK`). Wait for tick 44 and screenshot `void-flood.png`. It shows the flood under the player. Wait until `snapshot().fight.run.kind` is `ended`. The `floor-hit` rows in `log()` are `VOID_FLOOR_HITS`, `[[44,10],[45,9]]`, as `[at, receipt.applied]`, all on (5, 1), and `run-ended` is `VOID_RUN_END`, `[[45,"death"]]`: the cycle's other hits leave the player low, so the flood's second hit kills them. No `death-prevented` event appears.
- **Shoot across the flood, then walk in.** Open `?seed=4&practice=1` (`VOID_SHOT_QUERY`) and wait until `snapshot().ticking` is `true` and `snapshot().tick` is at least 8. Click `WALK_TARGET_TILE` (8, 3) at its `tileCentre` and wait until `snapshot().player` is (8, 3). Wait 1200 ms for the camera to settle, then click `EDGE_ORDER_TILE` (8, 0), which stops the player on the edge tile (8, 1). The default setup is ranged, so the player holds the blowpipe. On P4 tick 44 (`FLOOD_DAMAGE_TICK`), when the flood starts to damage, click the boss with `click_boss`. Wait until a `log()` row from tick 44 on has `combatDraws` above 0, which is the tick the blowpipe fires. Then click the ring tile (5, 3) at its `tileCentre`. Wait for tick 52 and run `agent-browser screenshot "$PWD/.verify/<run>/flood-ring.png"`. The screenshot shows the starry flood around the lit 5x5 and the player in the ring beside the boss. The shot fires from (8, 1) on a tick a `floor-hit` lands on that tile, crosses the flood, and lands as a `player-hit-judged` event with style `ranged` and outcome `blocked`, with no boss HP lost on that row, because Deflect Range is up for the whole outer void. From 44 to 58 (`FLOOD_LAST_TICK`), a `floor-hit` lands on exactly the ticks the player starts outside the 5x5, and none lands once the player stands in it. The walk-in tick moves by one between runs, with the click's place in the tick. Wait for tick 58 and read `log()` into `void-shot.json`.
- **Pixels.** The script counts screenshot pixels within 10 of the void colour `VOID_PIXEL` (`#1e2529`) in each channel. `before.png`, taken before any void, has under 0.3% inside the 61-pixel box around the arena centre (5, 5), because the fallen quadrants around the platform are as dark as the void. `void-inner.png` has between 0.6% and 3% of the whole screen. `void-flood.png` and `flood-ring.png` each have over 3%.
- **Scripted.** `scripts/verify.sh browser` runs both steps in the `void_floor` and `void_shot` units and records `floodHitsStandingStill`, `innerVoidDrawn`, `mortalWithoutTheParameter`, `rangedShotFromTheFlood`, `rangedShotDeflected` and `ringSparedInFlood` in their units' `verdict.json`. `noVoidBeforeTheFight` is in `p4_cycle`'s, and `floodDrawn`, which reads both void units, is in `browser-checks.json`. The shot's launch tick, tile and landing are under `observed.floodShot`, each flood tick's start tile and floor hit under `observed.floodRows`, and the measured shares under `observed.voidPixelShare`. The checks expect the launch on the edge tile (8, 1), outside the 5x5, on a tick the floor hits it, and a blocked ranged landing after it with no boss HP lost. They pin neither the launch tick, which moves with the click's place in the tick, nor the damage, whose rolls the loadout tests own.

## Gotchas

- Click the ring tile only after the blowpipe fires. A floor click before the attack cancels it, and `rangedShotFromTheFlood` then fails.
- The shot runs with `practice=1`, so the explosions and the transition attacks before the flood do not end the run before the shot. The standing page runs without it, and `mortalWithoutTheParameter` needs no `death-prevented` event there.
- The melee setup is not driven across the flood. Its scythe reaches the boss only from the ring, so it would show the same walk across void tiles that the ring click already shows.
- Without a pinned seed the floor amounts and the inner orb's tile differ, so the standing page's orb click misses. The tick numbers and the safe tiles do not change.
- The standing page ends at P4 tick 45 with the player dead. Wait on `run.kind`, not `run.tick`, because an ended run has no current tick.
