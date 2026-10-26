#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

const usage = `usage: parity.mjs BASE_DUMP HEAD_DUMP EXPECTED

Compares the seeded fights of test/parity/fights.parity.ts at the base and at
the head, and prints each fight that differs with its first differing value
and the sha256 of its head result. EXPECTED is the reviewed JSON object of
fights the change means to alter, each {"head": SHA256, "why": REASON}. A
difference fails unless EXPECTED names that fight with that head sha256.
Exits 0 when every fight matches the base or differs exactly as expected.
`;

const [baseFile, headFile, expectedFile] = process.argv.slice(2);
if (expectedFile === undefined) {
  process.stderr.write(usage);
  process.exit(2);
}

function parseExpected(json) {
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error("it is not an object of fight names");
  for (const [name, entry] of Object.entries(json)) {
    if (typeof entry?.head !== "string" || !/^[0-9a-f]{64}$/.test(entry.head)) throw new Error(`${name}.head is not a sha256`);
    if (typeof entry.why !== "string" || entry.why.trim() === "") throw new Error(`${name}.why is empty`);
  }
  return json;
}

const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const head = JSON.parse(fs.readFileSync(headFile, "utf8"));
let expected;
try {
  expected = parseExpected(JSON.parse(fs.readFileSync(expectedFile, "utf8")));
} catch (error) {
  process.stderr.write(`parity: ${expectedFile}: ${error.message}\n`);
  process.exit(2);
}
const show = (value) => (value === undefined ? "nothing" : JSON.stringify(value).slice(0, 160));
const digest = (value) => createHash("sha256").update(String(JSON.stringify(value))).digest("hex");

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
const unexpected = [];
for (const name of differing) {
  const sha = digest(head[name]);
  console.log(`parity: ${name} differs at ${firstDifference(base[name], head[name], name)}; head sha256 ${sha}`);
  if (expected[name]?.head === sha) console.log(`parity: ${name} differs as ${expectedFile} expects: ${expected[name].why}`);
  else unexpected.push(name);
}
for (const name of Object.keys(expected).filter((name) => !differing.includes(name))) console.log(`parity: ${expectedFile} expects ${name} to differ, but it matches the base`);

console.log(`parity: ${names.length - differing.length} of ${names.length} seeded fights match the base`);
if (unexpected.length === 0) process.exit(0);
console.log(`parity: ${unexpected.join(", ")} differ${unexpected.length === 1 ? "s" : ""} without an entry for that head in ${expectedFile}`);
process.exit(1);
