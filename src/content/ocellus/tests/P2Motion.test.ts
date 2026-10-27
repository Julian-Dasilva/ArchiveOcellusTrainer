import type { Location3, Unit } from "osrs-sdk";
import { at } from "../fight/geometry";
import { startP2 } from "./p2run";

type Run = ReturnType<typeof startP2>;

/** Where the SDK draws a unit at each fortieth of a tick, and the largest move between two frames. */
function drawnThrough(f: Run, unit: () => Unit, ticks: number) {
  const points: Location3[] = [];
  let ms = 0;
  for (let t = 0; t < ticks; t++) {
    f.tickOnce();
    for (let i = 0; i < 40; i++) {
      ms += 15;
      f.region.world.clientTick(f.region, i / 40, ms);
      points.push(unit().getPerceivedLocation(i / 40));
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const largestStep = points.slice(1).reduce((most, p, i) => Math.max(most, Math.hypot(p.x - points[i].x, p.y - points[i].y)), 0);
  const where = (i: number) => ({ x: round(points[i].x), y: round(points[i].y), z: round(points[i].z) });
  return { largestStep: round(largestStep), where, frames: points.length };
}

describe("phase 2 moves on screen without a jump", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("being shoved off the cross glides one tile, and no frame jumps more than a fifth of a tile", () => {
    const f = startP2();
    close = f.close;
    f.tickTo(1);
    f.player().hop(at(1, 0));
    const shove = drawnThrough(f, f.player, 1);
    expect({ from: shove.where(0), to: shove.where(39), largestStep: shove.largestStep, here: f.here() }).toEqual({
      from: { x: 15, y: 13.97, z: 0 },
      to: { x: 15, y: 13, z: 0 },
      largestStep: 0.07,
      here: at(1, 1),
    });
  });

  test("the safe-portal hop glides, and no frame jumps more than a fifth of a tile", () => {
    const f = startP2();
    close = f.close;
    f.tickTo(44);
    const opened = f.ofKind("safe-opened").find(([tick]) => tick === 44);
    if (!opened || opened[1].kind !== "safe-opened") throw new Error("no safe portal at tick 44");
    f.player().hop(opened[1].tile);
    const hop = drawnThrough(f, f.player, 1);
    const escaped = f.ofKind("escaped").find(([tick]) => tick === 45);
    if (!escaped || escaped[1].kind !== "escaped") throw new Error("standing on the safe portal did not hop");
    expect({ from: hop.where(0), to: hop.where(39), largestStep: hop.largestStep, here: f.here() }).toEqual({
      from: { x: 14.87, y: 17.13, z: 0 },
      to: { x: 10.8, y: 20, z: 0 },
      largestStep: 0.19,
      here: escaped[1].to,
    });
  });
});
