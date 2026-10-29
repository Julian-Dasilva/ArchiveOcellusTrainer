import { AttackStyle, AttackStylesController, defineSimLoadouts, dressPlayer } from "osrs-sdk";
import type { CatalogLoadout, Item, Player, PresetId } from "osrs-sdk";
import type { StartWeapon } from "./OcellusTimings";
import { OCELLUS_P4, START_WEAPONS } from "./OcellusTimings";
import type { LoadoutSnapshot } from "./P4Types";
import {
  InquisitorsGreatHelm,
  InquisitorsHauberk,
  InquisitorsPlateskirt,
  OcellusBlowpipe,
  OcellusMasoriBodyF,
  OcellusMasoriChapsF,
  OcellusMasoriMaskF,
  OcellusNecklaceOfRupture,
  OcellusScythe,
  OcellusTwistedBow,
  OcellusZaryteVambraces,
  TonalzticsOfRalos,
} from "./gear/OcellusGear";

const { gear } = OCELLUS_P4;
const RAID = "raid";

export const OCELLUS_LOADOUTS = defineSimLoadouts({
  sim: "archive-ocellus",
  items: [
    OcellusTwistedBow,
    OcellusScythe,
    TonalzticsOfRalos,
    OcellusBlowpipe,
    OcellusMasoriMaskF,
    OcellusMasoriBodyF,
    OcellusMasoriChapsF,
    OcellusZaryteVambraces,
    OcellusNecklaceOfRupture,
    InquisitorsGreatHelm,
    InquisitorsHauberk,
    InquisitorsPlateskirt,
  ],
  presets: [{ id: RAID, label: "Raid", revision: 1, loadout: gear.loadout.value, startOptions: START_WEAPONS }],
  defaultPreset: RAID,
  supplyStock: [],
  startOptions: START_WEAPONS.map((id) => ({ id, ...gear.starts.value[id] })),
});

export type StartedLoadout = Readonly<{ preset: PresetId; edited: boolean; loadout: CatalogLoadout }>;

export function startingLoadout(start: StartWeapon): StartedLoadout {
  const preset = OCELLUS_LOADOUTS.presets.find(({ id }) => id === OCELLUS_LOADOUTS.defaultPreset);
  if (!preset) throw new Error(`the default preset ${OCELLUS_LOADOUTS.defaultPreset} is not defined`);
  const started = OCELLUS_LOADOUTS.start({ preset, loadout: preset.loadout }, start);
  switch (started.kind) {
    case "started":
      return { preset: preset.id, edited: false, loadout: started.loadout };
    case "refused":
      throw new Error(`the ${preset.id} preset cannot start with ${start}: ${JSON.stringify(started.rejections)}`);
    default: {
      const unhandled: never = started;
      return unhandled;
    }
  }
}

const STANCES: Readonly<Record<typeof gear.scytheStance.value, AttackStyle>> = { jab: AttackStyle.AGGRESSIVECRUSH };

export function dressOcellus(player: Player, loadout: CatalogLoadout): void {
  dressPlayer(player, loadout);
  AttackStylesController.controller.setWeaponAttackStyle(new OcellusScythe(), STANCES[gear.scytheStance.value]);
}

function itemId(item: Item | null | undefined): number | null {
  const id = item?.cacheItemId;
  return typeof id === "number" ? id : null;
}

export function loadoutSnapshot(player: Player): LoadoutSnapshot {
  const { weapon, offhand, helmet, chest, legs, gloves, cape, necklace, feet, ring, ammo } = player.equipment;
  return {
    equipped: {
      weapon: itemId(weapon),
      offhand: itemId(offhand),
      helmet: itemId(helmet),
      chest: itemId(chest),
      legs: itemId(legs),
      gloves: itemId(gloves),
      cape: itemId(cape),
      necklace: itemId(necklace),
      feet: itemId(feet),
      ring: itemId(ring),
      ammo: itemId(ammo),
    },
    inventory: player.inventory.map(itemId),
    specialEnergy: player.currentStats.specialAttack,
  };
}
