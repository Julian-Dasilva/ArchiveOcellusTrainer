#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const usage = `usage: release-notes.mjs [--record-shipped] [--since VERSION] [CHANGELOG]

Prints the newest release in CHANGELOG (default: src/content/ocellus/changelog.ts)
as Markdown, for gh release create VERSION --notes-file -.
With --since VERSION, prints every release newer than VERSION, newest first.
VERSION is YYYY.MM.DD or YYYY.MM.DD.N, and that release is not included.
With --record-shipped, also adds every release it prints, each with the digest
of its notes, to shipped-releases.json beside CHANGELOG.
Exits 1 when the newest version is not YYYY.MM.DD or YYYY.MM.DD.N, repeats
an earlier release's version, or when a release in shipped-releases.json is
missing from CHANGELOG or its notes no longer match their digest.
`;

const VERSION = /^\d{4}\.\d{2}\.\d{2}(\.[1-9]\d*)?$/;

const args = process.argv.slice(2);
let since = null;
let recordShipped = false;
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--since") {
    since = args[index + 1] ?? "";
    index += 1;
    continue;
  }
  if (arg === "--record-shipped") {
    recordShipped = true;
    continue;
  }
  if (arg.startsWith("-")) {
    process.stderr.write(usage);
    process.exit(2);
  }
  positional.push(arg);
}
if (positional.length > 1) {
  process.stderr.write(usage);
  process.exit(2);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.resolve(positional[0] ?? path.join(root, "src/content/ocellus/changelog.ts"));
const { CHANGELOG } = await tsImport(pathToFileURL(file).href, import.meta.url);
const [newest, ...earlier] = CHANGELOG;
const shippedFile = path.join(path.dirname(file), "shipped-releases.json");
const shipped = fs.existsSync(shippedFile) ? JSON.parse(fs.readFileSync(shippedFile, "utf8")) : {};

function notesDigest(release) {
  return createHash("sha256").update(JSON.stringify(release.notes)).digest("hex");
}

function shippedProblem([version, digest]) {
  const release = CHANGELOG.find((candidate) => candidate.version === version);
  if (release === undefined) return `${version} shipped but is missing from the changelog`;
  if (notesDigest(release) !== digest) return `${version} shipped, so its notes cannot change; put new notes in a newer release`;
  return null;
}

const problems = [
  !VERSION.test(newest.version)
    ? `newest version ${JSON.stringify(newest.version)} is not YYYY.MM.DD or YYYY.MM.DD.N`
    : earlier.some((release) => release.version === newest.version)
      ? `newest version ${newest.version} repeats an earlier release`
      : null,
  ...Object.entries(shipped).map(shippedProblem),
].filter((problem) => problem !== null);
if (problems.length > 0) {
  process.stderr.write(problems.map((problem) => `release-notes: ${problem}\n`).join(""));
  process.exit(1);
}

function versionOrder(version) {
  const [year, month, day, suffix] = version.split(".");
  return [Number(year), Number(month), Number(day), suffix === undefined ? 0 : Number(suffix)];
}

function isAfter(version, sinceVersion) {
  const left = versionOrder(version);
  const right = versionOrder(sinceVersion);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

function markdown(release) {
  return `## ${release.version}\n\n${release.notes.map((note) => `- ${note}`).join("\n")}\n`;
}

if (since !== null && !VERSION.test(since)) {
  process.stderr.write(`release-notes: --since ${JSON.stringify(since)} is not YYYY.MM.DD or YYYY.MM.DD.N\n`);
  process.exit(1);
}
const published = since === null ? [newest] : CHANGELOG.filter((release) => isAfter(release.version, since));
if (published.length === 0) {
  process.stderr.write(`release-notes: no release is newer than ${since}\n`);
  process.exit(1);
}

if (recordShipped) {
  const recorded = { ...Object.fromEntries(published.map((release) => [release.version, notesDigest(release)])), ...shipped };
  fs.writeFileSync(shippedFile, `${JSON.stringify(recorded, null, 2)}\n`);
}
process.stdout.write(published.map(markdown).join("\n"));
