import type { CacheAssets } from "osrs-sdk/asset-manifest";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P4 } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P1 } from "./content/ocellus/js/OcellusTimingsP1";
import { OCELLUS_P2 } from "./content/ocellus/js/OcellusTimingsP2";
import { OCELLUS_P3 } from "./content/ocellus/js/OcellusTimingsP3";
import { FIGHT_ASSETS, FIGHT_MODELS } from "./content/ocellus/fight/assets";
import { PROTECT_MELEE_ICON } from "./content/ocellus/fight/data";
import { readBuildFlags } from "./flags";
import { P4_ASSETS, sequences } from "./servedAssets";

export { spriteFile } from "./servedAssets";

const { gear, presentation } = OCELLUS_P4;

const { looks: portalLooks } = OCELLUS_P2.portals;
const p2Key = (name: string) => `p2${name.charAt(0).toUpperCase()}${name.slice(1)}`;
/**
 * Phase 2's models, poses and spotanims are extracted only when ARCHIVE_P2 is on, so a build with the drill hidden asks the
 * cache for nothing it doesn't play. Cache 2746 also lacks three of its poses' frame sounds (12814, 12825, 12832).
 */
const { p2, full } = readBuildFlags();

/**
 * The full fight's bodies are our NPCs 16674, 16675 and 16677, so its poses join ours under their own keys when ARCHIVE_FULL is on;
 * its rift NPCs, effects and void models come only then too.
 */
const fightPoses = (form: Readonly<{ animations: Readonly<Record<string, number>> }>) =>
  full ? Object.fromEntries(Object.entries(form.animations).map(([name, id]) => [`fight_${name}`, id])) : {};
const { fightOcellusP1, fightOcellusP2, fightOcellusP3, fightHealingRift, fightVoidAugmenter, fightVoidVine } = FIGHT_ASSETS.npcs;

const P1_LOOK = OCELLUS_P1.presentation;
const p1CrackPieces = [...Object.values(P1_LOOK.crackPieces.straight), ...Object.values(P1_LOOK.crackPieces.diagonal)].flatMap(({ value }) => [value.start, value.piece, value.end]);
const p1SpotAnims = [
  ...Object.entries(P1_LOOK.spotAnims).map(([name, spotAnim]) => [`p1${name.charAt(0).toUpperCase()}${name.slice(1)}`, { id: spotAnim.value }]),
  ...[...p1CrackPieces, ...P1_LOOK.floorExplosions.value.pieces].map((id) => [`p1Floor${id}`, { id }]),
];

export const ARCHIVE_OCELLUS_ASSETS = {
  npcs: {
    ocellus: { ...P4_ASSETS.npcs.ocellus, animations: { ...P4_ASSETS.npcs.ocellus.animations, ...sequences(OCELLUS_P3.bossPoses), ...fightPoses(fightOcellusP3) } },
    voidRift: P4_ASSETS.npcs.voidRift,
    ocellusP1: { id: OCELLUS_P1.boss.npcId.value, animations: { ...sequences(P1_LOOK.bossPoses), ...fightPoses(fightOcellusP1) } },
    ...(p2 || full ? { ocellusP2: { id: OCELLUS_P2.ocellusNpcId.value, animations: { ...(p2 ? sequences(OCELLUS_P2.bossPoses) : {}), ...fightPoses(fightOcellusP2) } } } : {}),
    ...(full ? { fightHealingRift, fightVoidAugmenter, fightVoidVine } : {}),
  },
  models: {
    ...P4_ASSETS.models,
    ...(p2
      ? {
          p2PortalInactive: { id: portalLooks.value.inactive.model, animations: { idle: portalLooks.value.inactive.idle } },
          p2PortalLit: { id: portalLooks.value.lit.model, animations: { idle: portalLooks.value.lit.idle } },
        }
      : {}),
    ...(full ? FIGHT_MODELS : {}),
  },
  items: P4_ASSETS.items,
  spotAnims: {
    ...P4_ASSETS.spotAnims,
    ...Object.fromEntries([...p1SpotAnims, ...(p2 ? Object.entries(OCELLUS_P2.spotAnims).map(([name, spotAnim]) => [p2Key(name), { id: spotAnim.value }]) : [])]),
    ...(full ? FIGHT_ASSETS.spotAnims : {}),
  },
  sounds: { ...P4_ASSETS.sounds, ...(full ? FIGHT_ASSETS.sounds : {}) },
} as const satisfies CacheAssets;

export const ITEM_ICON_IDS = [...Object.values(gear.items).map((item) => item.itemId.value), ...Object.values(gear.sdkIcons).map((itemId) => itemId.value)];

export const ARCHIVE_OCELLUS_OVERRIDES = {
  items: Object.fromEntries(Object.entries(gear.sdkCacheIds).map(([key, id]) => [key, { id: id.value }])),
} as const satisfies CacheAssets;

/** The asset tool extracts no sprites, so scripts/extract-sprites.mjs writes these beside its output. */
export const ARCHIVE_OCELLUS_SPRITES: readonly SpriteFrame[] = [
  ...Object.values(presentation.overheadIcons).map((icon) => icon.value),
  P1_LOOK.overheadIcon.value,
  ...(full ? [PROTECT_MELEE_ICON] : []),
];
