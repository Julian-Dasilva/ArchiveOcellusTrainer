# Boss defence

Ocellus has the wiki's phase 3 defence: Defence level 250, stab 150, slash 100, crush 30, magic 200 and 250 ranged defence for every ammunition class. The Twisted Bow's dragon arrows roll against standard ranged defence and Ralos rolls against light, both 250. Defence can be drained to 60% of its level and no lower, so Division stops at 150. With the ranged setup and no prayer, a Twisted Bow shot hits a full-Defence boss 27.4% of the time, a Ralos throw 22.5% and a Division glaive 33.7%.

## Sub-features

- `ranged-defence` rolls every ranged attack against 250 ranged defence. Vitest owns the hit-chance literals, because the browser shows only hits and misses.
- `defence-floor` stops every Defence drain at 150. The second glaive of a Division rolls against the floored Defence the first glaive's drain will leave.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?setup=ranged`, wield Ralos from inventory slot 0, light the special orb and click Ocellus. Light the orb again after the first Division fires, so the next throw is a second Division.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=20&setup=ranged`, and P4 tick 9 reached (`snapshot().fight.run.tick >= 9`), so the boss is damageable.
- Pixel positions are for the 1280x800 viewport and match the loadout recipe's `LOADOUT_` constants.

- **Start.** `snapshot().fight.boss.defence` is 250.
- **First Division.** Click the inventory tab at (1164, 745), click slot 0 at (1125, 508) to wield Ralos, click the special orb at (1140, 157), then click Ocellus 10 px left of and 160 px above the canvas centre. Wait until `specialEnergy` is 50, then click the special orb again. Once `log().rows` holds two `player-hit-judged` events, Defence reads 176. With `seed=20` both glaives deal damage (2 and 17).
- **Second Division.** Once `log()` holds four `player-hit-judged` events, `specialEnergy` is 0 and Defence reads 150. Both glaives dealt damage (4 and 5), so without the floor Defence would read 102. In the last run they landed at P4 tick 21, inside the explosion window, as `reduced`: 4 and 5 kept 1 and 2, which still drain.
- **Scripted.** `scripts/verify.sh browser --unit defence_floor` runs these steps and records `divisionStopsAtDefenceFloor` in `units/defence_floor/verdict.json`. The check needs Defence 250, 176 and 150 and four glaives, `passed` or `reduced`, that each requested damage, so a run where a glaive misses fails instead of passing on a smaller drain.

## Gotchas

- Light the orb for the second Division only after the first has spent the bar. A click while the first is still queued turns the special attack off.
- Both glaives of one Division land on the same tick, so a per-tick read shows 250, 176 and 150. The 213 between them shows only in the Defence the second glaive rolls against, which Vitest records.
- Without a pinned `seed` the glaives may miss. Ranged accuracy against this boss is low, and a missed glaive drains nothing.
