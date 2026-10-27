import { P3 } from "./data/p3";
import { P2 } from "./data/p2";
import { scaledHp } from "./data/looks";
import type { Fall } from "./p3/types";
import { chasmTiles } from "./p3/script";
import type { FloorState } from "../fight/arena";
import type { ATile, Quadrant } from "../fight/geometry";
import { ARMS, C, CENSERS, GRID, QUADRANTS, key, quadrantTiles, stonesOf, toSdk, fromSdk } from "../fight/geometry";
import type { DrillConfig } from "../js/OcellusTimings";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import type { P4Entry } from "../js/p4/phase";
import { span, tick } from "../../../sim/brands";
import type { Frame } from "../../../sim/frame";
import { toLocal, toRoom } from "../../../sim/frame";

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

/**
 * The quadrants that fall, in order, when you leave each crumbling one for the next that is still up.
 * Phase 4 stands on the quadrant this list leaves out.
 */
const FELL_BEFORE_PHASE_4: readonly Quadrant[] = ["SE", "NE", "SW"];

function standingQuadrant(): Quadrant {
  const [standing, ...rest] = QUADRANTS.filter((quadrant) => !FELL_BEFORE_PHASE_4.includes(quadrant));
  if (standing === undefined || rest.length > 0) throw new Error("the third fall must leave one quadrant");
  return standing;
}

function lastHpFloor(): number {
  const fraction = P3.hpFloors[P3.hpFloors.length - 1];
  if (fraction === undefined) throw new Error("phase 3 names no HP floor");
  return fraction;
}

/** The arena, the boss and the waiting tile a third fall leaves when no bomb void carried. */
export function phase4Opening(): Readonly<{ fall: Fall; floor: FloorState; spawn: ATile }> {
  const standing = standingQuadrant();
  const chasm = new Set(chasmTiles().map((tile) => key(tile)));
  const frame = quadrantFrame(standing);
  const pool = scaledHp(P2.hp, 1);
  return {
    fall: {
      tick: tick(0),
      standing,
      boss: { hp: Math.ceil(pool * lastHpFloor()), defence: P3.defence },
      voids: [],
    },
    floor: {
      key: "third-fall",
      floor: quadrantTiles(standing).filter((tile) => !chasm.has(key(tile))),
      stones: ARMS.flatMap((arm) => stonesOf(arm)),
      censers: QUADRANTS.map((quadrant) => ({ tile: CENSERS[quadrant].tile, god: CENSERS[quadrant].god, lit: false })),
      crumbling: [],
      destroyed: [...FELL_BEFORE_PHASE_4],
    },
    spawn: fromSdk(toRoom(frame, OCELLUS_P4.geometry.playerSpawn.value)),
  };
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
