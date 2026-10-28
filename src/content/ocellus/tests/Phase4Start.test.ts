import { QUADRANTS, at, quadrantOf } from "../fight/geometry";
import { startP3 } from "./p3run";

const WAITING = at(-6, 2);

function thirdFall() {
  const run = startP3({ seed: 1, weapon: "blowpipe" });
  const fallTo = (count: number) => {
    for (let guard = 0; run.live().arena.destroyed.size < count; guard++) {
      if (guard > 400) throw new Error(`quadrant ${count} never fell at ${run.now()}`);
      run.tickOnce();
      if (run.region.current !== "p3") return;
      const crumbling = run.live().arena.floorState().crumbling;
      if (crumbling.length > 0 && quadrantOf(run.here()) === crumbling[0]) run.stepOff();
    }
  };
  for (const [floor, count] of [[75, 1], [50, 2]] as const) {
    run.tickTo(run.now() + 2, run.stayInReach);
    run.bossAt(floor);
    fallTo(count);
  }
  run.tickTo(run.now() + 2, run.stayInReach);
  run.bossAt(25);
  while (run.region.current === "p3" && run.live().arena.floorState().crumbling.length === 0) run.tickOnce();
  const left = QUADRANTS.filter((quadrant) => !run.live().arena.destroyed.has(quadrant) && !run.live().arena.floorState().crumbling.includes(quadrant));
  const standing = left[0];
  if (standing === undefined || left.length !== 1) throw new Error("the third fall left more than one quadrant");
  run.player().hop(WAITING);
  if (quadrantOf(run.here()) !== standing) throw new Error("the waiting tile is not on the quadrant still up");
  fallTo(3);
  return run;
}

function picture(run: ReturnType<typeof startP3>) {
  const mounted = run.region.p4.mounted;
  if (mounted === null) throw new Error("phase 4 is not running");
  const floor = run.region.floorState();
  const you = run.player();
  const tiles = (list: readonly { x: number; z: number }[]) => list.map((tile) => `${tile.x},${tile.z}`).sort();
  return {
    phase: run.region.current,
    hp: mounted.ocellus.currentStats.hitpoint,
    defence: mounted.ocellus.currentStats.defence,
    visible: mounted.ocellus.visible(),
    destroyed: [...floor.destroyed],
    crumbling: [...floor.crumbling],
    stones: tiles(floor.stones),
    censers: floor.censers.map((censer) => ({ god: censer.god, lit: censer.lit, tile: `${censer.tile.x},${censer.tile.z}` })),
    tiles: tiles(floor.floor),
    here: run.here(),
    playerHp: you.currentStats.hitpoint,
    prayer: you.currentStats.prayer ?? 0,
    special: you.currentStats.specialAttack,
    weapon: you.equipment.weapon?.itemName ?? null,
    earlierPhase: run.region.p3.mounted,
  };
}

test("starting at phase 4 opens the arena the third fall leaves", () => {
  const fell = thirdFall();
  const started = startP3({ seed: 1, weapon: "blowpipe", startPhase: 4 });
  try {
    const fromFall = picture(fell);
    const fromStart = picture(started);
    expect(fromStart).toEqual(fromFall);
    expect(fromStart).toMatchObject({
      phase: "p4",
      hp: 1313,
      defence: 250,
      visible: false,
      destroyed: ["SE", "NE", "SW"],
      here: WAITING,
      playerHp: 99,
      prayer: 99,
      special: 100,
      weapon: "Toxic Blowpipe",
      earlierPhase: null,
    });
    expect(fromStart.tiles).toHaveLength(84);
    expect(fromStart.stones).toHaveLength(12);
    expect(started.region.chat()).toEqual([]);
    expect(started.region.startOf("p4")).toBe(0);
  } finally {
    fell.close();
    started.close();
  }
});
