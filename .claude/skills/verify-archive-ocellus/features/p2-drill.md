# P2 drill (hidden)

A third drill, phase 2, sits behind the build flag `ARCHIVE_P2`. Production builds leave it off, so `?phase=p2` opens P4 and lists `phase=p2` as rejected. With the flag on, `?phase=p2` opens the phase 3 cache arena whole, with the player 4 tiles north-east of the middle and Ocellus (NPC 16675) holding the sword on the middle 3x3. Ocellus transforms at P2 tick 0, 24 portals rise on the cross's arms at 2, and at 7 he says "Your time... comes..." and The Blade can be attacked. Rounds start at 11, 53 and 95 in the wedge the player stands in, then clockwise. In each, ten of the round's twelve portals light purple every 5 ticks, 6 times, and fire 4 ticks later; the two orange gaps' rows cross on the safe 2x2. A volley hits a player who starts a tick on a tile it is over: 1 to 5 tiles out on the volley tick, 6 to 10 the next and 11 or 12 the tick after, for 18 to 27, so waiting 6 out on the wedge's diagonal and clicking 4 out a tick before the volley dodges it. In rounds 1 and 2, 13 pools form at +28 and burst at +32 for 30 or 31 on a player standing on one, all twelve portals light at +31, a floor portal forms on a pool at +33, and standing on it from +34 to +39 moves the player to its tile turned a quarter clockwise, out of the all-twelve volley at +40. The Blade stores the damage it takes; Ocellus's bar holds until +35 of rounds 1 and 2 and the sword's fall at 124, when it drops by half the stored damage. "This... is enough..." at 123 ends The Blade, and the run ends at 131, where phase 3 would start, with "Phase 2 cleared (interim end)", the P2 time, the HP Ocellus takes into phase 3, and Repeat P2, Retry seed and, when the build also has `ARCHIVE_P3`, Start P3. A death shows "You died" with the P2 tick. `seed`, `setup`, `invincible=on`, `bosshp=N` and `markers=skip-tiles` work on a P2 link. Any other key is rejected.

## Sub-features

- `p2-flag` opens P4 for `?phase=p2` when the build leaves `ARCHIVE_P2` off.
- `p2-open` opens P2 with NPC 16675 on the middle 3x3 at 5250 HP when the flag is on.
- `p2-portals` raises the 24 portals at 2, lights ten of the round's twelve purple and leaves the two gaps orange.
- `p2-volley` fires each lighting 4 ticks later and hits by tile: 1 to 5 out on the volley tick, 6 to 10 the next, 11 and 12 the tick after.
- `p2-skip` dodges every volley of a round for a player who waits 6 out on the diagonal and clicks 4 out a tick before each volley.
- `p2-pools` bursts the pools 4 ticks after they form on a player standing on one.
- `p2-floor-portal` takes a player on the floor portal while it idles into the next wedge, out of the all-twelve volley.
- `p2-blade` makes The Blade attackable from 7 to 122 and releases half of what it stored onto Ocellus's bar at 46, 88 and 124.
- `p2-interim` ends the run at 131 with the interim panel and its buttons.
- `p2-skip-tiles` marks the skip's wait and run tiles in all four wedges with `markers=skip-tiles`, switched by Settings' Skip tiles box during the run.
- `p2-phase-box` lists Phase 2 in Settings' Phase box when the flag is on.

## How to get to it (user POV)

- Run the trainer with the flag on: `ARCHIVE_P2=on npm start`, or `scripts/verify.sh serve`, which sets it and `ARCHIVE_P3`.
- Open `?phase=p2`, or choose **Phase 2** in the **Phase** box under **Settings**.
- Tick **Skip tiles** under **Settings** to mark the skip's tiles, or open `?phase=p2&markers=skip-tiles`.
- Survive to P2 tick 131, then click **Repeat P2**, **Retry seed** or **Start P3**.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started by `scripts/verify.sh serve` so the flag is on, and `public/osrs-assets/manifest.json` holds `npc-16675` and models 62757 and 62758.

- **Portals.** Open `?phase=p2&seed=1&markers=skip-tiles` and take a screenshot after P2 tick 3 and after tick 14. At 3 all 24 portals are orange; at 14 the north and east arms are purple but for one orange portal each, the log's first `portals-lit` has gaps `[5, 2]`, and the eight pink skip tiles show.
- **Skip.** On the same page click `tileCentre({ x: 21, y: 7 })` after tick 3, then for each volley at 15, 20, 25, 30, 35 and 40 click `tileCentre({ x: 19, y: 9 })` after the tick before it and `tileCentre({ x: 21, y: 7 })` after the volley tick. By tick 44 the log has no `player-hit`, and each volley's row has `playerAtBossStep` on (21, 7) and `playerAtPostTick` on (19, 9).
- **Volley bands.** Open `?phase=p2&seed=1&invincible=on`, click a tile after tick 3 and read the `player-hit` events from 15 to 17: (19, 9) at 15 twice, (20, 9) at 15, (21, 7) at 16, (25, 11) at 15 and 16, (26, 12) at 15 and 17.
- **Pools.** On `?phase=p2&seed=1&invincible=on`, click the first tile of the `pools-formed` event at 39. The log has a `pool-burst` hit of 30 at 43.
- **Floor portal and release.** Open `?phase=p2&seed=1&invincible=on`, click `tileCentre({ x: 16, y: 12 })` after tick 7 to attack The Blade, then click the `safe-portal-opened` tile, (25, 8), after tick 44. The log has `blade-released` at 46 with stored 92 and released 46, rows 44 and 45 at 5250 and row 46 at 5204, `escaped` at 48 from (25, 8) to (20, 23), and no `all` volley hit at 51.
- **Interim end.** Let the same page run to tick 131. The panel reads "Phase 2 cleared (interim end)", "P2 time: 131 ticks (1:18.6)", "Invincible was on." and "Ocellus goes into phase 3 at 5204 / 5250.", with Repeat P2, Retry seed and Start P3. Start P3 loads `?phase=p3&setup=ranged&invincible=on`, whose log header has phase `p3`.
- **Settings.** Open `?phase=p2&seed=1` and open Settings: `#phase` lists Phase 4, Phase 3 and Phase 2 with Phase 2 chosen, `#skip_tiles` is unticked, and there is no `#focus`. Ticking `#skip_tiles` draws the eight pink tiles.

## Gotchas

- The trainer opens in 3D facing north, so the north-east wedge shows at the top right.
- The Blade cannot be attacked before P2 tick 7: a click on the boss before then walks the player instead.
- A click that should land "a tick before the volley" must come after the row for that tick closes and before the next world tick.
- Cache 2746 has no synth for frame sounds 12814, 12825 and 12832 on the phase 2 animations. The asset tool skips them and the SDK logs "Cache animation sound preload failed" in the console; the trainer stops the SDK's unhandled rejection for them from becoming a page error.
- `scripts/verify.sh` has no scripted `drive_p2_drill` stage yet; these recipes were driven with puppeteer for this drill's pull request.
