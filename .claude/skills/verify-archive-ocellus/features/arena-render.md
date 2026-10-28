# Arena render

Opening the trainer loads cache assets, waits behind the Ready? dialog, counts down GET READY after Start, and shows Phase 4's room as the third fall leaves it. The standing north-west quadrant is a checkered floor of 84 tiles, the measured platform turned onto that quadrant, and the three fallen quadrants are dark around it. The player stands on the platform's north band, local (5, 1), facing local south toward the boss, inside the standard game HUD. The side panel takes the right of the page and the policy strip the bottom, so the canvas fills the rest.

## Sub-features

- `arena-load` loads the page and reaches the ticking state without page errors.
- `arena-view` opens the 3D view, the trainer's only view, even when an older build stored `use3dView: false`, and saves 3D facing north over it.
- `arena-floor` draws the standing quadrant's 84 floor tiles as a checkerboard. In platform-local tiles they are the `#` tiles of `geometry.platform` in `OcellusTimings.ts`.
- `arena-room` draws the room around the floor: cliffs into the abyss, the parapet and torches, the stepping stones and the censers on the quadrants' outer corners. A fallen quadrant's parapet, torches and censer go with it.
- `arena-walkway` keeps the walkway band (`w`, `b` and `/` in the same rows) off the floor: a click on it walks the player to the nearest floor tile ([click-to-walk.md](./click-to-walk.md)).
- `arena-player` draws the player model, in the gear Start with selects (the ranged setup with the twisted bow by default), on spawn tile (5, 1).
- `arena-hud` shows the minimap orbs, inventory tabs and inventory panel at the canvas's right edge.
- `arena-resize` keeps the 3D view's WebGL canvas in `#world`'s box and backing size when the window resizes, and a tile click still orders that tile.
- `arena-device-scale` does the same when the device pixel ratio changes.
- `arena-paused` keeps the frame drawn behind the Resume dialog while the trainer is paused.
- `arena-context-restore` draws the scene again after the browser restores a lost WebGL context, and logs the loss once.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` in a browser and press Start.
- Resize the window, or move it to a display with another scale.
- Switch to another tab and back.
- A GPU reset or driver update loses the WebGL context; the browser restores it.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, except that the page has not been opened yet.

- **Load.** Open the page. Run `agent-browser open http://127.0.0.1:8002/`. The title is `Archive Ocellus Trainer`, and `#start` shows once the assets have loaded. Run `agent-browser click "#start"`.
- **Ticking.** Wait for the countdown to finish. Run `agent-browser wait --fn "window.__archiveOcellusProbe?.snapshot().tick >= 8" --timeout 90000`. The command exits 0.
- **Spawn state.** Read the state. Run `agent-browser --json eval "window.__archiveOcellusProbe.snapshot()"`. `data.result.player` is `{"x":5,"y":1}` and `data.result.ticking` is `true`.
- **Proof.** Capture the screen. Run `agent-browser screenshot "$PWD/.verify/<run>/arena.png"`. The screenshot shows the checkered quadrant with the dark fallen quadrants around it, the player with the blowpipe at the centre, the boss ahead on his 3x3 once he is present, the HUD at the canvas's right edge, and the side panel beside it.
- **No errors.** Run `agent-browser --json errors`. `data.errors` is `[]`.
- **Stored 2D view.** In a new session started with `--init-script` set to `VIEWPORT_RENDERS_JS` from `scripts/verify.sh`, which counts every WebGL render into a canvas larger than 1x1 pixel, open `http://127.0.0.1:8002/osrs-assets/manifest.json`, a page on the same origin that runs no trainer. Run `agent-browser eval "localStorage.setItem('osrs-sdk:settings', JSON.stringify({ version: 1, values: { use3dView: false, rotated: 'south' } }))"`, then open `?seed=1`, click `#start` and wait for tick 8. `window.__viewportRenders.count` is above 0, and the saved `values` have `use3dView` `true` and `rotated` `"north"`. The `stored_view` unit records this as `stored2dViewOpensIn3d`.
- **Resize.** Run `agent-browser set viewport 1000 700`, then `agent-browser --json eval "[...document.querySelector('#world').parentElement.querySelectorAll(':scope > canvas')].map((c) => [c.getBoundingClientRect().width, c.width])"`. Each canvas reports a backing width equal to its box width, narrower than 1000 by the side panel.
- **Device scale.** Run `agent-browser set viewport 1000 700 2`. `devicePixelRatio` is 2, a screenshot is 2000x1400, and each canvas still reports a backing size equal to `#world`'s box.
- **Pause.** Run `agent-browser tab new about:blank`, `agent-browser tab close`, then switch back to the trainer's tab with `agent-browser tab <id>`. The Resume dialog shows over the arena, `snapshot().ticking` is `false`, and two screenshots 2 s apart are identical outside the FPS counter.
- **Context loss.** In a session started with `--init-script` set to `PRESENT_WEBGL_HOOKS_JS`, which keeps each WebGL2 context the page creates in `window.__webglContexts`, run `agent-browser eval "(window.__lose = window.__webglContexts[0].getExtension('WEBGL_lose_context')).loseContext()"`. The arena goes black under the HUD. Run `agent-browser eval "window.__lose.restoreContext()"`. The arena returns, and `agent-browser console` shows `[osrs-sdk] WebGL context lost while rendering the 3D viewport` once.
- **Composition proof.** `scripts/verify.sh browser --unit layered_present` runs these four on `?seed=1&practice=1` (`PRESENT_QUERY`) and compares each paused screen with the frame composed from the canvases (see `SKILL.md`).

## Gotchas

- Headless Chrome renders WebGL in software. The FPS counter at the top left can drop to around 35; this is not a regression.
- The fallen quadrants around the platform are as dark as the void, so a void colour count over the whole screen reads them too. `noVoidBeforeTheFight` counts only the box around the arena centre (5, 5).
- The player model is built only from equipped items. A player with no loadout is invisible except for the health bar.
- The SDK's model warm-up renders into a throwaway 1x1 canvas, so only renders into a larger canvas count as the 3D view.
- Vitest mounts the SDK's canvas viewport in place of the 3D one, because jsdom has no WebGL (`test/setupFiles.ts`). Only the browser shows which view the trainer opens.
- `agent-browser screenshot` with a relative path saves into agent-browser's own temporary directory. Pass an absolute path.
- The WebGL canvas reads back blank outside a frame that drew it, so `drawImage` or `toDataURL` from a command returns transparent pixels. The SDK renders at most `renderFps` (60) times a second and skips some frames, so read it in a `requestAnimationFrame` callback of a frame that rendered.
- Coming back to the tab restarts the 3D render loop. A check that rendering resumed after a context loss looks at the running page before it pauses.
- Without Practice the cycle's hits can end the run during a long manual check. Add `practice=1` to the link.
