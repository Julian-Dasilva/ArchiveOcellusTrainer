import type { CacheRenderBundleManifest } from "osrs-sdk";
import type { ConfiguredIds } from "./servedAssets";

const loadServedAssetsInEachTest = () => vi.importActual<typeof import("./servedAssets")>("./servedAssets");

type Rendered = Readonly<Record<"npcs" | "models" | "spotAnims", ConfiguredIds>>;

function manifestWithout(rendered: Rendered, missing: ReadonlySet<string>): CacheRenderBundleManifest {
  const keys = (prefix: string, assets: ConfiguredIds) => Object.values(assets).map(({ id }) => `${prefix}${id}`).filter((key) => !missing.has(key));
  return {
    schemaVersion: 3,
    bundleVersion: "test",
    cache: { revision: 241, source: "openrs2:2746", contentHash: "test" },
    assets: {},
    references: Object.fromEntries([...keys("npc:", rendered.npcs), ...keys("model:", rendered.models)].map((key) => [key, [key]])),
    spotAnims: Object.fromEntries(keys("", rendered.spotAnims).map((id) => [id, `spotanim-${id}`])),
  };
}

describe("reportUnservedAssets", () => {
  test("logs one error per phase 4 npc, model or spotanim the served manifest lacks, and none for a manifest that serves them all", async () => {
    const { P4_ASSETS, reportUnservedAssets } = await loadServedAssetsInEachTest();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportUnservedAssets(manifestWithout(P4_ASSETS, new Set(["npc:16677", "4339", "model:62508"])));
    reportUnservedAssets(manifestWithout(P4_ASSETS, new Set()));

    expect(errors.mock.calls).toEqual([
      ["assets: osrs-assets/manifest.json has no npcs.ocellus (16677); rebuild public/osrs-assets with npm run assets"],
      ["assets: osrs-assets/manifest.json has no models.voidHole (62508); rebuild public/osrs-assets with npm run assets"],
      ["assets: osrs-assets/manifest.json has no spotAnims.explosion (4339); rebuild public/osrs-assets with npm run assets"],
    ]);
    errors.mockRestore();
  });
});
