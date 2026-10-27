import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { Fight, StartPhase } from "../fight/Fight";
import type { Quadrant } from "../fight/geometry";
import { QUADRANTS, at, quadrantOf, quadrantTiles, toSdk } from "../fight/geometry";
import { carriedEntry, quadrantFrame } from "../full/fall";
import type { FightRegion, FullFightOptions } from "../full/prefix";
import { fullFightStaged } from "../full/prefix";
import { dress } from "../js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout, fullFightConfig } from "../js/OcellusTimings";
import type { LingeringVoid } from "../js/P4Types";
import type { P4Entry, P4Watch } from "../js/p4/phase";
import { p4Phase } from "../js/p4/phase";
import { seed, span, tile } from "../../../sim/brands";
import { toRoom } from "../../../sim/frame";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import { fence } from "../../../sim/sdk/fence";

type Tiles = readonly Readonly<{ x: number; y: number }>[];
const PLATFORM = OCELLUS_P4.geometry.platform.value.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === "#" ? [tile(x, y)] : [])));
const sorted = (tiles: Tiles) => tiles.map(({ x, y }) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

let close: (() => void) | null = null;
afterEach(() => {
  close?.();
  close = null;
});

function fullFight(startPhase: StartPhase, setup: "melee" | null = null) {
  Settings.readFromStorage();
  const options: FullFightOptions = { seed: 1, party: 1, startPhase, hazardTiles: false, videoMarkers: false, skipMarkers: false, soloVine: true, invincible: true };
  const region = fullFightStaged(options, (player) => {
    if (setup) dress(player, defaultLoadout(OCELLUS_P4.choices.setup.options[setup].value));
  });
  const trainer = new TrainerInstance(region, { force2d: true });
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.getReadyTimer = 0;
  Viewport.viewport.resize(800, 600);
  close = () => trainer.dispose();
  const fight = region.fight;
  if (!fight) throw new Error("the region built no fight");
  return { region, fight };
}

/** Standing on a quadrant when it falls kills the player, so leave each one as it crumbles. */
function stepOff(fight: Fight): void {
  const here = quadrantOf(fight.playerTile);
  const next = QUADRANTS.find((q) => q !== here && !fight.destroyed.has(q));
  if (!next) throw new Error("no quadrant left to stand on");
  const floor = quadrantTiles(next).find((t) => fight.isWalkable(t));
  if (!floor) throw new Error(`no floor in ${next}`);
  fight.player.hop(floor);
}

/** Phases 1 to 3 at speed: each pool drops to its floor at once, and the player leaves every crumbling quadrant. Returns the fall's world tick. */
function toThirdFall(region: FightRegion, fight: Fight, each: () => void = () => undefined): number {
  for (let step = 0; step < 2500; step++) {
    region.world.tickWorld();
    if (region.current === "p4") return region.world.globalTickCounter;
    each();
    const boss = fight.boss;
    const label = fight.label();
    if (boss && label === "Phase 1" && boss.form === "p1" && boss.currentStats.hitpoint > 0) boss.currentStats.hitpoint = 0;
    const floor = fight.phase?.hpFloor() ?? 0;
    if (boss && label === "Phase 3" && boss.currentStats.hitpoint > floor) boss.currentStats.hitpoint = floor;
    const crumbling = fight.floorState().crumbling;
    if (crumbling.length > 0 && quadrantOf(fight.playerTile) === crumbling[0]) stepOff(fight);
  }
  throw new Error("phase 3 never fell into P4");
}

function mountedP4(region: FightRegion) {
  const p4 = region.p4.mounted;
  if (!p4) throw new Error("P4 did not mount");
  return p4;
}

describe("the third fall enters P4 in the same world", () => {
  test("seed 1 runs from phase 1 to P4's kill, and P4's section logs a deflected hit's reflection", () => {
    const { region, fight } = fullFight(1, "melee");
    const labels: string[] = [];
    toThirdFall(region, fight, () => {
      const label = fight.label();
      if (label !== "" && labels[labels.length - 1] !== label) labels.push(label);
    });
    const { ocellus, player } = mountedP4(region);
    const reflected = () => region.rows("p4").some((row) => row.events.some((event) => event.kind === "deflect-reflected"));
    for (let step = 0; step < 3000 && ocellus.runState().kind !== "ended"; step++) {
      if (!player.aggro && ocellus.canBeAttacked()) player.setAggro(ocellus);
      // A player who neither prays nor takes the orbs loses ground to his heals, so once a hit has been deflected the next landed hit is the kill.
      if (reflected() && ocellus.currentStats.hitpoint > 1) ocellus.currentStats.hitpoint = 1;
      region.world.tickWorld();
    }
    expect({
      labels,
      phases: region.sections().map((section) => section.phase),
      run: ocellus.runState().kind,
      end: region.rows("p4").flatMap((row) => row.events.flatMap((event) => (event.kind === "run-ended" ? [event.reason] : []))),
      reflected: reflected(),
    }).toEqual({ labels: ["Phase 1", "Phase 2", "Phase 3"], phases: ["prefix", "p4"], run: "ended", end: ["kill"], reflected: true });
  }, 120000);

  test("P4 opens on the next world tick with no GET READY, and the boss is hidden for the 4 ticks from the fall", () => {
    const { region, fight } = fullFight(3);
    const shown: boolean[] = [];
    const bossShown = () => (region.current === "p4" ? mountedP4(region).ocellus.visible() : fight.boss?.visible() === true);
    const fellAt = toThirdFall(region, fight, () => {
      shown.splice(0, shown.length, bossShown());
    });
    shown.push(bossShown());
    for (let world = 0; world < 5; world++) {
      region.world.tickWorld();
      shown.push(bossShown());
    }
    const [first] = region.rows("p4");
    expect({ getReady: region.world.getReadyTimer, firstRow: first && [first.tick, first.worldTick - fellAt], shown }).toEqual({
      getReady: 0,
      firstRow: [1, 1],
      shown: [true, false, false, false, false, true, true],
    });
  });

  test("phase 3's timers, mobs and entities stay behind, and his fight steps no more", () => {
    const { region, fight } = fullFight(3);
    const fired: number[] = [];
    let set = false;
    toThirdFall(region, fight, () => {
      if (set || fight.floorState().crumbling.length === 0 || fight.destroyed.size < 2) return;
      set = true;
      fight.after(1, () => fired.push(fight.tick));
      fight.after(30, () => fired.push(fight.tick));
    });
    const fellAt = fight.tick;
    for (let world = 0; world < 40; world++) region.world.tickWorld();
    const counts: Record<string, number> = {};
    for (const entity of region.entities) counts[entity.constructor.name] = (counts[entity.constructor.name] ?? 0) + 1;
    const mobs = [...region.mobs, ...region.newMobs].map((mob) => mob.constructor.name);
    expect({ fired: fired.map((t) => t - fellAt), hisTick: fight.tick - fellAt, mobs, counts }).toEqual({
      fired: [-12],
      hisTick: 0,
      mobs: ["Ocellus"],
      counts: { ArenaFloor: 1, LocField: 1, InvisibleMovementBlocker: 48, VoidField: 1, FloorHole: 3, OrbView: 2, FragmentFlash: 1, BossFootprint: 1 },
    });
  });

  test("a Defence drained below P4's floor in phase 3 comes into P4 at the floor", () => {
    const { region, fight } = fullFight(3);
    toThirdFall(region, fight, () => {
      if (fight.boss) fight.boss.currentStats.defence = 40;
    });
    const { ocellus } = mountedP4(region);
    expect([ocellus.currentStats.defence, ocellus.stats.defence]).toEqual([150, 250]);
  });
});

/** P4 carried into one quadrant of his arena: the room is his 29-tile grid and the fall is given. */
function carriedP4(standing: Quadrant, voids: readonly Readonly<{ tile: Readonly<{ x: number; z: number }>; placed: number }>[] = []) {
  Settings.readFromStorage();
  const entry: P4Entry = carriedEntry({ tick: 100, standing, boss: { hp: 1313, defence: 250 }, voids }, fullFightConfig(seed(1)));
  const frame = quadrantFrame(standing);
  const watch: P4Watch = { invincible: true, mounted: null };
  const region = new EncounterRegion({
    room: { size: frame.size, drawFloor() {}, mount: (on) => ({ dispose() {}, walkable: (tiles) => void fence(on, tiles) }), spawn: toRoom(frame, OCELLUS_P4.geometry.playerSpawn.value) },
    phases: { p4: p4Phase<Readonly<{ p4: P4Entry }>>(watch) },
    start: { phase: "p4", entry },
    seed: seed(1),
  });
  const trainer = new TrainerInstance(region);
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.getReadyTimer = 0;
  close = () => trainer.dispose();
  const tickTo = (t: number) => {
    while ((region.rows("p4").at(-1)?.tick ?? 0) < t) region.world.tickWorld();
  };
  const p4 = watch.mounted;
  if (!p4) throw new Error("P4 did not mount");
  return { region, p4, tickTo };
}

describe("P4 in his arena", () => {
  test.each([
    { standing: "SE", boss: [19, 21], holes: [[26, 16], [26, 17], [26, 18]], orb: [16, 20], rifts: [[17, 16], [19, 17]] },
    { standing: "SW", boss: [7, 21], holes: [[10, 26], [11, 26], [12, 26]], orb: [8, 16], rifts: [[11, 19], [12, 17]] },
    { standing: "NW", boss: [7, 9], holes: [[2, 10], [2, 11], [2, 12]], orb: [12, 8], rifts: [[9, 11], [11, 12]] },
    { standing: "NE", boss: [19, 9], holes: [[16, 2], [17, 2], [18, 2]], orb: [20, 12], rifts: [[16, 11], [17, 9]] },
  ] as const)("in the $standing quadrant the boss, holes, first orb and first rifts stand on literal room tiles", ({ standing, boss, holes, orb, rifts }) => {
    const { region, p4, tickTo } = carriedP4(standing);
    tickTo(12);
    const orbAt = p4.views.orbs["inner-void"].location;
    tickTo(67);
    expect({
      boss: [p4.ocellus.location.x, p4.ocellus.location.y],
      holes: sorted(region.entities.filter((entity) => entity.constructor.name === "FloorHole").map((hole) => hole.location)),
      orb: [orbAt.x, orbAt.y],
      rifts: sorted([...region.mobs, ...region.newMobs].filter((mob) => mob.constructor.name === "VoidRift").map((rift) => rift.location)),
    }).toEqual({ boss, holes, orb, rifts });
  });

  test("P4's platform is each quadrant less its inner corner, which the room fences", () => {
    const off = QUADRANTS.map((q) => {
      const platform = new Set(PLATFORM.map((local) => toRoom(quadrantFrame(q), local)).map(({ x, y }) => `${x},${y}`));
      const quadrant = quadrantTiles(q).map(toSdk);
      return [q, quadrant.length, platform.size, quadrant.filter(({ x, y }) => !platform.has(`${x},${y}`)).map(({ x, y }) => [x, y])];
    });
    expect(off).toEqual([
      ["NE", 85, 84, [[16, 12]]],
      ["SE", 85, 84, [[16, 16]]],
      ["SW", 85, 84, [[12, 16]]],
      ["NW", 85, 84, [[12, 12]]],
    ]);
  });

  test("phase 3's voids hurt in P4 on every second tick counted from when they dropped", () => {
    // P4's spawn, local (5, 1), is arena (6, -2) in the south-east quadrant.
    const onSpawn = at(6, -2);
    const entry = carriedEntry({ tick: 100, standing: "SE", boss: { hp: 1313, defence: 250 }, voids: [{ tile: onSpawn, placed: 97 }] }, fullFightConfig(seed(1)));
    const expected: readonly LingeringVoid[] = [{ tile: tile(5, 1), sincePlaced: span(3), period: span(2), damage: { min: 6, max: 7 } }];
    expect(entry.kind === "carried" ? entry.voids : []).toEqual(expected);
    const { region, tickTo } = carriedP4("SE", [{ tile: onSpawn, placed: 97 }]);
    tickTo(8);
    expect(region.rows("p4").flatMap((row) => row.events.flatMap((event) => (event.kind === "void-hit" ? [[event.at, event.tile.x, event.tile.y]] : [])))).toEqual([
      [1, 5, 1], [3, 5, 1], [5, 5, 1], [7, 5, 1],
    ]);
  });
});
