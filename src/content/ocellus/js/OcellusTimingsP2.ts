import type { TickSpan, Tile } from "../../../sim/brands";
import { span, tile } from "../../../sim/brands";
import type { Basis } from "../../../sim/provenance";
import { noWiki, wiki } from "../../../sim/provenance";
import type { Arm } from "./P2Types";
import type { AmmunitionClass, DamageRange, FightLog, Selected, Source } from "./OcellusTimings";
import { DEFENCE_REDUCTION_TABLE, HOTFIX_NEWS, NO_WIKI_PRACTICE, NO_WIKI_PRESENTATION, PORTAL_SKIP_GUIDE, RSPROX_PLAN, analysis, cache, fightLog, guide, selected } from "./OcellusTimings";

const STRATEGIES_P2 = wiki("https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies", 15381236);
const BOSS_PAGE_P2 = wiki("https://oldschool.runescape.wiki/w/Ocellus", 15381233);
const NO_WIKI_P2_TICKS = noWiki("the wiki's phase 2 text gives the order of the portals, pools and floor portal but no tick counts (Strategies rev 15381236, Ocellus rev 15381233)");
const NO_WIKI_P2_ARENA = noWiki("the wiki has no tile layout of the phase 2 portals (Strategies rev 15381236, Ocellus rev 15381233)");
/** The logs with phase marks, so P2 +0 is the tick each enters phase 2: the two 8-raider kills and three 7-raider raids. */
const P2_KILLS = ["L1", "L2"] as const satisfies readonly FightLog[];
const P2_RAIDS = ["L6", "L7", "L8"] as const satisfies readonly FightLog[];
const P2_PHASE_2S = [...P2_KILLS, ...P2_RAIDS] as const;
const inLogs = (logs: readonly FightLog[], at: string): readonly Source[] => logs.map((log) => fightLog(log, at));
const P2_LOGS = inLogs(P2_PHASE_2S, "phase 2, P2 +0 to +131");
const P2_VOLLEY_HITS = inLogs(P2_PHASE_2S, "phase 2's volley ticks: 108 volley hitsplats across four of these five; every hit on the volley tick was 1 to 5 tiles from its portal's row or column, every hit a tick later 6 to 10, and the one two ticks later 12");
const P2_BOSS_BAR = inLogs(P2_PHASE_2S, "phase 2: Ocellus's bar holds at 100% from P2 +7 and drops only at +46, +88 and +124, by one hit each time");
const p2Pose = (id: number, name: string, basis: Basis, note: string, ...seen: readonly Source[]): Selected<number> =>
  selected(id, basis, "unscaled", note, NO_WIKI_PRESENTATION, cache(`seq ${id} ${name}`), ...seen);
const p2SpotAnim = (id: number, name: string, note: string, ...seen: readonly Source[]): Selected<number> =>
  selected(id, "log-repeated", "team-7-and-8", note, NO_WIKI_PRESENTATION, cache(`spotanim ${id} ${name}`), ...seen);

type P2BossPose = "transform" | "idle" | "enough";
type P2SpotAnim =
  | "transform"
  | "portalBolt"
  | "pool"
  | "safePortalSpawn"
  | "safePortalIdle"
  | "safePortalDespawn"
  | "swordRepair"
  | "discharge"
  | "swordDrop"
  | "swordRootFire"
  | "armDrop"
  | "armGlow"
  | "swordDropBurst";
type PortalLook = Readonly<{ model: number; idle: number }>;
type P2Shout = Readonly<{ text: string; lasts: TickSpan }>;

type P2Recipe = Readonly<{
  arena: Readonly<{ middle: Selected<Tile>; playerSpawn: Selected<Tile>; bossAnchor: Selected<Tile> }>;
  ocellusNpcId: Selected<number>;
  blade: Readonly<{
    name: Selected<string>;
    combatLevel: Selected<number>;
    stats: Selected<Readonly<{ attack: number; strength: number; defence: number; range: number; magic: number }>>;
    defenceBonuses: Selected<Readonly<{ stab: number; slash: number; crush: number; magic: number }>>;
    rangedDefence: Selected<Readonly<Record<AmmunitionClass, number>>>;
    lowestDefencePercent: Selected<number>;
    releasedPercent: Selected<number>;
  }>;
  timeline: Readonly<{
    portalsRise: Selected<TickSpan>;
    bladeWakes: Selected<TickSpan>;
    rounds: Selected<readonly [TickSpan, TickSpan, TickSpan]>;
    enough: Selected<TickSpan>;
    swordFalls: Selected<TickSpan>;
    phaseEnds: Selected<TickSpan>;
  }>;
  round: Readonly<{
    lightings: Selected<Readonly<{ count: number; every: TickSpan; fireAfter: TickSpan }>>;
    poolsForm: Selected<TickSpan>;
    allLight: Selected<TickSpan>;
    safePortal: Selected<Readonly<{ opens: TickSpan; takesFrom: TickSpan; takesUntil: TickSpan; closes: TickSpan }>>;
    allFire: Selected<TickSpan>;
    discharge: Selected<TickSpan>;
    release: Selected<TickSpan>;
  }>;
  portals: Readonly<{
    perArm: Selected<number>;
    gapDrift: Selected<number>;
    gapIndexSum: Selected<number>;
    rotation: Selected<Readonly<Record<Arm, number>>>;
    looks: Selected<Readonly<{ inactive: PortalLook; lit: PortalLook }>>;
  }>;
  volley: Readonly<{ cyclesPerTile: Selected<Readonly<{ lit: number; all: number }>>; damage: Selected<DamageRange> }>;
  pools: Readonly<{ count: Selected<number>; burst: Selected<Readonly<{ afterForming: TickSpan; damage: DamageRange }>> }>;
  escape: Selected<"turned-into-next-wedge">;
  shouts: Readonly<{ bladeWakes: Selected<P2Shout>; enough: Selected<P2Shout> }>;
  swordRepair: Selected<Readonly<{ first: TickSpan; every: TickSpan }>>;
  bossPoses: Readonly<Record<P2BossPose, Selected<number>>>;
  spotAnims: Readonly<Record<P2SpotAnim, Selected<number>>>;
  skipTiles: Selected<Readonly<{ wait: number; run: number; colour: string }>>;
}>;

const P2: P2Recipe = {
  arena: {
    middle: selected(tile(15, 13), "spec-single", "unscaled", "the middle of the 3-wide cross on the phase 3 grid, cache (31, 41), where The Blade stands and the four wedges turn onto each other; the phase 2 room is that grid's floor without the strip south of the cross's 12th tile, past the last portal", NO_WIKI_P2_ARENA, cache("map square 16472 plane 1: floor overlay 657")),
    playerSpawn: selected(tile(19, 9), "assumption", "unscaled", "4 tiles east and 4 north of the middle, inside the north-east wedge, where the first round then fires; no recording shows where a solo phase 2 starts", NO_WIKI_P2_ARENA, ...inLogs(P2_KILLS, "P2 +15: the team stands within a tile of 4 east, 4 north when the first volley fires")),
    bossAnchor: selected(tile(14, 14), "log-repeated", "team-7-and-8", "south-west tile of The Blade's 3x3, which covers x 14 to 16 and y 12 to 14, centred on the middle", NO_WIKI_P2_ARENA, ...inLogs(["L2", ...P2_RAIDS], "P2 +7: NPC 16676 appears at 1 west, 1 south of the middle")),
  },
  ocellusNpcId: selected(16675, "inferred", "unscaled", "the unnamed Ocellus form with the sword, model 62670, idle 14839, not interactable; the transformation 14837 at P2 +0 and the drop 14878 at +123 play on the form in the middle while The Blade, NPC 16676, takes the hits", NO_WIKI_PRESENTATION, cache("npc 16675 tfa_ocellus_p2"), ...P2_LOGS),
  blade: {
    name: selected("The Blade", "spec-confirmed", "team-7-and-8", "NPC 16676, the sword's hitbox on the middle 3x3 that players attack from P2 +7 until it leaves at +123; the cache name without its cyan colour tags", BOSS_PAGE_P2, cache("npc 16676 tfa_ocellus_p2_sword_hitbox, name <col=00ffff>The Blade</col>"), ...P2_LOGS),
    combatLevel: selected(0, "spec-confirmed", "unscaled", "the cache level; the infobox's 0 agrees", BOSS_PAGE_P2, cache("npc 16676 combat level")),
    stats: selected({ attack: 1, strength: 1, defence: 250, range: 1, magic: 220 }, "spec-confirmed", "unscaled", "The Blade never attacks; its 1000 hitpoints never fall, because it stores the damage instead (Strategies), so the trainer draws Ocellus's health on it", BOSS_PAGE_P2, cache("npc 16676 stats [1, 250, 1, 1000, 1, 220]")),
    defenceBonuses: selected({ stab: 150, slash: 120, crush: 10, magic: 100 }, "spec-confirmed", "unscaled", "cache params 5 to 8 match the infobox's phase 2 column; the Strategies page calls crush his weakest style", BOSS_PAGE_P2, STRATEGIES_P2, cache("npc 16676 params 5, 6, 7, 8")),
    rangedDefence: selected({ light: 100, standard: 110, heavy: 80 }, "spec-single", "unscaled", "the infobox's phase 2 column; the cache decode has no ranged defence param; heavy is the Strategies page's second weakness", BOSS_PAGE_P2, STRATEGIES_P2),
    lowestDefencePercent: selected(0, "inferred", "unscaled", "the 21 October hotfix stops Ocellus's Defence at 60% of his level; The Blade is a separate NPC and is drained to 0 (inferred)", DEFENCE_REDUCTION_TABLE, HOTFIX_NEWS),
    releasedPercent: selected(
      50,
      "spec-single",
      "team-7-and-8",
      "The Blade stores all damage dealt to it and releases half of it, rounded down (inferred), onto Ocellus's health at the end of each quadrant; the logs show the release as one hit on his bar at each round's end, from 196 to 646 on teams of 7 and 8, and nothing in between",
      STRATEGIES_P2, ...P2_BOSS_BAR,
    ),
  },
  timeline: {
    portalsRise: selected(span(2), "community-tested", "unscaled", "the 24 portals stand on the arms 2 ticks into the phase, before the first lighting at 11", NO_WIKI_P2_TICKS, analysis(RSPROX_PLAN, "phase 2: portals")),
    bladeWakes: selected(span(7), "log-repeated", "team-7-and-8", "\"Your time... comes...\" and The Blade's arrival, from which it can be attacked", NO_WIKI_P2_TICKS, ...P2_LOGS, ...P2_BOSS_BAR),
    rounds: selected([span(11), span(53), span(95)], "log-repeated", "team-7-and-8", "each round's first lighting; the first volleys follow at +15, +57 and +99 in all five", NO_WIKI_P2_TICKS, ...P2_LOGS),
    enough: selected(span(123), "log-repeated", "team-7-and-8", "\"This... is enough...\": The Blade leaves, the drop animation 14878 starts and the sword falls on the middle", NO_WIKI_P2_TICKS, ...P2_LOGS),
    swordFalls: selected(span(124), "log-repeated", "team-7-and-8", "the sword's burst 4388 on the middle and The Blade's last release, a tick after \"This... is enough...\"", NO_WIKI_P2_TICKS, ...P2_LOGS, ...P2_BOSS_BAR),
    phaseEnds: selected(span(131), "log-repeated", "team-7-and-8", "phase 3 starts 131 ticks after phase 2 in all five, whatever The Blade took", NO_WIKI_P2_TICKS, ...P2_LOGS),
  },
  round: {
    lightings: selected(
      { count: 6, every: span(5), fireAfter: span(4) },
      "log-repeated",
      "team-7-and-8",
      "ten of the twelve portals on the round's two arms light every 5 ticks from the round's start, 6 times, and fire 4 ticks after lighting; the last round's sixth lighting, at +120, still fires at +124, after \"This... is enough...\", and hit 3 raiders in two logs",
      STRATEGIES_P2, ...P2_LOGS, ...inLogs(P2_PHASE_2S, "P2 +124 and +125: ten bolts at +124 and hits on raiders at +124 and +125, in three of these five"),
    ),
    poolsForm: selected(span(28), "log-repeated", "team-7-and-8", "purple pools, 4270, on the round's wedge 28 ticks into rounds 1 and 2, sent once each; none in round 3", STRATEGIES_P2, BOSS_PAGE_P2, ...P2_LOGS),
    allLight: selected(span(31), "community-tested", "unscaled", "all twelve portals of the round's arms turn purple 3 ticks after the pools, ahead of the volley at +40", BOSS_PAGE_P2, analysis(RSPROX_PLAN, "phase 2: portal rounds")),
    safePortal: selected(
      { opens: span(33), takesFrom: span(34), takesUntil: span(39), closes: span(40) },
      "log-repeated",
      "team-7-and-8",
      "the orange floor portal forms on one of the pools at +33 (4271), idles from +34 to +39 (4272) and closes at +40 (4273), as all twelve fire; standing on it while it idles takes the player to the next wedge (inferred from its idle window)",
      STRATEGIES_P2, BOSS_PAGE_P2, ...P2_LOGS,
    ),
    allFire: selected(span(40), "log-repeated", "team-7-and-8", "all twelve portals fire across the whole wedge as the floor portal closes", BOSS_PAGE_P2, ...P2_LOGS),
    discharge: selected(span(34), "log-repeated", "team-7-and-8", "spotanim 4305 on the boss at +34 in rounds 1 and 2", NO_WIKI_P2_TICKS, ...P2_LOGS),
    release: selected(span(35), "log-repeated", "team-7-and-8", "The Blade's stored damage reaches Ocellus's bar a tick after the discharge, at +46 and +88; the third release comes as the sword falls at +124", STRATEGIES_P2, ...P2_BOSS_BAR),
  },
  portals: {
    perArm: selected(6, "log-repeated", "team-7-and-8", "each arm's 12 tiles from the middle carry six 2-tile portals; ten bolts per lighting, from the round's two arms less one gap each", STRATEGIES_P2, cache("locs 62684 tfa_ocellus_quadrant_wall_inactive and 62685 tfa_ocellus_quadrant_wall_active, 2x1"), ...P2_LOGS),
    gapDrift: selected(2, "inferred", "unscaled", "each lighting moves an arm's gap by up to 2 portals; the logs' gaps moved by 0 or 2 from one lighting to the next", NO_WIKI_P2_ARENA, ...inLogs(P2_KILLS, "P2 +15 to +20: in one of the two kills, the north arm's gap went from portal 1 to 3, the east arm's stayed on 1")),
    gapIndexSum: selected(7, "inferred", "unscaled", "the two gaps' rows cross on the safe 2x2, whose inner tile is (2h + 1, 2g + 1) from the middle; the octagon's cut corners keep it in the room only while g + h <= 7", NO_WIKI_P2_ARENA, cache("map square 16472 plane 1: floor overlay 657")),
    rotation: selected({ north: 3, east: 0, south: 1, west: 2 }, "community-tested", "unscaled", "each arm's portal loc rotation in quarter turns", NO_WIKI_PRESENTATION, analysis(RSPROX_PLAN, "phase 2: portal locs")),
    looks: selected(
      { inactive: { model: 62758, idle: 14830 }, lit: { model: 62757, idle: 14830 } },
      "spec-confirmed",
      "unscaled",
      "orange while idle or a gap, purple while lit to fire: locs 62684 and 62685, one model each, both looping 14830 vfx_ocellus_p2_portal_idle",
      STRATEGIES_P2, cache("loc 62684 Portal: model 62758, animation 14830"), cache("loc 62685 Portal: model 62757, animation 14830"),
    ),
  },
  volley: {
    cyclesPerTile: selected(
      { lit: 6, all: 5 },
      "community-tested",
      "team-7-and-8",
      "a volley is over the tile d out at speed × (d - 1) client cycles, 30 to a tick, and hits a player who starts that tick there; tiles 1 to 5 out take it on the firing tick, 6 to 10 a tick later and 11 and 12 the tick after, which the logs' hits match; the all-twelve volley flies at 5",
      NO_WIKI_P2_TICKS, analysis(RSPROX_PLAN, "phase 2: volley flight"), ...P2_VOLLEY_HITS,
    ),
    damage: selected<DamageRange>({ min: 18, max: 27 }, "log-repeated", "team-7-and-8", "typeless: 18 to 27 on raiders with no overhead and under Protect from Magic or Missiles alike; the packet analysis gave 19 to 25", NO_WIKI_P2_TICKS, ...P2_VOLLEY_HITS, analysis(RSPROX_PLAN, "phase 2: damage")),
  },
  pools: {
    count: selected(13, "log-repeated", "team-7-and-8", "13 pools on the round's wedge and its two arm strips, never on a wall or The Blade's 3x3", NO_WIKI_P2_ARENA, ...P2_LOGS),
    burst: selected(
      { afterForming: span(4), damage: { min: 30, max: 31 } },
      "footage-once",
      "team-7-and-8",
      "a pool is an area to dodge (its gameval name): its spotanim plays once and bursts 4 ticks in; in a raid of 7, the two raiders standing on pools then took 30 and 31, and nobody took pool damage on the ticks before or after; the packet analysis's 3 to 5 a tick does not appear in any log",
      BOSS_PAGE_P2, ...inLogs(P2_RAIDS, "P2 +81 to +85: in one of the three raids, pools at +81 and hits of 30 and 31 on the two pool tiles at +85"), analysis(RSPROX_PLAN, "phase 2: pools"),
    ),
  },
  escape: selected("turned-into-next-wedge", "inferred", "team-7-and-8", "the floor portal takes the player to its own tile turned a quarter clockwise about the middle, in the next wedge, where the next round fires; the logs place no one on the tick of a portal jump; in three of eight escapes the team's next logged positions, 6 to 11 ticks later, sit within 2 tiles of that turned tile, and a random tile of the next wedge fits the other five as well", STRATEGIES_P2, BOSS_PAGE_P2, ...P2_LOGS),
  shouts: {
    bladeWakes: selected({ text: "Your time... comes...", lasts: span(3) }, "log-repeated", "team-7-and-8", "overhead text as The Blade appears; the logs give the tick it is said, and it stays up 3 ticks like phase 4's \"End...\" (inferred)", NO_WIKI_P2_TICKS, ...P2_LOGS),
    enough: selected({ text: "This... is enough...", lasts: span(3) }, "log-repeated", "team-7-and-8", "overhead text as The Blade leaves; up 3 ticks like phase 4's \"End...\" (inferred)", NO_WIKI_P2_TICKS, ...P2_LOGS),
  },
  swordRepair: selected({ first: span(1), every: span(3) }, "log-repeated", "team-7-and-8", "spotanim 4304 on the middle every 3 ticks until \"This... is enough...\"; it runs on a clock of its own, from P2 +0, +1 or +2", NO_WIKI_PRESENTATION, ...P2_LOGS),
  bossPoses: {
    transform: p2Pose(14837, "npc_ocellus_phase2_transformation", "log-repeated", "the change into phase 2 at P2 +0", ...P2_LOGS),
    idle: p2Pose(14839, "npc_ocellus_phase2_idle", "spec-confirmed", "NPC 16675's stand animation"),
    enough: p2Pose(14878, "npc_ocellus_p2_to_p3_part1", "log-repeated", "the drop at \"This... is enough...\"", ...P2_LOGS),
  },
  spotAnims: {
    transform: p2SpotAnim(4268, "vfx_ocellus_p1_to_p2_transformation", "on the boss at P2 +0", ...P2_LOGS),
    portalBolt: p2SpotAnim(4269, "vfx_ocellus_portal_projectile", "each lit portal's bolt across its rows", ...P2_LOGS),
    pool: p2SpotAnim(4270, "vfx_ocellus_p2_aoe_dodge", "the purple pools, sent once: seq 14887 plays 180 client cycles, 6 ticks, through the burst 4 ticks in", ...P2_LOGS),
    safePortalSpawn: p2SpotAnim(4271, "vfx_ocellus_p2_safe_portal_spawn", "the floor portal forming", ...P2_LOGS),
    safePortalIdle: p2SpotAnim(4272, "vfx_ocellus_p2_safe_portal_idle", "the floor portal, sent each tick it stays", ...P2_LOGS),
    safePortalDespawn: p2SpotAnim(4273, "vfx_ocellus_p2_safe_portal_despawn", "the floor portal closing", ...P2_LOGS),
    swordRepair: p2SpotAnim(4304, "vfx_ocellus_sword_repair_particles_01", "on the middle every 3 ticks", ...P2_LOGS),
    discharge: p2SpotAnim(4305, "vfx_ocellus_p2_sword_discharge", "on the boss before each release", ...P2_LOGS),
    swordDrop: p2SpotAnim(4280, "vfx_ocellus_sword_drop", "on the middle at \"This... is enough...\"", ...P2_LOGS),
    swordRootFire: p2SpotAnim(4281, "vfx_ocellus_sword_root_fire", "on the boss at \"This... is enough...\"", ...P2_LOGS),
    armDrop: p2SpotAnim(4282, "vfx_ocellus_p2_to_p3_arm01", "on the boss at \"This... is enough...\"", ...P2_LOGS),
    armGlow: p2SpotAnim(4283, "vfx_ocellus_p2_to_p3_arm_glow01", "on the boss at \"This... is enough...\"", ...P2_LOGS),
    swordDropBurst: p2SpotAnim(4388, "tfa_arena_sword_drop_explosion", "on the middle as the sword falls", ...P2_LOGS),
  },
  skipTiles: selected(
    { wait: 6, run: 4, colour: "#ff3de0" },
    "community-tested",
    "team-7-and-8",
    "the portal skip: wait 6 tiles out on the wedge's diagonal and click 4 out one tick before each volley; the wave is judged on the tile a tick starts on, so it is over 6 out a tick after the volley and over 4 out on the volley tick, and misses both; one raider did it 71 times in three raids and took no volley hit; the marker pink is deeper than the community markers' #F5B1F7 so it shows on the pale floor",
    NO_WIKI_PRACTICE, guide(PORTAL_SKIP_GUIDE, "the method: wait 6 out diagonally, click 4 out one tick before each volley"),
    ...inLogs(P2_RAIDS, "phase 2's volley ticks: one raider 6 out diagonally the tick before 71 volleys across the three raids and 4 out on each volley tick, with no volley hit"),
  ),
};

export const OCELLUS_P2: P2Recipe = P2;
