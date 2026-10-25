import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ARCHIVE_OCELLUS_SPRITES, spriteFile } from "../assets";

const REBUILD = "rebuild it with npm run assets -- --cache-dir <openrs2 cache dir> --reader-path <osrscachereader checkout>, or scripts/verify.sh assets";

type AssetConfig = Readonly<{ cacheId: number; outDir: string; requirements: unknown }>;

async function main(): Promise<void> {
  const config = await loadAssetConfig();
  const dir = relative(process.cwd(), config.outDir);
  const gaps = [...buildGaps(config, readJson(join(config.outDir, "build-info.json"))), ...spriteGaps(config.outDir)];
  if (gaps.length === 0) {
    console.log(`assets: ${dir} has every asset osrs-assets.config.ts configures, from openrs2:${config.cacheId}`);
    return;
  }
  console.error(`assets: ${dir} lacks what osrs-assets.config.ts configures:`);
  for (const gap of gaps) console.error(`assets:   ${gap}`);
  console.error(`assets: ${REBUILD}`);
  process.exitCode = 1;
}

function buildGaps({ cacheId, requirements }: AssetConfig, built: unknown): readonly string[] {
  if (built === null) return ["build-info.json is missing or unreadable"];
  const builtCache = field(field(built, "cache"), "openrs2");
  return [
    ...(builtCache === cacheId ? [] : [`built from openrs2:${String(builtCache)}, configured openrs2:${cacheId}`]),
    ...missing(requirements, field(built, "requirements"), ""),
  ];
}

function missing(configured: unknown, built: unknown, key: string): readonly string[] {
  if (typeof configured !== "object" || configured === null) return configured === built ? [] : [`missing ${key} = ${JSON.stringify(configured)}`];
  return Object.entries(configured).flatMap(([name, value]: [string, unknown]) => missing(value, field(built, name), key === "" ? name : `${key}.${name}`));
}

function spriteGaps(outDir: string): readonly string[] {
  return ARCHIVE_OCELLUS_SPRITES.map(spriteFile)
    .filter((file) => !existsSync(join(outDir, file)))
    .map((file) => `missing ${file}`);
}

async function loadAssetConfig(): Promise<AssetConfig> {
  const tool: unknown = await import("osrs-sdk-assets");
  const loadConfig = field(tool, "loadConfig");
  if (typeof loadConfig !== "function") throw new Error("osrs-sdk-assets exports no loadConfig");
  const config: unknown = await Reflect.apply(loadConfig, undefined, []);
  const [cacheId, outDir] = [field(config, "cacheId"), field(config, "outDir")];
  if (typeof cacheId !== "number" || typeof outDir !== "string") throw new Error("osrs-sdk-assets loadConfig returned no cacheId or outDir");
  return { cacheId, outDir, requirements: { assets: field(config, "assets"), scenes: field(config, "scenes") } };
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function field(value: unknown, key: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null ? Reflect.get(value, key) : undefined;
}

void main();
