# Seed per run

Each run takes a seed that fixes its rolls, such as the order of the transition attacks. A run that starts without a typed seed draws a fresh random seed, and the seed box shows it. Restart and the focus control start a fresh run again unless the player typed a seed into the box first. A typed seed, or a link with `?seed=N`, replays that run exactly.

## Sub-features

- `seed-fresh` draws a random seed for a page opened without `seed=` and shows it in the seed box.
- `seed-restart` gives Restart a new random seed when the box still shows the run's seed.
- `seed-typed` replays the typed seed after Restart, even one equal to the seed the box shows, and keeps it in the URL as `seed=`.

## How to get to it (user POV)

- Open the trainer without `seed=` in the URL.
- Click **Restart**, or choose a new focus.
- Type a seed into the **Seed** box, then click **Restart**.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, except that the page has not been opened yet.

- **Fresh run.** Run `agent-browser open http://127.0.0.1:8002/` and wait for `(window.__archiveOcellusProbe?.snapshot().fight?.run.tick ?? -1) >= 0`. `agent-browser --json get value "#seed"` returns the same number as `window.__archiveOcellusProbe.log().header.seed`, the number is not 1, and `location.search` has no `seed=`.
- **Restart.** Read `performance.timeOrigin`, then run `agent-browser click "#restart"` and wait until `performance.timeOrigin` differs and the fight has ticked. The box and the log header show a new seed, and `location.search` still has no `seed=`.
- **Typed seed.** Run `agent-browser fill "#seed" <the fresh run's seed>` and click **Restart** the same way. The log header and the box show the fresh run's seed, and `location.search` has `seed=` with it.
- **Scripted.** `scripts/verify.sh browser --unit seed` runs this recipe, writes `seed.json`, and checks `seedFreshAndShown`, `restartDrawsFreshSeed` and `typedSeedReplays`.

## Gotchas

- `?seed=1` in a shared link pins only the run it opens. The next Restart draws a fresh seed unless the box was typed in.
- Clearing the box and clicking Restart also draws a fresh seed.
- The page reloads on Restart, so wait on `performance.timeOrigin`, not on the seed changing; a reused seed must fail the check, not time out.
