# Floor holes

The P4 platform carries black holes with a purple rim, drawn from cache model 62508 with its idle sequence 14891. They lie on their tiles from P4 tick 0 to the end of the run and never move. The page lays the default `corner-stack` layout: three holes in a north-south line in the platform's north-east corner, on (11, 1), (11, 2) and (11, 3), against the walkway band. Those are the tiles a team leaves when it stacks on one corner tile in each earlier quadrant. The layout comes from the platform rows, so it moves with the walkway. The outer flood hides the holes while it is drawn, from P4 tick 39 to 58. A hole is walkable, and a player who starts a tick on one takes 9 to 11 that tick, whether or not the flood hides it. The damage is an assumption, because no capture shows anyone on a hole.

## Sub-features

- `hole-layout` puts the holes on the tiles of the layout that the fight log header names in `choices.floorHoleLayout`, `corner-stack` on the page. The `scattered` option and the four footage layouts (`v1-turn`, `v1-mirror`, `j1-mirror`, `j1-turn`) are reachable only from Vitest, because the page reads no choice from its link.
- `hole-drawn` draws each hole on its tile from P4 tick 0.
- `hole-under-flood` hides every hole while the outer flood is drawn and shows it again when the flood clears.
- `hole-hit` lands a `hole-hit` row on each tick that the player starts on a hole, with amounts from the seeded `holeDamage` stream. No row lands on a tick that starts beside a hole.
- `hole-harmless` lands no `hole-hit` under the `floorHoleDamage` choice's `harmless` option. Vitest owns it.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and look for the three black holes in the corner against the walkway band.
- Walk onto a hole and stand there: a red hitsplat lands every tick.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold. The camera has not been turned since the page loaded.

- **See the holes.** Open `?seed=1&practice=1` (`HOLES_QUERY`) and wait until `snapshot().ticking` is `true` and `snapshot().tick` is at least 8. Wait 1200 ms and screenshot `holes-drawn.png`. The screen shows three black holes with purple rims in a line down the corner beside the walkway band. Read the page pixel of each hole tile in `HOLE_LAYOUT` and of each free tile in `HOLE_FREE_TILES`, (10, 2) and (10, 1), the floor west of the middle and northern holes, from `tileCentre` plus the canvas box, into `holes-pixels.json`. The script counts pixels no brighter than 30 in any channel in a box `HOLE_BOX_HALF_PX` (8) pixels each way around each of those pixels.
- **See the flood hide them.** On the same page, screenshot `holes-flood.png` 300 ms after P4 tick 45 (`HOLE_FLOOD_SHOT_TICK`). Every hole box shows the flood's starfield.
- **Stand on a hole.** On the same page, click `HOLE_TILE` (11, 2) at its projection, as in [click-to-walk.md](click-to-walk.md), which walks the player there from spawn. Wait until `log()` has three `hole-hit` events and screenshot `hole-hit.png`, which shows red hitsplats over the player on the flood.
- **Scripted.** `scripts/verify.sh browser --unit floor_holes` runs these steps and records `holesDrawnOnLayout`, `holesHiddenUnderFlood` and `holeHitsStandingOnIt` in `units/floor_holes/verdict.json`, with the measurements under `observed.holes`. The first needs the header's layout to be `corner-stack` with its three tiles, every hole box at least `HOLE_MIN_DARK_SHARE` (30%) dark and every free box at most `HOLE_MAX_DARK_SHARE` (5%). The second needs every hole box at most 5% dark under the flood. The third needs exactly one `hole-hit` on each row that starts on a hole tile and none on any other row, at least one row off the holes, at least `HOLE_HITS` (3) hits, all on (11, 2), and each amount within `HOLE_DAMAGE`, 9 to 11.

## Gotchas

- Every page runs the whole cycle, so a player on a hole during the flood takes a `floor-hit` as well as the `hole-hit`. Practice keeps the player alive through both, and the check counts only `hole-hit` events.
- The pixels come from `tileCentre` on the page that took the screenshot. A turned camera, or a player who moved between the read and the screenshot, moves every hole off its box.
- Without `seed=1` the layout is the same, but the hit amounts differ.
