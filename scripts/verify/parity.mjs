#!/usr/bin/env node
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

const usage = `usage: parity.mjs BASE_DUMP HEAD_DUMP [CHANGED_PATH...]

Compares the seeded fights of test/parity/fights.parity.ts at the base and at
the head, and prints each fight that differs with its first differing value.
A difference is expected when a changed path starts with one of the prefixes
in PARITY_FIGHT_CODE, and fails otherwise. Exits 0 when every fight matches or
every difference is expected.
`;

const [baseFile, headFile, ...changed] = process.argv.slice(2);
if (headFile === undefined || process.env.PARITY_FIGHT_CODE === undefined) {
  process.stderr.write(usage);
  process.exit(2);
}

const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const head = JSON.parse(fs.readFileSync(headFile, "utf8"));
const show = (value) => (value === undefined ? "nothing" : JSON.stringify(value).slice(0, 160));

function firstDifference(a, b, at) {
  if (isDeepStrictEqual(a, b)) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return `${at}: base ${show(a)}, head ${show(b)}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = firstDifference(a[key], b[key], Array.isArray(a) ? `${at}[${key}]` : `${at}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

const names = [...new Set([...Object.keys(base), ...Object.keys(head)])];
const differing = names.filter((name) => !isDeepStrictEqual(base[name], head[name]));
for (const name of differing) console.log(`parity: ${name} differs at ${firstDifference(base[name], head[name], name)}`);

const fightCode = process.env.PARITY_FIGHT_CODE.split(" ").filter(Boolean);
const reason = changed.find((file) => fightCode.some((prefix) => file.startsWith(prefix)));
console.log(`parity: ${names.length - differing.length} of ${names.length} seeded fights match the base`);
if (differing.length === 0) process.exit(0);
if (reason !== undefined) {
  console.log(`parity: expected, the change touches fight code (${reason})`);
  process.exit(0);
}
console.log(`parity: the change touches no fight code (${fightCode.join(", ")}), so no seeded fight may differ`);
process.exit(1);
