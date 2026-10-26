# Void floor

The floor turns to void twice in each 60-tick cycle. The inner void covers the 5x5 under and around Ocellus from P4 tick 8 to 29. The outer void floods every other platform tile from 39 to 58. Both draw as starry near-black tiles inside a glowing purple rim in the default 3D view. A player who starts a tick on void takes 9 to 11 damage that tick: on the flood from 44, five ticks after it forms, and on the inner square from 10 by default. The 5x5 stays safe during the flood, including the tiles under the boss. Void blocks neither walking nor line of sight, so a Twisted Bow shot from the flood lands on the boss.

## Sub-features

- `void-inner` draws the 5x5 as void from P4 tick 8 and clears it at 30.
- `void-flood` draws every platform tile outside the 5x5 as void from 39 and clears it at 59.
- `void-flood-damage` lands a `floor-hit` row on each tick from 44 that the player starts on the flood, with amounts from the seeded `floorDamage` stream, until the flood clears or the player dies.
- `void-ring-safe` lands no `floor-hit` while the player starts each tick inside the 5x5 during the flood.
- `void-walkable` lets the player walk across the flood into the 5x5.
- `void-ranged-sight` lets the ranged setup fire the Twisted Bow from a flood tile outside the 5x5, across the flood, and land the arrow on the boss.
- `void-inner-choice` selects the inner void's rule with `innerVoidFloor`: `one-tick-grace` (default, damage from 10), `outer-rule` (from 13) or `harmless`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and stand still: the flood reaches the spawn tile and its damage starts at P4 tick 44.
- Walk into the 5x5 before P4 tick 44 to stand in the safe ring.
- Stay on the flood past tick 44 and click the boss: the bow fires from where you stand and the floor keeps hitting you until you walk in.
- Pick `Void floor` in the `Focus` selector and press `Restart` to practise the floor alone.
- Add `innerVoidFloor=outer-rule` or `innerVoidFloor=harmless` to the URL for the other inner-void rules.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, and the P4 cycle recipe has run on `http://127.0.0.1:8002/?seed=1&specialSelection=replay-v2`.

- **Stand on the flood.** After the focus check, run `agent-browser select "#focus" void-floor`. Wait until `focus=void-floor` is in the URL, then wait for P4 tick 12 and screenshot `void-inner.png`. It shows the starry 5x5 with its purple rim under the boss while the player stands north of it. Wait for tick 45 and screenshot `void-flood.png`. It shows the flood under the player with red hitsplats. Wait until `snapshot().fight.run.kind` is `ended`. The `floor-hit` rows in `log()` are `[[44,9],[45,11],[46,10],[47,11],[48,10],[49,9],[50,9],[51,10],[52,9],[53,10],[54,1]]` as `[at, receipt.applied]`, all on (5, 1), and `run-ended` is `[[54,"death"]]`.
- **Shoot across the flood, then walk in.** Run `agent-browser open "http://127.0.0.1:8002/?seed=4&deflect=none&focus=void-floor"` and wait until `snapshot().ticking` is `true` and `snapshot().tick` is at least 8. Click `WALK_CLICK_LEFT_PX` (160) left of and `WALK_CLICK_UP_PX` (50) above the canvas centre, which walks the player from spawn to (8, 3), and wait until `snapshot().player` is (8, 3). Wait 1200 ms for the camera to settle, then click `EDGE_CLICK_DOWN_PX` (160) below the centre, which stops the player on the edge tile (8, 1). The page's default setup is ranged, so the player holds the Twisted Bow. Wait for P4 tick 44 with `>= 44`, when the flood starts to damage. Compute the canvas centre from `agent-browser get box "#world"` and click `BOSS_CLICK_RIGHT_PX` (150) right of and `BOSS_CLICK_UP_PX` (150) above it with `mouse move/down/up`. That pixel is the boss's body while the camera is centred on (8, 1). Wait until a `log()` row from tick 44 on has `combatDraws` above 0, which is the tick the bow fires. Then click `RING_CLICK_RIGHT_PX` (140) right of and `RING_CLICK_UP_PX` (40) above the centre, which walks the player to the ring tile (5, 3). Wait for tick 52 and run `agent-browser screenshot "$PWD/.verify/<run>/flood-ring.png"`. The screenshot shows the starry flood around the lit 5x5 and the player in the ring beside the boss. With `seed=4`, the bow fires at tick 45 from (8, 1), the tick a `floor-hit` lands on that tile. The arrow crosses the flood and lands at 48 as a `player-hit-judged` event with style `ranged`, outcome `passed` and `requested` 8, and boss HP falls from 1312 to 1304 on that row. From 44 to 58, a `floor-hit` lands on exactly the ticks the player starts outside the 5x5, and none lands once the player stands on (5, 3). One run had hits from 44 to 46 on (8, 1) and at 47 on (6, 2), with the player on (5, 3) from 48. The walk-in tick moves by one between runs, with the click's place in the tick. Wait for tick 58 and read `log()` into `void-shot.json`.
- **Pixels.** The script counts screenshot pixels within 10 of the void colour `#1e2529` in each channel. `before.png`, taken before any void, has under 0.3%. `void-inner.png` has between 0.6% and 3%. `void-flood.png` and `flood-ring.png` each have over 3%. On the measured platform the inner 5x5 measured 1.6%, the flood 5.0% and 7.9%, and `before.png` 0.08%, so one boundary at 3% tells the square from the flood. A floor mesh facing away from the camera measured 0.1%.
- **Scripted.** `scripts/verify.sh browser` runs both steps in the `void_floor` and `void_shot` units and records `rangedShotFromTheFlood`, `rangedShotLanded`, `ringSparedInFlood`, `floodHitsStandingStill` and `innerVoidDrawn` in their units' `verdict.json`. `noVoidBeforeTheFight` is in `p4_cycle`'s, and `floodDrawn`, which reads both void units, is in `browser-checks.json`. The shot's launch tick, tile and landing are under `observed.floodShot`, each flood tick's start tile and floor hit under `observed.floodRows`, and the measured shares under `observed.voidPixelShare`. The checks expect the launch on the edge tile (8, 1), outside the 5x5, on a tick the floor hits it, and a passed ranged landing after it whose damage is the row's boss HP loss. They pin neither the launch tick, which moves with the click's place in the tick, nor the damage, whose rolls the loadout tests own.

## Gotchas

- Click the ring tile only after the bow fires. A floor click before the attack cancels it, and `rangedShotFromTheFlood` then fails.
- The player takes four floor hits before reaching the ring, about 40 of 99 HP. The shot runs on the `void-floor` drill, where only the floor acts, so no other mechanic decides whether the player survives the walk in.
- The arrow lands at 48 under the boss's Deflect Range, which turns away a ranged hit. `deflect=none` keeps the overhead from deciding whether the shot lands. The overheads-rifts recipe checks deflect on its own page.
- The melee setup is not driven across the flood. Its scythe reaches the boss only from the ring, so it would show the same walk across void tiles that the ring click already shows.
- Without a pinned seed the floor amounts differ, and the arrow can miss: against the boss's 250 ranged defence a bow shot hits about one time in four. The tick numbers and the safe tiles do not change.
- The standing-still page ends at P4 tick 54 with the player dead. Wait on `run.kind`, not `run.tick`, because an ended run has no current tick.
