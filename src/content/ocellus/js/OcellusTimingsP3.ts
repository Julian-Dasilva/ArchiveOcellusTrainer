import type { HpFraction, TickSpan, Tile } from "../../../sim/brands";
import { hpFraction, span, tile } from "../../../sim/brands";
import { noWiki } from "../../../sim/provenance";
import type { P3Special, Quadrant } from "./P3Types";
import type { DamageRange, FightLog, Selected, Source } from "./OcellusTimings";
import { BOSS_PAGE_P3, NO_WIKI_PRESENTATION, ROBINHOOD_GUIDE, RSPROX_PLAN, STRATEGIES_P3, analysis, cache, fightLog, guide, pose, selected } from "./OcellusTimings";

const NO_WIKI_P3_TICKS = noWiki("the wiki's phase 3 text gives the order and damage but no tick counts (Strategies rev 15381236)");
const NO_WIKI_P3_ARENA = noWiki("the wiki has no tile layout of the phase 3 arena (Strategies rev 15381236, Ocellus rev 15381233)");
const KIRBY_GUIDE = "https://www.youtube.com/watch?v=GU8_yiucWtk";
const DEFBIGBEAST_GUIDE = "https://www.youtube.com/watch?v=lT4DVmgDJak";
const PANFLEET_SOLO = "https://www.youtube.com/watch?v=_upW4hBgHbA";
const P3_CYCLE_FRAMES = guide(PANFLEET_SOLO, "5:20 to 5:45 at 1x: swings f114, f168, f294, f348, slashes landing f240, f421, the spin f478 (raid timer 30:13.00 at f0)");
const P3_CHIP_FRAMES = guide(DEFBIGBEAST_GUIDE, "20:28 to 21:12 at 1x: slashes landing f310 and f490, the tank's chips red 2 at f363 and red 1 at f417");
const DUO_GUIDE = "https://www.youtube.com/watch?v=HAgq_qg0OIY";
/** The fight logs a phase 3 value rests on, one `fight-log` source each; fight N in the notes is FIGHT_LOGS' LN. */
const p3Logs = (logs: readonly [FightLog, ...FightLog[]], at: string): readonly Source[] => logs.map((log) => fightLog(log, at));
const P3_CHAIN_LOGS = p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 7, quadrant 1 from his landing S: swings S+4 and S+7, slash S+10, swings S+14 and S+17, slash S+20, the spin S+24, its end S+29 and his next swing S+33; fight 8 the same 3 ticks late after a panic at S+4");
const P3_PANIC_LOGS = p3Logs(["L3", "L6", "L8"], "fight 8: panic S+4, swing S+10, slash S+13; fight 3: swing S+33, panic S+36, slash S+42; fight 6: swing S+119, panic S+122, slash S+128");
const P3_SPECIAL_LOGS = p3Logs(["L4", "L5", "L6", "L7", "L8"], "fights 4 and 8, quadrant 1: spin S+24, Untether S+53 (fight 8: S+59 after two panics), spin, Insolence, spin, Untether, spin, Insolence, spin; fights 5 to 7 the same up to the fall");
const P3_DAMAGE_AUDIT = analysis(RSPROX_PLAN, "damage audit, p3 rows: packet captures of six recorded fights");
const P3_UNTETHER_LOGS = p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: Untether U, the slam U+29, a fall shout U+31 in fights 1 and 2, and with the quadrant standing a swing or panic at U+37 in fights 3 to 8");

type ChainStep = "afterSwing" | "afterSlash" | "afterPanic";
type P3BossPose = "swing" | "panic" | "shadowSlash" | "spinStarts" | "spinLoops" | "spinEnds" | "untetherStarts" | "untetherLoops" | "slam" | "superiorSlash" | "quadrantFalls";

type P3Recipe = Readonly<{
  arena: Readonly<{ grid: Selected<readonly string[]>; playerSpawn: Selected<Tile>; bossAnchor: Selected<Tile> }>;
  thresholds: Selected<Readonly<Record<Quadrant, HpFraction>>>;
  firstAttackAfterStart: Selected<TickSpan>;
  chain: Readonly<Record<ChainStep, Selected<TickSpan>>> & Readonly<{ setsBeforeSpecial: Selected<number> }>;
  swing: Readonly<{ protectedDamage: Selected<DamageRange>; unprotectedDamage: Selected<DamageRange> }>;
  panic: Readonly<{ shout: Selected<string>; landsAfter: Selected<TickSpan>; damage: Selected<DamageRange> }>;
  shadowSlash: Readonly<{ landsAfter: Selected<TickSpan>; width: Selected<number>; damage: Selected<DamageRange> }>;
  specials: Selected<readonly [P3Special, ...P3Special[]]>;
  spin: Readonly<{
    opensAfter: Selected<TickSpan>;
    openingDamage: Selected<DamageRange>;
    saws: Selected<number>;
    firstCut: Selected<TickSpan>;
    cutEvery: Selected<TickSpan>;
    nextMoveAfterLastCut: Selected<TickSpan>;
    damage: Selected<DamageRange>;
    severedFor: Selected<TickSpan>;
    severChat: Selected<readonly string[]>;
  }>;
  untether: Readonly<{
    shout: Selected<string>;
    corner: Selected<Tile>;
    magic: Selected<readonly TickSpan[]>;
    magicDamage: Selected<DamageRange>;
    slam: Selected<TickSpan>;
    slamDamage: Selected<DamageRange>;
    aftershockDamage: Selected<DamageRange>;
    fallsOrStandsAt: Selected<TickSpan>;
    swingsAgain: Selected<TickSpan>;
  }>;
  insolence: Readonly<{
    shout: Selected<string>;
    slashes: Selected<readonly TickSpan[]>;
    landsAfter: Selected<TickSpan>;
    width: Selected<number>;
    damage: Selected<DamageRange>;
    swingsAgain: Selected<TickSpan>;
  }>;
  fallShouts: Selected<readonly string[]>;
  shoutLasts: Selected<TickSpan>;
  bossPoses: Readonly<Record<P3BossPose, Selected<number>>>;
}>;

const P3: P3Recipe = {
  arena: {
    grid: selected(
      [
        ".........bbbbbbbbbbbbb.........",
        ".......bbbb222+++111bbbb.......",
        "......bbbb2222+++1111bbbb......",
        ".....bbbb22222+++11111bbbb.....",
        "....bbBb222222+++111111bBbb....",
        "...bbbb2222222+++1111111bbbb...",
        "...bbb22222222+++11111111bbb...",
        "..bbb222222222+++111111111bbb..",
        "..bb2222222222+++1111111111bb..",
        "..b22222222222+++11111111111b..",
        "..b22222222222+++11111111111b..",
        "..b22222222222+++11111111111b..",
        "..b+++++++++++++++++++++++++b..",
        "..b+++++++++++++++++++++++++b..",
        "..b+++++++++++++++++++++++++b..",
        "..b33333333333+++44444444444b..",
        "..b33333333333+++44444444444b..",
        "..b33333333333+++44444444444b..",
        "..bb3333333333+++4444444444bb..",
        "..bbb333333333+++444444444bbb..",
        "...bbb33333333+++44444444bbb...",
        "...bbbb3333333+++4444444bbbb...",
        "....bbBb333333+++444444bBbb....",
        ".....bbbb33333+++44444bbbb.....",
        "......bbbb3333+++4444bbbb......",
        ".......bbbb333+++444bbbb.......",
        ".........bbbbb+++bbbbb.........",
      ],
      "spec-single",
      "unscaled",
      "row y = 0 first, x = 0 leftmost, at cache x = 16 + column and y = 54 - row; 1 to 4 are the north-east, north-west, south-west and south-east wedges of 85 floor tiles each, + the 3-wide cross between them, b the raised rim, B a brazier on the rim, . not floor; every floor tile of the map square is in the grid, and a quarter turn about The Blade at cache (31, 41) maps each wedge onto the next",
      NO_WIKI_P3_ARENA, cache("map square 16472 plane 1: floor overlay 657, rim 656, brazier locs 62894"),
    ),
    playerSpawn: selected(tile(19, 9), "assumption", "unscaled", "a floor tile of the north-east wedge two tiles south-west of the boss; no clip pins where the phase starts", NO_WIKI_P3_ARENA),
    bossAnchor: selected(tile(21, 7), "assumption", "unscaled", "south-west tile of the boss's 3x3, which covers x 21 to 23 and y 5 to 7, all on the north-east wedge; no clip pins where the phase starts", NO_WIKI_P3_ARENA),
  },
  thresholds: selected(
    { 1: hpFraction(0.76), 2: hpFraction(0.51), 3: hpFraction(0.26) },
    "log-repeated",
    "unscaled",
    "a quadrant falls on the tick after the first tick the boss is at or below the fraction of his max HP, whatever he is doing, except that during Untether it waits for its end; the logs show his HP only as a whole percentage, so the exact fraction between 75% and 76% is not on record; the guides' 75%, 50% and 25% fall later than 9 of the 12 logged falls",
    NO_WIKI_P3_TICKS, guide(ROBINHOOD_GUIDE, "0:06:13"), guide(KIRBY_GUIDE, "5:37"),
    ...p3Logs(["L6", "L7", "L8"], "fights 6 to 8, quadrant 1: the bar reads 76% on the tick before the fall, with no hit to 75% or below before it (L6:3819 and L6:3821, L7:3943 and L7:3945, L8:4317 and L8:4335)"),
    ...p3Logs(["L1", "L2", "L6", "L7"], "quadrant 2: the bar reads 51% before the fall (L1:3576 and L1:3579, L2:3465 and L2:3477, L6:4707 and L6:4711, L7:5364 and L7:5366)"),
    ...p3Logs(["L1", "L6"], "quadrant 3: the bar reads 26% before the fall (L1:4289 and L1:4291, L6:5470 and L6:5472)"),
    ...p3Logs(["L5", "L7"], "fight 7: swings S+169 and S+172, slash S+175, the fall shout S+178, a tick before his next move; fight 5: swing S+172 and the fall shout S+173"),
  ),
  firstAttackAfterStart: selected(span(4), "log-repeated", "unscaled", "P3 tick 0 is the tick he lands in his first corner; his first move comes 4 ticks later, 10 after phase 3 begins", NO_WIKI_P3_TICKS, ...P3_CHAIN_LOGS),
  chain: {
    afterSwing: selected(span(3), "footage-repeated", "unscaled", "a set is two swings and a shadow slash, each move timed from the one before: the second swing 3 ticks after the first and the slash 3 after the second; the wiki infobox's attack speed of 6 is not this gap", STRATEGIES_P3, BOSS_PAGE_P3, ...P3_CHAIN_LOGS, P3_CYCLE_FRAMES, P3_CHIP_FRAMES),
    afterSlash: selected(span(4), "footage-repeated", "unscaled", "his next move, a swing or a special, 4 ticks after the slash's animation; the slash lands 1 tick after its animation, so footage shows it landing 3 ticks before the next swing", NO_WIKI_P3_TICKS, ...P3_CHAIN_LOGS, P3_CYCLE_FRAMES, P3_CHIP_FRAMES),
    afterPanic: selected(span(6), "log-repeated", "unscaled", "a panic shot takes a swing's place and his next move comes 6 ticks after it, so the rest of the chain runs 3 ticks late", NO_WIKI_P3_TICKS, ...P3_PANIC_LOGS),
    setsBeforeSpecial: selected(2, "footage-repeated", "unscaled", "two sets, then a special, then two sets again", NO_WIKI_P3_TICKS, ...P3_CHAIN_LOGS, guide(KIRBY_GUIDE, "4:18")),
  },
  swing: {
    protectedDamage: selected<DamageRange>({ min: 0, max: 6 }, "footage-repeated", "solo", "chip through Protect from Melee: red 6, blue 0, red 6, blue 0 in panfleet's solo and red 2 and red 1 on DefBigbeast's tank; 6 is the most seen", NO_WIKI_P3_TICKS, P3_CYCLE_FRAMES, P3_CHIP_FRAMES, guide(ROBINHOOD_GUIDE, "0:02:09")),
    unprotectedDamage: selected<DamageRange>({ min: 0, max: 26 }, "inferred", "unscaled", "the monster melee max hit ⌊0.5 + (250 + 9) × (0 + 64) / 640⌋ = 26 at the cache's Strength 250 with no strength bonus (assumption); no clip shows an unprotected swing", noWiki("no wiki page gives the phase 3 swing's max hit (Ocellus rev 15381233)"), cache("npc 16677 stats [325, 250, 250, 5250, 300, 300]")),
  },
  panic: {
    shout: selected("Your panic... is futile...", "log-repeated", "unscaled", "his shout with a panic shot", NO_WIKI_P3_TICKS, ...p3Logs(["L3", "L4", "L5", "L6", "L7", "L8"], "fights 3 to 8")),
    landsAfter: selected(span(2), "log-repeated", "unscaled", "a magic shot that lands 2 ticks after his animation, when nobody is in his melee reach as a swing comes; Protect from Magic blocks it", STRATEGIES_P3, ...p3Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 and 3 to 8: every panic's hits land 2 ticks after its animation, 0 on each raider under Protect from Magic")),
    damage: selected<DamageRange>({ min: 20, max: 26 }, "spec-single", "unscaled", "without Protect from Magic, from the wiki's 20+; the logs' unprotected hits as it lands run from 10 to 33, with other hits on the same tick, so they do not pin it", STRATEGIES_P3, guide(ROBINHOOD_GUIDE, "0:02:26 to 0:02:31"), ...p3Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 and 3 to 8")),
  },
  shadowSlash: {
    landsAfter: selected(span(1), "log-repeated", "unscaled", "the slash's floor graphic and its hits come the tick after his animation", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: spotanim 4335 on the floor and the hits on the tick after each animation 14846")),
    width: selected(3, "log-repeated", "unscaled", "a band 3 tiles wide toward his tank, snapped to the nearest of the 8 directions from his middle tile, from the ring touching his body to the wedge's edge; straight bands are the 3 tiles in line with his body, diagonal ones start at his corner; solo, his tank is you", NO_WIKI_P3_TICKS, ...p3Logs(["L3", "L4", "L5", "L6", "L7", "L8"], "fights 3 to 8: 111 bands of spotanim 4335, each aimed at the raider his swings hit")),
    damage: selected<DamageRange>({ min: 25, max: 28 }, "footage-repeated", "unscaled", "typeless, so a protection prayer does not help", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: 57 of the 75 hits on raiders the tick after a slash's animation are 25 to 28")),
  },
  specials: selected<readonly [P3Special, ...P3Special[]]>(
    ["spin", "untether", "spin", "insolence"],
    "footage-repeated",
    "unscaled",
    "after every two sets: the spin every other special, and between them Untether and Insolence in turn, Untether first; his HP plays no part, so a quadrant that stands through Untether goes on the same way; in later quadrants Insolence comes first, and the spin keeps alternating across a quadrant's fall, so a quadrant that falls after a spin opens with the other special",
    NO_WIKI_P3_TICKS, ...P3_SPECIAL_LOGS,
  ),
  spin: {
    opensAfter: selected(span(1), "log-repeated", "unscaled", "a melee hit lands on everyone 1 tick after the spin starts, before its first saw; Protect from Melee blocks it", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: a hit on S+1 of every spin and none on S, 0 on 256 of 257 raiders under Protect from Melee, as at L6:3292")),
    openingDamage: selected<DamageRange>({ min: 0, max: 18 }, "log-repeated", "unscaled", "without Protect from Melee; the 22 lone splats on S+1 run 0 to 18, as L6:3293's 18", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: the S+1 hits on raiders with no overhead")),
    saws: selected(1, "log-repeated", "unscaled", "one saw in quadrant 1; one more for each quadrant destroyed", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: one cut in quadrant 1, two in quadrant 2 and three in quadrant 3")),
    firstCut: selected(span(5), "log-repeated", "unscaled", "the first saw cuts 5 ticks after the spin starts, on the tick his loop animation, or for the last saw his end animation, plays", NO_WIKI_P3_TICKS, ...P3_CHAIN_LOGS, ...p3Logs(["L2"], "fight 2: per-tick overheads through each spin")),
    cutEvery: selected(span(3), "log-repeated", "unscaled", "each later saw 3 ticks after the one before", NO_WIKI_P3_TICKS, ...p3Logs(["L2"], "fight 2, quadrant 3: loops at P+5 and P+8, the end at P+11")),
    nextMoveAfterLastCut: selected(span(4), "log-repeated", "unscaled", "his next move 4 ticks after the last cut", NO_WIKI_P3_TICKS, ...P3_CHAIN_LOGS),
    damage: selected<DamageRange>({ min: 15, max: 27 }, "spec-single", "unscaled", "melee, 0 through Protect from Melee", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: zeros through Protect from Melee on each cut, and 11 to 29 on raiders with no overhead")),
    severedFor: selected(span(3), "footage-once", "unscaled", "an overhead up on the tick before a cut is severed and stays off for 3 ticks, so the cut lands; turn it off for that tick and back on for the cut", NO_WIKI_P3_TICKS, guide(DUO_GUIDE, "18:53 to 18:55"), ...p3Logs(["L2"], "fight 2: every raider's overhead off the tick before each cut and on for it")),
    severChat: selected(
      ["Ocellus disrupts your concentration, severing your prayer!", "You've been injured and can't use protection prayers!"],
      "footage-once",
      "unscaled",
      "the game chat as a prayer is severed",
      NO_WIKI_P3_TICKS, guide(DUO_GUIDE, "18:53"), ...p3Logs(["L4"], "fight 4: the second line in the chat"),
    ),
  },
  untether: {
    shout: selected("Untether...", "log-repeated", "unscaled", "his shout as Untether starts", STRATEGIES_P3, ...P3_UNTETHER_LOGS),
    corner: selected(tile(21, 7), "log-repeated", "unscaled", "he rises from his quadrant's corner: the south-west tile of his 3x3 at cache (37, 47) in quadrant 1", NO_WIKI_P3_ARENA, ...p3Logs(["L3", "L4", "L5"], "fights 3 to 5: every Untether in quadrant 1 at cache (37, 47)")),
    magic: selected([span(10), span(14), span(18), span(22)], "footage-repeated", "unscaled", "magic lands on everyone 10, 14, 18 and 22 ticks in, so Untether is prayed with Protect from Magic", NO_WIKI_P3_TICKS, guide(KIRBY_GUIDE, "4:37"), ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: zeros on every raider under Protect from Magic at U+10, U+14, U+18 and U+22")),
    magicDamage: selected<DamageRange>({ min: 14, max: 29 }, "spec-single", "unscaled", "without Protect from Magic, from 12 unprayed hits; nearly every hit through Protect from Magic was 0", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT),
    slam: selected(span(29), "footage-repeated", "unscaled", "the slam hits whoever is not under his 3x3 at the end of the tick before; the aftershock a tick later hits whoever is still under him at the end of the slam's tick; so be under him by U+28 and one tile out on U+29", NO_WIKI_P3_TICKS, guide(KIRBY_GUIDE, "5:00"), ...p3Logs(["L1"], "fight 1: 36 on the one raider outside at U+29, 21 and 41 at U+30 on the two still under")),
    slamDamage: selected<DamageRange>({ min: 34, max: 39 }, "footage-repeated", "unscaled", "typeless; the logs' slams run 34 to 41", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: hits at U+29")),
    aftershockDamage: selected<DamageRange>({ min: 18, max: 41 }, "footage-repeated", "unscaled", "typeless; 18 and 19 on the tick after the slam in the packet captures, 18 to 42 in the logs", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: hits at U+30")),
    fallsOrStandsAt: selected(span(31), "log-repeated", "unscaled", "the quadrant falls 31 ticks after Untether starts if his HP is at its floor by then; otherwise it stands", NO_WIKI_P3_TICKS, ...P3_UNTETHER_LOGS),
    swingsAgain: selected(span(37), "log-repeated", "unscaled", "with the quadrant standing, his next move 37 ticks after Untether starts", NO_WIKI_P3_TICKS, ...P3_UNTETHER_LOGS),
  },
  insolence: {
    shout: selected("Insolence...", "log-repeated", "unscaled", "his shout as Insolence starts", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8")),
    slashes: selected([span(2), span(7), span(12)], "log-repeated", "unscaled", "three superior slashes animate 2, 7 and 12 ticks after the shout; solo, all three come at you", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L5", "L6", "L7"], "fights 1 and 5 to 7: animation 14848 at I+2, I+7 and I+12; the other fights log two of the three on those ticks")),
    landsAfter: selected(span(3), "log-repeated", "unscaled", "each lands 3 ticks after its animation", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L4", "L5", "L6", "L7", "L8"], "fights 1, 2 and 4 to 8: hits of 38 to 48 three ticks after animation 14848")),
    width: selected(3, "footage-once", "unscaled", "a band 3 tiles wide from just outside his body to the wedge's edge, at any angle, not snapped", NO_WIKI_P3_TICKS, guide(DUO_GUIDE, "20:24")),
    damage: selected<DamageRange>({ min: 38, max: 46 }, "footage-repeated", "unscaled", "typeless; 39 to 41 in the packet captures, 38 to 48 in the logs, 46, 43 and 38 on one band in fight 1", NO_WIKI_P3_TICKS, P3_DAMAGE_AUDIT, ...p3Logs(["L1", "L2", "L4", "L5", "L6", "L7", "L8"], "fights 1, 2 and 4 to 8")),
    swingsAgain: selected(span(20), "log-repeated", "unscaled", "his next move 20 ticks after the shout", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L4", "L5", "L7", "L8"], "fights 1, 2, 4, 5, 7 and 8")),
  },
  fallShouts: selected(["Obliteration...", "Run... It matters not..."], "log-repeated", "unscaled", "one of these as the quadrant falls", NO_WIKI_P3_TICKS, ...p3Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8")),
  shoutLasts: selected(span(3), "assumption", "unscaled", "how long his overhead text shows", NO_WIKI_PRESENTATION),
  bossPoses: {
    swing: pose(14842, "npc_ocellus_phase3_melee_basic", "inferred", "the swing, 2 ticks; by its name"),
    panic: pose(14851, "npc_ocellus_phase3_basic_projectile_all", "footage-repeated", "the panic shot, 3 ticks; on every panic in the logs"),
    shadowSlash: pose(14846, "npc_ocellus_phase3_melee_slash", "footage-repeated", "the shadow slash, 3 ticks; on every slash in the logs"),
    spinStarts: pose(14869, "npc_ocellus_phase3_prayer_in", "footage-repeated", "the spin's start; on every spin in the logs"),
    spinLoops: pose(14870, "npc_ocellus_phase3_prayer_loop", "footage-repeated", "a saw's cut before the last; in the logs' later quadrants"),
    spinEnds: pose(14871, "npc_ocellus_phase3_prayer_out", "footage-repeated", "the last saw's cut; on every spin in the logs"),
    untetherStarts: pose(14857, "npc_ocellus_phase3_unleash_in", "footage-repeated", "Untether's rise, 2 ticks; on every Untether in the logs"),
    untetherLoops: pose(14858, "npc_ocellus_phase3_unleash_loop", "footage-repeated", "hovering through Untether, a 2-tick loop"),
    slam: pose(14861, "npc_ocellus_phase3_unleash_out", "footage-repeated", "the slam, 4 ticks; at U+29 in the logs"),
    superiorSlash: pose(14848, "npc_ocellus_phase3_superior_slash", "footage-repeated", "a superior slash of Insolence; in the logs"),
    quadrantFalls: pose(14859, "npc_ocellus_phase3_quadrant_destroy_in", "footage-repeated", "the fall's start, with its shout; in the logs"),
  },
};

export const OCELLUS_P3: P3Recipe = P3;
