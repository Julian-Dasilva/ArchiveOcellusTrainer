import type { CacheAssets } from "osrs-sdk/asset-manifest";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P4 } from "./content/ocellus/js/OcellusTimings";
import { FIGHT_ASSETS, FIGHT_MODELS } from "./content/ocellus/fight/assets";
import { PROTECT_MELEE_ICON } from "./content/ocellus/fight/data";
import { P4_ASSETS } from "./servedAssets";

export { spriteFile } from "./servedAssets";

const { gear, presentation } = OCELLUS_P4;

/** The full fight's bodies are our NPCs 16674, 16675 and 16677, so its poses join ours under their own keys. */
const fightPoses = (form: Readonly<{ animations: Readonly<Record<string, number>> }>) =>
  Object.fromEntries(Object.entries(form.animations).map(([name, id]) => [`fight_${name}`, id]));
const { fightOcellusP1, fightOcellusP2, fightOcellusP3, fightHealingRift, fightVoidAugmenter, fightVoidVine } = FIGHT_ASSETS.npcs;

export const ARCHIVE_OCELLUS_ASSETS = {
  npcs: {
    ocellus: { ...P4_ASSETS.npcs.ocellus, animations: { ...P4_ASSETS.npcs.ocellus.animations, ...fightPoses(fightOcellusP3) } },
    voidRift: P4_ASSETS.npcs.voidRift,
    ocellusP1: { id: fightOcellusP1.id, animations: fightPoses(fightOcellusP1) },
    ocellusP2: { id: fightOcellusP2.id, animations: fightPoses(fightOcellusP2) },
    fightHealingRift,
    fightVoidAugmenter,
    fightVoidVine,
  },
  models: { ...P4_ASSETS.models, ...FIGHT_MODELS },
  items: P4_ASSETS.items,
  spotAnims: { ...P4_ASSETS.spotAnims, ...FIGHT_ASSETS.spotAnims },
  playerAnimations: FIGHT_ASSETS.playerAnimations,
  sounds: { ...P4_ASSETS.sounds, ...FIGHT_ASSETS.sounds },
} as const satisfies CacheAssets;

export const ITEM_ICON_IDS = [...Object.values(gear.items).map((item) => item.itemId.value), ...Object.values(gear.sdkIcons).map((itemId) => itemId.value)];

export const ARCHIVE_OCELLUS_OVERRIDES = {
  items: Object.fromEntries(Object.entries(gear.sdkCacheIds).map(([key, id]) => [key, { id: id.value }])),
} as const satisfies CacheAssets;

/**
 * The fixed-mode frame's sprites, as osrs-sdk's `FixedLayout` places them from the client's interface 548 and chatbox 162:
 * the borders, minimap sides and cover, tab rows and their red open-tab stones, the side panel and the chatbox.
 */
export const FIXED_FRAME_SPRITES: readonly number[] = [4, 1017, 1018, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1182, 1441, 1611];

/** The asset tool extracts no sprites, so scripts/extract-sprites.mjs writes these beside its output. */
export const ARCHIVE_OCELLUS_SPRITES: readonly SpriteFrame[] = [
  ...Object.values(presentation.overheadIcons).map((icon) => icon.value),
  PROTECT_MELEE_ICON,
  ...FIXED_FRAME_SPRITES.map((archive) => ({ archive, frame: 0 })),
];
