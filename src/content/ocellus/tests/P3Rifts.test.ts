import { SEQ } from "../full/data/looks";
import { P3 } from "../full/data/p3";
import { VoidAdd } from "../fight/units";
import { S, startP3 } from "./p3run";

/** Phase 3's rifts take shape under their own sequences, and a Void Siphon heals its killer. */

const POSES = {
  "rift-basic": [SEQ.riftBasicIdle, SEQ.riftBasicIdle, SEQ.riftBasicDespawn],
  "rift-heal": [SEQ.riftHealIdle, SEQ.riftHealIdle, SEQ.riftHealDespawn],
  "rift-buff": [SEQ.riftBuffIdle, SEQ.riftBuffIdle, SEQ.riftBuffDespawn],
} as const;

describe("phase 3's rifts", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  /** The first quadrant falls after Untether; the second segment's first rift is up 3 ticks in. */
  function firstRift(seed: number) {
    const f = startP3({ seed });
    close = f.close;
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    f.stepOff();
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2 + 4);
    const rift = f.region.mobs.find((mob): mob is VoidAdd => mob instanceof VoidAdd && mob.kind !== "vine" && !mob.killed);
    if (rift === undefined) throw new Error(`no rift 4 ticks into the second segment on seed ${seed}`);
    return { f, rift };
  }

  test("each kind stands, walks and despawns on its own sequences", () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { rift } = firstRift(seed);
      if (rift.kind === "vine") throw new Error("a vine");
      kinds.add(rift.kind);
      expect([rift.idlePoseId, rift.walkingPoseId, rift.deathAnimationId]).toEqual(POSES[rift.kind]);
      close?.();
      close = null;
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  test("killing a Void Siphon heals its killer 22", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const { f, rift } = firstRift(seed);
      if (rift.kind !== "rift-heal") {
        close?.();
        close = null;
        continue;
      }
      const from = f.now();
      rift.currentStats.hitpoint = 0;
      f.tickTo(from + 3);
      const heals = f.events().flatMap(([, e]) => (e.kind === "healed" && e.cause.kind === "siphon-kill" ? [[e.target, e.amount] as const] : []));
      expect(heals).toEqual([["player", P3.siphonHeal]]);
      return;
    }
    throw new Error("no seed spawned a Void Siphon first");
  });
});
