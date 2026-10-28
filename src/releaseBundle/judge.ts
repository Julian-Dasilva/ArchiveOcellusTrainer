import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { builtScripts, kib, pageBytes } from "../perf/pageScripts";
import type { BuiltScript, ScriptRole } from "../perf/pageScripts";

const FULL_FIGHT = "Full fight (beta)";
const BEACON_MARKERS = ["beacon.min.js", "cloudflareinsights.com"] as const;
const RELEASE_SAMPLE_RATE = 0.1;

export type ReleaseCheck = Readonly<{
  problems: readonly string[];
  drillKiB: number;
  fullFightKiB: number;
  budgetKiB: number;
}>;

function read(dist: string, path: string): string {
  return readFileSync(join(dist, path), "utf8");
}

function contentHash(path: string): string | null {
  const parts = basename(path).split(".");
  if (parts.length !== 3 || parts[0] !== "full-fight" || parts[2] !== "js") return null;
  const hash = parts[1];
  return hash !== undefined && /^[0-9a-f]+$/.test(hash) ? hash : null;
}

function textOf(dist: string, scripts: readonly BuiltScript[], roles: readonly ScriptRole[]): string {
  return scripts.filter((script) => roles.includes(script.role)).map((script) => read(dist, script.path)).join("\n");
}

function sampleRate(dist: string): number | null {
  let raw: unknown;
  try {
    raw = JSON.parse(read(dist, "telemetry.json"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const rate = Object.getOwnPropertyDescriptor(raw, "sampleRate")?.value;
  return typeof rate === "number" ? rate : null;
}

export function judgeRelease(dist: string, budgetKiB: number): ReleaseCheck {
  const scripts = builtScripts(dist);
  const drillKiB = kib(pageBytes(scripts, "drill"));
  const fullFightKiB = kib(pageBytes(scripts, "full"));
  const problems: string[] = [];
  const entry = textOf(dist, scripts, ["entry"]);
  if (!entry.includes("full_fight") || !entry.includes(FULL_FIGHT)) problems.push("the entry does not contain the Full fight (beta) button");
  if (scripts.some((script) => script.role === "sidebar")) problems.push("the sidebar is a separate chunk");
  const fullChunk = scripts.find((script) => script.role === "full-fight");
  const hash = fullChunk === undefined ? null : contentHash(fullChunk.path);
  if (fullChunk === undefined || hash === null) problems.push("?mode=full has no full-fight chunk");
  else {
    const referenced = scripts.some((script) => script.role === "entry" && read(dist, script.path).includes(hash));
    if (!referenced) problems.push("the entry script does not reference the full-fight chunk");
  }
  const rate = sampleRate(dist);
  if (rate !== RELEASE_SAMPLE_RATE) problems.push(`telemetry.json sampleRate is ${String(rate)}, not ${RELEASE_SAMPLE_RATE}`);
  for (const script of scripts) {
    const text = read(dist, script.path);
    for (const marker of BEACON_MARKERS) {
      if (text.includes(marker)) problems.push(`${script.path} contains ${marker}`);
    }
  }
  if (drillKiB > budgetKiB) problems.push(`/ scripts are ${drillKiB} KiB, over the ${budgetKiB} KiB budget`);
  return { problems, drillKiB, fullFightKiB, budgetKiB };
}
