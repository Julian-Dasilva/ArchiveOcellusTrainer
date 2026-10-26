# Transition attack

Ocellus rises when the inner void forms, hovers over it and starts landing a tick before it clears. Two ticks after each void clears (P4 tick 32, then 60 after the outer void) he casts a transition attack, and its look and sound tell the player which prayer to use: a purple vortex with a wind-up sound is magic, a dark disk with purple spikes and a sound just before the hit is ranged, and a black disk with a purple semicircle and a sound at the tell is melee. Five ticks after the tell the attack hits every tile, including those under the boss. The prayer the player has when the hit lands decides the damage: the matching protection prayer takes 5 to 9, anything else 43 to 50.

## Sub-features

- `special-tell` logs `special-told` at P4 tick 32 and 60 of the first cycle, then every 60 ticks, with the variant and its style, and plays sequence 14844 with the variant's spotanim over the boss. The spotanim's centre draws black.
- `special-hit` logs `special-hit` 5 ticks after each tell with the style and the landing receipt. The hit was protected when the receipt's `prayer` equals the style.
- `special-sound` logs `special-sounded` for each of the told style's cues: magic 12554 at tell + 2.2, ranged 12555 at tell + 4.4 and 12556 at tell + 5.1, melee 12572 at tell + 0.1 and 12567 at tell + 5.1. The region plays each at the player with its sub-tick delay. Only the transition-attacks focus and the full fight play them.
- `prayer-at-landing` judges the prayer the player has on the landing tick. A prayer clicked during tick 36 is up at 37; one clicked during tick 37 is late.
- `boss-landing` plays the rise at the inner void's onset and the hover through it, and logs `boss-landing-started` one tick before the void clears (29, then 89), when the landing sequence 14865 starts. Its frame sounds 12584, 12587, 12586 and 12585 play at S+21.1, S+21.8, S+23.0 and S+23.5.
- `special-choices` select the order with `specialSelection`: `random-uniform` (default, seeded), `rotation-magic-ranged-melee`, `replay-v1` or `replay-v2`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` and watch the boss after the inner void clears at P4 tick 30. The prayer book is open in the side panel. Tick **Sound effects** and **Area sounds** in the Settings menu to hear the cues.
- Pick `Transition attacks` in the `Focus` selector to practise the tells alone. The drill reloads at once.
- Add `specialSelection=replay-v2` to the URL for the order V2's kill ran: vortex, spike disk, black disk, then again.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.
- The prayer book is the open side panel when the page loads. Clicking its tab button closes it, so the recipe never clicks the tab.
- A click must reach the page between two game ticks. Each click batches a `wait --fn` on the P4 tick with the `mouse move/down/up`, as in the explosions recipe.

- **Pray before the landing.** Run `agent-browser open "http://127.0.0.1:8002/?seed=1&focus=transition-attacks&specialSelection=replay-v2"`. Screenshot `special-before.png` at P4 tick 31, after the landing and before the tell. In one batch, wait for tick 33 and click `PROTECT_MAGIC_RIGHT_PX` (514) right of and `PROTECT_DOWN_PX` (218) below the canvas centre, which is Protect from Magic in the prayer book. Screenshot `special-vortex.png` at tick 35. `log()` shows `prayer-published` magic in row 34, `special-told` vortex at 32 and `special-hit` at 37 with receipt `{requested 9, applied 9, beforeHp 99, afterHp 90, prayer "magic"}`.
- **Pray late and listen.** Save sound and area sound on as in the explosions recipe and click Restart (`#restart`), as a player turning sound on would. Wait until the URL has `setup`, which only the reloaded page has, then wait for P4 tick 0 and install the audio probe. The probe wraps `AudioBufferSourceNode.prototype.start` and records the P4 tick, how far into that tick the start came (`phase`, in ticks, from the first moment the page saw the tick, or 600 ms after the previous tick's start when that is earlier), the buffer's length and rate, and the context state. In one batch, wait for tick 37 and click Protect from Magic. Screenshot `special-heal.png` at 39, the Soul Split heal splat ([overheads-rifts.md](./overheads-rifts.md)), `special-spike-disk.png` at 63, `special-semicircle.png` at 93 and `special-black-disk.png` at 95. Wait for the death at 97 and one more second, then save `log()` and the probe's starts. `log()` shows `prayer-published` magic first in row 38, `special-hit` at 37 with receipt `{requested 49, applied 49, beforeHp 99, afterHp 50, prayer null}`, tells at 32 (vortex), 60 (spike disk) and 92 (black disk), and the run ending in death at 97.
- **Sounds.** Sample counts repeat across sounds, so the script reads them per window. In `LANDING_WINDOWS` (29 to 32 and 89 to 92) the 22050 Hz starts of 19845, 33075 and 22050 samples must be `LANDING_SOUNDS`: 12584, 12587, 12586 and 12585 at 29.1, 29.83, 31.03 and 31.47, then 60 ticks later. In `STYLE_WINDOWS` (each tell to half a tick after its hit) the starts of 35280, 33075, 44100 and 66150 samples must be `STYLE_SOUNDS`: 12554 at 34.2, 12555 at 64.4, 12556 at 65.1, 12572 at 92.1 and 12567 at 97.1. Each time may differ by `SOUND_TOLERANCE_TICKS` (0.2), and every start must run on a `running` context. One run heard 29.11, 29.86, 31.08, 31.5, 34.2, 64.4, 65.1, 92.1 and 97.1.
- **Full fight.** The cycle recipe clicks Protect from Magic after tick 33 and Protect from Range (`PROTECT_RANGE_RIGHT_PX`, 551) after tick 61, so its player survives the vortex at 37 and the spike disk at 65.
- **Pixels.** The script counts vivid purple in `TELL_BOX`, a box from 200 left to 200 right and from 220 to 40 above the canvas centre, which holds the boss while the player stands on spawn. `special-before.png` must be under 0.3% and the vortex, spike disk and semicircle shots at least 1% (measured 0.01, 6.1, 2.7 and 2.5). In `TELL_CENTRE_BOX`, the west half of the boss's footprint from 50 left of the centre to the centre and from 110 to 75 above it, each of the vortex, spike disk and black disk shots must be under 1% near white (measured 0, 0 and 0 in three runs; without the centre recolour 35, 74 and 89). Near black is recorded, not checked: with no tell the boss's robe makes 23 to 31% of the box near black, and the vortex's share swings from 15 to 36 with its frame.
- **Scripted.** `scripts/verify.sh browser --unit transition_attack` runs these steps and records `prayerBeforeLandingProtects`, `lateClickTakesFullHit`, `tellsToldOnSchedule`, `tellsDrawn`, `tellCentresDark`, `landingSoundsOnSchedule` and `styleSoundsOnSchedule` in `units/transition_attack/verdict.json`, with the measurements under `observed.special`.

## Gotchas

- The prayer book positions hold for a 1280x800 viewport. A changed viewport or panel layout shows up as a missing `prayer-published` input, not a silent pass.
- The SDK draws spotanims without textures. The tells' centre is texture 215, a near-black starfield, so the data file's `tellCentre` recolours those faces to its mean texel. Without it the centre draws near white.
- Chrome starts the audio context `suspended` on a page that has had no click, unless a clicked page of the same origin navigated to it, as Restart and the focus selector do. A page loaded by `agent-browser open` has had no click, so its sounds start suspended until the first click resumes it. The probe still records those starts, so the checks require `running`.
- With no prayer, `replay-v2` kills a 99 HP player at 97: 49 at 37, 47 at 65 and the rest at 97.
- Clicking near a tick boundary can land the prayer a tick late. Click on the tick before you need it.
