import type { Capture, Line, Pair, Runs } from "./gate";
import { budgetRaises, judge, parseBaseLimits, parseCapture, parseConfig, passes } from "./gate";

const BUDGETS = {
  drawCallsMedian3d: 500,
  drawCallsMax3d: 700,
  trianglesMax3d: 30000,
  tickGapExcess3d: 200,
  geometriesPerRetiredRift3d: 2,
  texturesPerRetiredRift3d: 1,
  heapGrowthMiB3d: 8,
  mobGrowth3d: 0,
  entityGrowth3d: 0,
  projectileGrowth3d: 0,
  sceneObjectGrowth3d: 0,
  bundleKiB: 2048,
};
const RAW_CONFIG = {
  workload: { query: "?seed=1", cpuThrottleRate: 4, window: { from: 8, to: 80 }, resources: { from: 100, to: 280 } },
  budgets: BUDGETS,
  timing: { pairs: 3, medianRatioLimit: 1.5 },
  headless: { viewAllocationsPerFrame: 0 },
  exceptions: [],
};
const BUNDLE_BYTES = 1024 * 1024;
const MIB = 1024 * 1024;
const LEAD_IN_TICKS = 3;
const LEAD_IN_FRAME_MS = 500;
const LEAD_IN_DRAW_CALLS = 5000;
const RETIRED = [90, 90, 150, 150, 210, 210, 270, 270];

type Leaks = Readonly<{ heapMiB?: number; mobs?: number; entities?: number; projectiles?: number; sceneObjects?: number }>;
type Run = Readonly<{
  lastTick?: number;
  tickMs?: number;
  stallAfterTick?: number;
  frameMs?: number;
  draws?: readonly number[];
  triangles?: readonly number[];
  geometriesPerRift?: number;
  texturesPerRift?: number;
  leaks?: Leaks;
  heapReadings?: boolean;
  errors?: readonly string[];
}>;

function capture({ lastTick = 280, tickMs = 600, stallAfterTick, frameMs = 16, draws = [500], triangles = [10000], geometriesPerRift = 2, texturesPerRift = 1, leaks = {}, heapReadings = true, errors = [] }: Run): Capture {
  const { from, to } = RAW_CONFIG.workload.resources;
  const retiredBy = (p4: number) => RETIRED.filter((at) => at <= p4).length;
  const leaked = (p4: number | null, amount = 0) => (p4 !== null && p4 > from ? amount : 0);
  const tickTime = (world: number) => world * tickMs + (stallAfterTick !== undefined && world - LEAD_IN_TICKS > stallAfterTick ? 1500 : 0);
  const ticks = Array.from({ length: lastTick + LEAD_IN_TICKS + 1 }, (_, world) => {
    const p4 = world >= LEAD_IN_TICKS ? world - LEAD_IN_TICKS : null;
    const stage = p4 === null ? null : p4 % 60 >= 8 && p4 % 60 < 30 ? "inner-void" : "outer-void";
    const renderer =
      p4 !== null
        ? { geometries: 100 + geometriesPerRift * retiredBy(p4), textures: 10 + texturesPerRift * retiredBy(p4), sceneObjects: 400 + leaked(p4, leaks.sceneObjects) }
        : null;
    const counts = { mobs: 1 + leaked(p4, leaks.mobs), entities: 50 + leaked(p4, leaks.entities), projectiles: leaked(p4, leaks.projectiles) };
    return { at: tickTime(world), p4, stage, world: counts, renderer };
  });
  const fightStart = tickTime(LEAD_IN_TICKS + RAW_CONFIG.workload.window.from);
  const end = tickTime(LEAD_IN_TICKS + lastTick);
  const frames = [];
  for (let at = 0; at <= end; at += at < fightStart ? LEAD_IN_FRAME_MS : frameMs) frames.push(at);
  const heap = [
    { p4: from, usedBytes: 50 * MIB, backingBytes: 10 * MIB },
    { p4: to, usedBytes: 50 * MIB, backingBytes: (10 + (leaks.heapMiB ?? 0)) * MIB },
  ];
  return parseCapture({
    viewport: { width: 1280, height: 800, dpr: 1 },
    frames,
    ticks,
    draws: frames.map((at, i) => [at, at < fightStart ? LEAD_IN_DRAW_CALLS : draws[i % draws.length], triangles[i % triangles.length]]),
    heap: heapReadings && lastTick >= to ? heap : [],
    largestCanvas: { width: 1280, height: 800 },
    retired: RETIRED.filter((at) => at <= lastTick),
    errors,
  });
}

function pairs(head: Run): Pair[] {
  return [1, 2, 3].map(() => ({ base: capture({ lastTick: 80 }), head: capture({ lastTick: 80, ...head }) }));
}

const UNCHANGED: Run = {};

function withPairs(head: Run, long: Capture): Runs {
  return { long, bundleBytes: BUNDLE_BYTES, timing: { kind: "pairs", pairs: pairs(head) } };
}

function summary(line: Line): readonly (string | number | boolean)[] {
  switch (line.kind) {
    case "budget":
      return [line.name, line.observed, passes(line)];
    case "timing":
      return [line.measure, line.medianRatio, passes(line)];
    case "raise":
      return [line.limit, line.base, line.head, passes(line)];
    case "measurement":
      return [line.run, line.problem, passes(line)];
    default: {
      const unreachable: never = line;
      return unreachable;
    }
  }
}

describe("judge", () => {
  test("passes a head that matches its base and stays within every budget, counting only the fight window", () => {
    const lines = judge(parseConfig(RAW_CONFIG), withPairs(UNCHANGED, capture({})));

    expect(lines.map(summary)).toEqual([
      ["drawCallsMedian3d", 500, true],
      ["drawCallsMax3d", 500, true],
      ["trianglesMax3d", 10000, true],
      ["tickGapExcess3d", 0, true],
      ["geometriesPerRetiredRift3d", 2, true],
      ["texturesPerRetiredRift3d", 1, true],
      ["heapGrowthMiB3d", 0, true],
      ["mobGrowth3d", 0, true],
      ["entityGrowth3d", 0, true],
      ["projectileGrowth3d", 0, true],
      ["sceneObjectGrowth3d", 0, true],
      ["bundleKiB", 1024, true],
      ["frameP95", 1, true],
      ["tickGapP95", 1, true],
    ]);
  });

  test("fails each budget the head breaks and a timing measure the head slows beyond the limit, and nothing else", () => {
    const lines = judge(parseConfig(RAW_CONFIG), withPairs({ frameMs: 40 }, capture({ draws: [500, 500, 500, 900], geometriesPerRift: 3 })));

    expect(lines.filter((line) => !passes(line)).map(summary)).toEqual([
      ["drawCallsMax3d", 900, false],
      ["geometriesPerRetiredRift3d", 3, false],
      ["frameP95", 2.5, false],
    ]);
  });

  test("fails median draw calls, texture growth, 3D frame time, one long stall and slower ticks", () => {
    const lines = judge(parseConfig(RAW_CONFIG), withPairs({ frameMs: 40, stallAfterTick: 40, tickMs: 1000 }, capture({ draws: [600], texturesPerRift: 2 })));

    expect(lines.filter((line) => !passes(line)).map(summary)).toEqual([
      ["drawCallsMedian3d", 600, false],
      ["tickGapExcess3d", 1900, false],
      ["texturesPerRetiredRift3d", 2, false],
      ["frameP95", 2.5, false],
      ["tickGapP95", 1000 / 600, false],
    ]);
  });

  test("fails heap, mob, entity, projectile and scene object growth between the long run's resource ticks", () => {
    const long = capture({ leaks: { heapMiB: 180, mobs: 1, entities: 2, projectiles: 3, sceneObjects: 4 } });
    const lines = judge(parseConfig(RAW_CONFIG), withPairs(UNCHANGED, long));

    expect(lines.filter((line) => !passes(line)).map(summary)).toEqual([
      ["heapGrowthMiB3d", 180, false],
      ["mobGrowth3d", 1, false],
      ["entityGrowth3d", 2, false],
      ["projectileGrowth3d", 3, false],
      ["sceneObjectGrowth3d", 4, false],
    ]);
  });

  test("rejects runs that missed the window or logged a page error, resource samples from different points of the cycle, and a long run without heap readings", () => {
    const config = parseConfig({ ...RAW_CONFIG, workload: { ...RAW_CONFIG.workload, resources: { from: 100, to: 250 } } });
    const missed: Pair = { base: capture({ lastTick: 60 }), head: capture({ lastTick: 80, errors: ["Uncaught TypeError: boom"] }) };
    const lines = judge(config, { long: capture({}), bundleBytes: BUNDLE_BYTES, timing: { kind: "pairs", pairs: [missed] } });
    const unweighed = judge(parseConfig(RAW_CONFIG), withPairs(UNCHANGED, capture({ heapReadings: false })));

    expect([...lines, ...unweighed].map(summary)).toEqual([
      ["base-1", "never reached P4 tick 80", false],
      ["head-1", "page error: Uncaught TypeError: boom", false],
      ["long", "P4 ticks 100 and 250 are at cycle offsets 32 and 2", false],
      ["long", "no heap reading between P4 ticks 100 and 280", false],
    ]);
  });
});

describe("judge without the throttled pairs", () => {
  test("judges every budget the long run and the bundle measure, and leaves out the ones only the pairs measure", () => {
    const lines = judge(parseConfig(RAW_CONFIG), { long: capture({}), bundleBytes: BUNDLE_BYTES, timing: { kind: "not-run" } });

    expect(lines.map(summary)).toEqual([
      ["drawCallsMedian3d", 500, true],
      ["drawCallsMax3d", 500, true],
      ["trianglesMax3d", 10000, true],
      ["geometriesPerRetiredRift3d", 2, true],
      ["texturesPerRetiredRift3d", 1, true],
      ["heapGrowthMiB3d", 0, true],
      ["mobGrowth3d", 0, true],
      ["entityGrowth3d", 0, true],
      ["projectileGrowth3d", 0, true],
      ["sceneObjectGrowth3d", 0, true],
      ["bundleKiB", 1024, true],
    ]);
  });

  test("fails peak triangles and a larger bundle", () => {
    const lines = judge(parseConfig(RAW_CONFIG), { long: capture({ triangles: [10000, 10000, 10000, 40000] }), bundleBytes: 3 * 1024 * 1024 + 1, timing: { kind: "not-run" } });

    expect(lines.filter((line) => !passes(line)).map(summary)).toEqual([
      ["trianglesMax3d", 40000, false],
      ["bundleKiB", 3073, false],
    ]);
  });
});

describe("budgetRaises", () => {
  const exception = (budget: string, from: number, to: number) => ({ budget, from, to, reason: `${budget} pays for a new effect`, evidence: "https://example.test/run/1" });

  test("guard: fails a raise against the base unless this pull request adds an exception for exactly that raise, and ignores a budget the head no longer defines", () => {
    const inherited = exception("medianRatioLimit", 1.25, 1.3);
    const base = parseBaseLimits({
      budgets: { drawCallsMax3d: 1234, tickGapExcess3d: 900, canvasToViewport2d: 3, heapGrowthMiB3d: 8 },
      timing: { medianRatioLimit: 1.25 },
      exceptions: [inherited],
    });
    const head = parseConfig({
      ...RAW_CONFIG,
      budgets: { ...BUDGETS, drawCallsMax3d: 1258, tickGapExcess3d: 1000, heapGrowthMiB3d: 16 },
      timing: { pairs: 3, medianRatioLimit: 1.3 },
      exceptions: [inherited, exception("tickGapExcess3d", 900, 1000), exception("heapGrowthMiB3d", 4, 16)],
    });

    expect(budgetRaises(base, head).map(summary)).toEqual([
      ["drawCallsMax3d", 1234, 1258, false],
      ["tickGapExcess3d", 900, 1000, true],
      ["heapGrowthMiB3d", 8, 16, false],
      ["medianRatioLimit", 1.25, 1.3, false],
    ]);
    expect(budgetRaises(null, head)).toEqual([]);
  });
});
