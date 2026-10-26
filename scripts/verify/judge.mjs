#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadUnit, nonEmpty, readers } from "./capture.mjs";

const usage = `usage: judge.mjs UNIT DIR DRIVE_STATUS SECONDS

Writes DIR/verdict.json for one browser unit and prints one line. A drive that
exited non-zero aborts the unit with the lines it logged to DIR/unit.log.
Otherwise every capture the unit lists must be non-empty, and the unit's
checks decide. Exits 0 when the unit passed.
`;

const [unit, dir, driveStatus, seconds] = process.argv.slice(2);
if (seconds === undefined) {
  process.stderr.write(usage);
  process.exit(2);
}

const { captures, judge } = await loadUnit(unit);
const declared = captures(process.env);
const logged = () => (nonEmpty(path.join(dir, "unit.log")) ? fs.readFileSync(path.join(dir, "unit.log"), "utf8").split("\n").filter(Boolean) : []);

function decide() {
  if (driveStatus !== "0") return { outcome: "aborted", cause: "drive", detail: logged() };
  const missing = declared.filter((file) => !nonEmpty(path.join(dir, file)));
  if (missing.length > 0) return { outcome: "aborted", cause: "captures", detail: missing };
  const write = (file, content) => fs.writeFileSync(path.join(dir, file), content);
  try {
    const { observed, checks } = judge({ ...readers(unit, dir, declared), write, env: process.env });
    const failed = Object.keys(checks).filter((name) => !checks[name]);
    return failed.length === 0 ? { outcome: "passed", checks, observed } : { outcome: "failed", failed, checks, observed };
  } catch (error) {
    return { outcome: "aborted", cause: "judge", detail: [String(error?.stack ?? error)] };
  }
}

const verdict = { unit, seconds: Number(seconds), ...decide() };
fs.writeFileSync(path.join(dir, "verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`);
switch (verdict.outcome) {
  case "passed":
    console.log(`PASS unit ${unit}: ${Object.keys(verdict.checks).length} checks in ${seconds} s`);
    break;
  case "failed":
    console.log(`FAIL unit ${unit}: ${verdict.failed.join(", ")}`);
    break;
  case "aborted":
    console.log(`FAIL unit ${unit}: aborted in its ${verdict.cause}: ${verdict.detail.at(-1) ?? "no log line"}`);
    break;
}
process.exit(verdict.outcome === "passed" ? 0 : 1);
