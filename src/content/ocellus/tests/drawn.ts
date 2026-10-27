import type { Location3, Region, Unit } from "osrs-sdk";

type Ticked = Readonly<{ region: Region; tickOnce: () => void }>;

/**
 * Where the SDK draws a unit at each fortieth of a tick through `ticks` world ticks, client-ticking the region before
 * each frame as the page's render loop does, and the largest move between two frames.
 */
export function drawnThrough(run: Ticked, unit: () => Unit, ticks: number) {
  const points: Location3[] = [];
  let ms = 0;
  for (let t = 0; t < ticks; t++) {
    run.tickOnce();
    for (let i = 0; i < 40; i++) {
      ms += 15;
      run.region.world.clientTick(run.region, i / 40, ms);
      points.push(unit().getPerceivedLocation(i / 40));
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const largestStep = points.slice(1).reduce((most, p, i) => Math.max(most, Math.hypot(p.x - points[i].x, p.y - points[i].y)), 0);
  const highest = points.reduce((most, p) => Math.max(most, p.z), 0);
  const where = (i: number) => ({ x: round(points[i].x), y: round(points[i].y), z: round(points[i].z) });
  return { largestStep: round(largestStep), highest: round(highest), where, frames: points.length };
}
