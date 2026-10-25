# Set-up, pause and saved loadouts

Every page opens in a set-up state. The arena, the player, the side panel and the orbs are drawn, nothing ticks, and a Start panel waits in the middle of the game view. Settings, Keybinds and the side panel work while it waits. Start begins the GET READY countdown. During a run, a Pause button beside Restart, or the P key, stops the world on its current tick. While paused, keybinds and settings can be changed, and Resume (the button or P again) continues from the same tick. Pauses go into the fight log, and the result panel of a paused run says how often and how long it was paused. A loadout saved in the browser for the chosen setup sets the worn gear and all 28 inventory slots at the start of a P4 or P3 run. There is no editor for it yet.

## Sub-features

- `set-up-holds` keeps the world at tick 0 with no fight log rows until Start, and draws every frame without the GET READY text.
- `keybind-before-start` binds a tab key in the set-up state, and the key opens its tab once the run starts.
- `pause-holds` stops the world tick while paused and shows a Resume button.
- `keybind-while-paused` binds a tab key while paused, and the key works after Resume.
- `resume-same-tick` continues with the next world tick after the one the pause held.
- `paused-input` holds each click's input delay while paused, so a click registers on the same P4 tick as in a run with no pause. A click made while paused acts as if made when the pause began. When more than eight inputs register before one tick, the newest eight run, so the last click decides. Vitest owns both cases in `SetUpAndPause.test.tsx`.
- `pause-key` toggles pause and resume with P. P does nothing before Start, in the seed field, while a key is being bound, or once a tab is bound to P.
- `pause-logged` lists each pause in `log().pauses` with its world tick and length in ms, and the result panel reads "Paused once, for N s in all." or "Paused N times, ...".
- `pause-not-timed` leaves the pause out of the telemetry summary's frame and tick gaps.
- `restart-waits` makes the page that Restart loads while paused wait at Start, with no walk, prayer or inventory click from the run it replaced. The result panel's Restart and Retry seed do the same ([settings-and-results.md](settings-and-results.md)).
- `saved-loadout` wears and carries a loadout saved under `archive-ocellus:loadouts` for the setup, slot for slot, in P4 and P3.
- `loadout-fallback` uses the wiki loadout when nothing is saved for the setup or storage is blocked, and shows `#loadout_note` when the saved entry cannot be read. When the browser refuses storage outright, the page keeps its storage in memory until it reloads.

## How to get to it (user POV)

- Open any trainer link. The Start panel shows once the page has loaded.
- During a run, click **Pause (P)** beside Restart, or press P.
- A saved loadout comes from browser storage. No control writes it yet.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, except that the page has not been started. Open it with `START_ON_LOAD=0` in `scripts/verify.sh`, or with `agent-browser open` directly.

- **Set-up.** Open `?seed=1&invincible=on` and wait until `#start` is visible. Install a `fillText` recorder and wait 3 s. `snapshot().tick` is 0, `ticking` is `false`, `fight.run.kind` is `waiting` and `log().rows` is empty. Every frame drew the orb numbers, and none drew `GET READY`.
- **Keybind before Start.** Click `#settings`, then `#keybinds`, then the inventory key button at (1130, 650), and press F6. The tick is still 0. Click `#start`, wait for P4 tick 1, and press F6: `panel.tab` is `INVENTORY`.
- **Pause.** At P4 tick 10, click `#pause`. After 3 s `snapshot().tick` is unchanged and `#resume` is visible. Bind the inventory key to F7 the same way. Click `#resume`: the world ticks seen afterwards run on from the held tick by one. F7 opens `INVENTORY`.
- **Logged.** After Resume, `#pause` shows again, and `log().pauses` has one entry at the held world tick, at least 3000 ms long.
- **Restart while paused.** Click `#pause`. Click the walk tile, press F3 and click Protect from Magic, press F4 and click inventory slot 0, then click `#restart`. The new page shows Start, and 1.2 s later its tick is 0 with no fight log rows and no `#pause`. Click `#start`. On the first world tick the player is on (5, 1) with the bow worn and Ralos in slot 0, and the first fight log row has no prayer and no inputs. On a page that kept the departing run's input, the player walks to (8, 3), wears Ralos and prays Protect from Magic.
- **Saved loadouts.** On the trainer's origin, run `localStorage.setItem("archive-ocellus:loadouts", ...)` with a version 1 store whose `ranged` entry wears the melee gear and carries a brew, a restore, the ranged switches and Ralos in slots 0 to 10, a bastion and a super combat in 12 and 13, and a brew in 27. Open `?seed=1` and `?phase=p3&seed=1`: `snapshot().fight.player` shows that gear and those 28 slots, and there is no `#loadout_note`. Then save a store that is not JSON, one of version 2, one with `dragonClaws` in slot 0, one with the bow as the helmet and one with 27 slots. Each opens the ranged wiki loadout with `#loadout_note`. A session whose init script makes `window.localStorage` throw opens the ranged wiki loadout with no note. None has a page error.
- **Scripted.** `scripts/verify.sh browser` runs these steps as `drive_setup_pause` and `drive_saved_loadouts`, and writes `setup-pause-checks.json`, `restart-paused-checks.json` and `saved-loadout-checks.json`. `drive_telemetry` pauses its first page for 2.5 s and checks `pauseLeftOutOfTimings`.

## Gotchas

- `agent-browser press P`, like any letter key, sends a keydown, a keyup and then a stream of further keydowns, each without `repeat`, so every one toggles pause. Drive pause with `#pause` and `#resume`; Vitest owns the P key in `SetUpAndPause.test.tsx`.
- Every other recipe in `scripts/verify.sh` clicks Start after `ab open`, `ab reload` and each control that reloads the page. A recipe that must read the page before any click, such as the audio cue and GET READY checks, sets `START_ON_LOAD=0` and calls `start_run` itself.
- The Start click is the page's first pointerdown, so it resumes a suspended audio context. Read audio context states before it.
- Saved loadouts have no editor yet, so `drive_saved_loadouts` writes each store with `localStorage.setItem` on the trainer's origin before it opens the page. It removes the store afterwards, because later recipes expect the wiki loadout.
- `agent-browser errors` lists every error the session has seen, across page loads, and `errors --clear` fails without emptying it in 0.34. `saved_loadout_page` counts the errors before it opens a page and keeps only the ones after.
