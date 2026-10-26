# Floor holes

The P4 platform carries black holes with a purple rim, drawn from cache model 62508 with its idle sequence 14891. They lie on their tiles from P4 tick 0 to the end of the run and never move. By default every run lays the `corner-stack` layout: three holes in a north-south line in the platform's north-east corner, on (11, 1), (11, 2) and (11, 3), against the brazier walkway. Those are the tiles a team leaves when it stacks on one corner tile in each earlier quadrant. The layout comes from the platform rows, so it moves with the walkway. `floorHoleLayout=scattered` draws one of the four footage layouts from the seed instead. The outer flood hides the holes while it is drawn, from P4 tick 39 to 58. A hole is walkable, and a player who starts a tick on one takes 9 to 11 that tick, whether or not the flood hides it. The damage is an assumption, because no capture shows anyone on a hole.

## Sub-features

- `hole-layout` puts the holes on the tiles of the layout that the fight log header names in `choices.floorHoleLayout`. `floorHoleLayout=scattered` names the footage layout the seed drew, and `floorHoleLayout=v1-turn`, `v1-mirror`, `j1-mirror` or `j1-turn` lays that one.
- `hole-drawn` draws each hole on its tile from P4 tick 0.
- `hole-under-flood` hides every hole while the outer flood is drawn and shows it again when the flood clears.
- `hole-hit` lands a `hole-hit` row on each tick that the player starts on a hole, with amounts from the seeded `holeDamage` stream. No row lands on a tick that starts beside a hole.
- `hole-harmless` lands no `hole-hit` when the URL has `floorHoleDamage=harmless`.
- `hole-focus` lays holes in the full fight and the `Floor holes` drill only.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and look at the top left of the screen, in the corner against the walkway, for the three black holes.
- Add `floorHoleLayout=scattered` to the URL for a footage layout that changes with the seed.
- Walk onto a hole and stand there: a red hitsplat lands every tick.
- Pick `Floor holes` in the `Focus` selector to practise with the holes alone.
- Add `floorHoleDamage=harmless` to the URL to walk over the holes without damage.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold. The camera has not been turned since the page loaded.

- **See the holes.** Run `agent-browser open "http://127.0.0.1:8002/?seed=1&focus=floor-holes"` and wait until `snapshot().ticking` is `true` and `snapshot().tick` is at least 8. Wait 1200 ms and screenshot `holes-drawn.png`. The screen shows three black holes with purple rims at the top left, in a line down the corner beside the walkway. The script counts pixels no brighter than 30 in any channel in a 17-pixel box around each listed hole and each listed free tile. `HOLE_PIXELS` gives each box's offset from the canvas centre for (11, 1), (11, 2) and (11, 3), and `HOLE_FREE_PIXELS` gives the boxes for (10, 2) and (10, 1), the floor west of the middle and northern holes. One run measured 99, 99 and 98% dark in the hole boxes and 0% in both free boxes.
- **See the flood hide them.** On the same page, screenshot `holes-flood.png` 300 ms after P4 tick 45. Every hole box shows the flood's starfield, and one run measured 0% dark in each.
- **Stand on a hole.** On the same page, click `HOLE_TILE` (11, 2) at its projection, as in [click-to-walk.md](click-to-walk.md), which walks the player there from spawn. Wait until `log()` has three `hole-hit` events and screenshot `hole-hit.png`, which shows red hitsplats over the player on the flood. One run took 10, 10 and 11 at P4 ticks 49 to 51 on (11, 2), after ticks 0 to 48 on spawn and the walk there with no hit.
- **Scripted.** `scripts/verify.sh browser --unit floor_holes` runs these steps and records `holesDrawnOnLayout`, `holesHiddenUnderFlood` and `holeHitsStandingOnIt` in `units/floor_holes/verdict.json`, with the measurements under `observed.holes`. The first needs the header's layout to be `corner-stack` with its three tiles, every hole box at least `HOLE_MIN_DARK_SHARE` (30%) dark and every free box at most `HOLE_MAX_DARK_SHARE` (5%). The second needs every hole box at most 5% dark under the flood. The third needs exactly one `hole-hit` on each row that starts on a hole tile and none on any other row, at least one row off the holes, at least `HOLE_HITS` (3) hits, all on (11, 2), and each amount from 9 to 11.

## Gotchas

- The `Floor holes` drill draws the flood but does not let it hit, so every hit on the page is a hole's. In the full fight a hole under a damaging flood hits as well as the flood.
- The boxes assume the camera the page loads with, centred on spawn and facing south. A turned camera moves every hole off its box.
- Without `seed=1` the default layout is the same, but the hit amounts differ. With `floorHoleLayout=scattered` the layout changes with the seed too.
