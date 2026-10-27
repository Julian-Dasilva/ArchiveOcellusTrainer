import { at } from "../fight/geometry";
import { S, startP3 } from "./p3run";
import { drawnThrough } from "./drawn";

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
      largestStep: 0.1,
      highest: 1.5,
    });
  });

  test("crossing the stones, the player glides a tile at a time from the bank to the far quadrant", () => {
    const f = startP3();
    close = f.close;
    f.tickTo(S + 2);
    f.bossAt(74);
    f.tickTo(S + 4);
    expect(f.live().script.interceptWalk(at(6, 4))).toBe(true);
    const crossing = drawnThrough(f, f.player, 10);
    // From arena (5, -3) he walks to the bank and hops the east arm's stones to (10, 2), SDK (24, 12).
    expect({ from: crossing.where(0), to: crossing.where(399), largestStep: crossing.largestStep, here: f.here() }).toEqual({
      from: { x: 18.98, y: 16.98, z: 0 },
      to: { x: 24, y: 12.07, z: 0 },
      largestStep: 0.13,
      here: at(10, 2),
    });
  });
});
