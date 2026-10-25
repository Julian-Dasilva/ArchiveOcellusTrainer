import type { RunEnd, Stage } from "../content/ocellus/js/P4Types";

export const VIEWS = ["3d"] as const;
export const GPU_FAMILIES = ["nvidia", "amd", "intel-arc", "intel", "apple", "adreno", "mali", "powervr", "software", "other", "unavailable"] as const;
export const BROWSER_FAMILIES = ["edge", "opera", "samsung", "firefox", "chrome", "safari", "other"] as const;
const STAGES = ["lead-in", "inner-void", "after-inner", "outer-void", "after-outer"] as const satisfies readonly Stage[];
const ENDS = ["kill", "death", "left"] as const satisfies readonly (RunEnd | "left")[];

export type GpuFamily = (typeof GPU_FAMILIES)[number];
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];

type BlobField = Readonly<{ kind: "blob"; values: readonly string[] } | { kind: "version" }>;
type DoubleField = Readonly<{ kind: "double"; min: number; max: number }>;

const oneOf = <V extends readonly string[]>(values: V) => ({ kind: "blob", values }) as const;
const between = (min: number, max: number) => ({ kind: "double", min, max }) as const;
const MAX_MS = 60_000;
const MAX_COUNT = 10_000_000;

export const SUMMARY_FIELDS = {
  version: { kind: "version" },
  view: oneOf(VIEWS),
  gpu: oneOf(GPU_FAMILIES),
  browser: oneOf(BROWSER_FAMILIES),
  stage: oneOf(STAGES),
  end: oneOf(ENDS),
  sampleRate: between(Number.MIN_VALUE, 1),
  runTicks: between(0, MAX_COUNT),
  frames: between(0, MAX_COUNT),
  frameMedianMs: between(0, MAX_MS),
  frameP95Ms: between(0, MAX_MS),
  frameP99Ms: between(0, MAX_MS),
  framesOver50Ms: between(0, MAX_COUNT),
  tickMedianMs: between(0, MAX_MS),
  tickP95Ms: between(0, MAX_MS),
  tickMaxMs: between(0, MAX_MS),
  lateTicks: between(0, MAX_COUNT),
  devicePixelRatio: between(0, 16),
  canvasWidth: between(0, 100_000),
  canvasHeight: between(0, 100_000),
  cores: between(0, 64),
} as const satisfies Readonly<Record<string, BlobField | DoubleField>>;

type Fields = typeof SUMMARY_FIELDS;
type FieldValue<F> = F extends { kind: "blob"; values: readonly (infer V)[] } ? V : F extends { kind: "version" } ? string : number;

export type PerfSummary = Readonly<{ [K in keyof Fields]: FieldValue<Fields[K]> }>;
export type DataPoint = Readonly<{ blobs: string[]; doubles: number[]; indexes: [string] }>;

const VERSION = /^\d{4}\.\d{2}\.\d{2}(\.[1-9]\d*)?$/;
const MAX_INDEX_BYTES = 96;
const isKey = (key: string): key is keyof Fields => Object.prototype.hasOwnProperty.call(SUMMARY_FIELDS, key);
const KEYS = Object.keys(SUMMARY_FIELDS).filter(isKey);

function validField(field: BlobField | DoubleField, value: unknown): boolean {
  switch (field.kind) {
    case "version":
      return typeof value === "string" && VERSION.test(value) && new TextEncoder().encode(value).length <= MAX_INDEX_BYTES;
    case "blob":
      return typeof value === "string" && field.values.includes(value);
    case "double":
      return typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max;
    default: {
      const unhandled: never = field;
      return unhandled;
    }
  }
}

function isSummary(body: unknown): body is PerfSummary {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const entries = Object.entries(body);
  return entries.length === KEYS.length && entries.every(([key, value]) => isKey(key) && validField(SUMMARY_FIELDS[key], value));
}

export function parseSummary(json: string): PerfSummary | null {
  let body: unknown;
  try {
    body = JSON.parse(json);
  } catch {
    return null;
  }
  return isSummary(body) ? body : null;
}

export function toDataPoint(summary: PerfSummary): DataPoint {
  const isDouble = (key: keyof Fields) => SUMMARY_FIELDS[key].kind === "double";
  return {
    blobs: KEYS.filter((key) => !isDouble(key)).map((key) => String(summary[key])),
    doubles: KEYS.filter(isDouble).map((key) => Number(summary[key])),
    indexes: [summary.version],
  };
}
