# Phase 4 as the recorded fights show it

RuneLite fight logs recorded on 2026-10-23 (two spectated kills and two raids) settle four things the footage left open, and the fight follows them. Ocellus takes damage as soon as he is back, from P4 tick 4, not only from the first inner void at 8. A player already standing on a lifeforce orb when it glows gets the HP back on that tick, 24 for the inner orb, not the tick after. A void rift left alive bursts 30 ticks after it rises, at 97 for the rifts of 67, and every rift that bursts on a tick hits the player once together, for 28 to 41. Destroying a rift resets the player's attack delay, so the next attack can go at once. The evidence for each value is on its entry in `OcellusTimings.ts`.

## Sub-features

- `lead-in-damage` makes the boss take damage from P4 tick 4: a blowpipe shot from the ring clicked on tick 4 lands in full at 7, logged `player-hit-judged` `passed`, and the boss state is `present-damageable` from 4.
- `orb-on-maturity` returns the orb on the tick it matures to a player who ended the tick before on it: `orb-matured` and `orb-returned` both at 24 on seed 75. A player who steps on later still gets it the tick after ([lifeforce-orb.md](./lifeforce-orb.md)).
- `rift-burst-30` bursts each standing rift 30 ticks after it rose, at 97, with one `rift-burst` that names every rift bursting and one hit of 28 to 41 ([overheads-rifts.md](./overheads-rifts.md)).
- `rift-kill-reset` sets the player's attack delay to 0 on the tick a rift is destroyed. `rift-destroyed` logs the delay before and after.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?seed=100`, click the tile north of the 5x5 and click the boss as soon as he appears. The boss bar drops before the first inner void.
- Click the dark inner orb once it forms and stand on it, stepping off and back for the first explosion mark. HP comes back as it glows.
- Shoot one rift when they rise at 67, then the other: the kill resets the attack delay. Or leave one standing and take its burst at 97.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.
- Each click is on a named tile at the pixel `window.__archiveOcellusProbe.tileCentre(tile)` returns on the first frame of the tick it names, as `click_tile_after_tick` in `scripts/verify.sh` clicks.

- **Lead-in damage.** Open `?seed=100` (`RECORDED_LEAD_IN_QUERY`), with no Practice, and wait for P4 tick 0. Click `RECORDED_RING_TILE` (5, 3), then on tick 4 (`RECORDED_LEAD_IN_SHOT_TICK`) click the boss on `RECORDED_BOSS_TILE` (5, 5). Wait for tick 9 and screenshot `recorded-lead-in.png`; the boss bar reads 1292 / 5250. `log()` matches `RECORDED_LEAD_IN_EXPECTED`: `boss-state-changed` `[[4,"present-damageable"],[8,"present-out-of-melee-reach"]]`, `player-hit-judged` `[[7,"passed",21],[9,"passed",0]]`, and the row for tick 7 has `bossHp` `{atBossStep 1313, atPostTick 1292}`. The log starts at P4 tick 1, so the boss's hidden state from tick 0 has no row.
- **Orb on maturity.** Open `?seed=75&practice=1` (`RECORDED_ORB_QUERY`) and wait for P4 tick 0. On tick 12 click `RECORDED_ORB_TILE` (9, 4), where the inner orb forms. On tick 16 step one tile along the row, and on 17 (`RECORDED_ORB_DODGE_MARK`) click (9, 4) again, so the first explosion leaves the drained player alive to take the orb on its glow tick. Screenshot `recorded-orb-waiting.png` at 23, with the player on the dark orb, and `recorded-orb-returned.png` at 25. `log()` matches `RECORDED_ORB_EXPECTED`: `orb-matured` `[24,{"x":9,"y":4}]` and `orb-returned` at 24 with receipt `{requested 49, applied 49, beforeHp 7, afterHp 56}`.
- **Rift kill reset.** Open `?seed=1&practice=1` (`RECORDED_RIFT_QUERY`) and wait for P4 tick 0. On tick 68 click `RECORDED_FIRST_RIFT` (`rift-67-1`, on (2, 1)); on 72 click `RECORDED_SECOND_RIFT` (`rift-67-0`, on (4, 2)). The drive reads each tile from its `rift-spawned` event. Wait for tick 79 (`RECORDED_RIFT_LAST_TICK`). `log()` matches `RECORDED_RIFT_EXPECTED`: `rift-hit` `[[71,"rift-67-1","ranged",24],[73,"rift-67-1","ranged",20],[75,"rift-67-0","ranged",24],[76,"rift-67-0","ranged",24]]` and `rift-destroyed` `[[74,"rift-67-1",{"before":2,"after":0}],[77,"rift-67-0",{"before":0,"after":0}]]`.
- **Burst.** The burst at 97 and its one hit of 36 run on the rift recipe's page ([overheads-rifts.md](./overheads-rifts.md), kill a rift).
- **Scripted.** `scripts/verify.sh browser --unit recorded_fights` runs these steps. It records `leadInShotLandsInFull`, `orbReturnsOnMaturityToWaitingPlayer`, `riftKillResetsTheNextShot` and `noRecordedFightPageErrors` in `units/recorded_fights/verdict.json`, with the measurements under `observed.leadIn`, `observed.orb` and `observed.rift`. The `overheads_rifts` unit's `standingRiftBursts` checks the burst on its own page.

## Gotchas

- In 3D the boss's model covers the tiles just north of his 3x3 on screen, so a click meant for (4, 9) or (5, 8) from under him attacks him instead.
- The orb is taken on its glow tick only by a player who ended the tick before on it. A click on the orb after the glow returns the HP the tick after the player arrives, as before.
- Seed 1's burst of 36 is one roll inside 28 to 41. Another seed rolls another amount; the tick, 97, does not change.
