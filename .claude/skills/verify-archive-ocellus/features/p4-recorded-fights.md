# Phase 4 as the recorded fights show it

RuneLite fight logs recorded on 2026-10-23 (two spectated kills and two raids) settle four things the footage left open, and the drill follows them. Ocellus takes damage as soon as he is back, from P4 tick 4, not only from the first inner void at 8. A player already standing on a lifeforce orb when it glows gets the HP back on that tick, 24 for the inner orb, not the tick after. A void rift left alive bursts 30 ticks after it rises, at 97 for the rifts of 67, and every rift that bursts on a tick hits the player once together, for 28 to 41. Destroying a rift resets the player's attack delay, so the next attack can go at once. The evidence for each value is on its entry in `OcellusTimings.ts`.

## Sub-features

- `lead-in-damage` makes the boss take damage from P4 tick 4: a bow shot from the ring clicked after tick 4 lands in full at 7, logged `player-hit-judged` `passed`, and the boss state is `present-damageable` from 4.
- `orb-on-maturity` returns the orb on the tick it matures to a player who ended the tick before on it: `orb-matured` and `orb-returned` both at 24 on seed 75. A player who steps on later still gets it the tick after ([lifeforce-orb.md](./lifeforce-orb.md)).
- `rift-burst-30` bursts each standing rift 30 ticks after it rose, at 97, with one `rift-burst` that names every rift bursting and one hit of 28 to 41 ([overheads-rifts.md](./overheads-rifts.md)).
- `rift-kill-reset` sets the player's attack delay to 0 on the tick a rift is destroyed. `rift-destroyed` logs the delay before and after.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?seed=100`, click the tile north of the 5x5 and click the boss as soon as he appears. The boss bar drops before the first inner void.
- Pick `Lifeforce orb` in the `Focus` selector, click the dark orb once it forms and stand on it. HP comes back as it glows.
- Pick `Rifts` in the `Focus` selector. Shoot one rift when they rise at 67, then the other at once: the second shot goes on the tick the first rift is destroyed. Or leave one standing and take its burst at 97.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.
- Each click is on a named tile at the pixel `window.__archiveOcellusProbe.tileCentre(tile)` returns after the tick it names, batched with a `wait --fn` on the P4 tick, as `drive_p3_drill` clicks.

- **Lead-in damage.** Open `?seed=100` and wait for P4 tick 0. Click `RECORDED_RING_TILE` (5, 3), then after tick 4 click the boss on `RECORDED_BOSS_TILE` (5, 5). Wait for tick 9 and screenshot `recorded-lead-in.png`; the boss bar reads `1258 / 5250 (24.0%)`. `log()` shows `boss-state-changed` `[[0,"hidden"],[4,"present-damageable"],[8,"present-out-of-melee-reach"]]`, one `player-hit-judged` `[7,"passed",54]`, and the row for tick 7 has `bossHp` `{atBossStep 1312, atPostTick 1258}`.
- **Orb on maturity.** Open `?seed=75&focus=lifeforce-orb` and wait for P4 tick 0. After tick 12 click `RECORDED_ORB_TILE` (9, 4), where the inner orb forms. Screenshot `recorded-orb-waiting.png` at 23, with the player on the dark orb at 50 HP, and `recorded-orb-returned.png` at 25, at 99 HP. `log()` shows `orb-matured` `[24,{"x":9,"y":4}]` and `orb-returned` at 24 with receipt `{requested 49, applied 49, beforeHp 50, afterHp 99}`.
- **Rift kill reset.** Open `?seed=1&focus=rifts&drillStart=cycle-start` and wait for P4 tick 0. After tick 68 click the north-east rift, `RECORDED_NORTH_EAST_RIFT` (10, 2); after 72 click the north-west rift, `RECORDED_NORTH_WEST_RIFT` (2, 2). Wait for tick 79. `log()` shows `rift-hit` `[[72,"rift-67-1","ranged",44],[76,"rift-67-0","ranged",44]]` and `rift-destroyed` `[[73,"rift-67-1",{"before":2,"after":0}],[77,"rift-67-0",{"before":2,"after":0}]]`. The second shot goes at 73 and lands at 76; with the bow's 5-tick delay it would have gone at 75 and landed at 78.
- **Burst.** The burst at 97 and its one hit of 36 run on the rift recipe's page ([overheads-rifts.md](./overheads-rifts.md), kill a rift).
- **Scripted.** `scripts/verify.sh browser` ends with `drive_recorded_fights`, writes the `recorded-*` files and `recorded-checks.json`, and checks `leadInShotLandsInFull`, `orbReturnsOnMaturityToWaitingPlayer`, `riftKillResetsTheNextShot` and `noRecordedFightPageErrors`. The rift recipe's `riftKillResetsAttackDelay` and `standingRiftBursts` check the reset and the burst on its own page.

## Gotchas

- In 3D the boss's model covers the tiles just north of his 3x3 on screen, so a click meant for (4, 9) or (5, 8) from under him attacks him instead. The invincible orb recipe waits beside the orb on (3, 8) for that reason.
- The orb is taken on its glow tick only by a player who ended the tick before on it. A click on the orb after the glow returns the HP the tick after the player arrives, as before.
- Seed 1's burst of 36 is one roll inside 28 to 41. Another seed rolls another amount; the tick, 97, does not change.
- The drill still spawns two rifts every cycle. The logs show 2, 3, 4 and 5 rifts in cycles 2 to 5 of one raid; that count is not modelled yet.
