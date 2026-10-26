# Loadouts

The player enters phase 4 wearing one of two setups. The ranged setup is the Masori mask, body and chaps (f), Zaryte vambraces, the Necklace of rupture and the Twisted Bow. The melee setup is Inquisitor's great helm, hauberk and plateskirt and the Amulet of rancour with the Scythe of Vitur on Jab, its crush style. Both wear Avernic treads (max), so a switch never changes the boots. Tonalztics of Ralos, the special attack weapon, sits in inventory slot 0, followed by every piece of the other setup that differs from the worn one. Clicking a switch equips it. Ralos's special attack, Division, spends half the special bar, throws two glaives and lowers the target's Defence by 12.5% of its Magic level for each glaive that deals damage. Against Ocellus (Magic 300) that is 37 Defence per damaging glaive.

## Sub-features

- `setup-worn` enters wearing the setup the URL or the `Setup` selector names, `ranged` by default.
- `setup-switches` lists Ralos in slot 0 and the other setup's eight differing pieces in slots 1 to 8; clicking all eight wears the other setup.
- `set-effects` gives Inquisitor's armour its crush bonus on Jab. The ranged setup has no set effect. Vitest owns the attack-roll and max-hit literals, because the browser cannot force a max roll.
- `division` spends 50 special energy and, as the glaives land, drains the boss's Defence by 37 for each glaive that deals damage.
- `setup-selector` restarts the drill in the selected setup from the `Setup` selector and the Restart button.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?setup=ranged` or `?setup=melee`.
- Pick a setup in the `Setup` selector at the bottom left and press `Restart`.
- Open the inventory tab (the backpack icon in the bottom row of the side panel) and click items to switch them.
- Click the special attack orb (the crossed swords beside the minimap) with Ralos wielded, then click Ocellus.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=6&setup=ranged`, and P4 tick 9 reached (`snapshot().fight.run.tick >= 9`), so the boss is damageable.
- Pixel positions are for the 1280x800 viewport. The constants sit together under `LOADOUT_` at the top of `scripts/verify.sh`.

- **Worn setup.** Run `agent-browser --json eval "window.__archiveOcellusProbe.snapshot().fight.player"`. `equipped` is `{"weapon":20997,"offhand":null,"helmet":27235,"chest":27238,"legs":27241,"gloves":26235,"cape":28951,"necklace":33639,"feet":31097,"ring":28310,"ammo":11212}` and `inventory` starts with `28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485`.
- **Inventory tab.** Click (1164, 745) with `agent-browser mouse move 1164 745`, `mouse down left` and `mouse up left`. Ralos and the Inquisitor's pieces show icons drawn from cache 2746, as do the Masori (f) pieces and Zaryte vambraces once they are switched into the inventory. The other items show the SDK's bundled icons. Screenshot it.
- **Worn icons.** Click the equipment tab at (1197, 745) and screenshot it. It shows the Masori (f) pieces and Zaryte vambraces with their cache icons. Click the inventory tab again before the switches.
- **Switches.** Slot `n` is at (1125 + 39 × (n mod 4), 508 + 32 × floor(n / 4)). Click slots 1 to 8 the same way, about 150 ms apart. `equipped` becomes `{"weapon":22325,"offhand":null,"helmet":24419,"chest":24420,"legs":24421,"gloves":22981,"cape":21295,"necklace":29801,"feet":31097,"ring":25485,"ammo":11212}`, and the player model shows the scythe and the dark Inquisitor plate.
- **Division.** Click slot 0 to wield Ralos, click the special orb at (1140, 157) so it lights up, then click Ocellus 10 px left of and 160 px above the canvas centre. Wait with `agent-browser wait --fn "window.__archiveOcellusProbe.snapshot().fight.player.specialEnergy < 100"`, then wait until `log().rows` holds two `player-hit-judged` events, because each glaive drains only as it lands. `specialEnergy` is 50, and `fight.boss.defence` has dropped from 250 by 37 for each glaive that landed damage. With `seed=6` the glaives request 1 and 0. They land during the explosions, at P4 tick 22 in the last run, where the reduction rounds the 1 down to 0, so neither drains and Defence stays 250. The verdict reads the two glaives from `log()` and counts one drain for each glaive whose damage after the reduction is above 0. Two splats show on the boss and the orb reads 50.
- **Selector.** Run `agent-browser select "#setup" melee` and `agent-browser click "#restart"`. The page reloads with `setup=melee`, and `equipped` is the melee record above.
- **Scripted.** `scripts/verify.sh browser --unit loadouts` runs these steps and records `rangedSetupWorn`, `switchesWornByClick`, `divisionSpentHalfTheBar`, `divisionDrainedBossDefence` and `setupSelectorApplied` in `units/loadouts/verdict.json`.

## Gotchas

- The prayer tab is open on load. Open the inventory tab before you click a slot, or the click toggles a prayer.
- Special energy regenerates 10 every 30 seconds. Read it as soon as the glaives land.
- Without a pinned `seed`, the glaive rolls differ between loads, and a load where both glaives deal 0 leaves Defence at 250.
- A click on Ocellus before P4 tick 4 finds no target, because the boss is hidden.
