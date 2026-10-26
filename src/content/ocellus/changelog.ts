import type { Changelog } from "../../releases";

export const CHANGELOG: Changelog = [
  {
    version: "2026.10.26.2",
    notes: [
      "Before each run of void explosions, a ring of dark ovals forms around your feet, as in game, three ticks before the first mark.",
      "Ocellus plays his death animation when you kill him, glows as he steals your lifeforce in the melee phase, and a gust blows back at you when Deflect turns your hit away. Your lifeforce orb plays a heal sound as it returns your HP.",
      "Explosions hit 14 to 16, a transition attack you pray against hits up to 10, and the inner orb stays one tick longer, as the recorded fights show.",
      "Void rifts come 2, 3, 4 and then 5 a cycle, on random tiles 2 to 5 from Ocellus, as in the recorded fights.",
    ],
  },
  {
    version: "2026.10.26",
    notes: [
      "The 2D view is gone, and the 3D view draws each frame in about 14 draw calls instead of about 550. Gear switches after your first hitch far less. A typical switch's slowest frame drops from about 50 ms to one frame at 60 Hz.",
      "The void shards of each explosion now come in high over your head, from the game's own effect, so you can see the cue to step while you move.",
      "Change your mind before the tick, like in game. Whatever you click last before the tick is what you do, even a click made right before it.",
      "Ocellus takes damage as soon as he is back on the platform, and standing on your lifeforce orb as it glows gives your HP back that tick.",
      "A void rift left alive bursts 30 ticks after it appears and hits you once for 28 to 41, and destroying a rift resets your attack timer.",
    ],
  },
  {
    version: "2026.10.25.1",
    notes: [
      "Melee attacks always hit a void rift for your max hit, as ranged attacks already did.",
      "A special attack, such as Ralos's Division, still rolls its damage against a void rift.",
    ],
  },
  {
    version: "2026.10.24",
    notes: [
      "Ocellus has 5,250 HP for a solo or duo team, as the wiki lists, so phase 4 starts at 1,312.",
      "While the void explosions are going off, Ocellus takes 60% less damage, as the wiki describes.",
      "The back wall by the brazier is one smooth diagonal up to the jut, so you walk along it instead of around each corner.",
    ],
  },
  {
    version: "2026.10.23",
    notes: [
      "Hold Control and click a tile to walk there instead of running, like in game.",
      "Healing orbs never form on void puddles. The outer orb forms opposite where you entered the 5x5, and the inner orb lingers into the attack you pray against.",
      "In the melee phase you path around Ocellus instead of running under him.",
      "The east edge by the brazier gets its extra tile: 3 straight tiles, then the diagonal.",
      "Void puddles start stacked in the same corner tiles you'd use in game.",
    ],
  },
];
