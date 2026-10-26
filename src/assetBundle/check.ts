import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ARCHIVE_OCELLUS_SPRITES, type ConfiguredIds, INDEXED_CATEGORIES, type IndexedCategory, type ManifestIndex, manifestAssetKeys, spriteFile } from "../assets";

const REBUILD = "rebuild it with npm run assets -- --cache-dir <openrs2 cache dir> --reader-path <osrscachereader checkout>, or scripts/verify.sh assets";

type ConfiguredAssets = Readonly<Record<IndexedCategory | "sounds", ConfiguredIds>>;

type AssetConfig = Readonly<{ cacheId: number; outDir: string; assets: ConfiguredAssets; requirements: unknown }>;

type ServedManifest = Readonly<{ source: string; files: Readonly<Record<string, string>>; soundPack: string | undefined; index: ManifestIndex }>;

async function main(): Promise<void> {
  const config = await loadAssetConfig();
  const dir = relative(process.cwd(), config.outDir);
  const gaps = [
    ...buildGaps(config, readJson(join(config.outDir, "build-info.json"))),
    ...manifestGaps(config, readJson(join(config.outDir, "manifest.json"))),
    ...spriteGaps(config.outDir),
  ];
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

function manifestGaps({ cacheId, outDir, assets }: AssetConfig, read: unknown): readonly string[] {
  if (read === null) return ["manifest.json is missing or unreadable"];
  const manifest = parseManifest(read);
  if (manifest === undefined) return ["manifest.json is not a cache render bundle manifest"];
  const entries = INDEXED_CATEGORIES.flatMap((category) =>
    Object.entries(assets[category]).map(([name, { id }]) => ({ label: `${category}.${name} (${id})`, keys: manifestAssetKeys(manifest.index, category, id) })),
  );
  return [
    ...(manifest.source === `openrs2:${cacheId}` ? [] : [`manifest.json is from ${manifest.source}, configured openrs2:${cacheId}`]),
    ...entries.filter(({ keys }) => keys === undefined).map(({ label }) => `manifest.json has no ${label}`),
    ...entries.flatMap(({ label, keys }) => (keys ?? []).filter((key) => !(key in manifest.files)).map((key) => `manifest.json lists no asset ${key} for ${label}`)),
    ...Object.entries(manifest.files).filter(([, file]) => !existsSync(join(outDir, file))).map(([key, file]) => `missing ${file}, manifest.json's ${key}`),
    ...soundGaps(manifest.soundPack, outDir, assets.sounds),
  ];
}

function soundGaps(soundPack: string | undefined, outDir: string, sounds: ConfiguredIds): readonly string[] {
  if (soundPack === undefined) return ["manifest.json names no sound pack"];
  if (!existsSync(join(outDir, soundPack))) return [`missing ${soundPack}, manifest.json's sound pack`];
  const packed = packedSounds(readFileSync(join(outDir, soundPack)));
  if (packed === undefined) return [`${soundPack} is not a sound pack`];
  return Object.entries(sounds)
    .filter(([, { id }]) => !packed.has(id))
    .map(([name, { id }]) => `${soundPack} has no sounds.${name} (${id})`);
}

function packedSounds(bytes: Buffer): ReadonlySet<number> | undefined {
  if (bytes.length < 6 || bytes.toString("latin1", 0, 4) !== "SFX1") return undefined;
  const ids = new Set<number>();
  for (let at = 6, n = 0; n < bytes.readUInt16BE(4); n++, at += 4 + bytes.readUInt16BE(at + 2)) {
    if (at + 4 > bytes.length) return undefined;
    ids.add(bytes.readUInt16BE(at));
  }
  return ids;
}

function parseManifest(read: unknown): ServedManifest | undefined {
  const source = text(field(field(read, "cache"), "source"));
  const files = record(field(read, "assets"), (asset) => text(field(asset, "file")));
  const references = record(field(read, "references"), texts);
  if (source === undefined || files === undefined || references === undefined) return undefined;
  const playerAnimations = text(field(field(read, "sharedAssets"), "playerAnimations"));
  return {
    source,
    files,
    soundPack: text(field(field(read, "soundEffects"), "file")),
    index: {
      references,
      spotAnims: record(field(read, "spotAnims"), text),
      playerItems: record(field(read, "playerItems"), text),
      sharedAssets: playerAnimations === undefined ? undefined : { playerAnimations },
    },
  };
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
  const [cacheId, outDir, assets] = [field(config, "cacheId"), field(config, "outDir"), field(config, "assets")];
  if (typeof cacheId !== "number" || typeof outDir !== "string") throw new Error("osrs-sdk-assets loadConfig returned no cacheId or outDir");
  const ids = (category: IndexedCategory | "sounds"): ConfiguredIds => {
    const parsed = record(field(assets, category) ?? {}, (entry) => {
      const id = field(entry, "id");
      return typeof id === "number" ? { id } : undefined;
    });
    if (parsed === undefined) throw new Error(`osrs-sdk-assets loadConfig returned assets.${category} entries without numeric ids`);
    return parsed;
  };
  return {
    cacheId,
    outDir,
    assets: { npcs: ids("npcs"), models: ids("models"), spotAnims: ids("spotAnims"), items: ids("items"), playerAnimations: ids("playerAnimations"), sounds: ids("sounds") },
    requirements: { assets, scenes: field(config, "scenes") },
  };
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function record<T>(value: unknown, entry: (item: unknown) => T | undefined): Readonly<Record<string, T>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const parsed: Record<string, T> = {};
  for (const [key, item] of Object.entries(value)) {
    const result = entry(item);
    if (result === undefined) return undefined;
    parsed[key] = result;
  }
  return parsed;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function texts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: readonly unknown[] = value;
  const strings = items.filter((item): item is string => typeof item === "string");
  return strings.length === items.length ? strings : undefined;
}

function field(value: unknown, key: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null ? Reflect.get(value, key) : undefined;
}

void main();
