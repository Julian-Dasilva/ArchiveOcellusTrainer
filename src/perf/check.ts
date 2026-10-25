import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseLimits, Capture, Line, Pair } from "./gate";
import { SIDES, budgetRaises, judge, parseBaseLimits, parseCapture, parseConfig, passes, runMetrics } from "./gate";

const USAGE = "usage: VERIFY_PERF_BASE=<rev> check.ts <perfGate.json> <captures directory>";
const GATE_PATH = "src/perf/perfGate.json";

function read(file: string): unknown {
  if (!existsSync(file)) throw new Error(`missing capture ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function baseLimits(rev: string): BaseLimits | null {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });
  if (git("ls-tree", "--name-only", `${rev}^{commit}`, "--", GATE_PATH).trim() === "") return null;
  return parseBaseLimits(JSON.parse(git("show", `${rev}^{commit}:${GATE_PATH}`)));
}

function describe(line: Line): string {
  switch (line.kind) {
    case "budget":
      return `${line.name}: ${line.observed} against a budget of ${line.budget}`;
    case "timing":
      return `${line.measure}: head/base median ratio ${line.medianRatio.toFixed(3)} against a limit of ${line.limit} (base ${line.base.map((v) => v.toFixed(1)).join(", ")}; head ${line.head.map((v) => v.toFixed(1)).join(", ")})`;
    case "raise":
      return line.exception === null
        ? `${line.limit}: raised from ${line.base} to ${line.head} against the base. A raise needs an entry in the exceptions list of ${GATE_PATH}, added in this pull request, naming the budget, the old and new values (from, to), the reason and the evidence path`
        : `${line.limit}: raised from ${line.base} to ${line.head} by exception, because ${line.exception.reason} (evidence: ${line.exception.evidence})`;
    case "measurement":
      return `${line.run}: ${line.problem}`;
    default: {
      const unreachable: never = line;
      return unreachable;
    }
  }
}

function main(args: readonly string[]): void {
  const [configFile, dir] = args;
  const base = process.env.VERIFY_PERF_BASE;
  if (configFile === undefined || dir === undefined || args.length !== 2 || base === undefined || base === "") throw new Error(USAGE);
  const config = parseConfig(read(configFile));
  const capture = (name: string): Capture => parseCapture(read(join(dir, `${name}.json`)));
  const pairs = Array.from({ length: config.timing.pairs }, (_, i): Pair => ({ base: capture(`base-${i + 1}`), head: capture(`head-${i + 1}`) }));
  const long = capture("long");
  const lines = [...budgetRaises(baseLimits(base), config), ...judge(config, { pairs, long })];
  const measured = lines.every(({ kind }) => kind !== "measurement");
  const runs = measured
    ? Object.fromEntries([
        ...pairs.flatMap((pair, i) => SIDES.map((side) => [`${side}-${i + 1}`, runMetrics(pair[side], config.workload.window)])),
        ["long", runMetrics(long, config.workload.resources)],
      ])
    : {};
  for (const line of lines) console.error(`perf: ${passes(line) ? "PASS" : "FAIL"} ${describe(line)}`);
  console.log(JSON.stringify({ lines: lines.map((line) => ({ ...line, pass: passes(line) })), runs }, null, 2));
  if (!lines.every(passes)) process.exitCode = 1;
}

main(process.argv.slice(2));
