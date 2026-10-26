import type { CacheRenderBundleManifest } from "osrs-sdk";
import type { CacheAssets } from "osrs-sdk/asset-manifest";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P4 } from "./content/ocellus/js/OcellusTimings";

const { boss, gear, presentation, lifeforceOrb, rifts, explosion, geometry, floorHoles } = OCELLUS_P4;

export const sequences = (poses: Readonly<Record<string, Readonly<{ value: number }>>>) => Object.fromEntries(Object.entries(poses).map(([pose, sequence]) => [pose, sequence.value]));

export const P4_ASSETS = {
  npcs: {
    ocellus: { id: boss.npcId.value, animations: sequences(presentation.bossPoses) },
    voidRift: { id: rifts.npcId.value, animations: sequences(rifts.poses) },
  },
  models: {
    brazier: { id: geometry.brazier.value.model, animations: { burning: geometry.brazier.value.burning } },
    voidHole: { id: floorHoles.look.model.value, animations: { idle: floorHoles.look.idle.value } },
  },
  items: Object.fromEntries(Object.entries(gear.items).map(([key, item]) => [key, { id: item.itemId.value }])),
  spotAnims: Object.fromEntries([
    ...Object.entries(lifeforceOrb.look).map(([visual, spotAnim]) => [visual, { id: spotAnim.value }]),
    ...Object.entries(presentation.transitionTells).map(([variant, spotAnim]) => [`${variant.replace(/-(.)/g, (_, letter: string) => letter.toUpperCase())}Tell`, { id: spotAnim.value }]),
    ["riftFlare", { id: rifts.burstFlare.value }],
    ["explosion", { id: explosion.spotAnim.value }],
  ]),
  sounds: Object.fromEntries(Object.entries(presentation.sounds).map(([cue, sound]) => [cue, { id: sound.value }])),
} as const satisfies CacheAssets;

export type ConfiguredIds = Readonly<Record<string, Readonly<{ id: number }>>>;

export type ManifestIndex = Pick<CacheRenderBundleManifest, "references" | "spotAnims" | "playerItems" | "sharedAssets">;

export const INDEXED_CATEGORIES = ["npcs", "models", "spotAnims", "items", "playerAnimations"] as const;
export type IndexedCategory = (typeof INDEXED_CATEGORIES)[number];

export function manifestAssetKeys(manifest: ManifestIndex, category: IndexedCategory, id: number): readonly string[] | undefined {
  const one = (key: string | undefined) => (key === undefined ? undefined : [key]);
  switch (category) {
    case "npcs":
      return manifest.references[`npc:${id}`];
    case "models":
      return manifest.references[`model:${id}`];
    case "spotAnims":
      return one(manifest.spotAnims?.[id]);
    case "items":
      return one(manifest.playerItems?.[`item:${id}`]);
    case "playerAnimations":
      return one(manifest.sharedAssets?.playerAnimations);
    default: {
      const unhandled: never = category;
      return unhandled;
    }
  }
}

const RENDER_CATEGORIES = ["npcs", "models", "spotAnims"] as const satisfies readonly IndexedCategory[];

const RENDERED: Readonly<Record<(typeof RENDER_CATEGORIES)[number], ConfiguredIds>> = P4_ASSETS;

export function reportUnservedAssets(manifest: CacheRenderBundleManifest): void {
  for (const category of RENDER_CATEGORIES) {
    for (const [name, { id }] of Object.entries(RENDERED[category])) {
      if (manifestAssetKeys(manifest, category, id) === undefined) console.error(`assets: osrs-assets/manifest.json has no ${category}.${name} (${id}); rebuild public/osrs-assets with npm run assets`);
    }
  }
}

export const ITEM_ICON_DIR = "item-icons";
export const itemIconFile = (itemId: number) => `${ITEM_ICON_DIR}/${itemId}.png`;

export function spriteFile({ archive, frame }: SpriteFrame): string {
  return `sprites/${archive}-${frame}.png`;
}
