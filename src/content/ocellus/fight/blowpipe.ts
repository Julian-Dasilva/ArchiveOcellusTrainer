import { AttackStyle, AttackStylesController, Blowpipe, SaradominBrew } from "osrs-sdk";
import type { Player, Weapon } from "osrs-sdk";
import { wiki } from "../../../sim/provenance";
import type { AmmunitionClass, Setup, Source, StanceSpeeds } from "../js/OcellusTimings";
import { OCELLUS_P4, defaultLoadout, selected } from "../js/OcellusTimings";
import { dress } from "../js/OcellusLoadout";

const BLOWPIPE_PAGE = wiki("https://oldschool.runescape.wiki/w/Toxic_blowpipe", 15376390);
const DRAGON_DART_PAGE = wiki("https://oldschool.runescape.wiki/w/Dragon_dart", 15372145);
const OCELLUS_PAGE = wiki("https://oldschool.runescape.wiki/w/Ocellus", 15383870);
const STRATEGIES_PAGE = wiki("https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies", 15383713);
const KEPT: Source = { kind: "owner", date: "2026-10-27", topic: "keep a blowpipe for the whole fight" };

export const BLOWPIPE = selected(
  { itemId: 12926, rapidSpeed: 2, otherSpeed: 3, range: 5, longrangeRange: 7, rangedAttack: 30, rangedStrength: 55, ammunition: "light" } as const,
  "spec-single",
  "unscaled",
  "charged, in PvM: Accurate and Longrange are 3 ticks, Rapid is 2; range is 5 tiles, 7 on Longrange; Ranged attack +30 and Ranged strength +20, and dragon darts add +35",
  BLOWPIPE_PAGE,
  DRAGON_DART_PAGE,
  OCELLUS_PAGE,
  STRATEGIES_PAGE,
  KEPT,
);

export const PHASE_RANGED_DEFENCE = {
  p1: { light: 50, standard: 135, heavy: 50 },
  blade: { light: 100, standard: 110, heavy: 80 },
} as const satisfies Readonly<{ p1: Readonly<Record<AmmunitionClass, number>>; blade: Readonly<Record<AmmunitionClass, number>> }>;

export function ammunitionAgainst(itemId: number | "TODO" | null | undefined): AmmunitionClass {
  const table = OCELLUS_P4.gear.ammunition.value;
  if (itemId === OCELLUS_P4.gear.items.tonalzticsOfRalos.itemId.value) return table.tonalzticsOfRalos;
  if (itemId === BLOWPIPE.value.itemId) return BLOWPIPE.value.ammunition;
  return table.twistedBow;
}

function stanceSpeed<T extends number>(weapon: Weapon, speeds: StanceSpeeds<T>): T {
  return weapon.attackStyle() === AttackStyle.RAPID ? speeds.rapidSpeed : speeds.otherSpeed;
}

export class OcellusBlowpipe extends Blowpipe {
  constructor() {
    super();
    this.setStats();
  }

  override get cacheItemId(): number {
    return BLOWPIPE.value.itemId;
  }

  override setStats(): void {
    const { rangedAttack, rangedStrength } = BLOWPIPE.value;
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: rangedAttack },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }

  override get attackSpeed(): 2 | 3 {
    const { rapidSpeed, otherSpeed } = BLOWPIPE.value;
    const speeds: StanceSpeeds<2 | 3> = { rapidSpeed, otherSpeed };
    return stanceSpeed(this, speeds);
  }

  override get attackRange(): 5 | 7 {
    const { range, longrangeRange } = BLOWPIPE.value;
    return this.attackStyle() === AttackStyle.LONGRANGE ? longrangeRange : range;
  }
}

export function dressFullFight(player: Player, worn: Setup): void {
  dress(player, defaultLoadout(worn));
  const replaced = player.equipment.weapon;
  const blowpipe = new OcellusBlowpipe();
  player.equipment.weapon = blowpipe;
  let lastBrew = -1;
  player.inventory.forEach((slot, i) => {
    if (slot instanceof SaradominBrew) lastBrew = i;
  });
  const open = player.inventory.findIndex((slot) => slot === null || slot === undefined);
  const index = open === -1 ? lastBrew : open;
  if (replaced && index >= 0) player.inventory[index] = replaced;
  player.equipmentChanged();
  AttackStylesController.controller.setWeaponAttackStyle(blowpipe, AttackStyle.RAPID);
}
