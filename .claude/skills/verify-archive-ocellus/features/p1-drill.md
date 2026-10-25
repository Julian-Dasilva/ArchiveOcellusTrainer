# P1 drill (hidden)

A third drill, phase 1, sits behind the build flag `ARCHIVE_P1`. Production builds leave it off, so `?phase=p1` opens P4 and lists `phase=p1` as rejected, and Settings has no Phase 1 option. With the flag on, `?phase=p1` opens the whole room with Ocellus (NPC 16674) 3 tiles south of the middle and the player on the south arm. He says "Now... ascension...", then walks one tile a tick, straight then diagonally, to a seeded corner, casting a fire (ranged) or water (magic) volley every 5 ticks from P1 tick 4 under Protect from Melee. A volley lands 3 ticks after the cast within 4 tiles of his 3x3 and 4 beyond, and deals 0 through the matching protection prayer and 0 to 27 without it. At a corner he charges: 7 cracks 2 ticks apart, each 8 tiles long and closing 5 ticks after it opens, a taunt at C + 15, the explosion at C + 18 and a blast at C + 19 that hits within 2 tiles of his 3x3 for 26 to 34, then he walks on at C + 21. A crack that closes under the player is blocked: 3 to 5 damage, no charge, and the damage comes back as one heal once the player stands on no open crack. A crack nobody blocks charges his yellow bar by 2 of 96 and heals him 2. On the first volley tick at or below 66% and again at 25% he teleports to the middle instead: four beats facing each side clockwise, each with two 6-tile cracks and a blast, then the strike at M + 40, one shot of 17 to 19 that prayer does not reduce plus one per 24 of the bar, and his walk on at M + 49. At 0 HP he says "You... will disappear...", teleports to the middle when he is elsewhere, and transforms; the run ends 7 ticks later with "Phase 1 cleared (interim end)", the P1 time, Repeat P1 and Retry seed. A death shows "You died" with the P1 tick. `seed`, `setup`, `invincible=on` and `bosshp=N` (1 to 2500) work on a P1 link. Any other key is rejected.

## Sub-features

- `p1-flag` opens P4 for `?phase=p1` and offers no Phase 1 when the build leaves `ARCHIVE_P1` off.
- `p1-open` opens P1 on the whole room with NPC 16674 at 2500 HP when the flag is on.
- `p1-walk` walks him to a seeded corner, a tile a tick, with Protect from Melee up and a volley every 5 ticks.
- `p1-volleys` lands each volley 3 or 4 ticks after its cast, 0 through the matching prayer.
- `p1-corner` opens 7 cracks drawn tile by tile toward him, then the explosion and the blast.
- `p1-block` hits a player standing on a closing crack for 3 to 5 and heals it back once they step off.
- `p1-middle` teleports him to the middle at 66% and 25% for four beats and the strike.
- `p1-end` ends the run 7 ticks after his transformation with the interim panel and its two buttons.
- `p1-phase-box` lists Phase 1 in Settings and reloads it with its defaults.

## How to get to it (user POV)

- Run the trainer with the flag on: `ARCHIVE_P1=on npm start`.
- Open `?phase=p1`, or choose **Phase 1** in the **Phase** box under **Settings**.
- Pray against each volley, stand on cracks as they close, keep out of the blast, and attack him until he transforms.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the dev server started with `ARCHIVE_P1=on` on its own port. `scripts/verify.sh serve` does not set it yet.
- The view setting is saved before the page that needs it opens: `use3dView` true for 3D and false for 2D.

- **Open.** Open `?phase=p1&seed=1&invincible=on` and wait for P1 tick 4. `snapshot().fight.boss` reads NPC 16674 at 2500 of 2500, and Settings shows `#phase` on `p1`.
- **Walk and volleys.** On the same page by P1 tick 55, the log's `stage-entered` events read arrive 0, walk-from-start 4, corner 15, walk-from-corner 36 and corner 52; the `volley-cast` events are water at 4, 9, 36, 41 and 46, landing at 8, 13, 40, 45 and 50; `bossAt` walks (14, 16), (14, 15), (14, 14), then diagonally to (20, 8) by tick 12.
- **Corner.** At P1 tick 18 and 24 in 3D, a crack's pieces stand on the tiles south and west of him at the north-east corner; in 2D the same tiles are tinted dark red. At 34 the floor explosions stand on the 37 tiles around him.
- **Block.** On a 2D page with seed 1, click `tileCentre({ x: 21, y: 16 })` after P1 tick 15 and `tileCentre({ x: 17, y: 22 })` after tick 20. The log has `crack-closed` blocked at 20, a `crack-blocked` hit of 4 at 20, `block-refunded` 4 at 22, and `meter` 0 on the row for 20.
- **Middle.** Open `?phase=p1&seed=1&bosshp=1650&invincible=on`. He teleports out at 4 and in at 8 on (14, 14), charges at 12, 20, 28 and 36, blasts at 19, 27, 35 and 43, tells "Death... awaits..." at 44, casts at 46 and walks on at 53.
- **End.** Open `?phase=p1&seed=100&bosshp=1&invincible=on` in 3D and click `tileCentre` of his middle tile, one tile east and north of `bossAt`, after P1 tick 8. He says "You... will disappear..." at 12, transforms at 15, and the panel reads "Phase 1 cleared (interim end)", "P1 time: 22 ticks (0:13.2)", "Invincible was on." with Repeat P1 and Retry seed.
- **Phase box.** With the flag on, open `?seed=1`, open Settings and choose Phase 1. The new page's `location.search` is `?phase=p1&setup=ranged`, its log header reads `p1`, and the boss is NPC 16674.
- **Production.** Build with `ARCHIVE_P1=off`, serve the bundle, open `?phase=p1&seed=1` and open Settings. The boss bar reads `1312 / 5250 (25.0%)`, P4's entry, and the menu has `#setup` but no `#phase`.

## Gotchas

- `scripts/verify.sh` has no P1 stage yet; the browser stage serves with `ARCHIVE_P3=on` only, so a P1 recipe needs its own dev server with `ARCHIVE_P1=on`.
- The boss is unattackable on P1 tick 0, so a click on him then walks the player instead of attacking.
- He reads his HP only on volley ticks, so a hit that takes him under 66% sends him to the middle on the next volley tick, never on a blast.
- His transformation pose, seq 14814, is not played: one of its frame sounds, 12819, is missing from cache 2746, and the SDK throws an uncaught error when the pose reaches it. The drill plays the transformation spotanim alone.
- In 3D a crack's pieces show about 2 ticks after it opens, as in game; the 2D tint shows from the tick it opens.
