import { at } from "../fight/geometry";
import { startP2 } from "./p2run";
import { drawnThrough } from "./drawn";

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
