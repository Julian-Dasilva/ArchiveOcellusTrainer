import { PlayerAnimationIndices, Settings } from "osrs-sdk";
import type { ATile } from "../fight/geometry";
import { at, fromSdk } from "../fight/geometry";
import { S, startP3 } from "./p3run";
import { drawnThrough } from "./drawn";

/** East arm, from the south-east bank (4, -2) onto the north-east landing (10, 2), one tile a tick. */
const EAST_STONE_WALK: readonly ATile[] = [
  at(4, -1),
  at(4, 0),
  at(5, 0),
  at(6, 0),
  at(7, 0),
  at(8, 0),
  at(9, 0),
  at(10, 0),
  at(10, 1),
  at(10, 2),
];

type Run = ReturnType<typeof startP3>;

describe("phase 3 moves on screen without a jump", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("his jump to his first corner is a leap over the jump's 2 ticks, and his first step on landing carries on from it", () => {
    const f = startP3();
    close = f.close;
    f.tickTo(S - 1);
    const leap = drawnThrough(f, () => f.live().boss, 4);
    // He leaves the middle (SDK 13, 15) for the south-east corner (19, 21) and, on the same tick, steps toward you to (18, 20).
    expect({ start: leap.where(0), top: leap.where(40), landed: leap.where(80), after: leap.where(159), largestStep: leap.largestStep, highest: leap.highest }).toEqual({
      start: { x: 13, y: 15, z: 0 },
      top: { x: 15.5, y: 17.5, z: 1.5 },
      landed: { x: 18, y: 20, z: 0 },
      after: { x: 18, y: 20, z: 0 },
      largestStep: 0.11,
      highest: 1.5,
    });
  });

  test("crossing the three east stones takes ten walk ticks, and the drawn path does not stall between them", () => {
    const f = startP3();
    close = f.close;
    f.tickTo(S + 2);
    f.bossAt(74);
    f.tickTo(S + 4);
    expect(f.live().script.interceptWalk(at(6, 4))).toBe(true);
    const clientSteps = Settings.tickMs / 20;
    const round = (n: number) => Math.round(n * 100) / 100;
    let ms = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => ms);
    const step = () => {
      f.tickOnce();
      let largest = 0;
      let still = 1;
      let run = 1;
      let previous: { x: number; y: number } | null = null;
      const poses = new Set<number>();
      for (let i = 0; i < clientSteps; i++) {
        ms += 15;
        f.region.world.clientTick(f.region, i / clientSteps, ms);
        const player = f.player();
        poses.add(player.currentPoseAnimation);
        const seen = player.getPerceivedLocation(i / clientSteps);
        const point = { x: round(seen.x), y: round(seen.y) };
        if (previous) {
          largest = Math.max(largest, Math.hypot(point.x - previous.x, point.y - previous.y));
          if (point.x === previous.x && point.y === previous.y) {
            run++;
            still = Math.max(still, run);
          } else run = 1;
        }
        previous = point;
      }
      const end = previous ?? { x: 0, y: 0 };
      return { tile: f.here(), drawn: fromSdk({ x: Math.round(end.x), y: Math.round(end.y) }), largest, still, poses };
    };
    try {
      let guard = 0;
      let arrived = step();
      while (arrived.tile.x !== 4 || arrived.tile.z !== -2) {
        if (guard++ > 20) throw new Error("the walk never reached the east bank");
        arrived = step();
      }
      const walked: { tile: ATile; drawn: ATile; largest: number; still: number; run: boolean; walk: boolean }[] = [];
      for (let i = 0; i < EAST_STONE_WALK.length; i++) {
        const moved = step();
        walked.push({
          tile: moved.tile,
          drawn: moved.drawn,
          largest: round(moved.largest),
          still: moved.still,
          run: moved.poses.has(PlayerAnimationIndices.Run),
          walk: moved.poses.has(PlayerAnimationIndices.Walk),
        });
      }
      expect(walked).toEqual(
        EAST_STONE_WALK.map((tile) => ({
          tile,
          drawn: tile,
          largest: 0.03,
          still: 1,
          run: false,
          walk: true,
        })),
      );
    } finally {
      clock.mockRestore();
    }
  });
});
