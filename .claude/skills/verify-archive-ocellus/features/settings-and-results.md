# Settings menu and run results

The drill controls sit behind one Settings button at the bottom left, beside a Restart button that is always visible. The menu holds Setup, Focus, Seed, Keybinds, Sound effects, Area sounds, Invincible and What's new, and closes on a second click, Escape or a click outside it. When a run ends, a result panel over the game shows "Ocellus defeated" with the P4 time, or "You died" with the P4 tick, and offers Restart and Retry seed. `bosshp=N` in the link starts P4 at N boss hitpoints, so a tester can reach the kill result fast.

## Sub-features

- `menu-closed` hides every control except Settings and Restart, and adds no page width.
- `menu-open` shows every control inside the viewport at 1280x800, 800x600 and on a phone.
- `menu-close` closes the menu on a second click, on Escape (also from the seed box) and on a click outside it; a click inside keeps it open.
- `kill-result` shows "Ocellus defeated" and "P4 time: N ticks (m:ss.s)", N x 0.6 s, with "Invincible was on." when the box was on or prevented a death.
- `death-result` shows "You died" and "on P4 tick N".
- `result-restart` reloads the same setup and focus with a fresh seed; `result-retry` reloads the same seed. Both keep `bosshp` and carry what the Invincible box shows.
- `bosshp` starts P4 at N hitpoints for N from 1 to the max HP; any other value keeps the normal entry HP and is listed in `rejected`.

## How to get to it (user POV)

- Click **Settings** at the bottom left of the game view.
- Kill the boss or die; the result panel appears within a second.
- Open a link with `bosshp=1` to kill the boss with one hit.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.

- **Closed.** Open `?seed=1`. `agent-browser --json is visible "#settings_menu"` is `false`, `#seed` is not visible, and `#settings`, `#restart` and `#credit_line` are visible.
- **Open.** `agent-browser click "#settings"`. `#settings_menu` and all eight controls are visible, `#settings` has `aria-expanded="true"`, and the menu's box from `get box "#settings_menu"` lies inside the viewport.
- **Close.** Click `#settings` again, or press Escape, or click the canvas centre. `#settings_menu` is not visible. A click on `#seed` inside the open menu leaves it open.
- **Small and phone.** Repeat at `agent-browser set viewport 800 600` and in a separate session after `agent-browser set device "iPhone 14"`. `document.documentElement.scrollWidth` equals `innerWidth` with the menu closed and open.
- **Death.** Open `?seed=1&focus=void-floor` and wait until `snapshot().fight.run.kind` is `ended` (P4 tick 54), then 600 ms for the panel's poll. `#run_result` reads "You died" and "on P4 tick 54" with Restart and Retry seed. Click the walk tile, press F3 and click Protect from Magic, press F4 and click inventory slot 0, then click `#result_restart`. The new page waits at Start, and after Start carries none of those clicks, as in [setup-and-pause.md](setup-and-pause.md). Its `location.search` is `?focus=void-floor&setup=ranged` with a fresh seed.
- **Kill.** Open `?seed=4&bosshp=1`; `snapshot().fight.boss.hp` is 1. `click_after_tick` at P4 tick 12 clicks 10 px left of and 160 px above the canvas centre, the hovering boss. The click runs in the page on the first frame of tick 12. The bow kills him on P4 tick 16. `#run_result` reads "Ocellus defeated" and "P4 time: 16 ticks (0:09.6)". Click `#pause`: the element at the centre of `#resume` is `#resume`, above the result panel, which is tall enough here to reach it. Click `#resume`. Send the same walk, prayer and inventory clicks, then click `#result_retry`. The new page waits at Start and carries none of them. Its `location.search` is `?seed=4&bosshp=1&setup=ranged&focus=full-fight` and the boss starts at 1 HP again.
- **Scripted.** `scripts/verify.sh browser` runs these steps in the `settings_menu` and `run_results` units and records each check in its unit's `verdict.json`, including `resumeShowsOverTheResult`, `resultRestartWaitsAtStart`, `resultRestartCarriesNoInput`, `resultRetryWaitsAtStart` and `resultRetryCarriesNoInput`.

## Gotchas

- `agent-browser fill` can type into the hidden seed box, but a player cannot, so recipes open the menu first.
- The Settings click is a pointerdown, which resumes a suspended audio context. A recipe that proves the canvas click resumes audio reads the sound boxes after that click.
- On seeds 1, 2, 3 and 5 the bow's first hits on `bosshp=1` roll 0 and the player on spawn dies on P4 tick 24; seed 4 kills on 16.
- The panel polls the run state every 300 ms, so read it at least that long after the run ends.
