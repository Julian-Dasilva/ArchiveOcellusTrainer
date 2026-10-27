import type { Location3, Unit } from "osrs-sdk";
import { startP1 } from "./p1run";

type Run = ReturnType<typeof startP1>;

/** Where the SDK draws a unit at each fortieth of a tick, and the largest move between two frames. */
function drawnThrough(f: Run, unit: () => Unit, ticks: number) {
  const points: Location3[] = [];
  let ms = 0;
  // The draw blends with performance.now(). Reading at the client-tick timestamp keeps the point off process uptime.
  const now = vi.spyOn(performance, "now").mockImplementation(() => ms);
  try {
    for (let t = 0; t < ticks; t++) {
      f.tickOnce();
      for (let i = 0; i < 40; i++) {
        ms += 15;
        f.region.world.clientTick(f.region, i / 40, ms);
        points.push(unit().getPerceivedLocation(i / 40));
      }
    }
  } finally {
    now.mockRestore();
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const largestStep = points.slice(1).reduce((most, p, i) => Math.max(most, Math.hypot(p.x - points[i].x, p.y - points[i].y)), 0);
  const where = (i: number) => ({ x: round(points[i].x), y: round(points[i].y), z: round(points[i].z) });
  return { largestStep: round(largestStep), where, frames: points.length };
}

describe("phase 1 moves on screen without a jump", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("the first three steps of the walk glide, and no frame jumps more than a fifth of a tile", () => {
    const f = startP1();
    close = f.close;
    f.tickTo(3);
    const walk = drawnThrough(f, () => f.live().boss, 3);
    expect({ from: walk.where(0), to: walk.where(119), largestStep: walk.largestStep, frames: walk.frames }).toEqual({
      from: { x: 13, y: 18, z: 0 },
      to: { x: 16, y: 15, z: 0 },
      largestStep: 0.05,
      frames: 120,
    });
  });
});