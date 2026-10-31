# What's new and the version label

The side panel's About section has a What's new button that opens a panel listing every release in `src/content/ocellus/changelog.ts`, newest first, each with its version and notes. The changelog holds at most five releases, and an **Older releases** link under them opens the GitHub Releases page. A red dot on What's new marks a release the player has not opened yet. Opening the panel clears the dot and keeps the version in `localStorage` under `archive-ocellus:seen-release`, so a reload shows no dot until a newer release ships. The current version shows as `vYYYY.MM.DD` beside the credit line in the policy strip at the bottom of the page.

## Sub-features

- `unseen-dot` shows the dot on What's new until the newest release has been opened.
- `whats-new-panel` opens from What's new, inside the About section, lists every release with the newest first, ends with the Older releases link, and fits across the viewport at 1280x800, 800x600 and phone width.
- `whats-new-close` closes the panel on Close or Escape.
- `whats-new-focus` moves keyboard focus to the panel's title on open, and back to What's new on Close or Escape.
- `seen-release` keeps the dot cleared after a reload, and shows it again when the stored version is not the newest release.
- `version-label` shows `v` and the newest version beside the credit line, whose text stays exact.

## How to get to it (user POV)

- Scroll the side panel to the About section and click **What's new**.
- Look at the strip along the bottom of the page, to the right of the credit line.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.
- The browser session has never opened What's new. A new session starts with empty `localStorage`.

- **Unseen.** Open `?seed=1` (`MENU_QUERY`). `#whats_new` sits inside `#sidebar_about`, `#whats_new .unseen_dot` is visible, the panel is hidden and `localStorage.getItem('archive-ocellus:seen-release')` is `null`. Run `agent-browser scrollintoview "#whats_new"` before a screenshot.
- **Open.** `agent-browser click "#whats_new"`. `#whats_new_panel` is visible. Its first `article` has the `h3` and `li` lines that `node scripts/release-notes.mjs` prints. The dot is not visible, and the stored version is the newest one. The panel's only link reads `Older releases`, opens in a new tab and points to `https://github.com/Julian-Dasilva/ArchiveOcellusTrainer/releases`.
- **Fit.** With the panel open, `agent-browser set viewport 800 600`, then `set viewport 390 844`. The panel's left and right edges lie inside the viewport, and `document.documentElement.scrollWidth` does not exceed `innerWidth`. The panel may run below the screen, because the side panel scrolls.
- **Close.** Click `#whats_new_close`; the panel is hidden. Click `#whats_new` again and press Escape; it is hidden again.
- **Keyboard.** `agent-browser focus "#whats_new"`, then `press Enter`; the panel is visible and focus is on `#whats_new_title`. `agent-browser focus "#whats_new_close"` and `press Enter`; the panel is hidden and focus is on the visible `#whats_new`. Open it the same way and `press Escape`; focus is on `#whats_new` again.
- **Reload.** Open `?seed=1` again. `#whats_new .unseen_dot` is not visible.
- **Version.** `agent-browser --json get text "#app_version"` is `v` and the newest version, also at phone width. Its box starts at or right of the credit line's right edge and overlaps it vertically. `#credit_line` still reads the exact credit sentence.
- **Scripted.** `scripts/verify.sh browser --unit whats_new` runs these steps, writes `whats-new.json` and records `dotShownBeforeOpening`, `whatsNewListsNewestRelease`, `dotClearsOnOpen`, `panelFitsEveryViewport`, `panelClosesOnCloseAndEscape`, `keyboardOpenFocusesPanelTitle`, `keyboardCloseAndEscapeFocusWhatsNew`, `dotStaysClearedAfterReload`, `versionBesideCredit` and `noWhatsNewPageErrors` in `units/whats_new/verdict.json`.

## Gotchas

- The walk needs a session that has never opened What's new. Run it again in the same session and the first dot check fails, because the stored version is already the newest one.
- Never clear the stored version through `eval`. Open a new session instead.
- Before each Enter that is not the step under test, place focus with `agent-browser focus`. When the focus behavior regresses, an Enter sent to whatever holds focus can press Restart or Start fight and reload the page before the checks run.
- A pointerdown outside the About section closes the panel, as Escape does, so a click elsewhere on the page between steps changes the state under test.
- The checks compare the panel with the output of `scripts/release-notes.mjs`, so a changelog that script rejects fails the walk before the page opens.
