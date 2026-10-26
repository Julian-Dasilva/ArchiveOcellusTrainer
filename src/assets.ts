import type { CacheAssets } from "osrs-sdk/asset-manifest";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P2, OCELLUS_P3, OCELLUS_P4 } from "./content/ocellus/js/OcellusTimings";
import { readBuildFlags } from "./flags";

const { boss, gear, presentation, lifeforceOrb, rifts, explosion, geometry, floorHoles } = OCELLUS_P4;

const sequences = (poses: Readonly<Record<string, Readonly<{ value: number }>>>) => Object.fromEntries(Object.entries(poses).map(([pose, sequence]) => [pose, sequence.value]));
const { looks: portalLooks } = OCELLUS_P2.portals;
const p2Key = (name: string) => `p2${name.charAt(0).toUpperCase()}${name.slice(1)}`;
/**
 * Phase 2's models, poses and spotanims are extracted only when ARCHIVE_P2 is on, so a build with the drill hidden asks the
 * cache for nothing it doesn't play. Cache 2746 also lacks three of its poses' frame sounds (12814, 12825, 12832).
 */
const { p2 } = readBuildFlags();

export const ARCHIVE_OCELLUS_ASSETS = {
  npcs: {
    ocellus: { id: boss.npcId.value, animations: { ...sequences(presentation.bossPoses), ...sequences(OCELLUS_P3.bossPoses) } },
    voidRift: { id: rifts.npcId.value, animations: sequences(rifts.poses) },
    voidVine: { id: OCELLUS_P3.vine.npcId.value },
    ...(p2 ? { ocellusP2: { id: OCELLUS_P2.ocellusNpcId.value, animations: sequences(OCELLUS_P2.bossPoses) } } : {}),
  },
  models: {
    brazier: { id: geometry.brazier.value.model, animations: { burning: geometry.brazier.value.burning } },
    voidHole: { id: floorHoles.look.model.value, animations: { idle: floorHoles.look.idle.value } },
    ...(p2
      ? {
          p2PortalInactive: { id: portalLooks.value.inactive.model, animations: { idle: portalLooks.value.inactive.idle } },
          p2PortalLit: { id: portalLooks.value.lit.model, animations: { idle: portalLooks.value.lit.idle } },
        }
      : {}),
  },
  items: Object.fromEntries(Object.entries(gear.items).map(([key, item]) => [key, { id: item.itemId.value }])),
  spotAnims: Object.fromEntries([
    ...Object.entries(lifeforceOrb.look).map(([visual, spotAnim]) => [visual, { id: spotAnim.value }]),
    ...Object.entries(presentation.transitionTells).map(([variant, spotAnim]) => [`${variant.replace(/-(.)/g, (_, letter: string) => letter.toUpperCase())}Tell`, { id: spotAnim.value }]),
    ["riftFlare", { id: rifts.burstFlare.value }],
    ["explosion", { id: explosion.spotAnim.value }],
    ...(p2 ? Object.entries(OCELLUS_P2.spotAnims).map(([name, spotAnim]) => [p2Key(name), { id: spotAnim.value }]) : []),
  ]),
  sounds: Object.fromEntries(Object.entries(presentation.sounds).map(([cue, sound]) => [cue, { id: sound.value }])),
} as const satisfies CacheAssets;

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
