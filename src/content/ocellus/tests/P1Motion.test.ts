import { startP1 } from "./p1run";
import { drawnThrough } from "./drawn";

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
      from: { x: 13.03, y: 17.97, z: 0 },
      to: { x: 15.97, y: 15.03, z: 0 },
      largestStep: 0.05,
      frames: 120,
    });
  });
});