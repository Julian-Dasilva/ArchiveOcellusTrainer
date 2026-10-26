#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadUnit, readers } from "./capture.mjs";
import { crossChecks } from "./cross.mjs";

const usage = `usage: report.mjs DIR UNIT...

Reads DIR/units/UNIT/verdict.json for every unit the browser stage selected;
a selected unit without one fails. A check that spans units is judged once
every unit it reads has completed, and is listed as not judged otherwise.
Writes DIR/browser-checks.json and exits 0 when every selected unit and every
judged cross-unit check passed.
`;

const [dir, ...selected] = process.argv.slice(2);
if (selected.length === 0) {
  process.stderr.write(usage);
  process.exit(2);
}

const verdictOf = (unit) => {
  const file = path.join(dir, "units", unit, "verdict.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { unit, outcome: "missing" };
};
const verdicts = selected.map(verdictOf);
const completed = new Map(verdicts.filter(({ outcome }) => outcome === "passed" || outcome === "failed").map((verdict) => [verdict.unit, verdict]));

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function merge(into, from, at) {
  for (const [key, value] of Object.entries(from)) {
    if (isObject(value) && isObject(into[key])) merge(into[key], value, `${at}${key}.`);
    else if (key in into) throw new Error(`${at}${key} comes from two units`);
    else into[key] = value;
  }
  return into;
}
const checks = [...completed.values()].reduce((all, verdict) => merge(all, verdict.checks, "checks."), {});

const declared = new Map(await Promise.all([...completed.keys()].map(async (unit) => [unit, (await loadUnit(unit)).captures(process.env)])));
const reader = (unit) => readers(unit, path.join(dir, "units", unit), declared.get(unit));
const notJudged = {};
for (const [name, { units, judge }] of Object.entries(crossChecks)) {
  const absent = units.filter((unit) => !completed.has(unit));
  if (absent.length > 0) {
    notJudged[name] = absent;
    console.log(`NOT JUDGED check ${name}: needs units ${absent.join(", ")}`);
    continue;
  }
  try {
    const observed = units.reduce((all, unit) => merge(all, structuredClone(completed.get(unit).observed), "observed."), {});
    checks[name] = judge({ observed, read: (unit, file) => reader(unit).read(file), text: (unit, file) => reader(unit).text(file), env: process.env });
  } catch (error) {
    console.error(`verify: check ${name} threw: ${error?.stack ?? error}`);
    checks[name] = false;
  }
  console.log(`${checks[name] ? "PASS" : "FAIL"} check ${name} across ${units.length} units`);
}

const summary = ({ outcome, seconds, failed, cause, detail }) => ({ outcome, seconds, ...(failed && { failed }), ...(cause && { cause, detail }) });
const units = Object.fromEntries(verdicts.map((verdict) => [verdict.unit, summary(verdict)]));
fs.writeFileSync(path.join(dir, "browser-checks.json"), `${JSON.stringify({ units, checks, notJudged }, null, 2)}\n`);

for (const { unit } of verdicts.filter(({ outcome }) => outcome === "missing")) console.log(`FAIL unit ${unit}: no verdict`);
const passedUnits = verdicts.filter(({ outcome }) => outcome === "passed").length;
const failedChecks = Object.keys(checks).filter((name) => !checks[name]);
console.log(`browser: ${passedUnits} of ${verdicts.length} units passed, ${Object.keys(checks).length - failedChecks.length} of ${Object.keys(checks).length} judged checks passed` +
  (Object.keys(notJudged).length > 0 ? `, ${Object.keys(notJudged).length} cross-unit checks not judged` : ""));
process.exit(passedUnits === verdicts.length && failedChecks.length === 0 ? 0 : 1);
