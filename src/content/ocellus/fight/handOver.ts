import type { Item, ItemName, UnitEquipment } from "osrs-sdk";
import type { ATile } from "./geometry";
import type { BossForm, FightPlayer } from "./units";

type Slot = keyof UnitEquipment;
type CombatSkill = "attack" | "strength" | "defence" | "range" | "magic";

/** Everything the phase 4 drill needs to continue the fight from phase 3's third fall. Levels are current, boosts included. */
export type HandOver = Readonly<{
  player: Readonly<{
    tile: ATile;
    hp: number;
    prayerPoints: number;
    prayers: readonly string[];
    equipment: Readonly<Record<Slot, ItemName | null>>;
    inventory: readonly (ItemName | null)[];
    specialEnergy: number;
    runEnergy: number;
    levels: Readonly<Record<CombatSkill, number>>;
    attackDelay: number;
  }>;
  boss: Readonly<{ hp: number; defence: number }>;
}>;

const nameOf = (item: Item | null | undefined): ItemName | null => item?.itemName ?? null;

export function handOverOf(player: FightPlayer, boss: BossForm): HandOver {
  const { equipment: worn, currentStats: now } = player;
  return {
    player: {
      tile: player.tile,
      hp: now.hitpoint,
      prayerPoints: now.prayer ?? 0,
      prayers: player.prayerController.activePrayers().map((prayer) => prayer.name),
      equipment: {
        weapon: nameOf(worn.weapon),
        offhand: nameOf(worn.offhand),
        helmet: nameOf(worn.helmet),
        necklace: nameOf(worn.necklace),
        chest: nameOf(worn.chest),
        legs: nameOf(worn.legs),
        feet: nameOf(worn.feet),
        gloves: nameOf(worn.gloves),
        ring: nameOf(worn.ring),
        cape: nameOf(worn.cape),
        ammo: nameOf(worn.ammo),
      },
      inventory: player.inventory.map(nameOf),
      specialEnergy: now.specialAttack,
      runEnergy: now.run,
      levels: { attack: now.attack, strength: now.strength, defence: now.defence, range: now.range, magic: now.magic },
      attackDelay: player.attackDelay,
    },
    boss: { hp: boss.currentStats.hitpoint, defence: boss.currentStats.defence },
  };
}
