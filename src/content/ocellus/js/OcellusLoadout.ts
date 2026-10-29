import { AttackStyle, AttackStylesController, defineSimLoadouts, dressPlayer } from "osrs-sdk";
import type { CatalogLoadout, Item, LoadoutIds, Player, Preset, PresetId } from "osrs-sdk";
import type { StartWeapon, Tier, TierItem, TierRecipe, TierSlot, TierStarts } from "./OcellusTimings";
import { OCELLUS_P4, TIERS } from "./OcellusTimings";
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

export type OcellusPreset = Readonly<{ label: string; loadout: LoadoutIds; starts: TierStarts; notSimulated: readonly TierItem[] }>;

function tierPreset({ label, equipment, inventory, starts }: TierRecipe): OcellusPreset {
  const id = (slot: TierSlot) => (slot?.value.simulation === "simulated" ? slot.value.id : null);
  const { weapon, offhand, helmet, chest, legs, gloves, cape, necklace, feet, ring, ammo } = equipment;
  return {
    label,
    loadout: {
      equipment: { weapon: id(weapon), offhand: id(offhand), helmet: id(helmet), chest: id(chest), legs: id(legs), gloves: id(gloves), cape: id(cape), necklace: id(necklace), feet: id(feet), ring: id(ring), ammo: id(ammo) },
      inventory: inventory.map(id),
    },
    starts,
    notSimulated: [...Object.values(equipment), ...inventory].flatMap((slot) => (slot !== null && slot.value.simulation !== "simulated" ? [slot.value] : [])),
  };
}

export const OCELLUS_PRESETS: Readonly<Record<Tier, OcellusPreset>> = {
  raid: { label: "Raid", loadout: gear.loadout.value, starts: gear.starts.value, notSimulated: [] },
  max: tierPreset(gear.tiers.max.value),
  high: tierPreset(gear.tiers.high.value),
  mid: tierPreset(gear.tiers.mid.value),
  low: tierPreset(gear.tiers.low.value),
  poor: tierPreset(gear.tiers.poor.value),
};

const optionId = (tier: Tier, weapon: StartWeapon): string => `${tier}:${weapon}`;

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
  presets: TIERS.map((tier) => {
    const { label, loadout, starts } = OCELLUS_PRESETS[tier];
    return { id: tier, label, revision: 1, loadout, startOptions: starts.map(({ weapon }) => optionId(tier, weapon)) };
  }),
  defaultPreset: "raid",
  supplyStock: [],
  startOptions: TIERS.flatMap((tier) => OCELLUS_PRESETS[tier].starts.map(({ weapon, label, wear }) => ({ id: optionId(tier, weapon), label, wear }))),
});

export function parseTier(value: string | null): Tier {
  return TIERS.find((tier) => tier === value) ?? "raid";
}

export function tierStart(tier: Tier, value: string | null): StartWeapon {
  const { starts } = OCELLUS_PRESETS[tier];
  return (starts.find(({ weapon }) => weapon === value) ?? starts[0]).weapon;
}

function tierPresetOf(tier: Tier): Preset {
  const preset = OCELLUS_LOADOUTS.presets.find(({ id }) => id === tier);
  if (!preset) throw new Error(`the ${tier} preset is not defined`);
  return preset;
}

export function startTier(tier: Tier, weapon: StartWeapon, loadout: CatalogLoadout): CatalogLoadout {
  const started = OCELLUS_LOADOUTS.start({ preset: tierPresetOf(tier), loadout }, optionId(tier, weapon));
  switch (started.kind) {
    case "started":
      return started.loadout;
    case "refused":
      throw new Error(`the ${tier} preset cannot start with ${weapon}: ${JSON.stringify(started.rejections)}`);
    default: {
      const unhandled: never = started;
      return unhandled;
    }
  }
}

export type StartedLoadout = Readonly<{ preset: PresetId; edited: boolean; loadout: CatalogLoadout }>;

export function startingLoadout(tier: Tier, weapon: StartWeapon): StartedLoadout {
  const { id, loadout } = tierPresetOf(tier);
  return { preset: id, edited: false, loadout: startTier(tier, weapon, loadout) };
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
