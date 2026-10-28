# Boss defence

Ocellus has the wiki's phase 3 defence: Defence level 250, stab 150, slash 100, crush 30, magic 200 and 250 ranged defence for every ammunition class. The full fight's blowpipe darts and Ralos roll against light ranged defence, and the Vitest drill's Twisted Bow arrows against standard, all 250. Defence can be drained to 60% of its level and no lower, so Division stops at 150. In the Vitest drill, with the ranged setup and no prayer, a Twisted Bow shot hits a full-Defence boss 27.4% of the time, a Ralos throw 22.5% and a Division glaive 33.7%.

## Sub-features

- `ranged-defence` rolls every ranged attack against 250 ranged defence. Vitest owns the hit-chance literals, because the browser shows only hits and misses.
- `defence-floor` stops every Defence drain at 150. The second glaive of a Division rolls against the floored Defence the first glaive's drain will leave.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?setup=ranged`, wield Ralos from inventory slot 0, light the special orb and click Ocellus. Light the orb again after the first Division fires, so the next throw is a second Division.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=20&setup=ranged` (`DEFENCE_FLOOR_QUERY`), and P4 tick 1 reached.
- Panel points are the loadout recipe's `LOADOUT_` constants on a 1280x800 canvas, moved to the canvas's bottom right or top right as [loadouts.md](./loadouts.md) describes.

- **Start.** `snapshot().fight.boss.defence` is 250.
- **First Division.** Click the inventory tab at the panel point (1164, 745), click slot 0 at (1125, 508) to wield Ralos, click the special orb at (1140, 157), then click Ocellus with `click_boss` on P4 tick 12 (`DEFENCE_FLOOR_CLICK_TICK`), so both Divisions land on the same ticks, and the same side of the explosions' damage cut, on any machine. Wait until `specialEnergy` is 50, then click the special orb again. Once `log().rows` holds two `player-hit-judged` events, Defence reads 176, so both glaives kept damage.
- **Second Division.** Once `log()` holds four `player-hit-judged` events, `specialEnergy` is 0 and Defence reads 150. Both glaives of the second Division also kept damage, so without the floor Defence would read 102. A glaive that lands during the explosions is `reduced` and still drains when it keeps damage above 0.
- **Scripted.** `scripts/verify.sh browser --unit defence_floor` runs these steps and records `divisionStopsAtDefenceFloor` in `units/defence_floor/verdict.json`. The check needs Defence `DEFENCE_FLOOR_STEPS`, 250, 176 and 150, and four glaives, `passed` or `reduced`, that each requested damage, so a run where a glaive misses fails instead of passing on a smaller drain.

## Gotchas

- Light the orb for the second Division only after the first has spent the bar. A click while the first is still queued turns the special attack off.
- Both glaives of one Division land on the same tick, so a per-tick read shows 250, 176 and 150. The 213 between them shows only in the Defence the second glaive rolls against, which Vitest records.
- Without a pinned `seed` the glaives may miss. Ranged accuracy against this boss is low, and a missed glaive drains nothing.
