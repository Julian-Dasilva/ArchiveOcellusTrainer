# P3 wave dodge (hidden)

With the `ARCHIVE_P3` flag on, the P3 boss ends each pair of swings with a wave. He fixes its band a tick before he slashes: P3 ticks 12 and 22 in each autos table. The band runs from his centre tile along the nearest of 8 directions toward the tile the player stands on, 3 tiles wide, from just outside his 3x3 to the edge of the wedge. From then until it lands, its tiles are marked red on the floor; the game draws no such mark. He slashes at 13 and 23 (seq 14846), and the band lands at 14 and 24. Each band tile plays the game's floor graphic, spotanim 4335, starting 2 client cycles later for each ring of 3 tiles out from him. A player on a band tile at the landing takes 19 to 32 through any prayer. A run of 2 tiles to the side, clicked after the band shows or the tick before, clears it. A click earlier is aimed at, and a click on the slash tick is too late. The behaviour is ported from Alessandro Rodi's ocellus-sim at `3efd5bf`, with the fight logs' timing and damage.

## Sub-features

- `p3-wave-aim` fixes a 3-wide band toward the player a tick before the slash, snapped to the nearest of 8 directions, and logs `wave-aimed` with its tiles and landing tick.
- `p3-wave-mark` marks the band's tiles red in 3D from the aim to the landing.
- `p3-wave-land` hits a player on the band at the landing for 19 to 32, whatever the prayer, and logs `hazard-avoided` for a player off it.
- `p3-wave-band` plays spotanim 4335 on each band tile at the landing, and clears it with the marks within 4 ticks.

## How to get to it (user POV)

- Run the trainer with the flag on (`scripts/verify.sh serve`), and open `?phase=p3&seed=1&invincible=on`.
- Stand beside the boss. Two ticks after his second swing, the red band shows; run 2 tiles to the side before he slashes.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started by `scripts/verify.sh serve` so the flag is on.
- `use3dView` is saved true before the page opens.

- **Stand.** Open `?phase=p3&seed=1&invincible=on` in 3D and click `tileCentre({ x: 20, y: 9 })` after P3 tick 0. The boss settles with his centre on (20, 7). The log's `wave-aimed` at 12 lists (20, 9), (19, 9), (21, 9), (20, 10), (19, 10), (21, 10), (20, 11), (19, 11) and (21, 11) landing at 14, `wave-cast` is at 13, and the wave hits (20, 9) for 32 at 14.
- **Mark and band.** On that page, read `tileCentre` for the band tiles (19, 9) to (19, 11) and the tiles beside them, (18, 9) to (18, 11), and take screenshots at ticks 11, 12, 14 and 18. In a box 18 px either side and 14 px above and below each column, at least 40% of the band column's pixels have red minus green of 30 or more at 12, against at most 2% beside it and at most 1% at 11. At 14 at least 8% have blue minus red of 6 or more, the floor graphic, against at most 2% beside it, and no red is left. At 18 neither look is above 1%.
- **Side step.** Reopen the page, stand on (20, 9), and click `tileCentre({ x: 18, y: 9 })` after tick 12. At 14 the log has `hazard-avoided` for the wave on (18, 9) and no wave hit.
- **Early step.** Reopen it and click (18, 9) after tick 10. The band is aimed at (18, 9), and the wave hits there for 32 at 14.
- **Scripted.** `scripts/verify.sh browser` runs `drive_p3_wave` after `drive_p3_smite`. It writes `p3-wave-*` and `p3-wave-checks.json`, and checks `waveAimedAtStandingPlayer`, `waveLineDrawn`, `waveBandPlaysOnLanding`, `waveMarksCleared`, `waveSideStepAvoids`, `waveEarlyStepHit` and `noP3WavePageErrors`.

## Gotchas

- The camera on this page looks south, so x grows to the left on screen. The boss's model covers the band's columns 20 and 21 and the tiles east of them, so the pixel checks sample column 19, and the side step goes west. A click on a tile his model covers attacks him and orders no walk.
- A click after tick t moves the player on t + 1, after the boss's turn. A step clicked after 12 has left the band by the landing at 14, and one clicked after 13 has not.
