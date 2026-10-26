# Supplies and key bindings

Every item in the inventory menu shows its name, for example `Equip Tonalztics of Ralos`. After the switches, each setup carries the 19 supplies from the wiki's recommended Fractured Archive inventory, in its order: 2 super combat potions, 2 Bastion potions in place of ranging potions, 10 Saradomin brews and 5 super restores. Clicking a potion drinks it on the next tick, and the SDK holds the next potion for 3 ticks. A Saradomin brew at 99 Hitpoints raises them to 115. The `Keybinds` button beside `Restart` opens the SDK's settings tab, where the five buttons under Key Bindings bind the inventory, spellbook, prayer, equipment and combat tabs. A binding is saved in `osrs-sdk:settings` and survives a reload.

## Sub-features

- `item-names` shows each carried item's name in its hover text and right-click menu.
- `supplies` fills inventory slots 9 to 27 with the wiki's supplies after the switches.
- `brew-heal` raises Hitpoints by 15% of the maximum plus 2 on the tick after the click.
- `keybinds-reachable` opens the settings tab from the `Keybinds` button.
- `keybinds-saved` keeps a bound key across a reload, and the old key no longer opens the tab.
- `seed-field-keys` keeps a bound key typed into the seed field in the field. Vitest owns this check, because agent-browser cannot type a bound key into a focused field reliably.

## How to get to it (user POV)

- Open `http://127.0.0.1:8002/?setup=ranged` or `?setup=melee`, open the inventory tab, and hover or right-click an item.
- Click a potion in the inventory to drink it.
- Click **Settings** at the bottom left, then `Keybinds`, click one of the five tab buttons under Key Bindings, then press the new key.
- The wrench tab in the bottom row of the side panel opens the same settings.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold, with the page opened at `http://127.0.0.1:8002/?seed=1&setup=ranged`, and P4 tick 1 reached, so no damage has landed yet.
- Pixel positions are for the 1280x800 viewport. The constants sit under `SUPPLY_` and `KEYBIND_` at the top of `scripts/verify.sh`.

- **Carried items.** Open the inventory tab at (1164, 745). `snapshot().fight.player.inventory` is the 28 ids in `SUPPLY_INVENTORY`: Ralos, the eight melee switches, then `12695, 22461, 6685, 3024` twice and the remaining brews (6685) and restores (3024).
- **Item menu.** Right-click slot 0 at (1125, 508). `snapshot().menu` is `["Equip Tonalztics of Ralos","Drop Tonalztics of Ralos","Examine Tonalztics of Ralos"]`, and the screen shows the menu. Move the cursor to the canvas centre and `menu` becomes `null`.
- **Brew.** Read `snapshot().fight.run.tick`, then click slot 11 at (1242, 572). Within two ticks a `log()` row reads `playerAtPostTick.hp` 115, and every earlier row reads 99. The Hitpoints orb shows 115. No heal splat appears, because the game shows heal splats mostly in boss encounters and not for food or potions.
- **Key bindings.** Click `#keybinds`. `snapshot().panel.tab` is `SETTINGS`. Click the inventory button under Key Bindings at (1130, 650), then press F6. `panel.keys.inventory` is `F6`, and the saved `osrs-sdk:settings` has `values.inventory_key` `F6`.
- **Reload.** Open the same URL again. Press F4: `panel.tab` stays `PRAYER`. Press F6: `panel.tab` is `INVENTORY`. Bind the inventory tab back to F4 the same way.
- **Scripted.** `scripts/verify.sh browser` runs these steps in the `supplies` and `keybinds` units and records `itemNamedInMenu`, `suppliesCarried`, `brewHealedNextTick`, `keybindsButtonOpensSettings`, `keyBoundAndSaved`, `boundKeyOpensTabAfterReload` and `defaultKeyRestored` in their units' `verdict.json`.

## Gotchas

- `agent-browser press q` sends the key value `Unidentified`, and `press Q` sends `Q`. Bind function keys such as F6 in scripted checks, because their key values are exact.
- The SDK ignores tab keys for 20 ms after a binding. Wait before you press the new key.
- A binding is saved in the browser profile. Bind the key back when a check finishes, or the next run starts from a different key.
- Unequipping needs a free inventory slot, so with all 28 slots full a click on a worn item in the equipment tab does nothing. Drink a potion first. Switching from the inventory still works, because it swaps the items.
