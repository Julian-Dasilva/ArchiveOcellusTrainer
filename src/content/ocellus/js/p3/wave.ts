import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import type { TileSet } from "../../../../sim/tiles";

type Step = Readonly<{ dx: number; dy: number }>;

const NORTH: Step = { dx: 0, dy: -1 };

/** An offset within 22.5 degrees of an axis has (|dx| + |dy|)² < 2 × that axis², since tan 22.5° = √2 − 1. */
function heading({ dx, dy }: Step): Step {
  if (dx === 0 && dy === 0) return NORTH;
  const spread = (Math.abs(dx) + Math.abs(dy)) ** 2;
  return { dx: spread < 2 * dy * dy ? 0 : Math.sign(dx), dy: spread < 2 * dx * dx ? 0 : Math.sign(dy) };
}

export function waveLine(floor: TileSet, centre: Tile, aimed: Tile): readonly Tile[] {
  const offset = ({ x, y }: Tile): Step => ({ dx: x - centre.x, dy: y - centre.y });
  const step = heading(offset(aimed));
  const body = Math.floor(OCELLUS_P4.boss.size.value / 2);
  const clearance = OCELLUS_P3.wave.clearance.value;
  return floor
    .tiles()
    .filter((at) => {
      const { dx, dy } = offset(at);
      return dx * step.dx + dy * step.dy > 0 && Math.abs(dx * step.dy - dy * step.dx) < clearance && Math.max(Math.abs(dx), Math.abs(dy)) > body;
    })
    .map((at) => ({ at, distance: Math.hypot(offset(at).dx, offset(at).dy) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ at }) => at);
}
