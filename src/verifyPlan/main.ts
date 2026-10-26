import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { explain, parseImpact, plan, runCommand } from "./plan";

const USAGE = "usage: main.ts <impact map> <units directory> [--out <plan.json>] -- [changed path...]";

function main(args: readonly string[]): void {
  const split = args.indexOf("--");
  const options = split < 0 ? args : args.slice(0, split);
  const paths = split < 0 ? [] : args.slice(split + 1);
  const [mapFile, unitsDir, flag, out] = options;
  if (mapFile === undefined || unitsDir === undefined || (flag !== undefined && (flag !== "--out" || out === undefined))) throw new Error(USAGE);
  const browserUnits = readdirSync(unitsDir).filter((file) => file.endsWith(".mjs")).map((file) => file.slice(0, -".mjs".length)).sort();
  const json: unknown = JSON.parse(readFileSync(mapFile, "utf8"));
  const impact = parseImpact(json, browserUnits);
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
  console.log(`plan: run ${runCommand(impact, selected)}`);
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(selected, null, 2)}\n`);
}

main(process.argv.slice(2));
