# Timing cues

Players time phase 4 by ear as much as by sight, so the trainer plays the fight's sounds on the ticks the footage puts them. Two checkboxes in the side panel's Sound section, **Sound effects** and **Area sounds**, turn the SDK's two sound settings on and off. Both start on until the player unticks one, on desktop and mobile, and a saved choice holds across reloads. Every boss, orb and rift cue is an area sound. The first click anywhere on the page resumes the browser's audio, which a desktop browser starts suspended. The "End..." shout plays 12490 at P4 tick 5. Each lifeforce orb starts its spawn animation on the hit tick, so its four chimes count down to the glow. The outer flood plays 12497 as it forms. The lifeforce tell also posts "Ocellus manipulates your lifeforce!" in the game chat.

## Sub-features

- `sound-toggles` shows `#sound` and `#area_sound` checked on a fresh profile, writes `playsAudio` and `playsAreaAudio` to the SDK's saved settings in `osrs-sdk:settings` when clicked, and shows the saved choice after a reload. The SDK's own icons in the settings tab change the same settings.
- `audio-resume` resumes the SDK's audio context on the first `pointerdown` anywhere on the page.
- `end-shout` plays 12490 on the player's tile at P4 tick 5, the "End..." shout.
- `orb-chimes` play spotanim 4311's chimes 12624, 12621, 12622 and 12623 at 12.4, 15.87, 19.8 and 22.8, and spotanim 4309's at 43.1, 44.7, 46.8 and 48.3. The outer orb's last chime plays before it glows at 49.
- `flood` plays 12497 on the player's tile when the outer void forms, at 39 and every 60 ticks after.
- `lifeforce-chat` posts "Ocellus manipulates your lifeforce!" in `#game_chat` at each lifeforce tell, 11 and 42.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and listen. **Area sounds** carries the boss cues and **Sound effects** the hits and prayers. Untick either in the side panel's Sound section to silence it.
- Click anywhere on the page once if the browser held the audio back.
- Read the chat over the game view at the lifeforce tell.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, and the overheads-and-rifts recipe has run.
- `public/osrs-assets/` holds a sound pack with 12490 and 12497. `scripts/verify.sh assets` rebuilds it when the config lists a sound the pack lacks.
- Every page runs the whole cycle, so the transition attack's melee tell at 32 plays 12572 among the cues. The recipe uses `?seed=75&practice=1` (`CUE_QUERY`), whose first tell is melee.

- **Desktop autoplay.** Headless Chrome starts an audio context running, so it would pass a silent desktop browser. Write a script that subclasses `window.AudioContext`, suspends each new context and keeps it in `window.__audioContexts` (`AUTOPLAY_POLICY_JS`). Start a new session with it, `agent-browser --session <run>-autoplay --init-script autoplay-policy.js set viewport 1280 800`. The script runs before the page's scripts on every navigation of that session only, so the SDK's context starts suspended, as Chrome's autoplay policy starts it. The new session is a new browser, so its saved settings start empty.
- **Toggles on by default.** Open `CUE_QUERY`, wait until `#start` is visible and install the audio-start recorder from the explosions recipe. `agent-browser --json is visible` and `is checked` on `#sound` and `#area_sound` read visible and checked. Every context reads `suspended`.
- **First click.** Click `#start`, then on P4 tick 0 click the canvas centre, touching neither box. The context reads `running`. At tick 6 (`CUE_TOGGLE_TICK`) the recorder holds 12490 (7717 samples) at 5, on a `running` context.
- **Untick both.** `agent-browser click "#area_sound"` and `click "#sound"`. `osrs-sdk:settings` holds `playsAudio: false` and `playsAreaAudio: false`. Click **Restart** (`#restart_fight`), which reloads the same seed, and wait for Start.
- **Toggles off after a saved off.** Install the recorder again. Both boxes read visible and unchecked, and every context reads `suspended`.
- **Turn them on.** Click `#start`. After P4 tick 6, `agent-browser click "#area_sound"` and `click "#sound"`. Both read checked, `osrs-sdk:settings` holds `playsAudio: true` and `playsAreaAudio: true`, and every context reads `running`. Wait for tick 50 (`CUE_LAST_TICK`). No cue sound started before the click, so the "End..." shout at 5 stayed silent. After it, the chimes, the melee tell and the flood start on the schedule below, up to `CUE_SPAWN_HEARD_UNTIL` (40): this page's player stays on spawn and does not hear the outer orb's chimes.
- **Reload and click the canvas.** Click **Restart** again. Both boxes read checked after the reload, and the new context reads `suspended`. Click `#start`, then on P4 tick 0 click the canvas centre, which walks the player a tile in. The context reads `running`. `#game_chat` is empty at tick 10 and reads "Ocellus manipulates your lifeforce!" 600 ms after tick 11.
- **Hear the cues.** Wait for tick 50. The recorded 22050 Hz starts match `CUE_SOUNDS` within `CUE_SOUND_WINDOW`, P4 ticks 4 to 50: 12490 (7717 samples) at 5, 12624 (9922) at 12.4, 12621, 12622 and 12623 (12127 each) at 15.87, 19.8 and 22.8, 12572 (66150) at 32.1, 12497 (66150) at 39, and the outer chimes at 43.1, 44.7, 46.8 and 48.3, each within 0.2 tick and on a `running` context. The sample counts come from the SDK's synthesizer run on the cache's definitions.
- **Scripted.** `scripts/verify.sh browser --unit cues` runs these steps and records `soundTogglesShownOnWhenFresh`, `defaultSoundPlaysCueAfterFirstClick`, `soundOffChoiceSaved`, `soundTogglesShownOff`, `soundTogglesTurnOnCues`, `soundChoiceSaved`, `audioResumesOnFirstPointerdown`, `cueSoundsOnSchedule` and `lifeforceChatOnTell` in `units/cues/verdict.json`, with the heard sounds under `observed.cues`.

## Gotchas

- `agent-browser addinitscript` is not a command in 0.34. Pass `--init-script` when the session starts, and use a session of its own so the other recipes keep Chrome's headless default.
- The chimes are frame sounds of the orb's spawn spotanim, so they play only while the 3D view draws the orb, and only within 7 tiles of the player. On the toggle page seed 75 puts the inner orb on (9, 4), 7 tiles (Manhattan) from spawn, so its chimes play quietly. The toggle page's player stays on spawn and does not hear the outer orb's chimes; the last page's player, a tile in, does.
- A 138 ms frame at tick 12, when the hit lands and the inner orb first draws, made the page see tick 12 100 ms late when measured. Timed from that moment 12624 read 12.2. The probe starts a tick no later than 600 ms after the previous one, which puts it at 12.38.
- 12621, 12622 and 12623 have the same length, and so do 12572 and 12497, so the check tells them apart by tick.
- 12490 has the same length as the rift spawn sound 12643. The rifts rise at 67, after the window ends at 50.
- A click on a checkbox counts as the first pointerdown, so the toggle page resumes the context before its first cue. The fresh page and the last page prove a click on the game resumes it.
- The SDK writes its own off defaults to `osrs-sdk:settings` on a first visit and turns both sounds off on every mobile load. The trainer reads the saved choice before the SDK loads, so a profile that visited before this default changed keeps the `false` the SDK wrote and loads with both boxes unticked.
- A reused autoplay session keeps the sound choice saved by the last run and fails `soundTogglesShownOnWhenFresh`. The session name carries the run directory, and `release_browser` closes it.
