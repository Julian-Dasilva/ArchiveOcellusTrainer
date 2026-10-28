import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtScripts, kib, pageBytes } from "../perf/pageScripts";
import type { BuiltScript } from "../perf/pageScripts";

/** The full fight's Start at selector, which the drill page never had. */
const FULL_FIGHT_MARKER = "start_phase";
const RETIRED_DRILL_MARKERS = ["drill_controls", "phase_4_drill"] as const;
const BEACON_MARKERS = ["beacon.min.js", "cloudflareinsights.com"] as const;
const RELEASE_SAMPLE_RATE = 0.1;

export type ReleaseCheck = Readonly<{
  problems: readonly string[];
  pageKiB: number;
  budgetKiB: number;
}>;

function read(dist: string, path: string): string {
  return readFileSync(join(dist, path), "utf8");
}

function entryText(dist: string, scripts: readonly BuiltScript[]): string {
  return scripts.filter((script) => script.entry).map((script) => read(dist, script.path)).join("\n");
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
  const pageKiB = kib(pageBytes(scripts));
  const problems: string[] = [];
  const entry = entryText(dist, scripts);
  if (!entry.includes(FULL_FIGHT_MARKER)) problems.push("the entry does not contain the full fight's Start at selector");
  for (const marker of RETIRED_DRILL_MARKERS) {
    if (entry.includes(marker)) problems.push(`the entry still contains the retired drill page's ${marker}`);
  }
  const rate = sampleRate(dist);
  if (rate !== RELEASE_SAMPLE_RATE) problems.push(`telemetry.json sampleRate is ${String(rate)}, not ${RELEASE_SAMPLE_RATE}`);
  for (const script of scripts) {
    const text = read(dist, script.path);
    for (const marker of BEACON_MARKERS) {
      if (text.includes(marker)) problems.push(`${script.path} contains ${marker}`);
    }
  }
  if (pageKiB > budgetKiB) problems.push(`/ scripts are ${pageKiB} KiB, over the ${budgetKiB} KiB budget`);
  return { problems, pageKiB, budgetKiB };
}
