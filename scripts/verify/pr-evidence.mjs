#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = `usage: pr-evidence.mjs PLAN_JSON BODY_FILE

Exits 0 when BODY_FILE's Verification section records the proof PLAN_JSON
calls for. Prints each missing piece. A change that selects every unit must
name CI, because that run is the full browser proof. A T1 change that selects
the timing pairs must report the frame time, the tick gap, or the draw calls.
`;

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function readPlan(json) {
  if (!isRecord(json) || (json.tier !== "t0" && json.tier !== "t1" && json.tier !== "t2")) throw new Error("the plan has no tier");
  if (!Array.isArray(json.units) || !json.units.every((unit) => typeof unit === "string")) throw new Error("the plan has no unit list");
  return { tier: json.tier, units: json.units };
}

export function verificationSection(body) {
  const text = body.replace(/<!--[\s\S]*?-->/g, "");
  const start = text.search(/^## Verification\s*$/m);
  if (start < 0) return null;
  const rest = text.slice(start).split("\n").slice(1);
  const next = rest.findIndex((line) => /^## /.test(line));
  return (next < 0 ? rest : rest.slice(0, next)).join("\n");
}

export function missingProof(body, plan) {
  const section = verificationSection(body);
  if (section === null) return ["the pull request has no ## Verification section"];
  const missing = [];
  if (!section.includes("scripts/verify.sh")) missing.push("the Verification section does not name a scripts/verify.sh command");
  if (!/\bPASS\b|actions\/runs\/\d+/.test(section)) missing.push("the Verification section does not record a PASS line or a GitHub Actions run");
  if (plan.tier === "t2" && !/\bCI\b|actions\/runs\/\d+/.test(section)) missing.push("this change selects every unit, so the Verification section must name CI");
  if (plan.tier === "t1" && plan.units.includes("perf_timing") && !/frame|draw call|tick-gap|tick gap/i.test(section)) {
    missing.push("the plan selects the timing pairs, so the Verification section must report the frame time, the tick gap, or the draw calls");
  }
  return missing;
}

function main() {
  const [planFile, bodyFile] = process.argv.slice(2);
  if (planFile === undefined || bodyFile === undefined || planFile === "-h" || planFile === "--help") {
    process.stdout.write(usage);
    process.exit(planFile === "-h" || planFile === "--help" ? 0 : 2);
  }
  const plan = readPlan(JSON.parse(fs.readFileSync(planFile, "utf8")));
  const missing = missingProof(fs.readFileSync(bodyFile, "utf8"), plan);
  if (missing.length > 0) {
    for (const line of missing) process.stderr.write(`evidence: ${line}\n`);
    process.exit(1);
  }
  process.stdout.write("evidence: the pull request records its proof\n");
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
