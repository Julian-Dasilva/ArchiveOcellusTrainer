# Arena render

Opening the trainer loads cache assets, counts down GET READY, and shows the measured P4 platform as a checkered floor with black beyond its edges and a raised walkway along its diagonal edge. The player stands on its north band facing south toward the boss, inside the standard game HUD.

## Sub-features

- `arena-load` loads the page and reaches the ticking state without page errors.
- `arena-view` opens the 3D view, the trainer's only view, even when an older build stored `use3dView: false`, and saves 3D facing north over it.
- `arena-floor` draws the 84 floor tiles of the measured 12x12 platform (`#` in `geometry.platform` in `OcellusTimings.ts`) as a checkerboard.
- `arena-walkway` draws the brazier walkway (`w`, `b` and `/` in the same rows) as a raised olive curb with a light face toward the floor. A `/` tile is a diagonal wall: the curb fills its outer half and faces the floor along the diagonal, so the wall runs straight from the end of the straight run to the jut, and its floor half floods with the floor beside it. and hangs the cache's Zarosian Censer (model 62440) over the `b` tile. The walkway is scenery: a click on it walks the player to the nearest floor tile.
- `arena-player` draws the player model, in the selected setup's gear (ranged by default), on spawn tile (5, 1).
- `arena-hud` shows the minimap orbs, inventory tabs and inventory panel.
- `arena-resize` keeps the 3D view's WebGL canvas in `#world`'s box and backing size when the window resizes, and a tile click still orders that tile.
- `arena-device-scale` does the same when the device pixel ratio changes.
- `arena-paused` keeps the frame drawn behind the Resume dialog while the trainer is paused.
- `arena-context-restore` draws the scene again after the browser restores a lost WebGL context, and logs the loss once.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/` in a browser.
- Resize the window, or move it to a display with another scale.
- Switch to another tab and back.
- A GPU reset or driver update loses the WebGL context; the browser restores it.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, except that the page has not been opened yet.

- **Load.** Open the page. Run `agent-browser open http://127.0.0.1:8002/`. The title is `Archive Ocellus Trainer`.
- **Ticking.** Wait for the countdown to finish. Run `agent-browser wait --fn "window.__archiveOcellusProbe?.snapshot().tick >= 8" --timeout 90000`. The command exits 0.
- **Spawn state.** Read the state. Run `agent-browser --json eval "window.__archiveOcellusProbe.snapshot()"`. `data.result.player` is `{"x":5,"y":1}` and `data.result.ticking` is `true`.
- **Proof.** Capture the screen. Run `agent-browser screenshot "$PWD/.verify/<run>/arena.png"`. The screenshot shows the checkered platform with black beyond its edges, the olive walkway on the left running up past the boss, its floor side straight from the end of the straight run to the jut and stepped past it, the censer hanging on its chain beside the boss, the player in Masori armour with the Twisted Bow at the centre, the boss ahead on his 3x3, and the HUD at the right edge.
- **No errors.** Run `agent-browser --json errors`. `data.errors` is `[]`.
- **Stored 2D view.** In a new session started with `--init-script` set to `VIEWPORT_RENDERS_JS` from `scripts/verify.sh`, which counts every WebGL render into a canvas larger than 1x1 pixel, open `http://127.0.0.1:8002/osrs-assets/manifest.json`, a page on the same origin that runs no trainer. Run `agent-browser eval "localStorage.setItem('osrs-sdk:settings', JSON.stringify({ version: 1, values: { use3dView: false, rotated: 'south' } }))"`, then open `?seed=1` and wait for tick 8. `window.__viewportRenders.count` is above 0, and the saved `values` have `use3dView` `true` and `rotated` `"north"`. `drive_stored_view` records this as `stored2dViewOpensIn3d` in `stored-view-checks.json`.
- **Resize.** Run `agent-browser set viewport 1000 700`, then `agent-browser --json eval "[...document.querySelector('#world').parentElement.querySelectorAll(':scope > canvas')].map((c) => [c.getBoundingClientRect().width, c.width])"`. Both canvases report `[1000,1000]`.
- **Device scale.** Run `agent-browser set viewport 1000 700 2`. `devicePixelRatio` is 2, a screenshot is 2000x1400, and both canvases still report `[1000,1000]`.
- **Pause.** Run `agent-browser tab new about:blank`, `agent-browser tab close`, then `agent-browser tab t1`. The Resume dialog shows over the arena, `snapshot().ticking` is `false`, and two screenshots 2 s apart are identical outside the FPS counter.
- **Context loss.** Run `agent-browser eval "(window.__lose = document.querySelector('#world').previousElementSibling.getContext('webgl2').getExtension('WEBGL_lose_context')).loseContext()"`. The arena goes black under the HUD. Run `agent-browser eval "window.__lose.restoreContext()"`. The arena returns, and `agent-browser console` shows `[osrs-sdk] WebGL context lost while rendering the 3D viewport` once.
- **Composition proof.** `scripts/verify.sh browser --unit layered_present` runs these four and compares each paused screen with the frame composed from the canvases (see `SKILL.md`).

## Gotchas

- Headless Chrome renders WebGL in software. The FPS counter at the top left can drop to around 35; this is not a regression.
- Tiles off the platform and the walkway are black. `drawWorldBackground` paints only platform and walkway tiles, and the default 3D floor plane takes its texture from it.
- The walkway's top renders exactly `#6b6c40` (`geometry.walkway.top`) because it uses an unlit material, so a pixel count of that colour shows whether it is drawn.
- The player model is built only from equipped items. A player with no loadout is invisible except for the health bar.
- The SDK's model warm-up renders into a throwaway 1x1 canvas, so only renders into a larger canvas count as the 3D view.
- Vitest mounts the SDK's canvas viewport in place of the 3D one, because jsdom has no WebGL (`test/setupFiles.ts`). Only the browser shows which view the trainer opens.
- `agent-browser screenshot` with a relative path saves into agent-browser's own temporary directory. Pass an absolute path.
- The WebGL canvas reads back blank outside a frame that drew it, so `drawImage` or `toDataURL` from a command returns transparent pixels. The SDK renders at most `renderFps` (60) times a second and skips some frames, so read it in a `requestAnimationFrame` callback of a frame that rendered.
- Coming back to the tab restarts the 3D render loop. A check that rendering resumed after a context loss looks at the running page before it pauses.
