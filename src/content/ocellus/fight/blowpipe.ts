import { AttackStyle, AttackStylesController, Weapon } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { AmmunitionClass, StartWeapon } from "../js/OcellusTimings";
import { OCELLUS_P4, START_WEAPONS } from "../js/OcellusTimings";
import { OCELLUS_LOADOUTS, dressOcellus, startingLoadout } from "../js/OcellusLoadout";

const { blowpipe } = OCELLUS_P4.gear;

export const PHASE_RANGED_DEFENCE = {
  p1: { light: 50, standard: 135, heavy: 50 },
  blade: { light: 100, standard: 110, heavy: 80 },
} as const satisfies Readonly<{ p1: Readonly<Record<AmmunitionClass, number>>; blade: Readonly<Record<AmmunitionClass, number>> }>;

export function ammunitionAgainst(itemId: number | "TODO" | null | undefined): AmmunitionClass {
  const table = OCELLUS_P4.gear.ammunition.value;
  if (itemId === OCELLUS_P4.gear.items.tonalzticsOfRalos.itemId.value) return table.tonalzticsOfRalos;
  if (itemId === blowpipe.value.itemId) return blowpipe.value.ammunition;
  return table.twistedBow;
}

export function startWeapon(value: string | null): StartWeapon {
  return START_WEAPONS.find((weapon) => weapon === value) ?? "twistedBow";
}

export function dressFullFight(player: Player, start: StartWeapon): void {
  dressOcellus(player, startingLoadout(start).loadout);
  const pipe = OCELLUS_LOADOUTS.catalog.get(blowpipe.value.itemId)?.build();
  if (!(pipe instanceof Weapon)) throw new Error(`item ${blowpipe.value.itemId} is not the blowpipe in the Ocellus catalog`);
  AttackStylesController.controller.setWeaponAttackStyle(pipe, AttackStyle.RAPID);
}
