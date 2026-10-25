# Fight logs L1 to L8

The eight RuneLite fight logs that `FIGHT_LOGS` in `src/content/ocellus/js/OcellusTimings.ts` cites, recorded on
2026-10-23 in this order. A `fight-log` source's `log` is the file's name and its `at` says where in the file to look.

| Log | Fight | Players | Reached |
|---|---|---|---|
| [L1](L1.txt) | spectated kill | 8 | the kill |
| [L2](L2.txt) | spectated kill | 8 | the kill |
| [L3](L3.txt) | raid | 4 | a wipe in phase 3's first quadrant |
| [L4](L4.txt) | raid | 7 | a wipe in phase 3, after two quadrants fell |
| [L5](L5.txt) | raid | 7 | a wipe in phase 4's third cycle |
| [L6](L6.txt) | raid | 7 | a wipe in phase 4's fifth cycle |
| [L7](L7.txt) | raid | 7 | a wipe in phase 3, after two quadrants fell |
| [L8](L8.txt) | raid | 7 | a wipe in phase 3, after one quadrant fell |

## Format

One event per line: `t<world tick> [<phase or region> +<ticks since it began>] <event>`. L1, L2 and L6 to L8 carry phase
marks (`[P1 +0]` and so on); L3 to L5 count ticks from entering the arena (`[16472 +0]`). Events include the boss's
animations, shouts and spotanims, floor graphics, projectiles with their landing tick, NPC spawns and despawns, hitsplats
with the overhead prayer the target had up, and game chat. Lines such as `Swing lands: wanted Melee, had none` note the
prayer an attack called for and the one the player had up as it landed. L6 to L8 end with the short continuation logged after the recording
player died, appended in order.

## Anonymised

Every player's name is replaced by `Player N`, with the same number for the same player in every log. Lines that showed
the recording player's money were removed. Nothing else was changed.
