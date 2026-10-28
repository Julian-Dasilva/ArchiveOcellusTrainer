# Set-up and pause

Every page opens in a set-up state. The arena, the player, the side panel and the orbs are drawn, nothing ticks, and a Ready? dialog with a Start button waits in the middle of the game view. The side panel, Keybinds and the sound boxes work while it waits. Start begins the GET READY countdown. During a run, a Pause (P) button in the side panel's Fight section, or the P key, stops the world on its current tick. While paused, keybinds and settings can be changed, and Resume (the button or P again) continues from the same tick. Pauses go into the fight log, and the result of a paused run says how often and how long it was paused. Restart reloads the page with the same seed and the panel's current choices, and the new page waits at Start again.

## Sub-features

- `set-up-holds` keeps the world at tick 0 with no fight log rows until Start, and draws every frame without the GET READY text.
- `keybind-before-start` binds a tab key in the set-up state, and the key opens its tab once the run starts.
- `pause-holds` stops the world tick while paused and shows a Resume button.
- `keybind-while-paused` binds a tab key while paused, and the key works after Resume.
- `resume-same-tick` continues with the next world tick after the one the pause held.
- `paused-input` holds each click's input delay while paused, so a click registers on the same P4 tick as in a run with no pause. A click made while paused acts as if made when the pause began. When more than eight inputs register before one tick, the newest eight run, so the last click decides. Vitest owns both cases in `SetUpAndPause.test.tsx`.
- `pause-key` toggles pause and resume with P. P does nothing before Start, in the Start at selector, while a key is being bound, or once a tab is bound to P.
- `pause-logged` lists each pause in `log().pauses` with its world tick and length in ms, and the result reads "Paused once, for N s in all." or "Paused N times, ...".
- `pause-not-timed` leaves the pause out of the telemetry summary's frame and tick gaps.
- `restart-waits` makes the page that Restart loads while paused wait at Start on the same seed, with no walk, prayer or inventory click from the run it replaced.

## How to get to it (user POV)

- Open any trainer link. The Ready? dialog shows once the page has loaded.
- During a run, click **Pause (P)** in the side panel's Fight section, or press P.
- Click **Restart** in the same section, paused or not.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, except that the page has not been started. Open it with `START_ON_LOAD=0` in `scripts/verify.sh`, or with `agent-browser open` directly.

- **Set-up.** Open `?seed=1&practice=1` (`SETUP_QUERY`) and wait until `#start` is visible. Install a `fillText` recorder and wait 3 s. `snapshot().tick` is 0, `ticking` is `false`, `fight.run.kind` is `waiting` and `log().rows` is empty. Every frame drew the orb numbers, and none drew `GET READY`.
- **Keybind before Start.** Scroll `#keybinds` into view and click it, then click the inventory key button at the panel point (1130, 650), and press F6. The tick is still 0. Click `#start`, wait for P4 tick 1, and press F6: `panel.tab` is `INVENTORY`.
- **Pause.** At P4 tick 10, click `#pause`. After 3 s `snapshot().tick` is unchanged and `#resume` is visible. Bind the inventory key to F7 the same way. Click `#resume`: the world ticks seen afterwards run on from the held tick by one. F7 opens `INVENTORY`.
- **Logged.** After Resume, `#pause` shows again, and `log().pauses` has one entry at the held world tick, at least 3000 ms long.
- **Restart while paused.** Click `#pause`. Click (8, 3), press F3 and click Protect from Magic, press F4 and click inventory slot 0, then click `#restart_fight`. The new page shows Start, and 1.2 s later its tick is 0 with no fight log rows and no `#pause`. Click `#start`. On the first world tick the player is on (5, 1) with the blowpipe worn and Ralos in slot 0, and the first fight log row has no prayer and no inputs. On a page that kept the departing run's input, the player walks to (8, 3), wears Ralos and prays Protect from Magic.
- **Scripted.** `scripts/verify.sh browser --unit setup_pause` runs these steps and records each check in `units/setup_pause/verdict.json`, including `restartWhilePausedWaitsAtStart` and `restartWhilePausedCarriesNoInput`. The `telemetry` unit pauses its first page for 2.5 s and checks `pauseLeftOutOfTimings`.

## Gotchas

- `agent-browser press P`, like any letter key, sends a keydown, a keyup and then a stream of further keydowns, each without `repeat`, so every one toggles pause. Drive pause with `#pause` and `#resume`; Vitest owns the P key in `SetUpAndPause.test.tsx`.
- Every other recipe in `scripts/verify.sh` clicks Start after `ab open`, `ab reload` and each control that reloads the page. A recipe that must read the page before any click, such as the audio cue and GET READY checks, sets `START_ON_LOAD=0` and calls `start_run` itself.
- The Start click is the page's first pointerdown, so it resumes a suspended audio context. Read audio context states before it.
- Start fight in the side panel is not Start. It reloads the page with a fresh seed at the phase Start at names, and the new page waits at Start.
