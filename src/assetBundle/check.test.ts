import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ARCHIVE_OCELLUS_SPRITES, spriteFile } from "../assets";

const ROOT = resolve(__dirname, "../..");
const BUILD_TIMEOUT_MS = 180_000;
const BUILD_INFOS = `
  import { loadConfig } from "osrs-sdk-assets";
  const { cacheId, assets, scenes } = await loadConfig();
  const requirements = JSON.parse(JSON.stringify({ assets, scenes }));
  const complete = { cache: { openrs2: cacheId }, requirements };
  const { explosion, ...olderSpotAnims } = requirements.assets.spotAnims;
  console.log(JSON.stringify({
    complete,
    beforeExplosion: { ...complete, requirements: { ...requirements, assets: { ...requirements.assets, spotAnims: olderSpotAnims } } },
    otherCache: { ...complete, cache: { openrs2: 2745 } },
  }));
`;
const REBUILD = "assets: rebuild it with npm run assets -- --cache-dir <openrs2 cache dir> --reader-path <osrscachereader checkout>, or scripts/verify.sh assets";
const LACKS = "assets: public/osrs-assets lacks what osrs-assets.config.ts configures:";

type Bundle = Readonly<{ buildInfo: "complete" | "beforeExplosion" | "otherCache" | null; sprites: readonly string[] }>;

let project = "";
let buildInfos: Readonly<Record<string, unknown>> = {};

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), "archive-ocellus-assets-"));
  const tree = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).stdout;
  for (const file of tree.split("\0").filter((path) => path !== "" && path !== "node_modules" && existsSync(join(ROOT, path)))) {
    mkdirSync(dirname(join(project, file)), { recursive: true });
    cpSync(join(ROOT, file), join(project, file));
  }
  symlinkSync(join(ROOT, "node_modules"), join(project, "node_modules"));
  const recorded = spawnSync(process.execPath, ["--input-type=module", "-e", BUILD_INFOS], { cwd: project, encoding: "utf8" });
  const parsed: unknown = JSON.parse(recorded.stdout);
  if (typeof parsed !== "object" || parsed === null) throw new Error(`could not record build-info.json fixtures: ${recorded.stderr}`);
  buildInfos = Object.fromEntries(Object.entries(parsed));
});

afterAll(() => {
  if (project !== "") rmSync(project, { recursive: true, force: true });
});

function writeBundle({ buildInfo, sprites }: Bundle): void {
  const dir = join(project, "public/osrs-assets");
  for (const previous of [dir, join(project, "dist")]) rmSync(previous, { recursive: true, force: true });
  mkdirSync(join(dir, "sprites"), { recursive: true });
  if (buildInfo !== null) writeFileSync(join(dir, "build-info.json"), JSON.stringify(buildInfos[buildInfo]));
  for (const file of sprites) writeFileSync(join(dir, file), "");
}

function run(command: string, args: readonly string[]) {
  const { status, stdout, stderr } = spawnSync(command, args, { cwd: project, encoding: "utf8" });
  const guardLines = (text: string) => text.split("\n").filter((line) => line.startsWith("assets:"));
  return { status, stdout: guardLines(stdout), stderr: guardLines(stderr) };
}

const build = () => ({ ...run("npm", ["run", "build"]), built: existsSync(join(project, "dist")) });

const allSprites = () => ARCHIVE_OCELLUS_SPRITES.map(spriteFile);

describe("npm run build", () => {
  test("stops before webpack on a bundle built before the explosion spotanim, naming the key and the fix", { timeout: BUILD_TIMEOUT_MS }, () => {
    writeBundle({ buildInfo: "beforeExplosion", sprites: allSprites() });

    expect(build()).toEqual({
      status: 1,
      stdout: [],
      stderr: [LACKS, "assets:   missing assets.spotAnims.explosion.id = 4339", REBUILD],
      built: false,
    });
  });

  test("stops on a bundle from another cache with a sprite missing, naming both", { timeout: BUILD_TIMEOUT_MS }, () => {
    writeBundle({ buildInfo: "otherCache", sprites: allSprites().slice(1) });

    expect(build()).toEqual({
      status: 1,
      stdout: [],
      stderr: [LACKS, "assets:   built from openrs2:2745, configured openrs2:2746", "assets:   missing sprites/440-15.png", REBUILD],
      built: false,
    });
  });

  test("stops on an asset directory with no build-info.json", { timeout: BUILD_TIMEOUT_MS }, () => {
    writeBundle({ buildInfo: null, sprites: allSprites() });

    expect(build()).toEqual({
      status: 1,
      stdout: [],
      stderr: [LACKS, "assets:   build-info.json is missing or unreadable", REBUILD],
      built: false,
    });
  });
});

describe("the asset guard the build runs", () => {
  test("passes a bundle whose build-info.json records every configured requirement and whose sprites exist", () => {
    writeBundle({ buildInfo: "complete", sprites: allSprites() });

    expect(run("node_modules/.bin/tsx", ["src/assetBundle/check.ts"])).toEqual({
      status: 0,
      stdout: ["assets: public/osrs-assets has every asset osrs-assets.config.ts configures, from openrs2:2746"],
      stderr: [],
    });
  });
});
