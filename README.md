# Archive Ocellus Trainer

A free practice simulator for the Ocellus fight in The Fractured Archive.

**Status: early development.** Mechanics come from the community wiki and release-day reports. Timings are unverified and will change.

Play it at https://archive-ocellus-trainer.raid-sims.workers.dev. The site opens the full fight at phase 4. Pick another phase from **Start at** in the side panel and press **Start fight**. Tick **Practice** to play without dying. Hold Control while clicking a tile to walk there instead of running, as in game. The fight waits until you press **Start**, so you can set keybinds and settings first. Press **P** or **Pause** to pause; keybinds and settings work while paused, and the fight resumes on the same tick.

Built on [osrs-sdk](https://github.com/OldSchoolSDK/osrs-sdk), following the layout of [ColosseumTrainer](https://github.com/Supalosa/ColosseumTrainer).

## Development

Requires Node 22.

```sh
npm ci
scripts/install-beta-sdk.sh     # beta osrs-sdk packages, installed without saving; rerun after any npm ci
npm run assets -- --cache-dir <openrs2 cache dir> --reader-path <osrscachereader checkout>
npm start                       # http://127.0.0.1:8002
```

`npm run assets` extracts models from OpenRS2 cache 2746 into `public/osrs-assets/`, which is never committed. It then draws an inventory icon for each of the trainer's own items, and for the Masori (f) pieces and Zaryte vambraces, from the item's model in the same cache, the way the game client draws it, into `public/osrs-assets/item-icons/`, and writes the boss's overhead icons from the cache's sprite index into `public/osrs-assets/sprites/`. `npm run item-icons` with the same two options redraws only the icons. `npm start` and `npm run build` first run `src/assetBundle/check.ts`, which fails and names each missing key when `public/osrs-assets/` comes from another cache or lacks an asset that `src/assets.ts` configures: in `build-info.json`, in `manifest.json`, as a payload file the manifest names, or in the sound pack. The page logs one `assets:` console error for each configured NPC, model or spotanim its served manifest lacks. The icon renderer in `src/itemIcons/` is ported from RuneLite's cache tool under its BSD 2-clause licence.

## Review

Read [CODE_REVIEW.md](CODE_REVIEW.md) before you review a change. It lists the performance red flags and explains `scripts/verify.sh perf`, which measures draw calls, canvas size, GPU resource growth, frame time and tick timing against the budgets in `src/perf/perfGate.json`.

CI replays each pull request's test changes over its base with `review-ratchet/checks/replay-controls.mjs`. A test whose own source did not change must still pass there. When a pull request changes a shared test fixture on purpose, it lists each test that the change makes fail on the base in `review-ratchet/replay-acknowledged.json`, with a reason, and the reviewer checks that list. Only entries the pull request adds or changes count. An entry fails the check when it does not name an unchanged test that passed on the base, or when that test passes after the overlay, or when more than one test has its name. The check guards against honest mistakes, not an author who means to deceive it. It still rejects an acknowledged test that has no result, is skipped or sits in a file with an error outside its tests. It cannot tell whether an acknowledged test failed in its own body or in a hook or cleanup around it, so that call belongs to the reviewer.

## Releases

Each pull request that changes what players see adds one plain-language line to `src/content/ocellus/changelog.ts`. The line goes in the newest release if `src/content/ocellus/shipped-releases.json` does not list that release. Otherwise it goes in a new release, versioned by the day it ships: `YYYY.MM.DD`, or `YYYY.MM.DD.2` for a second release that day. Players read the notes under **About**, then **What's new**, and `node scripts/release-notes.mjs` prints the newest release as Markdown for a GitHub release. Before a deploy, `node scripts/release-notes.mjs --record-shipped --since VERSION`, where VERSION is the last shipped release, adds every release that the deploy publishes to `shipped-releases.json` and prints their notes for the GitHub release. Without `--since`, it records and prints the newest release only. From then on the script rejects the changelog if a recorded release's notes change or the release is removed.

The gear tiers and the Loadout editor are not released yet. `scripts/release-build.sh` builds with `ARCHIVE_LOADOUT=raid`, which leaves the Tier picker and the Loadout button off the page, ignores `tier=` links, and starts every run on the Raid gear. `ARCHIVE_LOADOUT=tiers` offers the tiers without the editor. Every other build, including `npm start`, `scripts/verify.sh` and Netlify previews, defaults to `editor`, which has both. To release the tiers, set `tiers` in `scripts/release-build.sh`, and to release the editor too, remove that line.

## Privacy

To find what causes lag, a sample of runs sends one anonymous performance summary when the run ends or the page is hidden mid-run. It holds the frame and tick timings, the view (always 3D), the screen scale and game size rounded to 50 pixels, the CPU core count, the graphics card family (such as `nvidia` or `apple`, never the full name), the browser family, the app version, the phase and how the run ended. It carries no ID, sets no cookie and stores nothing that identifies a player, and the trainer's code does not store IP addresses. Page views are counted with Cloudflare Web Analytics, which sets no cookies. Web Analytics loads on every page view unless you opt out. Only the performance summary is sampled. To turn both off, open **Settings** and untick **Send anonymous performance data**. The choice is saved in the browser. The summary stops at once, and page view counting stops from the next page load.

The share of runs that send a summary is `sampleRate` in `src/telemetry.json`, served as `/telemetry.json`. The Worker in `src/worker/worker.ts` accepts summaries at `/t` and writes each one to Workers Analytics Engine. `scripts/perf-report.mjs` summarises them.

Releases send the summary from about 1 run in 10. `sampleRate` is 0.1, and `wrangler.release.jsonc` binds `PERF` to the `archive_ocellus_perf` dataset. Web Analytics is not set up yet, so the release build refuses `CF_WEB_ANALYTICS_TOKEN` and pages load no Web Analytics script. In a release, the opt-out box is **Performance data** under **About** in the sidebar, which is in **Menu** on a phone.

## Credit

Made by Julian Dasilva / Moarhots ([@ShadowJdas](https://x.com/ShadowJdas) on X), with help from [Alessandro Rodi](https://github.com/alessandrorodi).

Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.

Game models are extracted, and item icons drawn, from the game cache at build time. Neither is stored in this repository.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
