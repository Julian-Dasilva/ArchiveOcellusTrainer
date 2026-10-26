# P3 Untether (hidden)

With the `ARCHIVE_P3` flag on, the P3 boss alternates his specials: the smite, then Untether, then the smite again. On Untether's first tick, U (P3 tick 54 in a run), he says "Untether..." for 3 ticks, moves to his Untether tile, so his 3x3 covers x 20 to 22 and y 6 to 8, and floats there for 31 ticks. While he floats he does not chase, a melee click on him lands no hit, and a quadrant break waits for U + 31. Purple tiles show at U + 6, 10, 14 and 18: one under the player and 7 to 10 more across the north-east wedge, under him too. Each erupts 4 ticks after it shows, for 23 to 25 through any prayer, on a player still on it. His magic lands on U + 10, 14, 18 and 22: Protect from Magic takes it to 0, otherwise 15 to 25. The border, spotanim 4319 turned 180 degrees, shows on his centre tile at B = U + 25. On B + 4 the void erupts for 34 to 41 on a player outside his 3x3 at the end of the tick before. On B + 5 he slams for 34 to 42 a player under him at the end of the tick before, or 18 to 21 if the eruption hit that player too. So the player prays Protect from Magic through the purple tiles, steps under him, and clicks him after B + 3 to run out during B + 4. He lands at U + 31 and swings again at U + 37. `specials=smite-only` makes every special the smite. Each chat line names a hit and what avoids it, for example "The void erupted for 34. Stand under him when it erupts."

## Sub-features

- `p3-untether-order` casts Untether as the second special and every other one after it, unless `specials=smite-only`.
- `p3-untether-float` moves him to his Untether tile on the shout, holds him there to U + 31 and blocks melee on him to U + 30.
- `p3-untether-magic` lands magic on U + 10, 14, 18 and 22 that Protect from Magic takes to 0.
- `p3-untether-purple` shows purple tiles, spotanim 4270, under the player and across the wedge, and erupts each 4 ticks later on a player still on it.
- `p3-untether-border` shows the border on his centre tile at B.
- `p3-untether-step-out` spares a player who is under him at the end of B + 3 and out at the end of B + 4. A step out a tick early takes the eruption, and a tick late takes the slam.
- `p3-untether-break` holds a quadrant break that comes due during Untether until U + 31.

## How to get to it (user POV)

- Run the trainer with the flag on (`scripts/verify.sh serve`), and open `?phase=p3&seed=1&invincible=on`.
- Pray Protect from Magic before U + 10. Step off each purple tile before it erupts. Click a tile under him before the border, then a tile beside him after B + 3.
- Add `setup=melee` to see melee blocked while he floats, and `specials=smite-only` to practise the smite alone.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started by `scripts/verify.sh serve` so the flag is on.
- `use3dView` is saved true before the pages open.

Each page reads U from the fight log's `untether-started` event, so the ticks below hold if the smite's timing changes.

- **Stand.** Open `?phase=p3&seed=1&invincible=on`. Click Protect from Magic at the canvas centre plus (`PROTECT_MAGIC_RIGHT_PX`, `PROTECT_DOWN_PX`) after P3 tick 1 and stand still. Screenshots at half of U + 5 and U + 7 bracket the first purple tiles around the player's tile (19, 9), and at half of U + 24 and U + 26 the border around his centre tile (21, 7). The log's first `purple-tiles-shown` is at U + 6 and holds (19, 9), and its `border-shown` is at U + 25. The eruption hits at U + 29 for 34 to 41, the slam is `hazard-avoided` at U + 30, and `#game_chat` has the eruption line.
- **Step out.** Reopen it and pray the same way. After U + 20, click (20, 8), under him. After U + 28, click (20, 9), beside him. The log's `walk-ordered` inputs are (20, 8) and then (20, 9) on U + 29, with no eruption or slam hit, the eruption `hazard-avoided` at U + 29 on a tile under him, and the slam `hazard-avoided` at U + 30 on a tile outside.
- **Melee.** Open `?phase=p3&seed=1&invincible=on&setup=melee`. After U + 3, click his body, 60 px left of and 180 px above his centre tile's pixel (`P3_UNTETHER_BODY_OFFSET`). The log has no `walk-ordered` input, his HP after each tick from U to U + 30 is one value, and it is lower at U + 40.
- **Scripted.** `scripts/verify.sh browser` runs `drive_p3_untether` after `drive_p3_smite`. It writes `p3-untether-*` and `p3-untether-checks.json`, and checks `purpleTilesDrawn`, `borderDrawnOnB`, `eruptionHitsOutside`, `stepUnderThenOutClean`, `floatBlocksMelee` and `noP3UntetherPageErrors`.

## Gotchas

- He floats about 200 px above his tiles in the 3D view, so a left click on a tile under him walks there, and a click meant to attack him goes on his body. In the Vitest drill's 2D projection the same tile click attacks him, so those cases walk under him with `drill.walkTo`.
- A click after tick t moves the player on t + 1. The eruption reads where the player stood at the end of B + 3 and the slam the end of B + 4, so the click out comes after B + 3.
- With Invincible on and the player standing still, the four purple tiles take the player to 3 HP, so the eruption's splat shows 3 and Invincible restores full HP. The log's `requested` keeps the rolled 34.
