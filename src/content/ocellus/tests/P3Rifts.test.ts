import { SEQ } from "../full/data/looks";
import { P3 } from "../full/data/p3";
import { VoidAdd } from "../fight/units";
import { S, startP3 } from "./p3run";

const POSES = {
  "rift-basic": { idle: SEQ.riftBasicIdle, spawn: SEQ.riftBasicSpawn, despawn: SEQ.riftBasicDespawn, detonate: SEQ.riftBasicDetonate },
  "rift-heal": { idle: SEQ.riftHealIdle, spawn: SEQ.riftHealSpawn, despawn: SEQ.riftHealDespawn, detonate: SEQ.riftHealDetonate },
  "rift-buff": { idle: SEQ.riftBuffIdle, spawn: SEQ.riftBuffSpawn, despawn: SEQ.riftBuffDespawn, detonate: SEQ.riftBuffDetonate },
} as const;

describe("phase 3's rifts", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
    vi.restoreAllMocks();
  });

  /** The first quadrant falls after Untether; the second segment's first rift is up 3 ticks in. */
  function firstRift(seed: number) {
    close?.();
    const played = vi.spyOn(VoidAdd.prototype, "playAnimation");
    const f = startP3({ seed });
    close = f.close;
    const P = S + 24;
    f.tickTo(P + 2, f.stayInReach);
    f.bossAt(75);
    f.stepOff();
    const S2 = P + 3 + P3.untether.nextSegment - P3.untether.obliteration;
    f.tickTo(S2 + 4);
    const rift = f.region.mobs.find((mob): mob is VoidAdd => mob instanceof VoidAdd && mob.kind !== "vine" && !mob.killed);
    if (rift === undefined || rift.kind === "vine") throw new Error(`no rift 4 ticks into the second segment on seed ${seed}`);
    const poses = POSES[rift.kind];
    const playedOn = () => played.mock.contexts.flatMap((unit, i) => (unit === rift ? [played.mock.calls[i]?.[0]] : []));
    return { f, rift, poses, playedOn };
  }

  function firstSiphon() {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const run = firstRift(seed);
      if (run.rift.kind === "rift-heal") return run;
    }
    throw new Error("no seed spawned a Void Siphon first");
  }

  test("each kind rises on its spawn animation, then stands and dies on its own sequences", () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { rift, poses, playedOn } = firstRift(seed);
      kinds.add(rift.kind);
      expect(playedOn()).toEqual([poses.spawn]);
      expect([rift.idlePoseId, rift.walkingPoseId, rift.deathAnimationId]).toEqual([poses.idle, poses.idle, poses.despawn]);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  test("a rift left alive detonates, stays one more tick, and is gone the tick after, with no kill and no heal", () => {
    const { f, rift, poses, playedOn } = firstSiphon();
    const detonated = () => f.looks("rift-detonated").map(([t]) => t);
    const until = f.now() + P3.riftDetonatesAfter;
    while (detonated().length === 0 && f.now() < until) {
      expect(f.region.mobs).toContain(rift);
      f.tickOnce();
    }
    const [at] = detonated();
    if (at === undefined) throw new Error("the rift never detonated");
    expect(f.now()).toBe(at);
    const present = (t: number) => {
      f.tickTo(t);
      return f.region.mobs.includes(rift);
    };
    expect(playedOn()).toEqual([poses.spawn, poses.detonate]);
    expect(rift.deathAnimationId).not.toBe(poses.despawn);
    expect([present(at + 1), present(at + 2)]).toEqual([true, false]);
    const events = f.events().map(([, e]) => e);
    expect(events.filter((e) => e.kind === "rift-killed")).toEqual([]);
    expect(events.filter((e) => e.kind === "healed" && e.cause.kind === "siphon-kill")).toEqual([]);
  });

  test("killing a Void Siphon below max HP heals the player 22", () => {
    const { f, rift } = firstSiphon();
    const player = f.player();
    player.currentStats.hitpoint = player.stats.hitpoint - 40;
    const before = player.currentStats.hitpoint;
    const from = f.now();
    rift.currentStats.hitpoint = 0;
    f.tickTo(from + 1);
    expect(f.events().filter(([t, e]) => t > from && e.kind === "rift-killed")).toHaveLength(1);
    expect(player.currentStats.hitpoint - before).toBe(P3.siphonHeal);
  });
});
