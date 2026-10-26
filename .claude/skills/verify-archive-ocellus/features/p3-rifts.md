# P3 void rifts (hidden)

With the `ARCHIVE_P3` flag on, the P3 boss spawns void rifts, ported from Alessandro Rodi's ocellus-sim and corrected by the RuneLite fight logs. In quadrant 1 the first rift appears 32 ticks after the quadrant's second special starts (P3 tick 86 in a run, after the smites at 27 and 54). In a later quadrant (`start=2` or `start=3`) the first one appears 3 ticks after the quadrant starts. Each next rift follows 48 ticks after the last. One appears at a time, on a seeded random floor tile of the boss's wedge at least 2 tiles from his 3x3. It is P4's Void Rift (NPC 16678, 44 HP) with its yellow timer bar under the HP bar, but it charges for 30 ticks, the bar filling by a thirtieth a tick. Left alive, it plays its detonate pose (seq 14898) on the 30th tick, flares spotanim 4306 on the player and hits for 39 to 41, typeless. Killed first, it plays its despawn pose (14897) instead, the chat says "Destroying the void rift empowers you!", and the player's attack delay resets. Standard ranged and melee attacks roll on it as on any target; only P4's rifts are always max-hit. No rift spawns or bursts on the tick a quadrant breaks.

## Sub-features

- `p3-rift-first-quadrant` spawns quadrant 1's first rift at 86, 32 ticks after the second special starts.
- `p3-rift-kill` destroys a rift the player kills, on the tick it dies, with the kill chat and an attack delay reset.
- `p3-rift-burst` detonates a standing rift 30 ticks after it appears, for 39 to 41.
- `p3-rift-bar` fills the rift's timer bar over 30 ticks.

## How to get to it (user POV)

- Run the trainer with the flag on (`scripts/verify.sh serve`), and open `?phase=p3&seed=1&invincible=on`. The first rift appears at P3 tick 86.
- Add `start=2` to get a rift at tick 3. Click it to shoot it, or leave it to watch the bar fill and the burst at 33.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started by `scripts/verify.sh serve` so the flag is on.

- **Quadrant 1.** Open `?phase=p3&seed=1&invincible=on` and wait for P3 tick 87. The log's only `rift-spawned` event is `rift-86-0` at 86.
- **Kill.** Open `?phase=p3&seed=1&invincible=on&start=2`. After P3 tick 3, read the `rift-spawned` tile from the log (seed 1: (26, 9)), project it with the probe's `tileCentre`, and click that pixel after tick 4, once the rift stands. The log shows `rift-destroyed` for `rift-3-0` at 8, no `rift-burst` hit, and `#game_chat` shows the kill line.
- **Bar and burst.** Reopen the same link and click nothing. Take screenshots at P3 ticks 5, 26 and 32. In the box from 70 px to 20 px left of the rift's tile pixel and from 85 px to 60 px above it, the yellow fill's share of the yellow and dark olive bar is 2/30, 23/30 and 29/30 within 0.034. The log shows one `rift-burst` hit, `rift-3-0` at 33 requesting 39.
- **Scripted.** `scripts/verify.sh browser` runs `drive_p3_rifts` after `drive_p3_smite`. It writes `p3-rift-*` and `p3-rift-checks.json`, and checks `p3RiftAppearsAfterSecondSpecial`, `p3RiftKilledByClick`, `p3StandingRiftBursts`, `p3RiftTimerBarFills` and `noP3RiftPageErrors`.

## Gotchas

- The SDK adds a mob spawned mid-tick on the next tick, so a rift spawned at 3 stands, draws and takes clicks from tick 4. A click on its tile at 3 is a walk order.
- The bar's yellow-to-olive ratio, not its yellow share alone, tells a 30-tick bar from a 23-tick one: a bar charged over 23 ticks is full at 26 and draws past its right edge at 32.
- With `start=2` or `start=3`, an unkilled first rift bursts for 39 at 33, between the smite's spins, so the spins' applied damage and the Invincible lines depend on it.
