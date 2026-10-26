# P3 smite flick (hidden)

With the `ARCHIVE_P3` flag on, the P3 boss ends each 20-tick autos table with the smite. It starts on S (P3 tick 27 in a run) as blades spin up around him, and its opening blow lands on S + 1: a 0 under Protect from Melee, or 0 to 18 without it. Spins land at S + 5 and then every 3 ticks: once in quadrant 1, twice with `start=2` and three times with `start=3`. The blades wind 2 ticks before each landing. The boss reads the prayers once a tick, after prayer clicks and before hits land. Under the default rule `off-then-on`, a spin is blocked when every protection prayer is off on the tick before its landing and Protect from Melee is on at the landing. A protection prayer still up on the tick before is switched off with the game's line "You've been injured and can't use protection prayers!", and clicks cannot turn it back on until 3 ticks after that, so the spin hits. A blocked spin deals 0. Any other spin deals 10 to 29, and the chat says why: the blades knocked the prayer off (knocked) or it was not back on for the landing (late). Under `flick=on-off-on` the chat can also say it stayed on (held) or was already off at the spin's reference (early). The chat names that reference: "the blades start" or "the smite started" for spin 1, and "spin 1 lands" or "spin 1 landed" for spin 2. As the blades wind for the only spin of a one-spin smite, or for the second spin otherwise, rubble is thrown on the player's tile. It lands 5 ticks later for 14 to 16 if the player is still on the tile, and leaves a void patch there for a seeded 21 to 51 ticks that hits 6 to 7 on every second tick the player stands on it. The autos start again 4 ticks after the last spin. `start=2` and `start=3` also open the boss at ⌊5250 × 0.76⌋ = 3990 and ⌊5250 × 0.51⌋ = 2677 HP. `flick=on-off-on` or `flick=held-blocks` changes the rule, `missedFlickDamage=swing-chip` changes a missed spin to 0 to 8, and `firstSpin=4` moves the first landing to S + 4, as a guide's tick count reads it.

## Sub-features

- `p3-smite-flick` blocks a spin flicked on the prayer tab: off on the tick before the landing, on for the landing.
- `p3-smite-off-then-on` blocks a spin with the prayer off from before the smite and clicked on only for the landing.
- `p3-smite-held` knocks a prayer still up on the tick before the landing off, refuses the clicks that try to turn it back on until 3 ticks later, and the spin hits for 10 to 29 with the chat naming the knock.
- `p3-smite-late` hits for 10 to 29 when the prayer comes back a tick after the landing, and the chat says it was late.
- `p3-smite-spins` lands 2 spins with `start=2` and 3 with `start=3`, 3 ticks apart.
- `p3-smite-blades` draws cache spotanims 4325 from S, then 4326 or 4327 as each spin winds, on the boss.
- `p3-smite-rubble` throws rubble on the player's tile as the blades wind. It falls as spotanim 4346, then lies as 4347 while its void patch lasts.
- `p3-smite-chat` writes the game's line when a prayer is knocked off, and one line for each spin that hits, naming the reference that spin was judged from.

## How to get to it (user POV)

- Run the trainer with the flag on (`scripts/verify.sh serve`), and open `?phase=p3&seed=1&invincible=on`.
- Flick Protect from Melee on the prayer tab around each landing: off by the tick before it, on for it.
- Add `start=2` or `start=3` to practise two or three spins, and `flick=`, `missedFlickDamage=` or `firstSpin=4` to change the rule, the damage or the first landing.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started by `scripts/verify.sh serve` so the flag is on.

- **Flick.** Open `?phase=p3&seed=1&invincible=on`. Click Protect from Melee at the canvas centre plus (`PROTECT_MELEE_RIGHT_PX`, `PROTECT_DOWN_PX`) after P3 ticks 20, 27 and 31. By tick 33 the log's only spin is at 32, spin 1 of 1, `blocked`, requesting 0 with prayer `melee`, and the log's `prayer-published` inputs are on 21, 28 and 32.
- **Held.** Reopen it and click Protect from Melee after tick 20 only. The log has `prayer-knocked-off` at 31, the spin at 32 is `struck`, `knocked`, requesting and applying 18 with prayer `null`, and `#game_chat` shows "You've been injured and can't use protection prayers!" and "Spin 1 of 1 hit you for 18. Your protection prayer was still up the tick before the spin, so the blades knocked it off. Turn it off after the blades start, then back on for the spin."
- **Late.** Reopen it and click after ticks 20, 27 and 32. The spin at 32 is `struck`, `late`, 18 with prayer `null`, and the chat says "Protect from Melee was not back on in time for the spin."
- **Two and three spins.** Open the same link with `&start=2` and click after 20, 27, 31, 32 and 34: spins 1 and 2 of 2 at 32 and 35 are both `blocked`. With `&start=3`, also click after 35 and 37: spins at 32, 35 and 38 are all `blocked`.
- **Blades.** Open the link and take a screenshot a tenth of the way into P3 tick 25 and halfway into 31, timed from when each tick starts. In the box from 260 px left to 120 px right and from 20 px above to 280 px below the canvas centre, at least 0.5% of the pixels are bright purple at 31 and at most 0.3% at 25.
- **Off then on.** `drive_p3_prayer_rules` opens `?phase=p3&seed=1&invincible=on` and clicks Protect from Melee after tick 31 only. The spin at 32 is `blocked`, and the only `prayer-published` input is `melee` on 32.
- **Knocked and locked.** It reopens the link and clicks Protect from Melee after ticks 20, 31, 32 and 33. The log has `prayer-knocked-off` at 31 until 33. The rows for ticks 31 to 34 read the prayer at the boss's step and after the tick as `melee` then `null`, `null` twice, `null` twice, and `melee` twice: the clicks after 31 and 32 are refused and the one after 33 turns it on for 34. The spin at 32 is `struck`, `knocked`, 18 with prayer `null`, and the chat has both lines of the held page.
- **Scripted.** `scripts/verify.sh browser` runs `drive_p3_smite` and then `drive_p3_prayer_rules` after `drive_p3_drill`. They write `p3-smite-*`, `p3-blades-*`, `p3-void-shot-magic*`, `p3-smite-checks.json` and `p3-prayer-checks.json`, and check `p3SmiteFlickedOnPrayerTab`, `p3HeldPrayerTakesSpin`, `p3LateFlickTakesSpin`, `p3TwoSpinFlick`, `p3ThreeSpinFlick`, `smiteBladesDrawn`, `noP3SmitePageErrors`, `p3OffThenOnBlocks`, `p3KnockedPrayerLocked`, `p3VoidShotBlockedByMagic` and `noP3PrayerRulePageErrors`. The magic void shot page is in [p3-drill.md](p3-drill.md).

## Gotchas

- A click after tick t is read by the boss on t + 1, so the log's `prayer-published` input sits on the row after the click. A click that slips past the next tick changes the verdict, and the check fails on the spin, not on the click.
- Two clicks in one 0.6 s interval cancel out. The SDK applies the last state of the interval, so off and on in one interval leaves the prayer up, and the blades knock it off.
- A click on a protection prayer while it is locked is refused on the prayer tab and publishes no `prayer-published` input.
- Without Invincible, a run with no prayer before the smite can die to the swings, a missed spin and the void patch.
- Model 62698's centre is 144 faces textured with 215. The SDK draws spotanims without textures, so the blades take P4's `tellCentre` recolour, which draws those faces black.
