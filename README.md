# Archive Ocellus Trainer

A free practice simulator for phase 4 of the Ocellus fight in The Fractured Archive.

**Status: early development.** Mechanics come from the community wiki and release-day reports. Timings are unverified and will change.

Play it at https://archive-ocellus-trainer.raid-sims.workers.dev. Add `?invincible=on` to the link to practise without dying, or open **Settings** in the game and tick **Invincible**. Pick a single mechanic to drill from **Focus** in the same menu. Hold Control while clicking a tile to walk there instead of running, as in game. The fight waits until you press **Start**, so you can set keybinds and settings first. Press **P** or **Pause** to pause; keybinds and settings work while paused, and the fight resumes on the same tick.

Built on [osrs-sdk](https://github.com/OldSchoolSDK/osrs-sdk), following the layout of [ColosseumTrainer](https://github.com/Supalosa/ColosseumTrainer).

## Development

Requires Node 22.

```sh
npm ci
scripts/install-beta-sdk.sh     # beta osrs-sdk packages, installed without saving; rerun after any npm ci
npm run assets -- --cache-dir <openrs2 cache dir> --reader-path <osrscachereader checkout>
npm start                       # http://127.0.0.1:8002
```

`npm run assets` extracts models from OpenRS2 cache 2746 into `public/osrs-assets/`, which is never committed. It then draws an inventory icon for each of the trainer's own items, and for the Masori (f) pieces and Zaryte vambraces, from the item's model in the same cache, the way the game client draws it, into `public/osrs-assets/item-icons/`, and writes the boss's overhead icons from the cache's sprite index into `public/osrs-assets/sprites/`. `npm run item-icons` with the same two options redraws only the icons. The icon renderer in `src/itemIcons/` is ported from RuneLite's cache tool under its BSD 2-clause licence.

## Review

Read [CODE_REVIEW.md](CODE_REVIEW.md) before you review a change. It lists the performance red flags and explains `scripts/verify.sh perf`, which measures draw calls, canvas size, GPU resource growth, frame time and tick timing against the budgets in `src/perf/perfGate.json`.

## Releases

Each pull request that changes what players see adds one plain-language line to `src/content/ocellus/changelog.ts`. The line goes in the newest release if that release has not shipped yet. Otherwise it goes in a new release, versioned by the day it ships: `YYYY.MM.DD`, or `YYYY.MM.DD.2` for a second release that day. Players read the notes under **Settings**, then **What's new**, and `node scripts/release-notes.mjs` prints the newest release as Markdown for a GitHub release.

## Privacy

To find what causes lag, a sample of runs sends one anonymous performance summary when the run ends or the page is hidden mid-run. It holds the frame and tick timings, the view (always 3D), the screen scale and game size rounded to 50 pixels, the CPU core count, the graphics card family (such as `nvidia` or `apple`, never the full name), the browser family, the app version, the phase and how the run ended. It carries no ID, sets no cookie and stores nothing that identifies a player, and the trainer's code does not store IP addresses. Page views are counted with Cloudflare Web Analytics, which sets no cookies. Web Analytics loads on every page view unless you opt out. Only the performance summary is sampled. To turn both off, open **Settings** and untick **Send anonymous performance data**. The choice is saved in the browser. The summary stops at once, and page view counting stops from the next page load.

The share of runs that send a summary is `sampleRate` in `src/telemetry.json`, served as `/telemetry.json`. The Worker in `src/worker/worker.ts` accepts summaries at `/t` and writes each one to Workers Analytics Engine. `scripts/perf-report.mjs` summarises them.

## Credit

Made by Julian Dasilva / Moarhots ([@ShadowJdas](https://x.com/ShadowJdas) on X).

Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.

Game models are extracted, and item icons drawn, from the game cache at build time. Neither is stored in this repository.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
