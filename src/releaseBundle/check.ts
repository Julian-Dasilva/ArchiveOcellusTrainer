import { readFileSync } from "node:fs";
import { parseConfig } from "../perf/gate";
import { judgeRelease } from "./judge";

const USAGE = "usage: check.ts <dist directory>";

function budgetKiB(): number {
  return parseConfig(JSON.parse(readFileSync("src/perf/perfGate.json", "utf8"))).budgets.bundleKiB;
}

function main(args: readonly string[]): void {
  const [dist] = args;
  if (dist === undefined || args.length !== 1) throw new Error(USAGE);
  const budget = budgetKiB();
  const report = judgeRelease(dist, budget);
  console.log(`release-bundle: / ${report.pageKiB} KiB against a budget of ${report.budgetKiB}`);
  for (const problem of report.problems) console.error(`release-bundle: ${problem}`);
  if (report.problems.length > 0) process.exitCode = 1;
}

main(process.argv.slice(2));
