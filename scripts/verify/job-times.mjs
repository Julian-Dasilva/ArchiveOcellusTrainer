#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2];
if (file === undefined) {
  process.stderr.write("usage: job-times.mjs JOBS.tsv\n");
  process.exit(2);
}

for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  if (line === "") continue;
  const [name, conclusion, started, completed] = line.split("\t");
  const start = Date.parse(started ?? "");
  const end = Date.parse(completed ?? "");
  const duration = Number.isFinite(start) && Number.isFinite(end) && end >= start ? `${Math.round((end - start) / 1000)}s` : "running";
  process.stdout.write(`- ${name}: ${conclusion}, ${duration}\n`);
}
