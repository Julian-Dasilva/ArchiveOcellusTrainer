import type { Tick } from "../sim/brands";
import { tick } from "../sim/brands";

export const SIDES = ["base", "head"] as const;
export type Side = (typeof SIDES)[number];
const GROWTH_BUDGETS = ["geometriesPerRetiredRift3d", "texturesPerRetiredRift3d", "heapGrowthMiB3d", "mobGrowth3d", "entityGrowth3d", "projectileGrowth3d", "sceneObjectGrowth3d"] as const;
type GrowthBudget = (typeof GROWTH_BUDGETS)[number];
const PAIR_BUDGETS = ["tickGapExcess3d"] as const;
const BUDGETS = ["drawCallsMedian3d", "drawCallsMax3d", "trianglesMax3d", ...PAIR_BUDGETS, ...GROWTH_BUDGETS, "bundleKiB"] as const;
export type BudgetName = (typeof BUDGETS)[number];
const LIMITS = [...BUDGETS, "medianRatioLimit"] as const;
export type Limit = (typeof LIMITS)[number];
const TIMINGS = ["frameP95", "tickGapP95"] as const;
export type TimingMeasure = (typeof TIMINGS)[number];
export const PAIRS_ONLY: readonly (BudgetName | TimingMeasure)[] = [...PAIR_BUDGETS, ...TIMINGS];
const MIB = 1024 * 1024;

type TickRange = Readonly<{ from: Tick; to: Tick }>;
export type BudgetException = Readonly<{ budget: Limit; from: number; to: number; reason: string; evidence: string }>;
export type Config = Readonly<{
  workload: Readonly<{ query: string; cpuThrottleRate: number; window: TickRange; resources: TickRange }>;
  budgets: Readonly<Record<BudgetName, number>>;
  timing: Readonly<{ pairs: number; medianRatioLimit: number }>;
  headless: Readonly<{ viewAllocationsPerFrame: number }>;
  exceptions: readonly BudgetException[];
}>;
export type BaseLimits = Readonly<{ limits: Readonly<Partial<Record<Limit, number>>>; exceptions: readonly BudgetException[] }>;

type WorldCounts = Readonly<{ mobs: number; entities: number; projectiles: number }>;
type RendererCounts = Readonly<{ geometries: number; textures: number; sceneObjects: number }>;
type TickSample = Readonly<{ at: number; p4: Tick | null; stage: string | null; world: WorldCounts; renderer: RendererCounts | null }>;
type DrawSample = Readonly<{ at: number; calls: number; triangles: number }>;
type HeapReading = Readonly<{ p4: Tick; usedBytes: number; backingBytes: number }>;
export type Capture = Readonly<{
  viewportPixels: number;
  frames: readonly number[];
  ticks: readonly TickSample[];
  draws: readonly DrawSample[];
  heap: readonly HeapReading[];
  largestCanvasPixels: number;
  retired: readonly Tick[];
  errors: readonly string[];
}>;
export type Pair = Readonly<Record<Side, Capture>>;
export type Timing = Readonly<{ kind: "pairs"; pairs: readonly Pair[] }> | Readonly<{ kind: "not-run" }>;
export type Runs = Readonly<{ long: Capture; bundleBytes: number; timing: Timing }>;

export type RunMetrics = Readonly<{
  frameP95: number;
  tickGapP95: number;
  tickGapMax: number;
  drawCallsMedian: number | null;
  drawCallsMax: number | null;
  trianglesMax: number | null;
  canvasToViewport: number;
}>;

export type Line =
  | Readonly<{ kind: "budget"; name: BudgetName; observed: number; budget: number }>
  | Readonly<{ kind: "timing"; measure: TimingMeasure; base: readonly number[]; head: readonly number[]; medianRatio: number; limit: number }>
  | Readonly<{ kind: "raise"; limit: Limit; base: number; head: number; exception: BudgetException | null }>
  | Readonly<{ kind: "measurement"; run: string; problem: string }>;

export function passes(line: Line): boolean {
  switch (line.kind) {
    case "budget":
      return line.observed <= line.budget;
    case "timing":
      return line.medianRatio <= line.limit;
    case "raise":
      return line.exception !== null;
    case "measurement":
      return false;
    default: {
      const unreachable: never = line;
      return unreachable;
    }
  }
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

const median = (values: readonly number[]): number => percentile(values, 0.5);

function gaps(times: readonly number[]): number[] {
  return times.slice(1).map((at, i) => at - times[i]);
}

function tickAt(capture: Capture, p4: Tick): TickSample | undefined {
  return capture.ticks.find((sample) => sample.p4 === p4);
}

function span(capture: Capture, { from, to }: TickRange): Readonly<{ start: number; end: number }> | null {
  const start = tickAt(capture, from);
  const end = tickAt(capture, to);
  return start && end ? { start: start.at, end: end.at } : null;
}

function measurementProblems(name: string, capture: Capture, window: TickRange): Line[] {
  const problem = (text: string): Line => ({ kind: "measurement", run: name, problem: text });
  const within = span(capture, window);
  if (within === null) return [problem(`never reached P4 tick ${window.to}`)];
  return [
    ...capture.errors.map((error) => problem(`page error: ${error}`)),
    ...(capture.frames.filter((at) => at >= within.start && at <= within.end).length < 2 ? [problem("fewer than 2 frames in the window")] : []),
    ...(!capture.draws.some(({ at }) => at >= within.start && at <= within.end) ? [problem("no 3D render in the window")] : []),
  ];
}

function tickGapsByTick(capture: Capture, { from, to }: TickRange): ReadonlyMap<Tick, number> {
  const ticks = capture.ticks.flatMap(({ at, p4 }) => (p4 !== null && p4 >= from && p4 <= to ? [{ at, p4 }] : []));
  return new Map(ticks.slice(1).map(({ at, p4 }, i) => [p4, at - ticks[i].at]));
}

function tickGapExcess(pairs: readonly Pair[], window: TickRange): number {
  const base = pairs.map((pair) => tickGapsByTick(pair.base, window));
  const longestBase = (p4: Tick) => Math.max(...base.map((gaps) => gaps.get(p4) ?? -Infinity));
  return Math.max(...pairs.flatMap((pair) => [...tickGapsByTick(pair.head, window)].map(([p4, gap]) => gap - longestBase(p4))));
}

export function runMetrics(capture: Capture, window: TickRange): RunMetrics {
  const within = span(capture, window);
  if (within === null) throw new RangeError(`the run never reached P4 tick ${window.to}`);
  const inWindow = (at: number) => at >= within.start && at <= within.end;
  const frameGaps = gaps(capture.frames.filter(inWindow));
  const tickGaps = gaps(capture.ticks.filter(({ p4 }) => p4 !== null && p4 >= window.from && p4 <= window.to).map(({ at }) => at));
  const renders = capture.draws.filter(({ at }) => inWindow(at));
  const draws = renders.map(({ calls }) => calls);
  const triangles = renders.map(({ triangles: count }) => count);
  return {
    frameP95: percentile(frameGaps, 0.95),
    tickGapP95: percentile(tickGaps, 0.95),
    tickGapMax: Math.max(...tickGaps),
    drawCallsMedian: draws.length > 0 ? median(draws) : null,
    drawCallsMax: draws.length > 0 ? Math.max(...draws) : null,
    trianglesMax: triangles.length > 0 ? Math.max(...triangles) : null,
    canvasToViewport: capture.largestCanvasPixels / capture.viewportPixels,
  };
}

function ticksSinceInnerVoidOnset(capture: Capture, sample: TickSample): number | null {
  const onsets = capture.ticks.filter(({ at, stage }, i) => at <= sample.at && stage === "inner-void" && capture.ticks[i - 1]?.stage !== "inner-void");
  const onset = onsets[onsets.length - 1];
  if (!onset || onset.p4 === null || sample.p4 === null) return null;
  return sample.p4 - onset.p4;
}

type Growth = Readonly<{ observed: Readonly<Record<GrowthBudget, number>> }> | Readonly<{ problem: string }>;

const heapBytes = ({ usedBytes, backingBytes }: HeapReading): number => usedBytes + backingBytes;

function longRunGrowth(capture: Capture, { from, to }: TickRange): Growth {
  const first = tickAt(capture, from);
  const last = tickAt(capture, to);
  if (!first || !last) return { problem: `never reached P4 tick ${to}` };
  if (first.renderer === null || last.renderer === null) return { problem: "no renderer resource counts" };
  const offsets = [ticksSinceInnerVoidOnset(capture, first), ticksSinceInnerVoidOnset(capture, last)];
  if (offsets[0] === null || offsets[0] !== offsets[1]) return { problem: `P4 ticks ${from} and ${to} are at cycle offsets ${offsets.join(" and ")}` };
  const retired = capture.retired.filter((at) => at > from && at <= to).length;
  if (retired === 0) return { problem: `no rift retired between P4 ticks ${from} and ${to}` };
  const heapFrom = capture.heap.find(({ p4 }) => p4 >= from && p4 < to);
  const heapTo = capture.heap.find(({ p4 }) => p4 >= to);
  if (!heapFrom || !heapTo) return { problem: `no heap reading ${heapFrom ? `from P4 tick ${to}` : `between P4 ticks ${from} and ${to}`}` };
  return {
    observed: {
      geometriesPerRetiredRift3d: (last.renderer.geometries - first.renderer.geometries) / retired,
      texturesPerRetiredRift3d: (last.renderer.textures - first.renderer.textures) / retired,
      heapGrowthMiB3d: (heapBytes(heapTo) - heapBytes(heapFrom)) / MIB,
      mobGrowth3d: last.world.mobs - first.world.mobs,
      entityGrowth3d: last.world.entities - first.world.entities,
      projectileGrowth3d: last.world.projectiles - first.world.projectiles,
      sceneObjectGrowth3d: last.renderer.sceneObjects - first.renderer.sceneObjects,
    },
  };
}

export function judge(config: Config, runs: Runs): readonly Line[] {
  const { window, resources } = config.workload;
  const pairs = runs.timing.kind === "pairs" ? runs.timing.pairs : [];
  const named = pairs.flatMap((pair, i) => SIDES.map((side) => [`${side}-${i + 1}`, pair[side]] as const));
  const problems = [
    ...named.flatMap(([name, capture]) => measurementProblems(name, capture, window)),
    ...measurementProblems("long", runs.long, window),
    ...measurementProblems("long", runs.long, resources),
  ];
  const growth = longRunGrowth(runs.long, resources);
  if ("problem" in growth) problems.push({ kind: "measurement", run: "long", problem: growth.problem });
  if (problems.length > 0 || "problem" in growth) return problems;

  const long = runMetrics(runs.long, window);
  const measured = (value: number | null) => value ?? Infinity;
  const observed: Readonly<Record<Exclude<BudgetName, "tickGapExcess3d">, number>> = {
    drawCallsMedian3d: measured(long.drawCallsMedian),
    drawCallsMax3d: measured(long.drawCallsMax),
    trianglesMax3d: measured(long.trianglesMax),
    ...growth.observed,
    bundleKiB: Math.ceil(runs.bundleBytes / 1024),
  };
  const budget = (name: BudgetName, value: number): Line => ({ kind: "budget", name, observed: value, budget: config.budgets[name] });
  const excess = runs.timing.kind === "pairs" ? [budget("tickGapExcess3d", tickGapExcess(pairs, window))] : [];
  const budgets = BUDGETS.flatMap((name): Line[] => (name === "tickGapExcess3d" ? excess : [budget(name, observed[name])]));
  if (runs.timing.kind === "not-run") return budgets;
  const metrics = (side: Side) => pairs.map((pair) => runMetrics(pair[side], window));
  const timings: Line[] = TIMINGS.map((measure) => {
    const base = metrics("base").map((run) => run[measure]);
    const head = metrics("head").map((run) => run[measure]);
    return { kind: "timing", measure, base, head, medianRatio: median(head.map((value, i) => value / base[i])), limit: config.timing.medianRatioLimit };
  });
  return [...budgets, ...timings];
}

const limits = (config: Config): Readonly<Record<Limit, number>> => ({ ...config.budgets, medianRatioLimit: config.timing.medianRatioLimit });

const sameRaise = (a: BudgetException, b: BudgetException): boolean => a.budget === b.budget && a.from === b.from && a.to === b.to;

export function budgetRaises(base: BaseLimits | null, head: Config): readonly Line[] {
  if (base === null) return [];
  const now = limits(head);
  return LIMITS.flatMap((limit): Line[] => {
    const was = base.limits[limit];
    if (was === undefined || now[limit] <= was) return [];
    const added = head.exceptions.filter((entry) => !base.exceptions.some((old) => sameRaise(old, entry)));
    const exception = added.find((entry) => entry.budget === limit && entry.from === was && entry.to === now[limit]) ?? null;
    return [{ kind: "raise", limit, base: was, head: now[limit], exception }];
  });
}

type Json = unknown;

function field(raw: Json, key: string): Json {
  if (typeof raw !== "object" || raw === null || !(key in raw)) throw new TypeError(`missing ${key}`);
  return Object.getOwnPropertyDescriptor(raw, key)?.value;
}

function num(raw: Json, key: string): number {
  return finite(field(raw, key));
}

function finite(raw: Json): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new TypeError(`${String(raw)} is not a number`);
  return raw;
}

function list(raw: Json, key: string): readonly Json[] {
  const value = field(raw, key);
  if (!Array.isArray(value)) throw new TypeError(`${key} is not a list`);
  return value;
}

function tuple(raw: Json, length: number): readonly Json[] {
  if (!Array.isArray(raw) || raw.length !== length) throw new TypeError(`${JSON.stringify(raw)} is not a ${length}-tuple`);
  return raw;
}

function range(raw: Json, key: string): TickRange {
  const value = field(raw, key);
  return { from: tick(num(value, "from")), to: tick(num(value, "to")) };
}

function isLimit(value: Json): value is Limit {
  return LIMITS.some((limit) => limit === value);
}

function text(raw: Json, key: string): string {
  const value = field(raw, key);
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${key} is not a non-empty string`);
  return value;
}

function exceptions(raw: Json): readonly BudgetException[] {
  return list(raw, "exceptions").map((entry) => {
    const budget = field(entry, "budget");
    if (!isLimit(budget)) throw new TypeError(`exception budget ${String(budget)} is not a budget`);
    return { budget, from: num(entry, "from"), to: num(entry, "to"), reason: text(entry, "reason"), evidence: text(entry, "evidence") };
  });
}

function has(raw: Json, key: string): boolean {
  return typeof raw === "object" && raw !== null && key in raw;
}

export function parseConfig(raw: Json): Config {
  const workload = field(raw, "workload");
  const query = field(workload, "query");
  if (typeof query !== "string") throw new TypeError("workload.query is not a string");
  const budgets = field(raw, "budgets");
  const timing = field(raw, "timing");
  const pairs = num(timing, "pairs");
  if (!Number.isInteger(pairs) || pairs < 1) throw new RangeError("timing.pairs is not a positive whole number");
  const cpuThrottleRate = num(workload, "cpuThrottleRate");
  if (cpuThrottleRate < 1) throw new RangeError("workload.cpuThrottleRate is below 1");
  return {
    workload: { query, cpuThrottleRate, window: range(workload, "window"), resources: range(workload, "resources") },
    budgets: {
      drawCallsMedian3d: num(budgets, "drawCallsMedian3d"),
      drawCallsMax3d: num(budgets, "drawCallsMax3d"),
      trianglesMax3d: num(budgets, "trianglesMax3d"),
      tickGapExcess3d: num(budgets, "tickGapExcess3d"),
      geometriesPerRetiredRift3d: num(budgets, "geometriesPerRetiredRift3d"),
      texturesPerRetiredRift3d: num(budgets, "texturesPerRetiredRift3d"),
      heapGrowthMiB3d: num(budgets, "heapGrowthMiB3d"),
      mobGrowth3d: num(budgets, "mobGrowth3d"),
      entityGrowth3d: num(budgets, "entityGrowth3d"),
      projectileGrowth3d: num(budgets, "projectileGrowth3d"),
      sceneObjectGrowth3d: num(budgets, "sceneObjectGrowth3d"),
      bundleKiB: num(budgets, "bundleKiB"),
    },
    timing: { pairs, medianRatioLimit: num(timing, "medianRatioLimit") },
    headless: { viewAllocationsPerFrame: num(field(raw, "headless"), "viewAllocationsPerFrame") },
    exceptions: exceptions(raw),
  };
}

export function parseBaseLimits(raw: Json): BaseLimits {
  const budgets = field(raw, "budgets");
  const timing = field(raw, "timing");
  const present = LIMITS.flatMap((limit) => {
    const source = limit === "medianRatioLimit" ? timing : budgets;
    return has(source, limit) ? [[limit, num(source, limit)] as const] : [];
  });
  return { limits: Object.fromEntries(present), exceptions: has(raw, "exceptions") ? exceptions(raw) : [] };
}

export function parseCapture(raw: Json): Capture {
  const viewport = field(raw, "viewport");
  const canvas = field(raw, "largestCanvas");
  return {
    viewportPixels: num(viewport, "width") * num(viewport, "height") * num(viewport, "dpr") ** 2,
    frames: list(raw, "frames").map(finite),
    ticks: list(raw, "ticks").map((sample) => {
      const p4 = field(sample, "p4");
      const stage = field(sample, "stage");
      if (stage !== null && typeof stage !== "string") throw new TypeError(`stage ${String(stage)} is not a string`);
      const world = field(sample, "world");
      const renderer = field(sample, "renderer");
      return {
        at: num(sample, "at"),
        p4: p4 === null ? null : tick(finite(p4)),
        stage,
        world: { mobs: num(world, "mobs"), entities: num(world, "entities"), projectiles: num(world, "projectiles") },
        renderer: renderer === null ? null : { geometries: num(renderer, "geometries"), textures: num(renderer, "textures"), sceneObjects: num(renderer, "sceneObjects") },
      };
    }),
    draws: list(raw, "draws").map((sample) => {
      const [at, calls, triangles] = tuple(sample, 3);
      return { at: finite(at), calls: finite(calls), triangles: finite(triangles) };
    }),
    heap: list(raw, "heap").map((reading) => ({ p4: tick(num(reading, "p4")), usedBytes: num(reading, "usedBytes"), backingBytes: num(reading, "backingBytes") })),
    largestCanvasPixels: num(canvas, "width") * num(canvas, "height"),
    retired: list(raw, "retired").map((at) => tick(finite(at))),
    errors: list(raw, "errors").map(String),
  };
}
