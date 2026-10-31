import { AttackStyle, AttackStylesController, Weapon } from "osrs-sdk";
import { CACHE_ASSETS } from "osrs-sdk/asset-manifest";
import type { CatalogLoadout, Player } from "osrs-sdk";
import type { AmmunitionClass, StartWeapon, Tier } from "../js/OcellusTimings";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { OCELLUS_LOADOUTS, dressOcellus, presetChoice, startingLoadout } from "../js/OcellusLoadout";

const { blowpipe } = OCELLUS_P4.gear;

export const PHASE_RANGED_DEFENCE = {
  p1: { light: 50, standard: 135, heavy: 50 },
  blade: { light: 100, standard: 110, heavy: 80 },
} as const satisfies Readonly<{ p1: Readonly<Record<AmmunitionClass, number>>; blade: Readonly<Record<AmmunitionClass, number>> }>;

export function ammunitionAgainst(itemId: number | "TODO" | null | undefined): AmmunitionClass {
  const table = OCELLUS_P4.gear.ammunition.value;
  if (itemId === OCELLUS_P4.gear.items.tonalzticsOfRalos.itemId.value) return table.tonalzticsOfRalos;
  if (itemId === CACHE_ASSETS.items.dragonCrossbow.id) return table.dragonCrossbow;
  if (itemId === CACHE_ASSETS.items.zaryteCrossbow.id) return table.zaryteCrossbow;
  if (itemId === CACHE_ASSETS.items.ascensionCrossbows.id) return table.ascensionCrossbows;
  if (itemId === blowpipe.value.itemId) return blowpipe.value.ammunition;
  return table.twistedBow;
}

export function dressFullFight(player: Player, start: StartWeapon, tier: Tier = "raid"): void {
  dressStartedFight(player, startingLoadout(presetChoice(tier), start).loadout);
}

export function dressStartedFight(player: Player, loadout: CatalogLoadout): void {
  dressOcellus(player, loadout);
  const pipe = OCELLUS_LOADOUTS.catalog.get(blowpipe.value.itemId)?.build();
  if (!(pipe instanceof Weapon)) throw new Error(`item ${blowpipe.value.itemId} is not the blowpipe in the Ocellus catalog`);
  AttackStylesController.controller.setWeaponAttackStyle(pipe, AttackStyle.RAPID);
}
