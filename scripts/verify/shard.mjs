#!/usr/bin/env node
import fs from "node:fs";

const usage = `usage: shard.mjs SECONDS_JSON INDEX COUNT UNIT...

Splits the units into COUNT shards of about equal time and prints shard INDEX
(1-based), one unit per line, in the order given. Each unit goes, longest
first, to the shard with the least time so far. A unit missing from
SECONDS_JSON weighs the median of the others.
`;

const [file, index, count, ...units] = process.argv.slice(2);
const at = Number(index), shards = Number(count);
if (units.length === 0 || !Number.isInteger(shards) || shards < 1 || !Number.isInteger(at) || at < 1 || at > shards) {
  process.stderr.write(usage);
  process.exit(2);
}

const { seconds } = JSON.parse(fs.readFileSync(file, "utf8"));
const known = Object.values(seconds).sort((a, b) => a - b);
const median = known[Math.floor(known.length / 2)] ?? 1;
const weight = (unit) => seconds[unit] ?? median;
const load = Array.from({ length: shards }, () => ({ seconds: 0, units: new Set() }));
for (const unit of [...units].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
  const lightest = load.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
  lightest.seconds += weight(unit);
  lightest.units.add(unit);
}
for (const unit of units.filter((unit) => load[at - 1].units.has(unit))) console.log(unit);
