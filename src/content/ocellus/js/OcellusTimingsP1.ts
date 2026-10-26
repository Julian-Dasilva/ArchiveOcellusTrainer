import type { HpFraction, TickSpan, Tile } from "../../../sim/brands";
import { hpFraction, span, tile } from "../../../sim/brands";
import type { Style } from "../../../sim/combat";
import { noWiki, wiki } from "../../../sim/provenance";
import type { Corner, CornerTurn, Direction, Element, Tendril } from "./P1Types";
import type { Side } from "../../../sim/tiles";
import type { AmmunitionClass, DamageRange, FightLog, Selected, Source, SpriteFrame } from "./OcellusTimings";
import { BOSS_PAGE_P1, HOTFIX_NEWS, NO_WIKI_PRESENTATION, P1_MAX_HP, analysis, cache, fightLog, guide, pose, selected, spotAnim } from "./OcellusTimings";

const STRATEGIES_P1 = wiki("https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies", 15381731);
const NO_WIKI_P1_TICKS = noWiki("the wiki's phase 1 text gives the order of the attacks but no tick counts (Strategies rev 15381731, Ocellus rev 15381739)");
const NO_WIKI_P1_ROOM = noWiki("the wiki has no tile layout of the phase 1 room (Strategies rev 15381731, Ocellus rev 15381739)");
const RSPROX_P1 = "https://github.com/MRobertEvers/oldschool-clientc/blob/HEAD/docs/rsprox-analysis/guthixian_archive/ocellus_plan.md";
/** A tick analysis of packet captures of six recorded fights, phase 1 section; it has no licence, so it is cited, not copied. */
const p1Captures = (at: string): Source => analysis(RSPROX_P1, at);
/**
 * The fight logs a phase 1 value rests on, one `fight-log` source each; fight N in the notes is FIGHT_LOGS' LN, in
 * recording order. Ticks count from A, the "Now... ascension..." shout, W, a walk's first volley, C, a corner's charge,
 * M, his teleport out to the middle, B, a middle beat, and K, the tick his HP reaches 0. Tiles are region 16472's.
 */
const p1Logs = (logs: readonly [FightLog, ...FightLog[]], at: string): readonly Source[] => logs.map((log) => fightLog(log, at));
const DUO_KILL = "https://www.youtube.com/watch?v=HAgq_qg0OIY";
const P1_ROOM_FRAME = "in the P3 arena grid's tiles, x = region x - 16 and y = 54 - region y; the middle 3x3 is centred on The Blade's tile, region (31, 41), grid (15, 13)";

type Diagonal = "north-east" | "south-east" | "south-west" | "north-west";
type CrackPieces = Readonly<{ start: number; piece: number; end: number }>;
/** A crack's first tile as an offset from the boss's south-west tile, and the way it runs out from him. */
type CrackStart = Readonly<{ dx: number; dy: number; run: Direction }>;
type P1BossPose = "idle" | "walk" | "volley" | "lastVolley" | "charge" | "expend" | "explode" | "teleportOut" | "teleportIn";
type P1SpotAnim = "fireOnBoss" | "fireShot" | "fireImpact" | "waterOnBoss" | "waterShot" | "waterImpact" | "strikeShot" | "glow" | "explodeOnBoss" | "teleportOut" | "teleportIn" | "transform";

type TendrilRecipe = Readonly<{
  firstFrom: Readonly<Record<Corner, Exclude<Tendril, "corner">>>;
  straightChance: number;
  cornerShapes: Readonly<{ diagonal: number; x: number; y: number }>;
}>;
type BeatRecipe = Readonly<{
  first: TickSpan;
  every: TickSpan;
  count: number;
  length: number;
  cracks: Readonly<Record<Side, readonly [CrackStart, CrackStart]>>;
  closesAfter: readonly [TickSpan, TickSpan];
  glowAfter: readonly TickSpan[];
  explodeAfter: TickSpan;
}>;
type StrikeRecipe = Readonly<{
  toldAfterLastExplode: TickSpan;
  castAfterTold: TickSpan;
  flight: TickSpan;
  damage: DamageRange;
  meterPerExtraShot: number;
  lasts: TickSpan;
  texts: Readonly<{ one: string; several: string }>;
}>;
type EndRecipe = Readonly<{
  shout: Readonly<{ text: string; lasts: TickSpan }>;
  teleportOutAfter: TickSpan;
  teleportInAfter: TickSpan;
  transformAfterLanding: TickSpan;
  transformAtMiddleAfter: TickSpan;
  phase2AfterTransform: TickSpan;
}>;
type ShotLook = Readonly<{ startCycle: number; nearEndCycle: number; farEndCycle: number; height: number }>;

type P1Recipe = Readonly<{
  boss: Readonly<{
    npcId: Selected<number>;
    size: Selected<number>;
    combatLevel: Selected<number>;
    maxHp: Selected<number>;
    stats: Selected<Readonly<{ attack: number; strength: number; defence: number; range: number; magic: number }>>;
    defenceBonuses: Selected<Readonly<{ stab: number; slash: number; crush: number; magic: number }>>;
    rangedDefence: Selected<Readonly<Record<AmmunitionClass, number>>>;
    lowestDefencePercent: Selected<number>;
  }>;
  room: Readonly<{ start: Selected<Tile>; corners: Selected<Readonly<Record<Corner, Tile>>>; middle: Selected<Tile>; playerSpawn: Selected<Tile>; path: Selected<"straight-then-diagonal"> }>;
  arrive: Readonly<{ shout: Selected<Readonly<{ text: string; lasts: TickSpan }>>; hoodedFor: Selected<TickSpan>; walkAfter: Selected<TickSpan> }>;
  route: Selected<Readonly<Record<CornerTurn, number>>>;
  walk: Readonly<{ volleyEvery: Selected<TickSpan>; overhead: Selected<"protect-melee">; chargeAfter: Selected<Readonly<{ lastVolley: TickSpan; endPose: TickSpan }>> }>;
  volley: Readonly<{
    styles: Selected<Readonly<Record<Element, Style>>>;
    switchChance: Selected<number>;
    flight: Selected<Readonly<{ nearWithin: number; near: TickSpan; far: TickSpan }>>;
    protectedDamage: Selected<DamageRange>;
    unprotectedDamage: Selected<DamageRange>;
  }>;
  corner: Readonly<{
    cracks: Selected<Readonly<{ count: number; every: TickSpan; length: number; closesAfter: TickSpan }>>;
    tendrils: Selected<TendrilRecipe>;
    glow: Selected<Readonly<{ from: TickSpan; every: TickSpan }>>;
    taunt: Selected<Readonly<{ at: TickSpan; lasts: TickSpan; texts: readonly [string, ...string[]] }>>;
    explodeAt: Selected<TickSpan>;
    walkAt: Selected<TickSpan>;
  }>;
  blast: Readonly<{ afterExplode: Selected<TickSpan>; radius: Selected<number>; damage: Selected<DamageRange> }>;
  crackBlock: Readonly<{
    damage: Selected<DamageRange>;
    refund: Selected<"on-stepping-off">;
    unblocked: Selected<Readonly<{ meter: number; bossHeal: number; meterMax: number }>>;
  }>;
  middle: Readonly<{
    thresholds: Selected<readonly [HpFraction, ...HpFraction[]]>;
    decidesOn: Selected<"volley-ticks">;
    teleport: Selected<Readonly<{ hiddenAfter: TickSpan; inAfter: TickSpan }>>;
    beats: Selected<BeatRecipe>;
    strike: Selected<StrikeRecipe>;
    walkAfterTold: Selected<TickSpan>;
  }>;
  end: Selected<EndRecipe>;
  presentation: Readonly<{
    bossPoses: Readonly<Record<P1BossPose, Selected<number>>>;
    spotAnims: Readonly<Record<P1SpotAnim, Selected<number>>>;
    shot: Selected<ShotLook>;
    crackPieces: Readonly<{ straight: Readonly<Record<Side, Selected<CrackPieces>>>; diagonal: Readonly<Record<Diagonal, Selected<CrackPieces>>> }>;
    crackTiming: Selected<Readonly<{ openDelay: number; perTile: number }>>;
    floorExplosions: Selected<Readonly<{ pieces: readonly [number, ...number[]]; ringDelays: readonly number[] }>>;
    overheadIcon: Selected<SpriteFrame>;
    chargeBar: Selected<Readonly<{ fill: string; background: string; height: number }>>;
  }>;
}>;

const crackPieces = (start: number, piece: number, end: number, toward: string): Selected<CrackPieces> =>
  selected(
    { start, piece, end },
    "spec-confirmed",
    "unscaled",
    `a crack growing ${toward}: the start piece on its far tile, the piece on the rest, the end piece as it closes; every logged crack uses one family for its growth`,
    NO_WIKI_PRESENTATION,
    cache(`spotanims ${start}, ${piece} and ${end} vfx_ocellus_p1_floor_crack`),
    ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: 133 cracks"),
  );

const P1: P1Recipe = {
  boss: {
    npcId: selected(16674, "spec-confirmed", "unscaled", "the phase 1 combat form; it shares models 62668 and 62669 with the Hooded Figure (16672) and the talking form (16673), which says the opening line", BOSS_PAGE_P1, cache("npc 16674 Ocellus, models 62668 and 62669"), ...p1Logs(["L3", "L4", "L5"], "fights 3 to 5: the shout from npc 16673, his attacks from npc 16674")),
    size: selected(3, "spec-confirmed", "unscaled", "a 3x3", BOSS_PAGE_P1, cache("npc 16674 size 3")),
    combatLevel: selected(1121, "spec-confirmed", "unscaled", "the phase 1 infobox and the cache agree", BOSS_PAGE_P1, cache("npc 16674 combat level 1121")),
    maxHp: P1_MAX_HP,
    stats: selected({ attack: 1, strength: 1, defence: 215, range: 250, magic: 350 }, "spec-confirmed", "unscaled", "the phase 1 infobox lists the cache's levels", BOSS_PAGE_P1, cache("npc 16674 stats [1, 215, 1, 2500, 250, 350]")),
    defenceBonuses: selected({ stab: 150, slash: 95, crush: 60, magic: 100 }, "spec-confirmed", "unscaled", "cache params 5 to 8 match the phase 1 infobox", BOSS_PAGE_P1, cache("npc 16674 params 5, 6, 7, 8")),
    rangedDefence: selected({ light: 50, standard: 135, heavy: 50 }, "spec-single", "unscaled", "the phase 1 infobox; the Strategies page: weakest to light and heavy ranged attacks; the cache decode has no ranged defence param", BOSS_PAGE_P1, STRATEGIES_P1),
    lowestDefencePercent: selected(60, "spec-single", "unscaled", "the 21 October hotfix caps Defence reduction at 60% of the level: phase 1 Defence stops at 129 of 215, as the Strategies table lists; rounded up, as in phase 3 (inferred)", BOSS_PAGE_P1, STRATEGIES_P1, HOTFIX_NEWS),
  },
  room: {
    start: selected(tile(14, 17), "log-repeated", "team-7-and-8", `south-west tile of his 3x3 as the phase starts, 3 tiles south of the middle 3x3, ${P1_ROOM_FRAME}`, NO_WIKI_P1_ROOM, ...p1Logs(["L3", "L4", "L5"], "fights 3 to 5: his first volley centred on (31, 38)")),
    corners: selected(
      { "north-east": tile(20, 8), "south-east": tile(20, 20), "south-west": tile(8, 20), "north-west": tile(8, 8) },
      "log-repeated",
      "team-7-and-8",
      `south-west tiles of his 3x3 at each corner stop, centred 6 tiles out from the middle on both axes, ${P1_ROOM_FRAME}`,
      NO_WIKI_P1_ROOM,
      ...p1Logs(["L3", "L4", "L5"], "fights 3 to 5: every corner charge centred on (37, 47), (37, 35), (25, 35) or (25, 47)"),
    ),
    middle: selected(tile(14, 14), "log-repeated", "team-7-and-8", `south-west tile of his 3x3 in the middle, centred on The Blade's tile, ${P1_ROOM_FRAME}`, NO_WIKI_P1_ROOM, ...p1Logs(["L3", "L4", "L5"], "fights 3 to 5: every teleport in centred on (31, 41)")),
    playerSpawn: selected(tile(15, 22), "assumption", "unscaled", "the south arm, 5 tiles south of his 3x3, by the room's entrance; no log pins where a player stands as the phase starts", NO_WIKI_P1_ROOM),
    path: selected(
      "straight-then-diagonal",
      "log-repeated",
      "team-7-and-8",
      "he walks one tile a tick, straight along the longer axis until both offsets are equal, then diagonally, so a walk takes the Chebyshev distance in ticks: from the start, (31, 38), (29, 38), (28, 38), (27, 37), (26, 36), (25, 35) to the south-west corner, and (33, 43) five steps toward the north-east one",
      NO_WIKI_P1_ROOM,
      ...p1Logs(["L3", "L4", "L5"], "fights 3 and 5: the walk from the start to the south-west corner; fight 4: the walk to the north-east corner"),
    ),
  },
  arrive: {
    shout: selected({ text: "Now... ascension...", lasts: span(4) }, "log-repeated", "team-7-and-8", "the opening line, with the game's \"Challenge started: Ocellus.\"", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 and 3 to 8")),
    hoodedFor: selected(span(1), "log-repeated", "team-7-and-8", "the talking form says the line at A and the combat form stands there from A + 1; the first hits on him land from A + 3", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 3 to 5: npc 16674 from A + 1; fights 1 and 3 to 8: first hit on him from A + 3 to A + 5")),
    walkAfter: selected(span(4), "log-repeated", "team-7-and-8", "his first walk and first volley at A + 4 in all 6 fights logged from the shout", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 and 3 to 8: first volley A + 4"), p1Captures("phase 1 timeline")),
  },
  route: selected(
    { anticlockwise: 10, clockwise: 3, across: 6 },
    "log-repeated",
    "unscaled",
    "weights for his next corner from the one he is at: anticlockwise 10, clockwise 3, across 6 of 19 recorded; the first corner is uniform (inferred); a middle never changes the corner he is heading for",
    NO_WIKI_P1_TICKS,
    p1Captures("phase 1 corner order"),
    ...p1Logs(["L3", "L4", "L5"], "fights 3 to 5: after each middle he walks on to the corner he was heading for"),
  ),
  walk: {
    volleyEvery: selected(span(5), "log-repeated", "team-7-and-8", "a volley every 5 ticks from the walk's first tick; the infobox's attack speed of 5", BOSS_PAGE_P1, ...p1Logs(["L1", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 and 3 to 8: volley poses and spotanims on him 5 ticks apart"), p1Captures("phase 1 timeline")),
    overhead: selected("protect-melee", "spec-single", "unscaled", "the wiki: while walking to a quadrant he has Protect from Melee active; it rises with a walk's first volley and drops the tick before the charge (inferred)", STRATEGIES_P1),
    chargeAfter: selected(
      { lastVolley: span(6), endPose: span(1) },
      "log-repeated",
      "team-7-and-8",
      "on the volley tick he reaches his corner he casts with the end pose and charges 6 ticks later; on a volley tick after he reached it he plays the end pose alone and charges the next tick: 6 after 19 end poses and 1 after 13; the 3 walks from the south-west to the north-east corner cast with the end pose a volley early and still charged on time (unexplained); 2 corners came 3 ticks after the pose",
      NO_WIKI_P1_TICKS,
      ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: 34 corners"),
    ),
  },
  volley: {
    styles: selected({ fire: "ranged", water: "magic" }, "log-repeated", "team-7-and-8", "the wiki's orange ranged and blue magic projectiles: fire (spotanim 4231, projectile 4232) and water (4228, 4229); every player praying the matching protection took 0", STRATEGIES_P1, ...p1Logs(["L1", "L2", "L6", "L7", "L8"], "fights 1, 2 and 6 to 8: 121 fire and 125 water volleys under the matching prayer, all 0")),
    switchChance: selected(14 / 65, "log-repeated", "unscaled", "each volley keeps the last one's element or switches: 14 switches in 65 captured volleys and 23 in 88 logged ones; the first element is even odds (inferred)", NO_WIKI_P1_TICKS, p1Captures("phase 1 volleys"), ...p1Logs(["L3", "L4", "L5", "L6", "L7", "L8"], "fights 3 to 8: 88 consecutive volleys")),
    flight: selected(
      { nearWithin: 4, near: span(3), far: span(4) },
      "log-repeated",
      "team-7-and-8",
      "a volley lands 3 ticks after the cast on a player within 4 tiles of his 3x3 and 4 ticks after it beyond; the projectile leaves 30 client cycles after the cast and lands at 95 or 125",
      NO_WIKI_P1_TICKS,
      p1Captures("phase 1 volleys, 30 to 95 and 30 to 125 cycles"),
      ...p1Logs(["L1", "L2", "L3", "L6", "L7", "L8"], "fight 3: 65- and 95-cycle projectiles from the tick after the cast; fights 1, 2 and 6 to 8: landings 3 or 4 ticks after the pose"),
    ),
    protectedDamage: selected<DamageRange>({ min: 0, max: 0 }, "footage-repeated", "team-7-and-8", "the matching protection prayer blocks it", STRATEGIES_P1, ...p1Logs(["L1", "L2", "L6", "L7", "L8"], "fights 1, 2 and 6 to 8: 246 of 246 volleys 0 under the matching prayer")),
    unprotectedDamage: selected<DamageRange>(
      { min: 0, max: 27 },
      "footage-repeated",
      "team-7-and-8",
      "0, 4 to 13, 20, 22, 25 and 27 on 18 players with no protection or the other one; the captures give 1 to 25 and the infobox a max hit of 24, which the logs exceed",
      BOSS_PAGE_P1,
      ...p1Logs(["L1", "L2", "L6", "L7", "L8"], "fights 1, 2 and 6 to 8: 18 volleys without the matching prayer"),
      p1Captures("phase 1 damage audit"),
    ),
  },
  corner: {
    cracks: selected(
      { count: 7, every: span(2), length: 8, closesAfter: span(5) },
      "log-repeated",
      "team-7-and-8",
      "seven tendrils one at a time: a crack on the charge tick and every 2 ticks after, 8 tiles long unless the room ends it, closing 5 ticks after it opens; the captures' 9 tiles is one longer than all 85 corner cracks logged",
      STRATEGIES_P1,
      ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: cracks at C to C + 12, each closing 5 ticks on, 85 of 85 8 tiles long"),
      p1Captures("phase 1 corner script"),
    ),
    tendrils: selected(
      { firstFrom: { "north-east": "y", "south-east": "x", "south-west": "y", "north-west": "x" }, straightChance: 62 / 107, cornerShapes: { diagonal: 20 / 42, x: 11 / 42, y: 11 / 42 } },
      "log-repeated",
      "unscaled",
      "three tendrils take turns, the first fixed by the corner and the other two in a seeded order; an x or y tendril leaves his face toward the middle, straight along his middle row or column (62 of 107) or diagonally from his inner row or column; the corner tendril leaves his inner corner diagonally (20 of 42) or straight along x or y; neighbouring cracks lie side by side",
      NO_WIKI_P1_TICKS,
      p1Captures("phase 1 crack roots"),
      ...p1Logs(["L6"], "fight 6, first corner: cracks from (-4, 5) diagonally, then from (-5, 4) and (-6, 4) south, as offsets from the middle"),
    ),
    glow: selected({ from: span(5), every: span(2) }, "log-repeated", "team-7-and-8", "the charge glow on him from C + 5, every 2 ticks until he explodes", NO_WIKI_PRESENTATION, ...p1Logs(["L3", "L4", "L5", "L6", "L7", "L8"], "fights 3 to 8: spotanim 4260 at C + 5"), p1Captures("phase 1 corner script")),
    taunt: selected(
      { at: span(15), lasts: span(3), texts: ["Pointless...", "You... fail...", "Unworthy..."] },
      "log-repeated",
      "team-7-and-8",
      "one of three lines at C + 15 in 31 of 34 corners; which line is a seeded pick (inferred)",
      NO_WIKI_P1_TICKS,
      ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: 34 corners"),
    ),
    explodeAt: selected(span(18), "log-repeated", "team-7-and-8", "the explode pose and spotanim 4261 at C + 18 in 31 of 33 corners", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8")),
    walkAt: selected(span(21), "log-repeated", "team-7-and-8", "his next walk's first volley at C + 21 in 23 of 24 corners", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8")),
  },
  blast: {
    afterExplode: selected(span(1), "log-repeated", "team-7-and-8", "the floor explosions land a tick after the explode pose", NO_WIKI_P1_TICKS, ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: spotanims 4262 to 4265 at C + 19 and B + 7")),
    radius: selected(2, "log-repeated", "team-7-and-8", "the wiki's two tile range: every floor tile within 2 of his 3x3, 37 at a corner and 40 in the middle", STRATEGIES_P1, ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: 37 and 40 floor explosions")),
    damage: selected<DamageRange>({ min: 26, max: 34 }, "footage-repeated", "team-7-and-8", "26, 27, 27, 29, 29, 29, 30, 30, 33, 33, 34 and 34 on players inside it; the wiki's up to 35; the captures give 28 to 30", STRATEGIES_P1, ...p1Logs(["L1", "L6", "L7", "L8"], "fights 1 and 6 to 8: 12 blast hits"), p1Captures("phase 1 damage audit")),
  },
  crackBlock: {
    damage: selected<DamageRange>(
      { min: 3, max: 5 },
      "footage-repeated",
      "team-7-and-8",
      "a player on a crack's tile as it closes blocks it and takes 3 to 5: 330 hits on players on closing tiles in fight 6, and 130 of 133 closings in fights 6 to 8 hit the logging player",
      STRATEGIES_P1,
      ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8"),
    ),
    refund: selected(
      "on-stepping-off",
      "community-tested",
      "unscaled",
      "the wiki: a blocker takes some damage but is healed after stepping off; here the damage blocked comes back as one heal on the first tick the player stands on no open crack; the logs' heals roughly match the hits before them, and the duo's +16, +9 and +13 read as several blocks returned at once (inferred)",
      STRATEGIES_P1,
      BOSS_PAGE_P1,
      ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: heals of 2 to 17 after blocks of 3 to 5"),
      guide(DUO_KILL, "13:31 to 13:35"),
    ),
    unblocked: selected({ meter: 2, bossHeal: 2, meterMax: 96 }, "footage-repeated", "unscaled", "a crack that closes with nobody on it charges his yellow bar by 2 of 96 and heals him 2", BOSS_PAGE_P1, p1Captures("phase 1 meter")),
  },
  middle: {
    thresholds: selected([hpFraction(0.66), hpFraction(0.25)], "spec-single", "unscaled", "at 66% and 25% of his shield he teleports to the middle", STRATEGIES_P1, p1Captures("phase 1 middle")),
    decidesOn: selected(
      "volley-ticks",
      "log-repeated",
      "team-7-and-8",
      "he reads his HP when a volley is due and, at or below a threshold, teleports out on that tick instead: mid-walk on W + 5, W + 10 and W + 15, and after a corner on the next walk's first tick, C + 21, in 8 of 8 corners followed by a middle; never on the blast at C + 19",
      NO_WIKI_P1_TICKS,
      ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: 13 middles"),
    ),
    teleport: selected({ hiddenAfter: span(1), inAfter: span(4) }, "log-repeated", "team-7-and-8", "the teleport out at M and in at M + 4 in 15 of 15; hidden between (inferred)", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: poses 14812 and 14813")),
    beats: selected(
      {
        first: span(8),
        every: span(8),
        count: 4,
        length: 6,
        cracks: {
          east: [{ dx: 3, dy: -2, run: { dx: 1, dy: -1 } }, { dx: 3, dy: 0, run: { dx: 1, dy: 1 } }],
          south: [{ dx: 2, dy: 1, run: { dx: 1, dy: 1 } }, { dx: 0, dy: 1, run: { dx: -1, dy: 1 } }],
          west: [{ dx: -1, dy: 0, run: { dx: -1, dy: 1 } }, { dx: -1, dy: -2, run: { dx: -1, dy: -1 } }],
          north: [{ dx: 0, dy: -3, run: { dx: -1, dy: -1 } }, { dx: 2, dy: -3, run: { dx: 1, dy: -1 } }],
        },
        closesAfter: [span(4), span(6)],
        glowAfter: [span(4), span(6)],
        explodeAfter: span(6),
      },
      "log-repeated",
      "team-7-and-8",
      "four beats at M + 8, 16, 24 and 32 in 15 of 15 middles, each facing the next side clockwise from a seeded first; a beat opens two 6-tile diagonals from the corners of the face he looks at, the first closing 4 ticks on and the other 6, glows at +4 and +6, explodes at +6 and blasts a tick later",
      STRATEGIES_P1,
      ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: charge poses at M + 8, 16, 24, 32; fights 6 to 8: beat cracks 6 tiles long, closing at B + 4 and B + 6"),
      p1Captures("phase 1 middle beats"),
    ),
    strike: selected(
      { toldAfterLastExplode: span(2), castAfterTold: span(2), flight: span(1), damage: { min: 17, max: 19 }, meterPerExtraShot: 24, lasts: span(4), texts: { one: "Death... awaits...", several: "Embrace... annihilation..." } },
      "log-repeated",
      "team-7-and-8",
      "the strike is told at M + 40, cast at M + 42 and lands at M + 43: one shot of 17 to 19 that Protect from Magic does not reduce (17, 17, 18, 19, 19, 19); the wiki's 17 to 18 for one shot, and numerous shots over 80 in all with a charged bar; one more shot per 24 of the bar is the captures' engine's guess, never logged",
      STRATEGIES_P1,
      ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8: 13 strikes, all \"Death... awaits...\"; fights 6 to 8: 6 hits under Protect from Magic"),
      p1Captures("phase 1 strike"),
    ),
    walkAfterTold: selected(span(9), "log-repeated", "team-7-and-8", "his next walk's first volley 9 ticks after the strike is told, M + 49, in 11 of 11", NO_WIKI_P1_TICKS, ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8")),
  },
  end: selected(
    { shout: { text: "You... will disappear...", lasts: span(4) }, teleportOutAfter: span(2), teleportInAfter: span(5), transformAfterLanding: span(2), transformAtMiddleAfter: span(3), phase2AfterTransform: span(7) },
    "log-repeated",
    "team-7-and-8",
    "at 0 HP he says the line at K; in the middle he transforms at K + 3 (5 kills), elsewhere he teleports out at K + 2, in at K + 5 and transforms at K + 7 (3 kills); phase 2 starts 7 ticks after the transformation in all 8",
    STRATEGIES_P1,
    ...p1Logs(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"], "fights 1 to 8"),
  ),
  presentation: {
    bossPoses: {
      idle: pose(14804, "npc_ocellus_phase1_idle", "spec-confirmed", "npc 16674's stand animation"),
      walk: pose(14805, "npc_ocellus_phase1_walk", "spec-confirmed", "npc 16674's walk animation"),
      volley: pose(14806, "npc_ocellus_phase1_basic_projectile_start", "footage-repeated", "every volley but the last of a walk"),
      lastVolley: pose(14807, "npc_ocellus_phase1_basic_projectile_end", "footage-repeated", "the last volley of a walk, or the walk's end alone"),
      charge: pose(14809, "npc_ocellus_phase1_charge", "footage-repeated", "a corner's charge and each middle beat"),
      expend: pose(14810, "npc_ocellus_phase1_expend", "footage-repeated", "the strike's cast"),
      explode: pose(14811, "npc_ocellus_phase1_explode", "footage-repeated", "the explosion before each blast"),
      teleportOut: pose(14812, "npc_ocellus_phase1_teleport_out", "footage-repeated", "leaving for the middle"),
      teleportIn: pose(14813, "npc_ocellus_phase1_teleport_in", "footage-repeated", "arriving in the middle"),
    },
    spotAnims: {
      fireOnBoss: spotAnim(4231, "vfx_ocellus_fire_attack01_spotanim", "footage-repeated", "on him as he casts a fire volley"),
      fireShot: spotAnim(4232, "vfx_ocellus_fire_attack01_projanim", "footage-repeated", "the fire volley's projectile"),
      fireImpact: spotAnim(4233, "vfx_ocellus_fire_attack01_impactanim", "footage-repeated", "on the player as a fire volley lands"),
      waterOnBoss: spotAnim(4228, "vfx_ocellus_water_attack01_spotanim", "footage-repeated", "on him as he casts a water volley"),
      waterShot: spotAnim(4229, "vfx_ocellus_water_attack01_projanim", "footage-repeated", "the water volley's projectile"),
      waterImpact: spotAnim(4230, "vfx_ocellus_water_attack01_impactanim", "footage-repeated", "on the player as a water volley lands"),
      strikeShot: spotAnim(4234, "vfx_ocellus_phase1_charge_expend_projectile", "inferred", "the strike's projectile, by its name; the logs record the hit but no projectile"),
      glow: spotAnim(4260, "vfx_ocellus_p1_charge", "footage-repeated", "the charge glow on him"),
      explodeOnBoss: spotAnim(4261, "vfx_ocellus_p1_explode_npc", "footage-repeated", "on him with the explode pose"),
      teleportOut: spotAnim(4266, "vfx_ocellus_p1_teleport_out", "footage-repeated", "on him as he teleports out"),
      teleportIn: spotAnim(4267, "vfx_ocellus_p1_teleport_in", "footage-repeated", "on him as he teleports in"),
      transform: spotAnim(
        4268,
        "vfx_ocellus_p1_to_p2_transformation",
        "inferred",
        "the end of phase 1, by its name; his transformation pose, seq 14814, is not played, because one of its frame sounds, 12819, is missing from cache 2746 and the SDK throws when the pose reaches it",
      ),
    },
    shot: selected({ startCycle: 30, nearEndCycle: 95, farEndCycle: 125, height: 0.6 }, "log-repeated", "unscaled", "the volley's projectile from 30 client cycles after the cast to its landing; its height in tiles is chosen by eye", NO_WIKI_PRESENTATION, p1Captures("phase 1 volleys"), ...p1Logs(["L3"], "fight 3: 65 and 95 cycles to land")),
    crackPieces: {
      straight: {
        north: crackPieces(4236, 4240, 4241, "north"),
        east: crackPieces(4237, 4242, 4243, "east"),
        south: crackPieces(4238, 4244, 4245, "south"),
        west: crackPieces(4239, 4246, 4247, "west"),
      },
      diagonal: {
        "north-east": crackPieces(4248, 4252, 4253, "north-east"),
        "south-east": crackPieces(4249, 4254, 4255, "south-east"),
        "south-west": crackPieces(4250, 4256, 4257, "south-west"),
        "north-west": crackPieces(4251, 4258, 4259, "north-west"),
      },
    },
    crackTiming: selected(
      { openDelay: 60, perTile: 1 },
      "log-repeated",
      "unscaled",
      "client cycles before a crack piece shows: 60 on the far tile and one more per tile toward him, so a crack grows back to him about 2 ticks after it opens; its end pieces go from the far tile with 0 and one more per tile",
      NO_WIKI_PRESENTATION,
      ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: crack spotanims with delays 60 to 67 and end pieces with 0 to 7"),
    ),
    floorExplosions: selected(
      { pieces: [4262, 4263, 4264, 4265], ringDelays: [0, 2] },
      "log-repeated",
      "unscaled",
      "the blast on each floor tile, one of four quarter turns, the nearer ring at once and the outer one 2 client cycles later; which turn is not seeded, because it is only a look",
      NO_WIKI_PRESENTATION,
      cache("spotanims 4262 to 4265 vfx_ocellus_p1_explode_floor"),
      ...p1Logs(["L6", "L7", "L8"], "fights 6 to 8: floor spotanims 4262 to 4265 with delays 0 and 2"),
    ),
    overheadIcon: selected({ archive: 440, frame: 0 }, "spec-single", "unscaled", "his Protect from Melee, drawn under his HP bar as phase 4's curse icons are", STRATEGIES_P1, cache("sprite 440 headicons_prayer frame 0")),
    chargeBar: selected({ fill: "#e8d020", background: "#3a3410", height: 4 }, "assumption", "unscaled", "his yellow bar, drawn under his HP bar and filled to his charge over 96; its look in game is not recorded", BOSS_PAGE_P1),
  },
};

export const OCELLUS_P1: P1Recipe = P1;
