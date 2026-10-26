import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UNITS = path.join(path.dirname(fileURLToPath(import.meta.url)), "units");

export const unitIds = () => fs.readdirSync(UNITS).filter((file) => file.endsWith(".mjs")).map((file) => file.slice(0, -".mjs".length)).sort();

export const loadUnit = (unit) => import(path.join(UNITS, `${unit}.mjs`));

export const nonEmpty = (file) => (fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 0;

export function readers(unit, dir, declared) {
  const at = (file) => {
    if (!declared.includes(file)) throw new Error(`${unit} reads ${file}, which is not one of its captures`);
    return path.join(dir, file);
  };
  const text = (file) => fs.readFileSync(at(file), "utf8");
  return { text, bytes: (file) => fs.readFileSync(at(file)), read: (file) => JSON.parse(text(file)) };
}
