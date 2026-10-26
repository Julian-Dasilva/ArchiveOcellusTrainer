#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const usage = `usage: t2-summary.mjs T2_DIR

Reads the browser report in T2_DIR/browser/browser-checks.json and the
artifacts the T2 jobs uploaded to T2_DIR/artifacts, writes the one T2
verdict to T2_DIR/verdict.json, and prints it as Markdown. Exits 0 when every
browser unit and check, the production stage and the perf budgets passed,
and the throttled timing pairs passed too when the plan selected them (or
when no plan was uploaded).
`;

const [dir] = process.argv.slice(2);
if (dir === undefined) {
  process.stderr.write(usage);
  process.exit(2);
}

const artifact = (name, file) => path.join(dir, "artifacts", name, file);
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const stage = (name, file) => /^(PASS|FAIL) /m.exec(read(artifact(name, file)) ?? "")?.[1] ?? "missing";

const report = JSON.parse(read(path.join(dir, "browser", "browser-checks.json")) ?? '{"units":{},"checks":{},"notJudged":{}}');
const units = Object.entries(report.units);
const failedUnits = units.filter(([, { outcome }]) => outcome !== "passed");
const failedChecks = Object.keys(report.checks).filter((name) => !report.checks[name]);
const assets = read(artifact("t2-assets", "assets-diff.txt"));
const plan = read(artifact("t2-plan", "plan.json"));
const timingSelected = plan === null || JSON.parse(plan).units.includes("perf_timing");
const verdict = {
  head: process.env.GITHUB_SHA ?? null,
  base: process.env.BASE ?? null,
  sdk: read(artifact("t2-assets", "sdk-pin.txt"))?.trim() ?? "missing",
  browser: { passed: units.length > 0 && failedUnits.length === 0 && failedChecks.length === 0, ...report },
  production: stage("t2-production", "summary.txt"),
  perf: stage("perf-evidence", "summary.txt"),
  perfTiming: timingSelected ? stage("perf-timing-evidence", "summary.txt") : "not selected by the plan",
  assets: assets === null ? "missing" : JSON.parse(assets.trimEnd().split("\n").at(-1)),
};
const passed = verdict.browser.passed && verdict.production === "PASS" && verdict.perf === "PASS" && (verdict.perfTiming === "PASS" || !timingSelected);
fs.writeFileSync(path.join(dir, "verdict.json"), `${JSON.stringify({ passed, ...verdict }, null, 2)}\n`);

const lines = [
  `## T2 ${passed ? "PASS" : "FAIL"} at ${verdict.head ?? "an unknown head"}`,
  "",
  `- browser: ${units.length - failedUnits.length} of ${units.length} units passed, ${Object.keys(report.checks).length - failedChecks.length} of ${Object.keys(report.checks).length} checks passed`,
  ...failedUnits.map(([unit, { outcome, failed, cause, detail }]) => `  - ${unit} ${outcome}${failed ? `: ${failed.join(", ")}` : ""}${cause ? ` in its ${cause}: ${[detail].flat().at(-1) ?? ""}` : ""}`),
  ...failedChecks.filter((name) => !units.some(([, { failed }]) => failed?.includes(name))).map((name) => `  - check ${name} failed`),
  ...Object.entries(report.notJudged).map(([name, missing]) => `  - check ${name} not judged: ${missing.join(", ")} did not complete`),
  `- production: ${verdict.production}`,
  `- perf budgets: ${verdict.perf}`,
  `- perf timing pairs: ${verdict.perfTiming}`,
  `- assets: ${verdict.assets === "missing" ? "missing" : `${verdict.assets.deleted.length} deleted, ${verdict.assets.added.length} added, ${verdict.assets.changed.length} changed against the base`}`,
  ...(verdict.assets === "missing" ? [] : verdict.assets.deleted.map((key) => `  - deleted ${key}`)),
  `- SDK: ${verdict.sdk}`,
];
console.log(lines.join("\n"));
process.exit(passed ? 0 : 1);
