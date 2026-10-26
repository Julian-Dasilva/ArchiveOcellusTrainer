# Code review

Read this before you review a change to the trainer, whether you are a person or an agent. It lists the performance mistakes to look for and the check that proves them. Players have reported lag, so a review judges performance as well as correctness.

## Look for these performance red flags

Each flag below is a pattern that costs frame time or memory on a player's machine. A flag is a finding only when it comes with an executable proof: a measured regression from `scripts/verify.sh perf`, or a test or script that shows the growth or the extra work.

- Work per frame that could run once per tick. The world ticks every 600 ms and the browser draws up to 60 frames a second, so per-frame work runs about 36 times as often.
- Allocation inside a frame or tick loop, including new `THREE` geometries, textures, materials and canvases. Build them once and reuse them, as `VoidFloorModel` in `src/content/ocellus/js/entities/P4Views.ts` does for each void kind.
- A draw call per tile, per shard or per particle where one batched mesh would do. Each mesh is at least one draw call.
- A canvas larger than the viewport times `devicePixelRatio`.
- An entity, view, listener or timer that is never disposed. A model's `destroy` must dispose the geometries, materials and textures it owns, not only remove them from the scene.
- An array, map or log that grows without bound over a long run.
- A first-use asset fetch, image decode or shader compile in the middle of the fight. Load and warm these before P4 starts.
- A new entry in the `exceptions` list of `src/perf/perfGate.json`. Each entry lets a pull request raise one budget. The reviewer must justify it before approval: read the entry's reason and evidence, confirm the cost is worth what players get, and confirm no cheaper change removes the cost.

A change to rendering, the tick loop, entities, views or input states its performance effect in the pull request. If it touches those paths, the author runs `scripts/verify.sh perf` and reports the frame-time p95, the tick-gap p95 and the draw calls.

## Run the perf stage

```sh
source ~/osrs-sims/env.sh                     # Node 22 on this machine
scripts/verify.sh assets perf                 # assets once, then the perf stage
VERIFY_PERF_BASE=<rev> scripts/verify.sh perf # compare against a base other than the merge base with origin/main
```

The stage builds production bundles for the working tree (the head) and for the base, serves both on `VERIFY_PRODUCTION_PORT` (default 8003), and drives seeded passive fights in headless Chrome. `src/perf/observer.js` records every animation frame, every world tick with the world's mob, entity and projectile counts, each 3D render's draw calls, the renderer's geometry, texture and scene object counts, and the largest canvas the page allocates. `src/perf/check.ts` turns the captures into a verdict. Evidence lands in `<evidence>/perf/captures/` and `<evidence>/perf-checks.json`.

Every fight-window run is CPU throttled 4 times (`workload.cpuThrottleRate`), so a player on a slower machine than the one running the stage is represented. The long run is not throttled, because it counts resources rather than time, and on a throttled GitHub Actions runner the page was still loading models at P4 tick 220. `src/perf/devtools.ts throttle` sets the DevTools protocol's `Emulation.setCPUThrottlingRate` on the session's tab. Chrome ends the throttle when that DevTools session closes, so the process holds the session for the whole stage, and the stage fails a throttled run that ends after the process exits. The throttle slows the page's main thread only. On a GitHub Actions runner the software WebGL rasteriser runs in Chrome's GPU process and stays at full speed.

Each run uses `?seed=1&invincible=on`, stands still, and runs from P4 tick 8 to P4 tick 80, so the void rifts that spawn at tick 67 are on screen for the last 13 ticks. The stage runs 5 pairs of base and head runs, alternating their order, then one long head run to P4 tick 400. The whole stage takes about 14 minutes, both on an M3 Max and on a GitHub Actions runner, where the `perf` job in `.github/workflows/test.yml` runs it for every pull request.

## Read the verdict

`src/perf/perfGate.json` holds every budget and the timing rule. The stage fails when any line fails.

The draw-call, resource and growth budgets do not depend on machine speed. The draw-call median and maximum, texture, mob, entity, projectile and scene object budgets are set to the measured value, which was the same on an M3 Max and on a GitHub Actions runner, so the stage passes on `main` and fails on any regression. The geometry and heap budgets have allowances, described below. The tick-gap budget compares the head with the base.

| Budget | What the stage measures |
| --- | --- |
| `drawCallsMedian3d` | The median draw calls per 3D render in the fight window, worst head run |
| `drawCallsMax3d` | The most draw calls in one 3D render in the fight window, worst head run |
| `tickGapExcess3d` | The most that any head run's gap between two world ticks in the fight window exceeds the longest base gap ending at the same P4 tick, in milliseconds |
| `geometriesPerRetiredRift3d` | The renderer's geometry count gained between P4 ticks 220 and 400, which sit at the same point of the 60-tick cycle, divided by the rifts retired in between |
| `texturesPerRetiredRift3d` | The same for textures |
| `heapGrowthMiB3d` | The JS heap plus its array buffer storage gained between P4 ticks 220 and 400 of the long run, in MiB, each read after a forced garbage collection |
| `mobGrowth3d`, `entityGrowth3d`, `projectileGrowth3d` | The world's mobs, entities and projectiles gained between P4 ticks 220 and 400 |
| `sceneObjectGrowth3d` | The objects in the rendered 3D scene gained between P4 ticks 220 and 400 |

The resource count starts at P4 tick 220 because the page loads models during its first cycles, and loads them more slowly when it draws fewer frames. At three frames a second the geometry count still grows from loading between ticks 160 and 220, and by tick 220 it has stopped.

From tick 220 the geometry and texture counts stay flat, on an M3 Max and on a GitHub Actions runner. Before the SDK disposed the models it replaces, 1 of 7 runner measurements counted one geometry more than the rifts explained, so a runner can still gain a lasting geometry at a random tick. The budget of 0.67 allows 4 of those extra geometries over the 6 rifts the window retires. A rift that leaks one geometry adds 6 over the window and fails. A smaller leak, such as one geometry every third rift, stays under the budget.

The renders in the fight window draw between 9 and 27 calls each, and their median is 14. The renders that draw 14 calls straddle the middle. On an M3 Max and on GitHub Actions runners, 42 to 44% of renders draw 13 calls or fewer, and 52 to 54% draw 14 or fewer. Removing the renders of any one 1500 ms span leaves the median at 14. The median budget is 14 with no allowance, so a head that adds calls only to the lighter renders fails it. If a run's median reaches 15 with no draw-call change, raise the budget to 15 with an exception that cites that run.

`src/perf/devtools.ts heap` reads the heap with the DevTools protocol's `Runtime.getHeapUsage`, after `HeapProfiler.collectGarbage`. It sums `usedSize` and `backingStorageSize` to the byte, because a retained `ArrayBuffer` or typed array lives in the backing storage and not in the JS heap's used size. On `main` the heap gained between -0.49 and +0.81 MiB over the window in 7 runs. The budget of 4 MiB is nearly 5 times the largest change. A leak of 1 MiB every 600 ms gains 180 MiB and fails. The mob, entity, projectile and scene object counts gained nothing on `main`, so their budgets are 0.

The tick-gap budget catches one long stall, which the p95 measure misses. The fight is seeded, so each P4 tick does the same work in the head and the base, and the stage compares each head gap with the longest base gap that ends at the same tick. A stall the base already has cancels out, and a new one shows its full length. In 7 throttled runs whose base and head ship the same game code, 3 on an M3 Max and 4 on GitHub Actions runners, no head gap exceeded its base by more than 133 ms. The budget is 300 ms, half a world tick. One 1500 ms stall in the fight window exceeds the base by 1500 ms and fails.

An absolute limit does not work on the runners, because their speed changes from run to run. The gap that ends at P4 tick 13 measured 719, 1025 and 1430 ms in base runs on three runners, while the M3 Max measured 617 ms. On the runner, the page draws one long frame there while the renderer's geometry count rises from 29 to 50. That stall exists on `main` today, and a change that removes it lowers the base's gap, not the budget.

Frame-time p95 and tick-gap p95 depend on the machine and its load. The stage compares them against the base build on the same machine at the same seed. For each pair it divides the head's value by the base's value, and it fails when the median of those ratios exceeds `timing.medianRatioLimit`, which is 1.25.

The limit rests on 7 throttled runs whose base and head ship the same game code, 3 on an M3 Max with its GPU and 4 on GitHub Actions runners with software WebGL. Every median ratio fell between 0.991 and 1.003. Every per-pair ratio fell between 0.976 and 1.031 except three on the runners, where one 3D run drew its frames one refresh slower or faster than its pair, a ratio of 1.198 or 0.858, and the median of 5 pairs absorbed each. The median is why one slow run cannot fail the stage. A limit of 1.25 sits 28 times above the medians' largest deviation, 0.009, and leaves room for a busy machine, while a 300 ms stall in every frame raises the frame-time ratio to about 20. Frame times move in whole display refreshes of 16.7 ms, so the frame-time measure moves only when a frame misses a refresh. Under the throttle the M3 Max still draws every frame in one refresh, and the runners draw 3D frames in 83 to 117 ms. The hard budgets catch slower costs, such as extra draw calls, on any machine.

## Change a budget

When a change lowers a measured value, lower its budget in `src/perf/perfGate.json` to the new value in the same pull request.

A raised budget hides the next regression of the same size, so the stage refuses one by default. `src/perf/check.ts` reads `src/perf/perfGate.json` at the base revision and compares each budget and `timing.medianRatioLimit` with the head's file. Any increase fails the stage unless the same pull request adds an entry to the `exceptions` list for exactly that raise:

```json
"exceptions": [
  { "budget": "drawCallsMax3d", "from": 27, "to": 51, "reason": "the new floor glow draws one mesh per lit tile", "evidence": "https://github.com/<owner>/<repo>/actions/runs/<id>" }
]
```

`from` and `to` must equal the base and head values. An entry that the base already has does not allow a new raise. The stage prints each allowed raise with its reason and evidence, so the reviewer sees it in the verdict as well as in the diff.

The stage compares only the budgets that the head's `src/perf/gate.ts` still defines, so a removed budget prints no line. The reviewer judges a removal from the diff of `src/perf/gate.ts` and `src/perf/perfGate.json`.
