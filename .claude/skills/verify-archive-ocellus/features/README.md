# Archive Ocellus Trainer verification map

This directory is the maintained source for verifying what a user of the trainer can see and do. Read this index before driving the app, then use the matching feature file as the recipe. Add a file here when a mechanic ships, and change the file when its user path changes. Add its scenarios and oracles to [scenarios.md](../scenarios.md) in the same change.

## Baseline preconditions

- `scripts/verify.sh serve` has started the full fight at `http://127.0.0.1:8002/`, which opens on Phase 4, and `scripts/verify.sh doctor` passes.
- `public/osrs-assets/manifest.json` contains `npc-16677` and `npc-16678` from cache `openrs2:2746`, and `public/osrs-assets/sprites/` holds the head icons.
- `AGENT_BROWSER_SESSION` names a session that belongs to this run.
- The viewport is 1280x800 (`agent-browser set viewport 1280 800`).
- The page has loaded fresh, `#start` has been clicked, and `window.__archiveOcellusProbe.snapshot().tick` has reached 8, past the 6-tick GET READY countdown.

## Driving conventions

- Start every recipe from a fresh page load unless its preconditions say otherwise.
- Use real input for page loads, tile clicks, and visible elements: `agent-browser open`, `mouse move/down/up`, and CSS ids. A click timed to a P4 tick is `click_after_tick`: a `MouseEvent` on `#world` in the first frame of that tick, sent only when `document.elementFromPoint` is `#world`.
- Read world state only through `window.__archiveOcellusProbe.snapshot()` and `window.__archiveOcellusProbe.log()`. Both are read-only and exist only in development builds. Their tiles are platform-local.
- Never change state through `eval`, the snapshot handle or SDK globals. The one exception is `window.__archiveOcellusProbe.setBossHp(hp)`, which a recipe that needs a quick kill calls once Phase 4 has started.
- Pixel positions are relative to `agent-browser get box "#world"`. Scene clicks aim at `window.__archiveOcellusProbe.tileCentre(tile)`, because the camera follows the player and keeps the platform's local south at the top of the screen, so no fixed offset names a tile. Panel clicks keep their distance from the canvas's bottom right (tabs, prayers, inventory) or top right (minimap orbs), as `click_panel` in `scripts/verify.sh` does.
- Every page runs the whole Phase 4 cycle: the drain, the explosions, the void floor, the transition attacks and the rifts act together. A recipe for one mechanic dodges or survives the others, usually with `practice=1` in the link.

## Proof and skip reporting

- Capture the user action and the resulting state: a snapshot and a screenshot before the action, the action itself, then a snapshot and a screenshot after it.
- Save console output (`agent-browser console`) and page errors (`agent-browser --json errors`). An uncaught page error fails the proof.
- Record the feature ID and the entry point with every artifact.
- Report an unreachable path with the command you tried and the precondition that was not met.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with agent-browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Arena render](./arena-render.md) covers page load, the standing quadrant's floor and the room around it, the player model and the HUD.
- [Set-up and pause](./setup-and-pause.md) covers the Start panel, keybinds before Start and while paused, Pause and Resume with the button or P, the pause log and result note, and Restart reloading the same seed.
- [Click to walk](./click-to-walk.md) covers walking the player to a clicked floor tile, walking one tile a tick on a Control-click, and stopping at the platform's edge.
- [Credit line](./credit-line.md) covers the Fan Content Policy credit that must stay visible.
- [What's new and the version label](./whats-new.md) covers the What's new panel in the About section, its unseen dot, and the version beside the credit line.
- [P4 cycle](./p4-cycle.md) covers the boss, the lead-in, the 60-tick cycle's stages and overheads, and the fight log.
- [Loadouts](./loadouts.md) covers the ranged and melee setups, the Start with and Defence drained controls, inventory switches and Ralos's Division special attack.
- [Boss defence](./boss-defence.md) covers the boss's ranged defence and the 60% Defence floor that stops Division at 150.
- [Void floor](./void-floor.md) covers the inner square and outer flood, their damage, the safe 5x5 and how both draw in 3D.
- [Floor holes](./floor-holes.md) covers the corner-stack hole layout, the holes drawn from the cache, their hiding under the flood, and the hit on a player who stands on one.
- [Lifeforce orb](./lifeforce-orb.md) covers the lifeforce tell and hit, the orb from spawn to glow, its return, its expiry and the boss heal from an unclaimed outer orb.
- [Supplies and key bindings](./supplies-and-keybinds.md) covers item names in menus, the carried brews, restores and boost potions, drinking them, and binding the side-panel tabs to keys.
- [Personal explosions](./explosions.md) covers the marks on the player's tile, the hit a tick later, dodging on mark ticks, the late step, standing under the boss and how the shards draw.
- [Transition attack](./transition-attack.md) covers the boss's rise and landing, the three tells, the styled hit and the protection prayer judged when it lands.
- [Overheads, heals and rifts](./overheads-rifts.md) covers the boss's curse icons, deflected player hits, the Soul Split heal, and void rifts from spawn to kill or burst, with the kill line in the chat.
- [Phase 4 as the recorded fights show it](./p4-recorded-fights.md) covers the boss taking damage from P4 tick 4, the orb returned on its glow tick to a player waiting on it, the rift burst 30 ticks on as one hit, and the attack delay reset when a rift is destroyed.
- [Timing cues](./timing-cues.md) covers the sound checkboxes, resuming audio on the first click, the "End..." shout, the orb chimes, the flood sound and the lifeforce chat line.
