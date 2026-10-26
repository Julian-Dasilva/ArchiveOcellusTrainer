#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const usage = `usage: assets-diff.mjs BASE_ASSETS HEAD_ASSETS

Compares two public/osrs-assets bundles and prints every manifest entry and
item icon or sprite file that the head deletes, adds or changes, then the same
as JSON on the last line. It reports and never fails: the bundle stage fails a
head bundle that lacks a configured asset.
`;

const [baseDir, headDir] = process.argv.slice(2);
if (headDir === undefined) {
  process.stderr.write(usage);
  process.exit(2);
}

const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const files = (dir, sub) => (fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub), { recursive: true }).map((file) => `${sub}/${file}`) : []);
const entries = (dir) => {
  const m = manifest(dir);
  const listed = ["assets", "playerItems", "spotAnims", "sharedAssets", "references"].flatMap((section) => Object.entries(m[section] ?? {}).map(([key, value]) => [`${section}.${key}`, value]));
  const bytes = (file) => fs.statSync(path.join(dir, file)).size;
  const loose = [...files(dir, "item-icons"), ...files(dir, "sprites")].filter((file) => fs.statSync(path.join(dir, file)).isFile()).map((file) => [file, { bytes: bytes(file) }]);
  return new Map([...listed, ["soundEffects", m.soundEffects ?? null], ["cache", m.cache ?? null], ...loose]);
};

const base = entries(baseDir), head = entries(headDir);
const deleted = [...base.keys()].filter((key) => !head.has(key));
const added = [...head.keys()].filter((key) => !base.has(key));
const changed = [...head.keys()].filter((key) => base.has(key) && !isDeepStrictEqual(base.get(key), head.get(key)));
for (const key of deleted) console.log(`assets: deleted ${key}`);
for (const key of added) console.log(`assets: added ${key}`);
for (const key of changed) console.log(`assets: changed ${key}`);
console.log(`assets: ${deleted.length} deleted, ${added.length} added, ${changed.length} changed of ${base.size} base entries`);
console.log(JSON.stringify({ deleted, added, changed }));
