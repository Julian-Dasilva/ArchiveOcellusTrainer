# What's new and the version label

The Settings menu has a What's new button that opens a panel listing every release in `src/content/ocellus/changelog.ts`, newest first, each with its version and notes. A red dot on Settings and on What's new marks a release the player has not opened yet. Opening the panel clears both dots and keeps the version in `localStorage` under `archive-ocellus:seen-release`, so a reload shows no dot until a newer release ships. The current version shows as `vYYYY.MM.DD` beside the credit line at the bottom left.

## Sub-features

- `unseen-dot` shows the dot on Settings, and on What's new inside the menu, until the newest release has been opened.
- `whats-new-panel` opens from What's new, hides the menu, lists every release with the newest first, and fits the viewport at 1280x800, 800x600 and phone width.
- `whats-new-close` closes the panel on Close or Escape.
- `whats-new-focus` moves keyboard focus to the panel's title on open, and back to Settings on Close or Escape.
- `seen-release` keeps the dot cleared after a reload, and shows it again when the stored version is not the newest release.
- `version-label` shows `v` and the newest version beside the credit line, whose text stays exact.

## How to get to it (user POV)

- Click **Settings** at the bottom left, then **What's new**.
- Look at the bottom-left corner, to the right of the credit line.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.
- The browser session has never opened What's new. A new session starts with empty `localStorage`.

- **Unseen.** Open `?seed=1`. `#settings .unseen_dot` is visible and `localStorage.getItem('archive-ocellus:seen-release')` is `null`.
- **Menu.** `agent-browser click "#settings"`. `#whats_new` is visible with its own `.unseen_dot`.
- **Open.** `agent-browser click "#whats_new"`. `#whats_new_panel` is visible and `#settings_menu` is not. Its first `article` has the `h3` and `li` lines that `node scripts/release-notes.mjs` prints. Neither dot is visible, and the stored version is the newest one.
- **Fit.** With the panel open, `agent-browser set viewport 800 600`, then `set viewport 390 844`. The panel's box lies inside the viewport, and `document.documentElement.scrollWidth` does not exceed `innerWidth`.
- **Close.** Click `#whats_new_close`; the panel is hidden. Open it again from Settings and press Escape; it is hidden again.
- **Keyboard.** `agent-browser focus "#settings"`, then `press Enter` and `press Shift+Tab`; `document.activeElement` is `#whats_new`. `press Enter`; the panel is visible and focus is on `#whats_new_title`. `agent-browser focus "#whats_new_close"` and `press Enter`; the panel is hidden and focus is on the visible `#settings`. Open it the same way and `press Escape`; focus is on `#settings` again.
- **Reload.** Open `?seed=1` again. `#settings .unseen_dot` is not visible, and after a click on `#settings` neither is `#whats_new .unseen_dot`.
- **Version.** `agent-browser --json get text "#app_version"` is `v` and the newest version. Its box starts at or right of the credit line's right edge and overlaps it vertically. `#credit_line` still reads the exact credit sentence.
- **Scripted.** `scripts/verify.sh browser --unit whats_new` runs these steps, writes `whats-new.json` and records each check in `units/whats_new/verdict.json`.

## Gotchas

- The walk needs a session that has never opened What's new. Run it again in the same session and the first dot check fails, because the stored version is already the newest one.
- Never clear the stored version through `eval`. Open a new session instead.
- Before each Enter that is not the step under test, place focus with `agent-browser focus`. When the focus behavior regresses, an Enter sent to whatever holds focus can press Restart and reload the page before the checks run.
- The checks compare the panel with the output of `scripts/release-notes.mjs`, so a changelog that script rejects fails the walk before the page opens.
