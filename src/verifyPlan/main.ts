import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { explain, handoff, parseImpact, plan, runCommand } from "./plan";

const USAGE = "usage: main.ts <impact map> <units directory> [--out <plan.json>] [--handoff <handoff.json>] -- [changed path...]";

function readFlags(flags: readonly string[]): { readonly out: string | undefined; readonly handoffFile: string | undefined } {
  const known = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index];
    const value = flags[index + 1];
    if (name === undefined || value === undefined || (name !== "--out" && name !== "--handoff") || value.startsWith("--") || known.has(name)) throw new Error(USAGE);
    known.set(name, value);
  }
  return { out: known.get("--out"), handoffFile: known.get("--handoff") };
}

function main(args: readonly string[]): void {
  const split = args.indexOf("--");
  const options = split < 0 ? args : args.slice(0, split);
  const paths = split < 0 ? [] : args.slice(split + 1);
  const [mapFile, unitsDir, ...flags] = options;
  if (mapFile === undefined || unitsDir === undefined) throw new Error(USAGE);
  const { out, handoffFile } = readFlags(flags);
  const browserUnits = readdirSync(unitsDir).filter((file) => file.endsWith(".mjs")).map((file) => file.slice(0, -".mjs".length)).sort();
  const json: unknown = JSON.parse(readFileSync(mapFile, "utf8"));
  const impact = parseImpact(json, browserUnits, relative(process.cwd(), mapFile));
  const selected = plan(impact, paths);
  for (const selection of selected.selections) console.log(`plan: ${explain(selection)}`);
  switch (selected.tier) {
    case "t0":
      console.log(`plan: t0, ${paths.length} changed paths select no unit`);
      break;
    case "t1":
      console.log(`plan: t1, ${selected.units.length} units: ${selected.units.join(", ")}`);
      break;
    case "t2":
      console.log(`plan: t2, every unit`);
      break;
    default: {
      const unknownTier: never = selected;
      throw new Error(`unknown plan ${JSON.stringify(unknownTier)}`);
    }
  }
  const chosen = handoff(impact, selected);
  console.log(`plan: run ${runCommand(impact, selected)}`);
  console.log(`plan: handoff ${chosen.kind}`);
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(selected, null, 2)}\n`);
  if (handoffFile !== undefined) writeFileSync(handoffFile, `${JSON.stringify(chosen, null, 2)}\n`);
}

main(process.argv.slice(2));
