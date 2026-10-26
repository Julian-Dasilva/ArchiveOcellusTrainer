import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readBuildFlags } from "../flags";
import { PHASE_ONLY_MODULES, strayPhaseModules } from "./phaseCode";

const USAGE = "usage: check.ts <dist directory>";
const ROOT = resolve(__dirname, "../..");

function sourcesOf(path: string): readonly string[] {
  const map: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof map !== "object" || map === null || !("sources" in map) || !Array.isArray(map.sources)) throw new Error(`${path} is not a source map`);
  return map.sources.filter((source): source is string => typeof source === "string");
}

function main(args: readonly string[]): void {
  const [dist] = args;
  if (dist === undefined || args.length !== 1) throw new Error(USAGE);
  const missing = [...PHASE_ONLY_MODULES.keys()].filter((module) => !existsSync(join(ROOT, module)));
  if (missing.length > 0) throw new Error(`PHASE_ONLY_MODULES lists modules that do not exist: ${missing.join(", ")}`);
  const sources = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js.map"))
    .flatMap((entry) => sourcesOf(join(entry.parentPath, entry.name)));
  if (sources.length === 0) throw new Error(`${dist} has no source maps, so its modules cannot be checked`);
  const strays = strayPhaseModules(sources, readBuildFlags());
  for (const { module, phases } of strays) console.error(`phase-code: ${module} is in the build, but ${phases.join(" and ")} ${phases.length === 1 ? "is" : "are"} off`);
  console.log(`phase-code: ${sources.length} modules, ${strays.length} from phases that are off`);
  if (strays.length > 0) process.exitCode = 1;
}

main(process.argv.slice(2));
