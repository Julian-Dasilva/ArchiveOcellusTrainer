# Lifeforce orb

Four ticks after each void forms, Ocellus takes half the player's current HP, rounded down, whatever prayer is on. A teal swirl plays on the player a tick before the hit. On the hit tick an orb starts to form, never on a floor hole and never under the boss. The inner orb forms 2 to 5 tiles from the player, off the void. The outer orb forms on the 5x5 rim tile farthest from the tile where the player last stepped into the 5x5, or from the player when they are outside it. Its four chimes count down to the glow, and the dark orb shows a tick or two after the hit. Every tile of the measured platform is within 4 tiles of safe floor, so a near-player orb always lands within 5. It glows teal once it is ready, 12 ticks after an inner hit or 6 after an outer one. A player who ends a tick on the ready orb gets back exactly the HP that hit took, the tick after, even above 99. A player already on the orb when it glows gets it back on that tick ([p4-recorded-fights.md](./p4-recorded-fights.md)). An orb stays pickable after its void clears: the inner orb for 5 ticks, into the transition tell, and the outer orb for 2. Then it vanishes, at 35 for the inner orb and 61 for the outer one. The tick after an outer orb nobody took vanishes, it heals the boss by the HP it held.

## Sub-features

- `lifeforce-tell` logs `lifeforce-told` at P4 tick 11 (and 42) and plays spotanim 4313 on the player's tile.
- `lifeforce-hit` logs `lifeforce-drained` at 12 (and 43) with a receipt of `floor(HP / 2)`, through any protection prayer.
- `orb-dormant` logs `orb-spawned` on the hit tick, 12 (and 43), and plays spotanim 4311 (inner) or 4309 (outer) on the orb's tile. Their frame sounds are the orb's four chimes, checked in the [timing cues](./timing-cues.md) recipe.
- `orb-glow` logs `orb-matured` at 24 (and 49) and loops spotanim 4310.
- `orb-return` logs `orb-returned` the tick after the player ends a tick on a ready orb, or on the tick it matures when the player already stands on it, writes the HP back without the max-HP cap, and plays 4312 on the orb and 4314 on the player.
- `orb-expiry` logs `orb-expired` at 36 (and 61) and plays 4312.
- `unclaimed-orb-heal` logs `boss-healed` with cause `unclaimed-orb` at 62 when the outer orb was not collected.
- `orb-opposite-entry` puts the default outer orb on the rim tile farthest in a straight line from the 5x5 entry tile. Equally far tiles are a seeded pick.
- `orb-off-holes` keeps both orbs off every tile of the run's hole layout, under both `outerOrbTile` options. Vitest owns it in `U3-lifeforce-orb.test.ts`.
- `orb-choices` select the pickup radius with `orbPickupRadius` (`on-tile` or `adjacent`), the outer orb's tile with `outerOrbTile` (`opposite-entry`, or the near-player pick `safe-floor`), and the heal with `unclaimedOuterOrb` (`heals-boss` or `off`). The page uses each default; Vitest drives the others.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and watch the HP orb halve at P4 tick 12 and 43 in every cycle.
- Click the orb's tile once it appears and stand on it until it glows. HP comes back on the glow tick. A player who steps on after the glow gets it the tick after.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with no page open yet.
- `public/osrs-assets/manifest.json` lists spotanims 4309 to 4314. `scripts/verify.sh assets` rebuilds the assets when one is missing.
- Every page runs the whole cycle, so the inner explosions start on the player's tile at 17. The recipes use `?seed=75&practice=1` (`ORB_QUERY`), and each one that walks onto the orb first dodges the marks before it.

- **Watch the inner orb form.** Open `ORB_QUERY` and wait until `snapshot().tick` is at least 8. Read the page pixel of the orb's tile (9, 4), where seed 75 puts the orb, from `tileCentre` into `orb-tile.json`. Wait for P4 tick 12 with `>= 12` and screenshot `orb-hit.png`. It shows a red 49 on the player and the HP orb at 50. Leave the player on spawn (5, 1). Take six frames in P4 tick 20, `orb-dormant-1.png` to `orb-dormant-6.png`. They show the dark orb on (9, 4) with a thin teal rim that pulses. Take six more in tick 24, `orb-glow-1.png` to `orb-glow-6.png`. They show a teal swirl around the orb that dims in about one frame of four. Copy `log()` on tick 30. It shows `lifeforce-told` at 11, a 49 `lifeforce-drained` at 12 that leaves 50, `orb-spawned` at 12 on (9, 4) with credit 49, and `orb-matured` at 24.
- **Collect the inner orb.** Reload `ORB_QUERY`. On the tick before each of marks 17, 19, 21 and 23 (`ORB_CLAIM_DODGE_MARKS`), click two tiles along the player's row, alternating direction (`step_on_marks`). On P4 tick 24 (`ORB_GLOW_TICK`), click (9, 4) at its `tileCentre`. `snapshot().destination` is (9, 4). Wait for tick 30. `log()` shows the player on (9, 4) and one `orb-returned` the tick after the player reached it, with receipt `{requested 49, applied 49, beforeHp 50, afterHp 99}`.
- **Skip the orbs.** Reload `ORB_QUERY` and do nothing. Wait for tick 63 (`ORB_SKIP_LAST_TICK`) and screenshot `orb-skip.png`. The boss bar reads 1370 / 5250. `log()` shows `orb-expired` for the inner orb at 36 and the outer orb at 61, no `orb-returned`, and a `boss-healed` at 62 with cause `unclaimed-orb` and receipt `{requested 11, applied 11, beforeHp 1359, afterHp 1370}`. The boss also heals from Soul Split in the full cycle, so read only the `unclaimed-orb` cause.
- **Pixels.** The script counts teal pixels, where green is at least 120 and exceeds red by 60 and blue exceeds red by 30. It counts them only inside `ORB_BOX`, from 60 px left to 50 px right and from 75 px above to 5 px below the orb tile's pixel, so the player, the HUD and the FPS meter never count. The highest glow frame must beat the highest dormant frame by at least 3 percentage points of that box.
- **Pick up the inner orb late.** Open `ORB_QUERY` and dodge each inner mark, 17 to 27, two tiles along the row on the tick before it. The inner void clears at P4 tick 30. Wait for tick 31 and screenshot `orb-late.png`. It shows the glowing orb on (9, 4) on clear floor. Click (9, 4) at its `tileCentre`. Wait for tick 36. `log()` shows one inner `orb-returned` after 30 and by 36, with receipt `{requested 49, applied 49, beforeHp 50, afterHp 99}`, and no inner `orb-expired`.
- **Enter the 5x5 at a corner.** Reload the same link. On P4 tick 34 (`ORB_ENTRY_CLICK_TICK`), click the 5x5's north-west corner `ORB_ENTRY_TILE` (3, 3) at its `tileCentre`. Wait for tick 44 and screenshot `orb-entry.png`. `log()` shows one walk order, to (3, 3), and the outer `orb-spawned` at 43 on the opposite corner (7, 7).
- **Scripted.** `scripts/verify.sh browser` runs these steps in the `lifeforce_orb` and `orb_late_and_entry` units and records `orbToldAndDrained`, `orbSpawnedDormant`, `orbClickTargetedOrb`, `orbGlowsOnSchedule`, `orbReturnedTickAfterArrival`, `orbGlowDrawn`, `skippedOrbHealsBoss`, `orbPickedUpAfterTheClear` and `outerOrbOppositeEntry` in their units' `verdict.json`, with the measured shares under `observed.orb.tealShare`.

## Gotchas

- Keep the player on spawn while the dormant and glow frames are taken. The camera follows the player, so a move shifts the orb out of `ORB_BOX`, and a player standing on the orb hides its glow.
- The inner orb expires at tick 36. A click on the glow tick and the run to (9, 4) leave several ticks to spare.
- A click takes effect on the next game tick. Read `destination` after waiting, not straight after `mouse up`.
- HP above 99 needs a heal between the hit and the return. The trainer has no food, so the browser run returns to 99. The SDK regenerates 1 HP at P4 tick 199, which the Vitest test `a return can pass max HP` uses to reach 100.
- A player who stands on a mark tile is hit a tick later, and the hit changes the HP the orb returns to. Dodge the marks before the claim, or the receipt's `beforeHp` differs.
- Without `seed=75` the orb lands on another tile and the recipe's clicks miss it. The ticks do not change.
- The tell's swirl (4313) is short. A screenshot on the tick it starts can miss it; about 350 ms later it shows.
