import type { CacheRenderBundleManifest } from "osrs-sdk";
import { ARCHIVE_OCELLUS_ASSETS, reportUnservedAssets } from "./assets";

function manifestWithout(missing: ReadonlySet<string>): CacheRenderBundleManifest {
  const keys = (prefix: string, assets: Readonly<Record<string, Readonly<{ id: number }>>>) =>
    Object.values(assets).map(({ id }) => `${prefix}${id}`).filter((key) => !missing.has(key));
  return {
    schemaVersion: 3,
    bundleVersion: "test",
    cache: { revision: 241, source: "openrs2:2746", contentHash: "test" },
    assets: {},
    references: Object.fromEntries([...keys("npc:", ARCHIVE_OCELLUS_ASSETS.npcs), ...keys("model:", ARCHIVE_OCELLUS_ASSETS.models)].map((key) => [key, [key]])),
    spotAnims: Object.fromEntries(keys("", ARCHIVE_OCELLUS_ASSETS.spotAnims).map((id) => [id, `spotanim-${id}`])),
  };
}

describe("reportUnservedAssets", () => {
  test("logs one error per configured npc, model or spotanim the served manifest lacks, and none for a manifest that serves them all", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportUnservedAssets(manifestWithout(new Set(["npc:16677", "4339", "model:62508"])));
    reportUnservedAssets(manifestWithout(new Set()));

    expect(errors.mock.calls).toEqual([
      ["assets: osrs-assets/manifest.json has no npcs.ocellus (16677); rebuild public/osrs-assets with npm run assets"],
      ["assets: osrs-assets/manifest.json has no models.voidHole (62508); rebuild public/osrs-assets with npm run assets"],
      ["assets: osrs-assets/manifest.json has no spotAnims.explosion (4339); rebuild public/osrs-assets with npm run assets"],
    ]);
    errors.mockRestore();
  });
});
