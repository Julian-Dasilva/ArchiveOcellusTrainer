import { at } from "../fight/geometry";
import { startP2 } from "./p2run";
import { drawnThrough } from "./drawn";

describe("phase 2 forced moves", () => {
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
      from: { x: 15, y: 14, z: 0 },
      to: { x: 15, y: 13, z: 0 },
      largestStep: 0.07,
      here: at(1, 1),
    });
  });

  test("the safe-portal escape is drawn on the landing tile on the next frame", () => {
    const f = startP2();
    close = f.close;
    f.tickTo(44);
    const opened = f.ofKind("safe-opened").find(([tick]) => tick === 44);
    if (!opened || opened[1].kind !== "safe-opened") throw new Error("no safe portal at tick 44");
    f.player().hop(opened[1].tile);
    const escape = drawnThrough(f, f.player, 1);
    const escaped = f.ofKind("escaped").find(([tick]) => tick === 45);
    if (!escaped || escaped[1].kind !== "escaped") throw new Error("standing on the safe portal did not teleport");
    const onLanding = { x: 9, y: 21, z: 0 };
    expect({
      first: escape.where(0),
      next: escape.where(1),
      last: escape.where(39),
      largestStep: escape.largestStep,
      here: f.here(),
      logged: escaped[1].to,
    }).toEqual({
      first: onLanding,
      next: onLanding,
      last: onLanding,
      largestStep: 0,
      here: at(-5, -7),
      logged: at(-5, -7),
    });
  });
});
