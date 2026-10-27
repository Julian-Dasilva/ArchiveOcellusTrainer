import { P3 } from "../fight/data";
import type { Fall } from "../fight/Fight";
import type { Quadrant } from "../fight/geometry";
import { C, GRID, toSdk } from "../fight/geometry";
import type { DrillConfig } from "../js/OcellusTimings";
import type { P4Entry } from "../js/p4/phase";
import { span } from "../../../sim/brands";
import type { Frame } from "../../../sim/frame";
import { toLocal } from "../../../sim/frame";

/**
 * P4's platform is the south-east quadrant as it stands, local (x, y) on arena (x + 1, -(y + 1)): fight log L6 puts his
 * south-west tile (5, -7) on P4's anchor (4, 6). Each quadrant clockwise is a quarter turn about the middle tile.
 */
const PLATFORM_IN: Readonly<Record<Quadrant, Omit<Frame, "size">>> = {
  SE: { turns: 0, origin: { x: C + 1, y: C + 1 } },
  SW: { turns: 1, origin: { x: C - 1, y: C + 1 } },
  NW: { turns: 2, origin: { x: C - 1, y: C - 1 } },
  NE: { turns: 3, origin: { x: C + 1, y: C - 1 } },
};

export function quadrantFrame(quadrant: Quadrant): Frame {
  return { ...PLATFORM_IN[quadrant], size: { width: GRID, height: GRID } };
}

/** P4's tick 0 is the fall's tick, so a void hurts on P4's ticks in step with his clock. */
export function carriedEntry(fall: Fall, config: DrillConfig): P4Entry {
  const frame = quadrantFrame(fall.standing);
  return {
    kind: "carried",
    config,
    frame,
    boss: fall.boss,
    voids: fall.voids.map(({ tile, placed }) => ({ tile: toLocal(frame, toSdk(tile)), sincePlaced: span(fall.tick - placed), period: span(P3.patchEvery), damage: P3.patchDamage })),
  };
}
