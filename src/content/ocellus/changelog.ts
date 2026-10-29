import type { Changelog } from "../../releases";

export const CHANGELOG: Changelog = [
  {
    version: "2026.10.29",
    notes: [
      "Tier in Fight picks your gear: Raid, or one of the five community gear tiers, Max to Poor. A tier keeps only the items the trainer simulates, with their wiki stats, and lists the items it leaves out.",
      "Start with lists the weapons in the tier you picked. Raid still starts with the twisted bow by default.",
      "Loadout in Fight edits a tier's gear and inventory before the start or while paused, with the raid's Alliance Supplies as the shop. Apply restarts the fight with your edit.",
      "Each tier keeps your edit for the next run, until you press Reset.",
      "Phase 2's portal gaps follow the game's three set patterns, orange, red and green, in the game's order after a random first, and Phase 2 patterns in Learning aids numbers every wave's safe spot, 1 to 6, in its pattern's colour. In phase 3, the Void Rift, Void Siphon and Void Augmenter now play their spawn, despawn and detonate animations, and killing a Void Siphon heals you 22.",
    ],
  },
  {
    version: "2026.10.28",
    notes: [
      "Insolence's three waves now leave the damaging void field on every tile they hit, as in game.",
      "In the full fight's phase 3, you cross a chasm in four quick jumps, one a tick, from the bank onto each stepping stone and off the far one, as in game.",
      "About 1 run in 10 sends an anonymous performance summary, so we can find what causes lag. To turn it off, untick Performance data under About.",
      "The site opens straight into the full fight, starting at phase 4, with every phase in the Start at selector. The separate phase 4 drill page is gone.",
      "Settings is one panel: Fight, Learning aids, Sound, Controls, then About, which keeps What's new and the Performance data box. In Fight, Start with picks the weapon in your hand: the twisted bow (the default), the toxic blowpipe, or the scythe in melee gear, with the same inventory either way. Tick Defence drained to start each phase with his Defence as low as it goes.",
    ],
  },
  {
    version: "2026.10.27",
    notes: [
      "The full fight is in beta. Full fight (beta) on the drill page opens it, and the phase selector starts you in phase 1, 2, or 3.",
      "The credit line sits under the game, so it no longer covers the tabs on a phone.",
      "Chat stays above the inventory on a narrow screen, so the lines no longer cover it.",
    ],
  },
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
    version: "2026.10.26.1",
    notes: [
      "The fight waits for you. Set your keybinds and settings first, then press Start to begin the GET READY countdown.",
      "Pause with the Pause button or P. While paused you can change keybinds and settings, and the fight resumes on the same tick. The result shows how long you paused.",
      "The trainer now opens when your browser blocks site storage or the storage is full. Your settings then reset each time the page reloads, which Restart does.",
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
