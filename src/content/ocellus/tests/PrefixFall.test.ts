import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { Fight, StartPhase } from "../fight/Fight";
import { QUADRANTS, quadrantOf, quadrantTiles } from "../fight/geometry";
import type { FightRegion, FullFightOptions } from "../full/prefix";
import { fullFightStaged } from "../full/prefix";
import { dress } from "../js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout } from "../js/OcellusTimings";

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

/** Phases 1 to 3 at speed: each pool drops to its floor at once, and the player leaves every crumbling quadrant. Returns the third fall's world tick. */
function toThirdFall(region: FightRegion, fight: Fight, each: () => void = () => undefined): number {
  for (let step = 0; step < 2500; step++) {
    region.world.tickWorld();
    if (fight.destroyed.size === 3) return region.world.globalTickCounter;
    each();
    const boss = fight.boss;
    const label = fight.label();
    if (boss && label === "Phase 1" && boss.form === "p1" && boss.currentStats.hitpoint > 0) boss.currentStats.hitpoint = 0;
    const floor = fight.phase?.hpFloor() ?? 0;
    if (boss && label === "Phase 3" && boss.currentStats.hitpoint > floor) boss.currentStats.hitpoint = floor;
    const crumbling = fight.floorState().crumbling;
    if (crumbling.length > 0 && quadrantOf(fight.playerTile) === crumbling[0]) stepOff(fight);
  }
  throw new Error("phase 3 never fell for the third time");
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
    const p4 = region.p4.mounted;
    const reflected = () => region.rows("p4").some((row) => row.events.some((event) => event.kind === "deflect-reflected"));
    for (let step = 0; p4 && step < 3000 && p4.ocellus.runState().kind !== "ended"; step++) {
      const { ocellus, player } = p4;
      if (!player.aggro && ocellus.canBeAttacked()) player.setAggro(ocellus);
      // A player who neither prays nor takes the orbs loses ground to his heals, so once a hit has been deflected the next landed hit is the kill.
      if (reflected() && ocellus.currentStats.hitpoint > 1) ocellus.currentStats.hitpoint = 1;
      region.world.tickWorld();
    }
    expect({
      labels,
      phases: region.sections().map((section) => section.phase),
      run: p4?.ocellus.runState().kind ?? null,
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

  test("phase 3's drained Defence, which his own floor holds at 150, crosses into P4", () => {
    const { region, fight } = fullFight(3);
    toThirdFall(region, fight, () => {
      if (fight.boss) fight.boss.currentStats.defence = 40;
    });
    const { ocellus } = mountedP4(region);
    expect([ocellus.currentStats.defence, ocellus.stats.defence]).toEqual([150, 250]);
  });
});
