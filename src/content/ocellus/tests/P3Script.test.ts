import { SEQ } from "../full/data/looks";
import { P3 } from "../full/data/p3";
import { Potion } from "osrs-sdk";
import { QUADRANTS, at, covers, quadrantOf } from "../fight/geometry";
import { S, startP3 } from "./p3run";

const SWING = SEQ.p3MeleeBasic;
const SLASH = SEQ.p3MeleeSlash;
const PANIC = SEQ.p3ProjectileAll;
const VINE_SHOUTS = ["The void... will take you...", "Await... the void..."];

describe("phase 3 on the engine follows the recorded kill [K]", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  function open(...args: Parameters<typeof startP3>) {
    const run = startP3(...args);
    close = run.close;
    return run;
  }

  test("the first quadrant: two sets, the spin, two sets, Untether, and the quadrant falls 31 ticks on", () => {
    const f = open();
    f.tickTo(S + 52, f.stayInReach);
    f.tickTo(S + 53 + 11);
    f.bossAt(75);
    f.tickTo(S + 96);
    const kinds = [SWING, SLASH, PANIC, SEQ.p3PrayerIn, SEQ.p3PrayerLoop, SEQ.p3PrayerOut, SEQ.p3UnleashIn, SEQ.p3UnleashOut, SEQ.p3QuadrantDestroyIn, SEQ.p3UnleashOut90];
    // [K] from S = t477: 481 484 487 | 491 494 497 | spin 501, end 506 | 510 513 516 | 520 523 526 | Untether 530, slam 559, "Run..." 561, 572.
    expect(f.anims(S, kinds)).toEqual([
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
    const f = open();
    const I = S + 139;
    f.tickTo(S + 210, f.stayInReach);
    // [K] 21:16, quadrant 1 at 91% to 85%: S U S I S U, swings again 37 after each Untether.
    expect(f.anims(S, [SEQ.p3PrayerIn, SEQ.p3UnleashIn, SEQ.p3SuperiorSlash, SEQ.p3QuadrantDestroyIn])).toEqual([
      [24, SEQ.p3PrayerIn], [53, SEQ.p3UnleashIn], [110, SEQ.p3PrayerIn],
      [141, SEQ.p3SuperiorSlash], [146, SEQ.p3SuperiorSlash], [151, SEQ.p3SuperiorSlash],
      [179, SEQ.p3PrayerIn], [208, SEQ.p3UnleashIn],
    ]);
    expect(f.anims(S + 53 + 30, [SWING])[0]).toEqual([7, SWING]);
    expect(f.said("Insolence...", S)).toEqual([139]);
    // Insolence's bands land 5, 10 and 15 on, his swings 20 on. Standing beside him you are in each band.
    expect(f.landed(["superior-slash"], I)).toEqual([[5, "superior-slash"], [10, "superior-slash"], [15, "superior-slash"]]);
    expect(f.anims(I + 16, [SWING])[0]).toEqual([4, SWING]);
    // The quadrant's 1st and 3rd spins bring the vine with his next move, not the 2nd.
    expect(VINE_SHOUTS.flatMap((text) => f.said(text, S)).sort((a, b) => a - b)).toEqual([33, 188]);
    expect(f.chat("You've been rooted in place!", S)).toEqual([36, 191]);
  });

  test("a quadrant falls the tick after his HP reaches its floor, even mid-spin; the next opens with the other special", () => {
    const f = open();
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    f.tickTo(P + 6, f.stayInReach);
    expect(f.anims(P, [SEQ.p3PrayerOut, SEQ.p3QuadrantDestroyIn])).toEqual([[3, SEQ.p3QuadrantDestroyIn]]);
    f.stepOff();
    // He lands in the next quadrant 17 ticks after it falls. A spin came last, so the other special opens it: Insolence.
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2);
    f.tickTo(S2 + 26, f.stayInReach);
    expect(f.said("Insolence...", S2)).toEqual([24]);
    expect(f.anims(S2, [SEQ.p3PrayerIn])).toEqual([]);
  });

  test("the vine: shouted with his first move after the quadrant's first spin, rooting you until a teammate cuts it", () => {
    const f = open({ soloVine: false });
    f.tickTo(S + 49, f.stayInReach);
    // [K] kill 2: the shout with the swing on t285 (spin end + 4), the vine on t288.
    expect(VINE_SHOUTS.flatMap((text) => f.said(text, S))).toEqual([33]);
    expect(f.chat("You've been rooted in place!", S)).toEqual([36]);
    expect(f.player().frozen).toBeGreaterThan(0);
    f.tickTo(S + 50, f.stayInReach);
    expect(f.chat("You break free of the vine.", S)).toEqual([50]);
    expect(f.player().frozen).toBeLessThanOrEqual(0);
  });

  describe("the shadow slash: 3 wide from the ring around his body, snapped to the nearest of 8 directions [K]", () => {
    /** The band shown the tick before his slash, with you `east` and `south` of his middle tile; each tile as [east, south] of that middle. */
    function band(east: number, south: number): (readonly [number, number])[] {
      const f = open();
      f.tickTo(S + 8, f.stayInReach);
      const mid = at(f.live().boss.tile.x + 1, f.live().boss.tile.z + 1);
      f.player().hop(at(mid.x + east, mid.z - south));
      f.tickTo(S + 9);
      const shown = f.looks("danger").filter(([t, look]) => t === S + 9 && look.role === "slash");
      close?.();
      close = null;
      return shown.flatMap(([, look]) => look.tiles.map((t) => [t.x - mid.x, mid.z - t.z] as const));
    }
    const has = (tiles: (readonly [number, number])[], e: number, s: number) => tiles.some(([x, z]) => x === e && z === s);

    test("straight: the 3 tiles in line with his body", () => {
      const south = band(1, 4);
      expect(south.length).toBeGreaterThan(6);
      expect(south.every(([e, s]) => Math.abs(e) <= 1 && s >= 2)).toBe(true);
      expect([-1, 0, 1].every((e) => has(south, e, 2))).toBe(true);
      const east = band(4, 1);
      expect(east.every(([e, s]) => Math.abs(s) <= 1 && e >= 2)).toBe(true);
      expect([-1, 0, 1].every((s) => has(east, 2, s))).toBe(true);
    });

    test("diagonal: 3 wide from his corner, outside his 3x3", () => {
      const se = band(4, 2);
      expect(se.every(([e, s]) => e >= 1 && s >= 1 && Math.abs(e - s) <= 1)).toBe(true);
      expect(has(se, 2, 2) && has(se, 2, 1) && has(se, 1, 2)).toBe(true);
      expect(has(se, 1, 1) || has(se, 3, 1)).toBe(false);
    });
  });

  test("swings land on the animation tick, the shadow slash the tick after its own", () => {
    const f = open();
    f.tickTo(S + 12, f.stayInReach);
    expect(f.landed(["swing", "slash"], S)).toEqual([[4, "swing"], [7, "swing"], [11, "slash"]]);
  });

  test("a panic shot takes the first swing's place and the chain runs 3 ticks late", () => {
    const f = open();
    f.tickTo(S + 3, f.stayInReach);
    f.player().hop(at(8, 8));
    f.tickTo(S + 4);
    f.tickTo(S + 28, f.stayInReach);
    // [K]'s second quadrant from S = t578: panic 582, 588, slash 591 | 595 598 601 | spin 605.
    expect(f.anims(S, [SWING, SLASH, PANIC, SEQ.p3PrayerIn])).toEqual([
      [4, PANIC], [10, SWING], [13, SLASH],
      [17, SWING], [20, SWING], [23, SLASH],
      [27, SEQ.p3PrayerIn],
    ]);
    expect(f.landed(["panic"], S)).toEqual([[4 + P3.panicLands, "panic"]]);
  });

  test("the spin: each saw cuts on its loop animation, 5 + 3i in; an overhead up the tick before is severed", () => {
    const f = open();
    const P = S + 24;
    f.tickTo(0);
    f.live().arena.destroy("NW");
    f.live().arena.destroy("NE");
    f.tickTo(P + 3, f.stayInReach);
    f.player().prayerController.findPrayerByName("Protect from Melee").toggle(f.player());
    f.tickTo(P + 16, f.stayInReach);
    // [K] from P = t715: loop 720, end 726, swing 730.
    expect(f.anims(P, [SEQ.p3PrayerIn, SEQ.p3PrayerLoop, SEQ.p3PrayerOut, SWING])).toEqual([
      [0, SEQ.p3PrayerIn], [5, SEQ.p3PrayerLoop], [8, SEQ.p3PrayerLoop], [11, SEQ.p3PrayerOut], [15, SWING],
    ]);
    expect(f.chat("Ocellus disrupts your concentration, severing your prayer!", P)[0]).toBe(4);
    // Fight logs L1 to L8: an opening hit 1 tick in on every spin, then each saw's cut.
    expect(f.landed(["spin-opening", "saw"], P).filter(([t]) => t < 12)).toEqual([[1, "spin-opening"], [5, "saw"], [8, "saw"], [11, "saw"]]);
    // Fight log L2, P = t276: 4325 with the spin, 4327 for its one saw at t279, 2 ticks before the cut.
    const spots = f.events().flatMap(([t, e]) => (e.kind === "boss-changed" && e.change.kind === "spotanim" && e.change.channel === "spin" ? [[t - P, e.change.id]] : []));
    expect(spots).toEqual([[0, 4325], [3, 4326], [6, 4326], [9, 4327]]);
  });

  test("each void bomb shows over you 5 ticks before it drops, then on its tile 2 before", () => {
    const f = open();
    f.tickTo(S + 10);
    const here = f.here();
    // Fight log L2, S = t252: 4302 over the raider at S+1, 4299 at S+2, 4299 on the floor at S+4, the drop at S+6.
    expect(f.looks("player-spot").filter(([, look]) => look.channel === "bomb").map(([t, look]) => [t - S, look.id])).toEqual([[1, 4302], [2, 4299], [4, 4302], [5, 4299]]);
    expect(f.looks("bomb-shown").filter(([, look]) => look.tile.x === here.x && look.tile.z === here.z).map(([t]) => t - S)).toEqual([4, 7]);
  });

  describe("Untether: under his 3x3 by U+28, one tile out on U+29", () => {
    const U = S + 53;
    function untether(plan: Readonly<Record<27 | 28 | 29, "under" | "out">>) {
      const f = open();
      f.tickTo(U - 1, f.stayInReach);
      f.tickTo(U + 1);
      const sw = f.live().boss.tile;
      const under = at(sw.x + 1, sw.z + 2);
      const out = at(sw.x + 1, sw.z + 3);
      f.player().hop(plan[27] === "under" ? under : out);
      for (const t of [27, 28, 29] as const) {
        f.tickTo(U + t);
        f.player().hop(plan[t] === "under" ? under : out);
        expect(covers(f.body(), f.here())).toBe(plan[t] === "under");
      }
      f.tickTo(U + 31);
      return { slams: f.landed(["slam", "aftershock"], U), magic: f.landed(["untether-magic"], U).map(([t]) => t), f, out };
    }

    test("the magic lands 10, 14, 18 and 22 ticks in", () => {
      expect(untether({ 27: "under", 28: "under", 29: "out" }).magic).toEqual([10, 14, 18, 22]);
    });

    test("under by the end of 28 and out at the end of 29: nothing", () => {
      expect(untether({ 27: "under", 28: "under", 29: "out" }).slams).toEqual([]);
    });

    test("out at the end of 28: the slam on 29", () => {
      expect(untether({ 27: "under", 28: "out", 29: "out" }).slams).toEqual([[29, "slam"]]);
    });

    test("still under at the end of 29: the aftershock on 30", () => {
      expect(untether({ 27: "under", 28: "under", 29: "under" }).slams).toEqual([[30, "aftershock"]]);
    });

    test("outside the whole time: only the slam, no eruption hit", () => {
      expect(untether({ 27: "out", 28: "out", 29: "out" }).slams).toEqual([[29, "slam"]]);
    });

    test("a pool splashes under you with each shot from the second wave, and pools never hit", () => {
      const { f, out } = untether({ 27: "out", 28: "out", 29: "out" });
      // Fight logs L1, L2, L6 to L8: a 4270 under every raider at U+10, U+14 and U+18; hits only from the magic.
      expect(f.looks("pools").filter(([t, look]) => t > U && look.tiles.some((p) => p.x === out.x && p.z === out.z)).map(([t]) => t - U)).toEqual([10, 14, 18]);
      expect(f.landed(["swing", "panic", "slash", "bomb", "debris", "void-patch", "untether-magic"], U).filter(([t]) => t > 1 && t < 27)).toEqual([
        [10, "untether-magic"], [14, "untether-magic"], [18, "untether-magic"], [22, "untether-magic"],
      ]);
    });
  });

  test("a quadrant at its HP floor falls the next tick, cutting his set short", () => {
    const f = open();
    f.tickTo(S + 8, f.stayInReach);
    f.bossAt(75);
    f.tickTo(S + 14, f.stayInReach);
    // [K] 23:03: swings on t19080 and t19083, then "Obliteration..." on t19086 in place of the slash.
    expect(f.anims(S, [SWING, SLASH, SEQ.p3QuadrantDestroyIn])).toEqual([[4, SWING], [7, SWING], [9, SEQ.p3QuadrantDestroyIn]]);
    expect(f.landed(["slash"], S)).toEqual([]);
    expect(f.landed(["swing"], S)).toEqual([[4, "swing"], [7, "swing"]]);
  });

  test("between moves, a quadrant at its HP floor falls the next tick", () => {
    const f = open();
    f.tickTo(S + 11, f.stayInReach);
    f.bossAt(75);
    f.tickTo(S + 14, f.stayInReach);
    // [K]'s third quadrant: slash 786, floor 788, "Run..." 789.
    expect(f.anims(S, [SWING, SLASH, SEQ.p3QuadrantDestroyIn])).toEqual([[4, SWING], [7, SWING], [10, SLASH], [12, SEQ.p3QuadrantDestroyIn]]);
  });

  test("a rift left alive detonates 30 ticks after it appears", () => {
    const f = open();
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    f.stepOff();
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2 + 3 + P3.riftDetonatesAfter + 1);
    // [K] 20:40: a Void Rift from t4831 detonated on t4861; 21:53: an Augmenter from t12106 on t12136.
    expect(f.landed(["rift-detonation"], S2)).toEqual([[3 + P3.riftDetonatesAfter, "rift-detonation"]]);
  });

  test("the third quadrant's fall enters our phase 4 in the same world with the player as it stands, each potion's doses included, and the boss", () => {
    const f = open({ setup: "ranged" });
    const fallTo = (count: number) => {
      for (let guard = 0; f.live().arena.destroyed.size < count; guard++) {
        if (guard > 100) throw new Error(`quadrant ${count} never fell`);
        f.tickOnce();
        if (f.region.current !== "p3") return;
        const crumbling = f.live().arena.floorState().crumbling;
        if (crumbling.length > 0 && quadrantOf(f.here()) === crumbling[0]) f.stepOff();
      }
    };
    for (const [floor, count] of [[75, 1], [50, 2]] as const) {
      f.tickTo(f.now() + 2, f.stayInReach);
      f.bossAt(floor);
      fallTo(count);
    }
    f.tickTo(f.now() + 2, f.stayInReach);
    f.bossAt(25);
    while (f.live().arena.floorState().crumbling.length === 0) f.tickOnce();
    const crumbleStart = f.now();
    const left = QUADRANTS.filter((q) => !f.live().arena.destroyed.has(q) && !f.live().arena.floorState().crumbling.includes(q));
    expect(left).toHaveLength(1);
    const standing = f.standOn(left[0]);
    const you = f.player();
    you.prayerController.findPrayerByName("Protect from Range").toggle(you);
    you.inventory[12].inventoryLeftClick(you);
    expect(f.region.current).toBe("p3");
    fallTo(3);

    // The third quadrant crumbles from tick 40 and falls 13 ticks later, at 53, P4's tick 0, with him hidden. P4 runs from the next world tick.
    const fell = f.events().flatMap(([t, e]) => (e.kind === "quadrant-fell" ? [t] : []));
    const hidden = f.events().flatMap(([t, e]) => (e.kind === "boss-changed" && e.change.kind === "shown" && !e.change.visible ? [t] : []));
    expect([crumbleStart, fell.at(-1), hidden.at(-1), f.region.current]).toEqual([40, 53, 53, "p4"]);
    const p4 = f.region.p4.mounted;
    if (!p4) throw new Error("P4 did not mount");
    const player = p4.player;
    // 25% of the 5,250 pool, rounded up, is the third quadrant's floor.
    expect({ hp: p4.ocellus.currentStats.hitpoint, defence: p4.ocellus.currentStats.defence }).toEqual({ hp: 1313, defence: 250 });
    expect(player === you).toBe(true);
    expect(f.here()).toEqual(standing);
    expect(player.prayerController.activePrayers().map((prayer) => prayer.name)).toEqual(["Protect from Range"]);
    const slots = ["weapon", "offhand", "helmet", "necklace", "chest", "legs", "feet", "gloves", "ring", "cape", "ammo"] as const;
    expect(Object.fromEntries(slots.map((slot) => [slot, player.equipment[slot]?.itemName ?? null]))).toEqual({
      weapon: "Twisted Bow", offhand: null, helmet: "Masori mask (f)", necklace: "Necklace of rupture", chest: "Masori body (f)", legs: "Masori chaps (f)",
      feet: "Avernic treads (max)", gloves: "Zaryte Vambraces", ring: "Venator ring", cape: "Dizana's Quiver", ammo: "Dragon arrow",
    });
    const carried = (index: number) => {
      const item = player.inventory[index];
      return item ? { name: item.itemName, doses: item instanceof Potion ? item.doses : null } : null;
    };
    expect([0, 1].map(carried)).toEqual([{ name: "Tonalztics of Ralos", doses: null }, { name: "Scythe of Vitur", doses: null }]);
    expect([9, 10, 11, 12, 13].map(carried)).toEqual([
      { name: "Super combat potion", doses: 4 }, { name: "Bastion Potion", doses: 4 }, { name: "Saradomin Brew", doses: 4 },
      { name: "Super Restore", doses: 3 }, { name: "Super combat potion", doses: 4 },
    ]);
    const { currentStats: stats } = player;
    expect([stats.hitpoint, stats.specialAttack, stats.run, { attack: stats.attack, strength: stats.strength, defence: stats.defence, range: stats.range, magic: stats.magic }]).toEqual([
      99, 100, 10000, { attack: 99, strength: 99, defence: 99, range: 99, magic: 99 },
    ]);
    for (let world = 0; world < 10; world++) f.tickOnce();
    expect([f.now(), f.region.p3.mounted, f.region.rows("p4").map((row) => row.tick)]).toEqual([53, null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
  });
});
