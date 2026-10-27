#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = `usage: ci-verdict.mjs SHA

Reads the test workflow run for SHA and prints its T2 verdict.
Exits 0 when that verdict passed, 1 when it failed, and 2 when the run
is missing, still going, or has no t2-verdict artifact.
`;

function formatDuration(job) {
  const start = Date.parse(job.startedAt ?? "");
  const end = Date.parse(job.completedAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "running";
  return `${Math.round((end - start) / 1000)}s`;
}

export function ciReport(sha, runs, verdict, jobs) {
  if (!Array.isArray(runs) || runs.length === 0) return { code: 2, text: `ci: no test workflow run for ${sha}\n` };
  const run = runs[0];
  if (run.status !== "completed") return { code: 2, text: `ci: ${run.url} is ${run.status}\n` };
  if (verdict === null) return { code: 2, text: `ci: ${run.url} has no t2-verdict artifact\n` };
  const word = verdict.passed === true ? "PASS" : "FAIL";
  const lines = [`ci: T2 ${word}`, run.url];
  for (const job of jobs) lines.push(`ci: ${job.name} ${job.conclusion ?? job.status} ${formatDuration(job)}`);
  return { code: verdict.passed === true ? 0 : 1, text: `${lines.join("\n")}\n` };
}

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw new Error(`ci: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ci: ${(result.stderr || "gh failed").trim()}`);
  return result.stdout;
}

function main() {
  const sha = process.argv[2];
  if (sha === undefined || sha === "-h" || sha === "--help") {
    process.stdout.write(usage);
    process.exit(sha === "-h" || sha === "--help" ? 0 : 2);
  }
  let runs = [];
  try {
    const listed = JSON.parse(gh(["run", "list", "--commit", sha, "--workflow", "test.yml", "--json", "databaseId,status,conclusion,url,headSha", "--limit", "5"]));
    if (Array.isArray(listed)) runs = listed;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  const run = runs[0];
  let verdict = null;
  let jobs = [];
  if (run !== undefined && run.status === "completed") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-verdict."));
    const downloaded = spawnSync("gh", ["run", "download", String(run.databaseId), "--name", "t2-verdict", "--dir", dir], { encoding: "utf8" });
    const verdictFile = path.join(dir, "verdict.json");
    if (downloaded.status === 0 && fs.existsSync(verdictFile)) verdict = JSON.parse(fs.readFileSync(verdictFile, "utf8"));
    const viewed = spawnSync("gh", ["run", "view", String(run.databaseId), "--json", "jobs"], { encoding: "utf8" });
    if (viewed.status === 0) {
      const body = JSON.parse(viewed.stdout);
      if (Array.isArray(body.jobs)) jobs = body.jobs;
    }
  }
  const report = ciReport(sha, runs, verdict, jobs);
  process.stdout.write(report.text);
  process.exit(report.code);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
