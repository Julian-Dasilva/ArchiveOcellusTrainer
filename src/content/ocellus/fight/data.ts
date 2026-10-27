/**
 * Every id, timing and damage range the full fight uses, in one place.
 *
 * Sources (see docs/SOURCES.md):
 *  [R] RSProx tick analysis of six recorded fights, MRobertEvers/oldschool-clientc
 *      docs/rsprox-analysis/guthixian_archive/ocellus_plan.md (2026-10-21)
 *  [W] OSRS Wiki, Ocellus and The Fractured Archive/Strategies (2026-10-21)
 *  [G] RuneLite gameval AnimationID / SpotanimID / NpcID (cache 241)
 *  [V] ShadowStalkerTM, "Duo The Fractured Archive", youtube.com/watch?v=HAgq_qg0OIY (12:17 kill)
 *  [K] a RuneLite fight log of a spectated 8-raider kill, 2026-10-23: every anim, floor
 *      spotanim and projectile, every raider's hitsplats with their overhead, and positions around Untether, by tick
 * Ticks are 600 ms game ticks unless marked cc (20 ms client cycles).
 */

export type Range = Readonly<{ min: number; max: number }>;
const range = (min: number, max: number): Range => ({ min, max });

/** [G] NpcID */
export const NPC = {
  hoodedFigure: 16673,
  p1: 16674,
  p2: 16675,
  blade: 16676,
  p3: 16677,
  riftBasic: 16678,
  riftHeal: 16679,
  riftBuff: 16680,
  vine: 16681,
} as const;

/** [G] AnimationID (seq) */
export const SEQ = {
  p1Idle: 14804,
  p1Walk: 14805,
  p1VolleyStart: 14806,
  p1VolleyEnd: 14807,
  p1Charge: 14809,
  p1Expend: 14810,
  p1Explode: 14811,
  p1TeleportOut: 14812,
  p1TeleportIn: 14813,
  p1Transformation: 14814,
  p2Transformation: 14837,
  p2Idle: 14839,
  p2ToP3Part1: 14878,
  p2ToP3Part2: 14881,
  p3Idle: 14840,
  p3IdleHigh: 14841,
  p3MeleeBasic: 14842,
  p3MeleeHybrid: 14844,
  p3MeleePrayer: 14845,
  p3MeleeSlash: 14846,
  p3SuperiorSlash: 14848,
  p3Walk: 14849,
  p3ProjectileAll: 14851,
  p3SoulFragmentStart: 14855,
  p3SoulFragmentEnd: 14856,
  p3UnleashIn: 14857,
  p3UnleashLoop: 14858,
  p3QuadrantDestroyIn: 14859,
  p3QuadrantDestroyLoop: 14860,
  p3UnleashOut: 14861,
  p3UnleashOut90: 14862,
  p3DeflectIn: 14863,
  p3DeflectLoop: 14864,
  p3DeflectOut: 14865,
  p3PrayerIn: 14869,
  p3PrayerLoop: 14870,
  p3PrayerOut: 14871,
  p3Death: 14872,
} as const;

/**
 * [G] ObjectID tfa_ocellus_quadrant_wall_inactive (62684) and _active (62685), phase 2's portals. Read from cache 2746:
 * one model each, both looping seq 14830 (vfx_ocellus_p2_portal_idle), 2x1 tiles.
 */
export const PORTAL = {
  inactiveModel: 62758,
  activeModel: 62757,
  idle: 14830,
} as const;

/**
 * [G] ObjectID phase 3's floor hazards, read from cache 2746 (each a 1x1 loc with a type 10 and a type 22 model):
 * tfa_ocellus_void_degen_bomb "Void" (62701), _void_degen_aoe "Debris" (62702), _aoe_insolence_1 "Cracks" (62703).
 */
export const VOID_LOC = {
  bomb: { models: [62507, 62508], idle: 14891 },
  aoe: { models: [62687, 62688], idle: 14936 },
  insolence: { models: [62682, 62683], idle: 14930 },
} as const;
export type VoidLocKind = keyof typeof VOID_LOC;

/** [G] SpotanimID */
export const SPOT = {
  fireOnBoss: 4231,
  fireProjectile: 4232,
  fireImpact: 4233,
  waterOnBoss: 4228,
  waterProjectile: 4229,
  waterImpact: 4230,
  expendProjectile: 4234,
  strikeProjectile: 4235,
  crackStraightStart: [4236, 4237, 4238, 4239],
  crackStraight: [4240, 4242, 4244, 4246],
  crackStraightEnd: [4241, 4243, 4245, 4247],
  crackDiagonalStart: [4248, 4249, 4250, 4251],
  crackDiagonal: [4252, 4254, 4256, 4258],
  crackDiagonalEnd: [4253, 4255, 4257, 4259],
  p1Charge: 4260,
  p1ExplodeOnBoss: 4261,
  p1ExplodeFloor: [4262, 4263, 4264, 4265],
  p1TeleportOut: 4266,
  p1TeleportIn: 4267,
  p1ToP2: 4268,
  portalProjectile: 4269,
  p2Pool: 4270,
  safePortalSpawn: 4271,
  safePortalIdle: 4272,
  safePortalDespawn: 4273,
  death: 4274,
  deathSkirt: 4275,
  deathCrack: 4276,
  swordIdle: 4278,
  swordIdle2: 4279,
  swordDrop: 4280,
  swordRootFire: 4281,
  p2ToP3Arm: 4282,
  p2ToP3ArmGlow: 4283,
  entangleStart: 4290,
  entangleIdle: 4291,
  entangleEnd: 4292,
  magicImpact: 4293,
  magicOnBoss: 4294,
  magicProjectile: 4297,
  bombIdle: 4299,
  bombImpact: 4300,
  bombDrop: 4301,
  bombSpawn: 4302,
  healingFlare: 4303,
  swordRepair: 4304,
  swordDischarge: 4305,
  soulFragmentSpawn6: 4309,
  soulFragmentIdle: 4310,
  soulFragmentSpawn12: 4311,
  soulFragmentDespawn: 4312,
  soulFragmentPlayer: 4313,
  soulFragmentRegain: 4314,
  levitating: 4316,
  unleashArena: [4317, 4318, 4319, 4320],
  unleashOnBoss: 4321,
  deflectWind: 4322,
  slashDegen: 4323,
  meleePrayerIn: 4325,
  meleePrayer: 4326,
  meleePrayerOut: 4327,
  hybridMelee: 4328,
  hybridMagic: 4329,
  hybridRanged: 4330,
  collapseIn: 4331,
  collapseLoop: 4332,
  collapseOut1: 4333,
  collapseOut2: 4334,
  shadowSlash: 4335,
  superiorSlash: 4336,
  voidChainExplosion: 4339,
  voidChainTelegraph: 4340,
  glowZaros: 4341,
  glowBandos: 4342,
  glowSaradomin: 4343,
  glowArmadyl: 4344,
  fallingDebris: 4346,
  debrisIdle: 4347,
  swordDropExplosion: 4388,
  collapsingExplosion: [4390, 4391, 4392, 4393],
} as const;

/** Sounds the server sends on its own (the rest ride on the seqs and spotanims above). */
export const SOUND = {
  crackClosed: [12512, 12513],
  swordDischarge: 4428,
  swordDropBoom: 444,
  heal: 5281,
  explosionSeriesStart: 12638,
  explosionMark: 12537,
  meleeTell: 12572,
  meleeHit: 12567,
  rangedBeforeHit: 12555,
  rangedHit: 12556,
  magicWindUp: 12554,
} as const;

/**
 * The 21 October hotfix: Defence reduction stops at 60% of his level (phase 1: 129 of 215, phase 3: 150 of 250);
 * The Blade has no floor. [W] Out Today news and The Fractured Archive/Strategies, via ArchiveOcellusTrainer #17;
 * rounding up is inferred.
 */
export const LOWEST_DEFENCE_FRACTION = 0.6;

/** [R] RAID_PLAN.md: HP = base x multiplier, rounded to 10. Solo uses the duo scale. */
export const PARTY_SCALE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 1.45, 4: 1.87, 5: 2.29 };
export const scaledHp = (base: number, party: number): number => Math.round((base * (PARTY_SCALE[party] ?? 1)) / 10) * 10;

export const P1 = {
  hp: 2500,
  combatLevel: 1121,
  /** Phase 1 holds Protect from Melee while walking. [R] */
  defence: 215,
  defenceBonuses: { stab: 150, slash: 95, crush: 60, magic: 100, range: 135 },
  startWalkAfter: 4,
  volleyEvery: 5,
  /** Shots land 30 -> 95 cc within 4 tiles and 30 -> 125 cc beyond. [R] */
  volleyLand: { near: 3, far: 4, nearWithin: 4 },
  volleyDamage: range(1, 25),
  elementSwitchChance: 14 / 65,
  /** Corner script, from the charge C. [R] */
  linesEvery: 2,
  lineCount: 7,
  lineClosesAfter: 5,
  chargeVfxFrom: 5,
  shoutAt: 15,
  explodeAt: 18,
  blastAt: 19,
  walkOnAt: 21,
  shouts: ["Pointless...", "You... fail...", "Unworthy..."],
  blastRadius: 2,
  blastDamage: range(28, 30),
  /**
   * Standing on a crack as it closes blocks it and heals you: +16, +9, +13 on the blocker in [V] duo 13:31-13:35;
   * "it'll heal all of the chip damage" (Bubba OSRS guide 1:21). [R]'s 3-5 every 2 ticks on blockers matches a burn
   * left over from the room before ("You have been set alight!"), not the cracks.
   */
  blockHeal: range(9, 16),
  meterPerLine: 2,
  healPerLine: 2,
  meterMax: 96,
  /** Middle phase at 66% and a quarter. [R] */
  thresholds: [0.66, 0.25],
  teleportInAfter: 4,
  firstBeatAfter: 8,
  beatEvery: 8,
  beats: 4,
  beatLineLength: 6,
  /**
   * A beat's two lines appear together on the beat tick; the first in turn order closes after 4, the other after 6
   * ([K] second kill: 4258 and 4252 at +36, closing at +40 and +42). Corner cracks close after 5.
   */
  beatLineCloses: [4, 6],
  beatExplodeAfter: 6,
  strikeShoutAfterLastExplode: 2,
  strikeHeal: range(4, 8),
  strikeHitAfterShout: 3,
  strikeDamage: range(17, 19),
  /** One more shot per 24 of meter (unverified past 10 of 96: never recorded). [R] */
  meterPerExtraShot: 24,
  walkOnAfterShout: 8,
  /** Next corner: anticlockwise 10, clockwise 3, across 6 of 19 recorded. [R] */
  routeWeights: { anticlockwise: 10, clockwise: 3, across: 6 },
  cornerLineLength: 9,
  transformAfterLanding: 3,
  p2After: 7,
} as const;

export const P2 = {
  hp: 5250,
  bladeDefence: 250,
  bladeDefenceBonuses: { stab: 150, slash: 120, crush: 10, magic: 100, range: 110 },
  portalsAt: 2,
  bladeAt: 7,
  rounds: [11, 53, 95],
  enough: 123,
  wallsFall: 127,
  p3At: 131,
  /** Within a round R: [R] */
  lightEvery: 5,
  lightTimes: 6,
  fireAfterLight: 4,
  poolsAt: 28,
  poolCount: 13,
  allLitAt: 31,
  safePortalAt: 33,
  safePortalUntil: 39,
  allFireAt: 40,
  lineDamage: range(19, 25),
  /**
   * A volley lands on the tile d out from its portal at speed x d - speed client cycles (30 to a tick): 6 for the
   * lit portals, 5 for the all-twelve volley. [R] Each tile is judged on the tick the volley is over it, so running
   * through the wave skips it, as with the Wardens' skulls in Tombs of Amascut. [O] J R V's "Ocellus P2 Portal Skip"
   * (youtube c4PSUxjNUiY): stand 6 out diagonally, click 4 out one tick before the volley.
   */
  lineCyclesPerTile: 6,
  crossfireCyclesPerTile: 5,
  /** The skip's tiles, out along each quadrant's diagonal. A deeper pink than the RuneLite markers' #F5B1F7, which an
   * outline alone loses on the pale floor. */
  skipStandOut: 6,
  skipRunOut: 4,
  skipMarkerColour: "#FF3DE0",
  poolDamage: range(3, 5),
} as const;

const NO_TICKS: readonly number[] = [];

export const P3 = {
  combatLevel: 1601,
  defence: 250,
  defenceBonuses: { stab: 150, slash: 100, crush: 30, magic: 200, range: 250 },
  jumpToCornerAfter: 6,
  /**
   * His attacks are a chain, each move timed from the one before, not a clock from the segment start. Two swings 3
   * ticks apart, the shadow slash 3 after the second, and his next move 4 after the slash. After two such sets comes a
   * special. "Your panic... is futile..." (nobody in his reach) takes a swing's place, and the next move comes 6 ticks
   * after it, so the rest of the chain runs 3 ticks late. [K], which reproduces [R]'s fixed segment timelines.
   */
  firstMove: 4,
  swingGap: 3,
  afterPanic: 6,
  afterSlash: 4,
  setsPerSpecial: 2,
  /**
   * His specials, the same in eight recorded fights: the spin alternates with another special through the whole phase,
   * carrying on across quadrant falls. The other one alternates Untether and Insolence within a quadrant, Untether first
   * in the first quadrant and Insolence first in later ones. His HP plays no part (Untether at 91%, 85%, 63%). [K]
   * e.g. S U S I S U S I S | fall | I S U S I ... and S U S I | fall | S I S U S | fall | I S U ...
   * On the segment's own clock from its start S: void bombs (when they drop) and the rifts. [R] [K]
   */
  first: { firstOther: "untether", bombs: [6, 9], rifts: NO_TICKS },
  later: { firstOther: "insolence", bombs: [6], rifts: [3, 51, 111] },
  /** Swings hit everyone near him on the animation tick: 1-7 through Protect from Melee. [R] [K] */
  basicHitProtected: range(1, 7),
  basicHitUnprotected: range(12, 19),
  /**
   * The shadow slash lands the tick after its animation, on a band aimed at his tank (solo: you) and snapped to the
   * nearest of 8 directions from his middle tile: 3 wide from the ring touching his body to the platform's edge. [K]
   * 111 bands in six fights
   */
  slashLands: 1,
  slashDamage: range(25, 28),
  /** Insolence's bands: 3 wide, to the platform edge, at any angle. [V] duo 20:24, Bubba OSRS guide 4:56 [W] [K] */
  waveWidth: 3,
  /**
   * The spin: saw i cuts 5 + 3i ticks in, on the tick its loop animation (the last saw's: the end animation) plays; an
   * overhead up on the tick before is severed. His next move comes 4 ticks after the last cut. [K] [V]
   */
  sawFirstCut: 5,
  sawEvery: 3,
  /** Each saw's spotanim (4326, the last saw's 4327) shows on him 2 ticks before its cut. Every spin in fight logs L2, L6 to L8. */
  sawShowsBefore: 2,
  afterSpin: 4,
  spinDamage: range(15, 27),
  /** A melee hit on everyone 1 tick into the spin, 0 through Protect from Melee. Every spin in fight logs L1 to L8. */
  spinOpens: 1,
  spinOpeningDamage: range(0, 18),
  /** "Severing your prayer!" locks protection prayers this long: back on 3 ticks later in [V] duo 18:53-18:55. */
  severTicks: 3,
  panicLands: 2,
  volleyDamage: range(20, 26),
  patchDamage: range(6, 7),
  /** A void hurts whoever stands on it every second tick from the tick it dropped. */
  patchEvery: 2,
  patchLasts: range(21, 51),
  /**
   * Void bombs fall on every raider but the tank (solo: you), and on the same tile turned into each other standing
   * quadrant. Their voids stay until the quadrant falls, so the last quadrant's carry into phase 4. [R] [M] 8:55
   * Each shows over its raider first (spotanim 4302 5 ticks before it drops, 4299 a tick later), then on its floor
   * tile (4299) 2 ticks before it drops. [K]; every bombed segment in fight logs L2, L6 to L8
   */
  bombOverheadBefore: 5,
  bombDropAfter: 2,
  bombDamage: range(6, 11),
  /**
   * Rubble over each raider during the spin, 3 ticks in (first segment) or 6 (later); it falls 5 ticks on and leaves
   * a void patch. [R] [M] 7:20. The damage is a guess (nobody stood under it in [R]): the bomb's.
   */
  debrisIntoSpin: { first: 3, later: 6 },
  debrisFalls: 5,
  debrisDamage: range(6, 11),
  vineHp: 44,
  /**
   * "The void... will take you..." comes with his first move after a quadrant's 1st and 3rd spins (13 of 15 first
   * spins and 5 of 5 third ones in eight fights; never an even one, rarely a later odd one), and the vine roots its
   * target where they stand 3 ticks later. [K]
   */
  vineAfterSpins: [1, 3],
  vineRootsAfter: 3,
  /**
   * It holds its target until it dies: vines lived 7-32 ticks, median 14, and nobody took a hit for leaving one ([K];
   * [R] and [W] had 14 ticks, then 50). With "attack your own vine" off, a teammate cuts yours at the median.
   */
  vineCutByTeammate: 14,
  /**
   * "Insolence...": superior slashes animate 2, 7 and 12 ticks on, each landing 3 after its animation, and his swings
   * resume 20 ticks after the shout. [K] Damage: [R] 39-41, [K] 38, 43 and 46.
   */
  insolenceFirst: 2,
  insolenceSlashes: 3,
  insolenceEvery: 5,
  insolenceLands: 3,
  afterInsolence: 20,
  insolenceDamage: range(38, 46),
  insolenceDebrisLasts: 16,
  riftHp: 44,
  /**
   * A rift left alive detonates 30 ticks after it appears (its detonate animation, a flare on raiders and a hit on the
   * same tick; gone 2 later), in all 3 of [K]'s unkilled rifts; 56 others died to raiders 4-30 ticks in. Phase 3's
   * hits: 39 (a Void Rift) and 40, 40, 41 (a Void Augmenter); one raider took 18 under Protect from Magic. [K]
   */
  riftDetonatesAfter: 30,
  riftDetonationDamage: range(39, 41),
  /** Killing a Void Augmenter: Attack and Strength to 116, Magic and Ranged to 112, from 99s. [W] Void Augmenter */
  augmenterBoost: { melee: 17, rangedMagic: 13 },
  healRiftEvery: 4,
  healRiftHeal: [12, 14],
  /** Untether, from U. [R] [W] [K] */
  untether: {
    /**
     * Pools (spotanim 4270) splash in waves; from the second, one lands under each raider as the magic hits them. They
     * never hit: through all 15 Untethers in fight logs L1, L2, L6 to L8, raiders take hits only on the magic's ticks.
     */
    pools: [6, 10, 14, 18],
    poolsPerWave: range(10, 15),
    /**
     * Magic at everyone lands with each pool wave after the first: "pray mage, he'll mage you constantly" [M] 4:37;
     * zeros through Protect from Magic on every raider in [K] and [R].
     */
    magic: [10, 14, 18, 22],
    magicFlight: 2,
    magicDamage: range(20, 28),
    unleashVfx: 18,
    /** The arena flares under him. No hit comes with it. [K] */
    erupt: 25,
    /**
     * The slam hits whoever is not under his 3x3 at the end of the tick before it; the aftershock a tick later hits
     * whoever is still under him. So be under him by the end of U+28 and one tile out at the end of U+29. [K]: 36 on the
     * one raider outside, then 21 and 41 on the two still under. [M] 5:00: "step out is tick perfect".
     */
    slam: 29,
    slamDamage: range(34, 39),
    aftershock: 30,
    aftershockDamage: range(18, 41),
    obliteration: 31,
    /** With his HP above the floor the quadrant stands and his swings resume. [K] */
    swingsAgain: 37,
    escapeLine: 42,
    gone: 44,
    nextSegment: 48,
  },
  /**
   * The quadrant falls the tick after his whole-number HP% is down to 75 / 50 / 25 (the sim holds him there), Untether
   * or not, cutting short whatever he is doing ([K] 23:03: "Obliteration..." on the tick of a set's slash). His bar
   * reads the same at the floor and just above it, so the tick the floor came is not on the record. During Untether it
   * waits for U+31. [W] [O] [V] [K]
   */
  hpFloors: [0.75, 0.5, 0.25],
  jumpTicks: 2,
} as const;

export const P4 = {
  /**
   * "End..." 1 tick into the phase, then a 60-tick cycle from his first Deflect, 4 ticks in. He takes hits from 3 ticks
   * in, so he is back with the shout. [K] (was 5 and 8 from [R] [T])
   */
  hiddenFor: 1,
  shoutAt: 1,
  firstCycleAt: 4,
  cycle: 60,
  innerVoid: { from: 0, until: 22 },
  outerVoid: { from: 31, until: 51 },
  winds: [4, 35],
  /** Ready 16 and 42 ticks into the cycle: the first raiders took theirs back then, in both of [K]'s cycles. */
  orbReadyAfterWind: [12, 7],
  orbExpiresAfterReady: 13,
  orbFirstTickBonus: 8,
  explosionMarks: [
    [9, 11, 13, 15, 17, 19],
    [40, 42, 44, 46, 48, 50],
  ],
  explosionDamage: range(14, 16),
  /** A mark that explodes a tile from you resets your attack timer: 2-tick attacks with any weapon. [M] 12:50 */
  explosionResetReach: 1,
  hybrids: [24, 52],
  hybridHitAfter: 5,
  hybridProtected: range(5, 10),
  hybridUnprotected: range(43, 50),
  floorDamage: range(9, 11),
  floorGraceInner: 2,
  floorGraceOuter: 5,
  /**
   * Rifts detonate 30 ticks after they appear unless killed, as in phase 3 (P3.riftDetonatesAfter); [K]'s one
   * phase 4 detonation hit its raider for 3 twice. [T]'s charge (14, 11 ticks after they appear) is the next cycle's
   * first explosion, which lands at +10; upstream's later 23 ticks was an estimate.
   */
  riftsAt: 59,
  riftDetonationHits: [3, 3],
  /** Overheads: Deflect Melee in the inner void, Soul Split around hybrids, Deflect Range in the outer void. */
  overheads: [
    { from: 0, to: 25, overhead: "deflect-melee" },
    { from: 25, to: 30, overhead: "soul-split" },
    { from: 31, to: 53, overhead: "deflect-range" },
    { from: 53, to: 59, overhead: "soul-split" },
  ],
} as const;

export type BossOverhead = "protect-melee" | "deflect-melee" | "deflect-range" | "soul-split";

/** [G] His Protect from Melee overhead: sprite 440 (headicons_prayer), frame 0. */
export const PROTECT_MELEE_ICON = { archive: 440, frame: 0 } as const;
