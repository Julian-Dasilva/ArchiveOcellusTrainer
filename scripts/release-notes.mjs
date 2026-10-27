#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const usage = `usage: release-notes.mjs [--since VERSION] [CHANGELOG]

Prints the newest release in CHANGELOG (default: src/content/ocellus/changelog.ts)
as Markdown, for gh release create VERSION --notes-file -.
With --since VERSION, prints every release newer than VERSION, newest first.
VERSION is YYYY.MM.DD or YYYY.MM.DD.N, and that release is not included.
Exits 1 when the newest version is not YYYY.MM.DD or YYYY.MM.DD.N, or repeats
an earlier release's version.
`;

const VERSION = /^\d{4}\.\d{2}\.\d{2}(\.[1-9]\d*)?$/;

const args = process.argv.slice(2);
let since = null;
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--since") {
    since = args[index + 1] ?? "";
    index += 1;
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

const problem = !VERSION.test(newest.version)
  ? `newest version ${JSON.stringify(newest.version)} is not YYYY.MM.DD or YYYY.MM.DD.N`
  : earlier.some((release) => release.version === newest.version)
    ? `newest version ${newest.version} repeats an earlier release`
    : null;
if (problem !== null) {
  process.stderr.write(`release-notes: ${problem}\n`);
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

if (since !== null) {
  if (!VERSION.test(since)) {
    process.stderr.write(`release-notes: --since ${JSON.stringify(since)} is not YYYY.MM.DD or YYYY.MM.DD.N\n`);
    process.exit(1);
  }
  const later = CHANGELOG.filter((release) => isAfter(release.version, since));
  if (later.length === 0) {
    process.stderr.write(`release-notes: no release is newer than ${since}\n`);
    process.exit(1);
  }
  process.stdout.write(later.map(markdown).join("\n"));
} else {
  process.stdout.write(markdown(newest));
}
