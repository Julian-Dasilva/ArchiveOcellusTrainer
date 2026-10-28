import type { Location } from "osrs-sdk";
import type { ATile } from "../fight/geometry";
import { at, fromSdk } from "../fight/geometry";
import { S, startP3 } from "./p3run";
import { drawnThrough } from "./drawn";

/** The east arm from the south-east bank (4, -2): stones 4, 7 and 10 out, then the north-east landing. */
const EAST_JUMPS: readonly ATile[] = [at(4, 0), at(7, 0), at(10, 0), at(10, 2)];
const BANK = at(4, -2);
const SHORT_JUMP = 12196;

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

  test("a click across the east chasm jumps the three stones and lands in 4 ticks, each jump drawn as a glide inside its tick", () => {
    const f = startP3();
    close = f.close;
    f.tickTo(S + 2);
    f.bossAt(74);
    f.tickTo(S + 4);
    const round = (n: number) => Math.round(n * 100) / 100;
    const drawnTile = (p: Location): ATile => fromSdk({ x: round(p.x), y: round(p.y) });
    let ms = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => ms);
    const played: number[] = [];
    const animation = vi.spyOn(f.player(), "playAnimation").mockImplementation((id) => {
      played.push(id);
      return Promise.resolve();
    });
    let last: Location = f.player().getPerceivedLocation(1);
    const tick = () => {
      f.tickOnce();
      let largest = 0;
      for (let i = 0; i < 40; i++) {
        ms += 15;
        f.region.world.clientTick(f.region, i / 40, ms);
        const seen = f.player().getPerceivedLocation(i / 40);
        largest = Math.max(largest, Math.hypot(seen.x - last.x, seen.y - last.y));
        last = seen;
      }
      return { tile: f.here(), drawn: drawnTile(last), glides: largest <= 0.1 };
    };
    try {
      expect(f.live().script.interceptWalk(at(6, 4))).toBe(true);
      for (let guard = 0; f.here().x !== BANK.x || f.here().z !== BANK.z; guard++) {
        if (guard > 20) throw new Error("the walk never reached the east bank");
        tick();
      }
      played.length = 0;
      const jumps = EAST_JUMPS.map(() => tick());
      expect({ jumps, played }).toEqual({
        jumps: EAST_JUMPS.map((tile) => ({ tile, drawn: tile, glides: true })),
        played: [SHORT_JUMP, SHORT_JUMP, SHORT_JUMP, SHORT_JUMP],
      });
    } finally {
      animation.mockRestore();
      clock.mockRestore();
    }
  });
});
