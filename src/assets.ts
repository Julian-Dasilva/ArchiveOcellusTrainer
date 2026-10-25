import type { CacheRenderBundleManifest } from "osrs-sdk";
import type { CacheAssets } from "osrs-sdk/asset-manifest";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P3, OCELLUS_P4 } from "./content/ocellus/js/OcellusTimings";

const { boss, gear, presentation, lifeforceOrb, rifts, explosion, geometry, floorHoles } = OCELLUS_P4;

const sequences = (poses: Readonly<Record<string, Readonly<{ value: number }>>>) => Object.fromEntries(Object.entries(poses).map(([pose, sequence]) => [pose, sequence.value]));

export const ARCHIVE_OCELLUS_ASSETS = {
  npcs: {
    ocellus: { id: boss.npcId.value, animations: { ...sequences(presentation.bossPoses), ...sequences(OCELLUS_P3.bossPoses) } },
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

type RenderCategory = "npcs" | "models" | "spotAnims";

const RENDERED: Readonly<Record<RenderCategory, Readonly<Record<string, Readonly<{ id: number }>>>>> = ARCHIVE_OCELLUS_ASSETS;

const SERVED: readonly (readonly [RenderCategory, (manifest: CacheRenderBundleManifest, id: number) => boolean])[] = [
  ["npcs", (manifest, id) => `npc:${id}` in manifest.references],
  ["models", (manifest, id) => `model:${id}` in manifest.references],
  ["spotAnims", (manifest, id) => manifest.spotAnims?.[id] !== undefined],
];

export function reportUnservedAssets(manifest: CacheRenderBundleManifest): void {
  for (const [category, served] of SERVED) {
    for (const [name, { id }] of Object.entries(RENDERED[category])) {
      if (!served(manifest, id)) console.error(`assets: osrs-assets/manifest.json has no ${category}.${name} (${id}); rebuild public/osrs-assets with npm run assets`);
    }
  }
}

export const ITEM_ICON_DIR = "item-icons";
export const itemIconFile = (itemId: number) => `${ITEM_ICON_DIR}/${itemId}.png`;
export const ITEM_ICON_IDS = [...Object.values(gear.items).map((item) => item.itemId.value), ...Object.values(gear.sdkIcons).map((itemId) => itemId.value)];

export const ARCHIVE_OCELLUS_OVERRIDES = {
  items: Object.fromEntries(Object.entries(gear.sdkCacheIds).map(([key, id]) => [key, { id: id.value }])),
} as const satisfies CacheAssets;

/** The asset tool extracts no sprites, so scripts/extract-sprites.mjs writes these beside its output. */
export const ARCHIVE_OCELLUS_SPRITES: readonly SpriteFrame[] = Object.values(presentation.overheadIcons).map((icon) => icon.value);

export function spriteFile({ archive, frame }: SpriteFrame): string {
  return `sprites/${archive}-${frame}.png`;
}
