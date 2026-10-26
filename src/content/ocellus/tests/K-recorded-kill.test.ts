import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import { dress } from "../js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout } from "../js/OcellusTimings";
import type { Range } from "../fight/data";
import { P3, SEQ } from "../fight/data";
import type { SpotOptions } from "../fight/effects";
import type { Fight, FightOptions, HitSpec } from "../fight/Fight";
import type { HandOver } from "../fight/handOver";
import { FightRegion } from "../fight/FightRegion";
import type { ATile, Body } from "../fight/geometry";
import { QUADRANTS, at, covers, distanceToBody, quadrantOf, quadrantTiles } from "../fight/geometry";
import { BossForm } from "../fight/units";

/**
 * Phase 3 against a RuneLite fight log of a spectated 8-raider kill, 2026-10-23 ([K] in docs/SOURCES.md).
 * Ticks in the comments are the log's.
 */

type Hit = Readonly<{ tick: number; style: HitSpec["style"] | null }>;

const SWING = SEQ.p3MeleeBasic;
const SLASH = SEQ.p3MeleeSlash;
const PANIC = SEQ.p3ProjectileAll;

describe("phase 3 follows the recorded kill [K]", () => {
  let restore: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    restore.forEach((r) => r());
    restore = [];
  });

  /** A fight that records his animations, shouts, hits on you and chat by tick; `setup` dresses you as the app does. */
  function recorded(startPhase: 3, overrides: Partial<FightOptions> = {}, setup: "ranged" | null = null) {
    Settings.readFromStorage();
    const handOvers: { tick: number; state: HandOver }[] = [];
    const options: FightOptions = {
      seed: 1, party: 1, startPhase, hazardTiles: true, videoMarkers: false, skipMarkers: false, soloVine: true, invincible: true,
      onHandOver: (state) => handOvers.push({ tick: region.fight?.tick ?? -1, state }), ...overrides,
    };
    const region = new FightRegion(options, (player) => {
      if (setup) dress(player, defaultLoadout(OCELLUS_P4.choices.setup.options[setup].value));
    });
    const trainer = new TrainerInstance(region, { force2d: true });
    trainer.mount(document.createElement("canvas"), document.createElement("div"));
    region.world.getReadyTimer = 0;
    Viewport.viewport.resize(800, 600);
    const fight = region.fight;
    if (!fight) throw new Error("the region built no fight");
    restore.push(() => trainer.dispose());

    const anims: (readonly [number, number])[] = [];
    const shouts: (readonly [number, string])[] = [];
    const hits: Hit[] = [];
    const messages: (readonly [number, string])[] = [];
    vi.spyOn(BossForm.prototype, "playAnimation").mockImplementation((id: number) => {
      anims.push([fight.tick, id]);
      return Promise.resolve();
    });
    const say = fight.say.bind(fight);
    vi.spyOn(fight, "say").mockImplementation((text: string, ticks?: number) => {
      shouts.push([fight.tick, text]);
      say(text, ticks);
    });
    const hit = fight.hit.bind(fight);
    vi.spyOn(fight, "hit").mockImplementation((spec: HitSpec) => {
      hits.push({ tick: fight.tick, style: spec.style ?? null });
      hit(spec);
    });
    const message = fight.message.bind(fight);
    vi.spyOn(fight, "message").mockImplementation((text: string, colour?: string) => {
      messages.push([fight.tick, text]);
      message(text, colour);
    });
    const spots: (readonly [number, number, ATile])[] = [];
    const spot = fight.spot.bind(fight);
    vi.spyOn(fight, "spot").mockImplementation((tile: ATile, id: number, options?: SpotOptions) => {
      spots.push([fight.tick, id, tile]);
      return spot(tile, id, options);
    });

    const boss = () => {
      if (!fight.boss) throw new Error("no boss");
      return fight.boss;
    };
    const body = (): Body => ({ sw: boss().tile, size: 3 });
    /** One tick: the fight steps at its start, then you act; anything done after it is where you end the tick. */
    const tick = () => region.world.tickWorld();
    const tickTo = (t: number, each: () => void = () => undefined) => {
      while (fight.tick < t) {
        tick();
        each();
      }
    };
    /** Stand beside his 3x3, square on, so every swing reaches you. */
    const stayInReach = () => {
      const b = boss();
      if (b.hidden || distanceToBody(body(), fight.playerTile) === 1) return;
      const sw = b.tile;
      const sides: ATile[] = [at(sw.x - 1, sw.z + 1), at(sw.x + 3, sw.z + 1), at(sw.x + 1, sw.z - 1), at(sw.x + 1, sw.z + 3)];
      const side = sides.find((t) => fight.isWalkable(t));
      if (side) fight.player.hop(side);
    };
    const from = (start: number, kinds: readonly number[]) => anims.filter(([t, id]) => t >= start && kinds.includes(id)).map(([t, id]) => [t - start, id]);
    /** His HP at a whole-number percentage of the pool. */
    const bossAt = (percent: number) => (boss().currentStats.hitpoint = Math.ceil((fight.poolMax * percent) / 100));
    const said = (text: string, start: number) => shouts.filter(([, s]) => s === text).map(([t]) => t - start);
    return { fight, boss, body, tick, tickTo, stayInReach, anims, shouts, hits, messages, spots, from, bossAt, said, handOvers };
  }

  /** Phase 3 begins on tick 0 and he lands in his first corner P3.jumpToCornerAfter later: the segment start S. */
  const S = P3.jumpToCornerAfter;

  /** The recorded lines keep going after a fall, so the player has to be off that quadrant before it goes. */
  function stepOff(fight: Fight): void {
    const here = quadrantOf(fight.playerTile);
    const next = QUADRANTS.find((q) => q !== here && !fight.destroyed.has(q));
    if (!next) throw new Error("no quadrant left to stand on");
    const tile = quadrantTiles(next).find((t) => fight.isWalkable(t));
    if (!tile) throw new Error(`no floor in ${next}`);
    fight.player.hop(tile);
  }

  test("the first quadrant: two sets, the spin, two sets, Untether, and the quadrant falls 31 ticks on", () => {
    const f = recorded(3);
    f.tickTo(S + 52, f.stayInReach);
    // His HP reaches the floor during Untether, as in [K] (75% at t541, U+11).
    f.tickTo(S + 53 + 11);
    f.bossAt(75);
    f.tickTo(S + 96);
    const kinds = [SWING, SLASH, PANIC, SEQ.p3PrayerIn, SEQ.p3PrayerLoop, SEQ.p3PrayerOut, SEQ.p3UnleashIn, SEQ.p3UnleashOut, SEQ.p3QuadrantDestroyIn, SEQ.p3UnleashOut90];
    // [K] from S = t477: 481 484 487 | 491 494 497 | spin 501, end 506 | 510 513 516 | 520 523 526 | Untether 530,
    // slam 559, "Run..." 561, 572.
    expect(f.from(S, kinds)).toEqual([
      [4, SWING], [7, SWING], [10, SLASH],
      [14, SWING], [17, SWING], [20, SLASH],
      [24, SEQ.p3PrayerIn], [29, SEQ.p3PrayerOut],
      [33, SWING], [36, SWING], [39, SLASH],
      [43, SWING], [46, SWING], [49, SLASH],
      [53, SEQ.p3UnleashIn], [82, SEQ.p3UnleashOut], [84, SEQ.p3QuadrantDestroyIn], [95, SEQ.p3UnleashOut90],
    ]);
    expect(f.said("Untether...", S)).toEqual([53]);
  });

  test("above the floor the quadrant stands: swings at U+37, then the spin, Insolence, and the spin again with a vine", () => {
    const f = recorded(3);
    const I = S + 139;
    const bands: number[] = [];
    const roll = f.fight.rng.roll.bind(f.fight.rng);
    vi.spyOn(f.fight.rng, "roll").mockImplementation((damage: Range) => {
      if (damage === P3.insolenceDamage) bands.push(f.fight.tick - I);
      return roll(damage);
    });
    f.tickTo(S + 210, f.stayInReach);
    // [K] 21:16, quadrant 1 at 91% to 85%: S U S I S U, swings again 37 after each Untether (t7902 -> t7939).
    expect(f.from(S, [SEQ.p3PrayerIn, SEQ.p3UnleashIn, SEQ.p3SuperiorSlash, SEQ.p3QuadrantDestroyIn])).toEqual([
      [24, SEQ.p3PrayerIn], [53, SEQ.p3UnleashIn], [110, SEQ.p3PrayerIn],
      [141, SEQ.p3SuperiorSlash], [146, SEQ.p3SuperiorSlash], [151, SEQ.p3SuperiorSlash],
      [179, SEQ.p3PrayerIn], [208, SEQ.p3UnleashIn],
    ]);
    expect(f.from(S + 53 + 30, [SWING])[0]).toEqual([7, SWING]);
    expect(f.said("Insolence...", S)).toEqual([139]);
    // Insolence's bands land 5, 10 and 15 on, his swings 20 on. Standing beside him you are in each band.
    expect(bands).toEqual([5, 10, 15]);
    expect(f.from(I + 16, [SWING])[0]).toEqual([4, SWING]);
    // The quadrant's 1st and 3rd spins bring the vine with his next move, not the 2nd.
    const shouts = f.shouts.filter(([, s]) => s === "The void... will take you..." || s === "Await... the void...").map(([t]) => t - S);
    expect(shouts).toEqual([33, 188]);
    expect(f.messages.filter(([, m]) => m === "You've been rooted in place!").map(([t]) => t - S)).toEqual([36, 191]);
  });

  test("a quadrant falls the tick after his HP reaches its floor, even mid-spin; the next opens with the other special", () => {
    const f = recorded(3);
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    f.tickTo(P + 6, f.stayInReach);
    // The rest of the spin goes with the quadrant.
    expect(f.from(P, [SEQ.p3PrayerOut, SEQ.p3QuadrantDestroyIn])).toEqual([[3, SEQ.p3QuadrantDestroyIn]]);
    stepOff(f.fight);
    // He lands in the next quadrant 17 ticks after it falls. A spin came last, so the other special opens it, and in a
    // later quadrant that is Insolence first, as kill 2's third quadrant and 21:16's second opened.
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2);
    f.tickTo(S2 + 26, f.stayInReach);
    expect(f.said("Insolence...", S2)).toEqual([24]);
    expect(f.from(S2, [SEQ.p3PrayerIn])).toEqual([]);
  });

  test("the vine: shouted with his first move after the quadrant's first spin, rooting you until it dies", () => {
    const f = recorded(3, { soloVine: false });
    f.tickTo(S + 49, f.stayInReach);
    // [K] kill 2: the shout with the swing on t285 (spin end + 4), the vine on t288.
    const shout = f.shouts.filter(([, s]) => s === "The void... will take you..." || s === "Await... the void...").map(([t]) => t - S);
    expect(shout).toEqual([33]);
    expect(f.messages.filter(([, m]) => m === "You've been rooted in place!").map(([t]) => t - S)).toEqual([36]);
    // No timer of its own (vines lived 7-32 ticks); with "attack your own vine" off a teammate cuts it 14 ticks on.
    expect(f.fight.player.frozen).toBeGreaterThan(0);
    f.tickTo(S + 50, f.stayInReach);
    expect(f.messages.filter(([, m]) => m === "You break free of the vine.").map(([t]) => t - S)).toEqual([50]);
    expect(f.fight.player.frozen).toBeLessThanOrEqual(0);
  });

  describe("the shadow slash: 3 wide from the ring around his body, snapped to the nearest of 8 directions [K]", () => {
    /**
     * The band marked the tick before his slash, with you `east` and `south` of his middle tile when it is aimed; each
     * tile as [east, south] of that middle.
     */
    function band(east: number, south: number): (readonly [number, number])[] {
      const f = recorded(3);
      f.tickTo(S + 8, f.stayInReach);
      const mid = at(f.boss().tile.x + 1, f.boss().tile.z + 1);
      f.fight.player.hop(at(mid.x + east, mid.z - south));
      f.tickTo(S + 9);
      return f.fight.marks().filter((m) => m.colour === 0xb01030).map((m) => [m.tile.x - mid.x, mid.z - m.tile.z] as const);
    }
    const has = (tiles: (readonly [number, number])[], e: number, s: number) => tiles.some(([x, z]) => x === e && z === s);

    test("straight: the 3 tiles in line with his body", () => {
      const south = band(1, 4);
      expect(south.length).toBeGreaterThan(6);
      expect(south.every(([e, s]) => Math.abs(e) <= 1 && s >= 2)).toBe(true);
      expect([-1, 0, 1].every((e) => has(south, e, 2))).toBe(true);
      // 4 east, 1 south of his middle is still east.
      const east = band(4, 1);
      expect(east.every(([e, s]) => Math.abs(s) <= 1 && e >= 2)).toBe(true);
      expect([-1, 0, 1].every((s) => has(east, 2, s))).toBe(true);
    });

    test("diagonal: 3 wide from his corner, outside his 3x3", () => {
      // 4 east, 2 south of his middle snaps to south-east; the room's cut corners end it early.
      const se = band(4, 2);
      expect(se.every(([e, s]) => e >= 1 && s >= 1 && Math.abs(e - s) <= 1)).toBe(true);
      expect(has(se, 2, 2) && has(se, 2, 1) && has(se, 1, 2)).toBe(true);
      expect(has(se, 1, 1) || has(se, 3, 1)).toBe(false);
    });
  });

  test("swings land on the animation tick, the shadow slash the tick after its own", () => {
    const f = recorded(3);
    f.tickTo(S + 12, f.stayInReach);
    const melee = f.hits.filter((h) => h.style === "melee").map((h) => h.tick - S);
    expect(melee).toEqual([4, 7]);
    // Standing beside him, square on, you are in the band toward you: it lands on S+11.
    expect(f.hits.filter((h) => h.style === null).map((h) => h.tick - S)).toContain(11);
  });

  test("a panic shot takes the first swing's place and the chain runs 3 ticks late", () => {
    const f = recorded(3);
    f.tickTo(S + 3, f.stayInReach);
    // Out of his reach (another quadrant) as his first move comes.
    f.fight.player.hop(at(8, 8));
    f.tickTo(S + 4);
    f.tickTo(S + 28, f.stayInReach);
    // [K]'s second quadrant from S = t578: panic 582, 588, slash 591 | 595 598 601 | spin 605.
    expect(f.from(S, [SWING, SLASH, PANIC, SEQ.p3PrayerIn])).toEqual([
      [4, PANIC], [10, SWING], [13, SLASH],
      [17, SWING], [20, SWING], [23, SLASH],
      [27, SEQ.p3PrayerIn],
    ]);
    expect(f.hits.filter((h) => h.style === "magic").map((h) => h.tick - S)).toEqual([4]);
  });

  test("the spin: each saw cuts on its loop animation, 5 + 3i in; an overhead up the tick before is severed", () => {
    const f = recorded(3);
    // Two quadrants down: three saws, as in [K]'s third quadrant.
    f.fight.destroyed.add("NW");
    f.fight.destroyed.add("NE");
    f.tickTo(S + 24, f.stayInReach);
    const P = S + 24;
    f.tickTo(P + 3, f.stayInReach);
    f.fight.player.prayerController.findPrayerByName("Protect from Melee").toggle(f.fight.player);
    f.tickTo(P + 16, f.stayInReach);
    // [K] from P = t715: loop 720, end 726, swing 730.
    expect(f.from(P, [SEQ.p3PrayerIn, SEQ.p3PrayerLoop, SEQ.p3PrayerOut, SWING])).toEqual([
      [0, SEQ.p3PrayerIn], [5, SEQ.p3PrayerLoop], [8, SEQ.p3PrayerLoop], [11, SEQ.p3PrayerOut], [15, SWING],
    ]);
    const severed = f.messages.filter(([, text]) => text.includes("severing your prayer")).map(([t]) => t - P);
    expect(severed[0]).toBe(4);
    expect(f.hits.filter((h) => h.style === "melee" && h.tick > P && h.tick < P + 12).map((h) => h.tick - P)).toEqual([5, 8, 11]);
  });

  describe("Untether: under his 3x3 by U+28, one tile out on U+29", () => {
    const U = S + 53;
    /** Where you end each tick from U+27 to U+29 (and wait until then): under him or one tile out. */
    function untether(plan: Readonly<Record<27 | 28 | 29, "under" | "out">>) {
      const f = recorded(3);
      f.tickTo(U - 1, f.stayInReach);
      f.tickTo(U + 1);
      const under = at(f.boss().tile.x + 1, f.boss().tile.z + 2);
      const out = at(f.boss().tile.x + 1, f.boss().tile.z + 3);
      // Off the bombs' voids by his side, onto clean floor.
      f.fight.player.hop(plan[27] === "under" ? under : out);
      for (const t of [27, 28, 29] as const) {
        f.tickTo(U + t);
        f.fight.player.hop(plan[t] === "under" ? under : out);
        expect(covers(f.body(), f.fight.playerTile)).toBe(plan[t] === "under");
      }
      f.tickTo(U + 31);
      return { typeless: f.hits.filter((h) => h.style === null && h.tick > U + 20).map((h) => h.tick - U), magic: f.hits.filter((h) => h.style === "magic").map((h) => h.tick - U), f };
    }

    test("the magic lands 10, 14, 18 and 22 ticks in", () => {
      // Each shot is queued 2 ticks before it lands.
      expect(untether({ 27: "under", 28: "under", 29: "out" }).magic).toEqual([8, 12, 16, 20]);
    });

    test("under by the end of 28 and out at the end of 29: nothing", () => {
      expect(untether({ 27: "under", 28: "under", 29: "out" }).typeless).toEqual([]);
    });

    test("out at the end of 28: the slam on 29", () => {
      expect(untether({ 27: "under", 28: "out", 29: "out" }).typeless).toEqual([29]);
    });

    test("still under at the end of 29: the aftershock on 30", () => {
      expect(untether({ 27: "under", 28: "under", 29: "under" }).typeless).toEqual([30]);
    });

    test("outside the whole time: only the slam, no eruption hit", () => {
      expect(untether({ 27: "out", 28: "out", 29: "out" }).typeless).toEqual([29]);
    });
  });

  test("a quadrant at its HP floor falls the next tick, cutting his set short", () => {
    const f = recorded(3);
    const slashes: number[] = [];
    const roll = f.fight.rng.roll.bind(f.fight.rng);
    vi.spyOn(f.fight.rng, "roll").mockImplementation((damage: Range) => {
      if (damage === P3.slashDamage) slashes.push(f.fight.tick - S);
      return roll(damage);
    });
    f.tickTo(S + 8, f.stayInReach);
    f.bossAt(75);
    f.tickTo(S + 14, f.stayInReach);
    // [K] 23:03: swings on t19080 and t19083, then "Obliteration..." on t19086 in place of the slash.
    expect(f.from(S, [SWING, SLASH, SEQ.p3QuadrantDestroyIn])).toEqual([[4, SWING], [7, SWING], [9, SEQ.p3QuadrantDestroyIn]]);
    // The slash's band went with it.
    expect(slashes).toEqual([]);
  });

  test("between moves, a quadrant at its HP floor falls the next tick", () => {
    const f = recorded(3);
    f.tickTo(S + 11, f.stayInReach);
    f.bossAt(75);
    f.tickTo(S + 14, f.stayInReach);
    // [K]'s third quadrant: slash 786, floor 788, "Run..." 789.
    expect(f.from(S, [SWING, SLASH, SEQ.p3QuadrantDestroyIn])).toEqual([[4, SWING], [7, SWING], [10, SLASH], [12, SEQ.p3QuadrantDestroyIn]]);
  });

  test("phase 3: a rift left alive detonates 30 ticks after it appears", () => {
    const f = recorded(3);
    const detonations: number[] = [];
    const roll = f.fight.rng.roll.bind(f.fight.rng);
    vi.spyOn(f.fight.rng, "roll").mockImplementation((damage: Range) => {
      if (damage === P3.riftDetonationDamage) detonations.push(f.fight.tick);
      return roll(damage);
    });
    // Drop the first quadrant mid-spin; rifts come 3 ticks into the next one.
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    stepOff(f.fight);
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2 + 3 + P3.riftDetonatesAfter + 1);
    // [K] 20:40: a Void Rift from t4831 detonated on t4861; 21:53: an Augmenter from t12106 on t12136.
    expect(detonations.map((t) => t - S2)).toEqual([3 + P3.riftDetonatesAfter]);
  });

  test("the third quadrant's fall hands the player, with each potion's doses, and the boss over in place of his phase 4", () => {
    const f = recorded(3, {}, "ranged");
    const fallTo = (count: number) => {
      for (let guard = 0; f.fight.destroyed.size < count; guard++) {
        if (guard > 100) throw new Error(`quadrant ${count} never fell`);
        f.tick();
        const crumbling = f.fight.floorState().crumbling;
        if (crumbling.length > 0 && quadrantOf(f.fight.playerTile) === crumbling[0]) stepOff(f.fight);
      }
    };
    for (const [floor, count] of [[75, 1], [50, 2]] as const) {
      f.tickTo(f.fight.tick + 2, f.stayInReach);
      f.bossAt(floor);
      fallTo(count);
    }
    f.tickTo(f.fight.tick + 2, f.stayInReach);
    f.bossAt(25);
    while (f.fight.floorState().crumbling.length === 0) f.tick();
    const crumbleStart = f.fight.tick;
    const left = QUADRANTS.filter((q) => !f.fight.destroyed.has(q) && !f.fight.floorState().crumbling.includes(q));
    expect(left).toHaveLength(1);
    const standing = quadrantTiles(left[0]).find((t) => f.fight.isWalkable(t));
    if (!standing) throw new Error(`no floor left in ${left[0]}`);
    f.fight.player.hop(standing);
    f.fight.player.prayerController.findPrayerByName("Protect from Range").toggle(f.fight.player);
    f.fight.player.inventory[12].inventoryLeftClick(f.fight.player);
    expect(f.handOvers).toEqual([]);
    fallTo(3);

    // The third quadrant crumbles from tick 40 and falls 13 ticks later, at 53. The hand-over is that tick, the phase 4 drill's tick 0, with him hidden.
    expect([crumbleStart, f.handOvers.map(({ tick }) => tick), f.fight.boss?.hidden]).toEqual([40, [53], true]);
    expect(f.handOvers).toHaveLength(1);
    const [{ state: { player, boss } }] = f.handOvers;
    // 25% of the 5,250 pool, rounded up, is the third quadrant's floor.
    expect(boss).toEqual({ hp: 1313, defence: 250 });
    expect(player.tile).toEqual(standing);
    expect(player.prayers).toEqual(["Protect from Range"]);
    expect(player.equipment).toEqual({
      weapon: "Twisted Bow", offhand: null, helmet: "Masori mask (f)", necklace: "Necklace of rupture", chest: "Masori body (f)", legs: "Masori chaps (f)",
      feet: "Avernic treads (max)", gloves: "Zaryte Vambraces", ring: "Venator ring", cape: "Dizana's Quiver", ammo: "Dragon arrow",
    });
    expect(player.inventory.slice(0, 2)).toEqual([{ name: "Tonalztics of Ralos", doses: null }, { name: "Scythe of Vitur", doses: null }]);
    expect(player.inventory.slice(9, 14)).toEqual([
      { name: "Super combat potion", doses: 4 }, { name: "Bastion Potion", doses: 4 }, { name: "Saradomin Brew", doses: 4 },
      { name: "Super Restore", doses: 3 }, { name: "Super combat potion", doses: 4 },
    ]);
    expect([player.hp, player.specialEnergy, player.runEnergy, player.levels]).toEqual([99, 100, 10000, { attack: 99, strength: 99, defence: 99, range: 99, magic: 99 }]);
    f.tickTo(f.fight.tick + 10);
    expect([f.fight.label(), f.handOvers.length]).toEqual(["Phase 3", 1]);
  });
});
