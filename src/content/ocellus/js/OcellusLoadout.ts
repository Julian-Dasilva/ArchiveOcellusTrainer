import { AttackStyle, AttackStylesController, defineSimLoadouts, dressPlayer, remainingStock } from "osrs-sdk";
import type { ActiveLoadout, CarriedItem, CatalogItem, CatalogLoadout, EquipmentSlot, Item, LoadoutIds, LoadoutStore, Player, Preset, PresetId } from "osrs-sdk";
import type { SavedStorage } from "../../../browserStorage";
import type { StartWeapon, Tier, TierItem, TierRecipe, TierSlot, TierStart, TierStarts } from "./OcellusTimings";
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

const ALLIANCE_SUPPLIES = gear.allianceSupplies.value.map(({ item, quantity }) => ({ item: item.value, quantity }));

export const SHOP_NOT_SIMULATED: readonly Readonly<{ item: TierItem; quantity: number }>[] = ALLIANCE_SUPPLIES.filter(({ item }) => item.simulation !== "simulated");

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
  supplyStock: ALLIANCE_SUPPLIES.flatMap(({ item, quantity }) => (item.simulation === "simulated" ? [{ id: item.id, quantity }] : [])),
  startOptions: TIERS.flatMap((tier) => OCELLUS_PRESETS[tier].starts.map(({ weapon, label, wear }) => ({ id: optionId(tier, weapon), label, wear }))),
});

export function parseTier(value: string | null): Tier {
  return TIERS.find((tier) => tier === value) ?? "raid";
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

export type LoadoutChoice = Pick<ActiveLoadout, "preset" | "source" | "loadout">;

export function presetChoice(tier: Tier): LoadoutChoice {
  const preset = tierPresetOf(tier);
  return { preset, source: "preset", loadout: preset.loadout };
}

export function tierStarts({ preset, loadout }: LoadoutChoice): readonly TierStart[] {
  const tier = parseTier(preset.id);
  return OCELLUS_PRESETS[tier].starts.filter(({ weapon }) => OCELLUS_LOADOUTS.start({ preset, loadout }, optionId(tier, weapon)).kind === "started");
}

export function tierStart(choice: LoadoutChoice, value: string | null): StartWeapon | null {
  const starts = tierStarts(choice);
  return (starts.find(({ weapon }) => weapon === value) ?? starts.at(0))?.weapon ?? null;
}

export type StartedLoadout = Readonly<{ preset: PresetId; edited: boolean; start: StartWeapon | null; loadout: CatalogLoadout }>;

export function startingLoadout(choice: LoadoutChoice, requested: string | null): StartedLoadout {
  const start = tierStart(choice, requested);
  const loadout = start === null ? choice.loadout : startTier(parseTier(choice.preset.id), start, choice.loadout);
  return { preset: choice.preset.id, edited: choice.source === "edit", start, loadout };
}

const CHECKED_WORN: readonly CatalogItem[] = [
  ...new Set(
    Object.values(gear.tiers).flatMap(({ value }) =>
      [...Object.values(value.equipment), ...value.inventory].flatMap((slot) => (slot?.value.simulation === "simulated" ? [slot.value.id] : [])),
    ),
  ),
].flatMap((id) => {
  const item = OCELLUS_LOADOUTS.catalog.get(id);
  return item && item.slot !== "carried" ? [item] : [];
});

export function editorChoices(slot: EquipmentSlot | null): readonly CatalogItem[] {
  return CHECKED_WORN.filter((item) => slot === null || item.slot === slot);
}

export type OverStock = Readonly<{ item: CarriedItem; carried: number; allowed: number }>;

export type TierLoadout = Readonly<{ tier: Tier; active: ActiveLoadout; overStock: readonly OverStock[] }>;

function overStockOf(active: ActiveLoadout): readonly OverStock[] {
  if (active.source !== "edit") return [];
  const stocked = new Set(OCELLUS_LOADOUTS.supplyStock.map(({ item }) => item.id));
  const unstocked = new Map(active.loadout.inventory.flatMap((held) => (held?.slot === "carried" && !stocked.has(held.id) ? [[held.id, held] as const] : [])));
  const supplies = [...OCELLUS_LOADOUTS.supplyStock, ...[...unstocked.values()].map((item) => ({ item, quantity: 0 }))];
  return remainingStock(supplies, active.preset.loadout, active.loadout).flatMap(({ item, quantity }) => {
    const carried = active.loadout.inventory.filter((held) => held?.id === item.id).length;
    return quantity < 0 ? [{ item, carried, allowed: carried + quantity }] : [];
  });
}

function tierLoadout(store: LoadoutStore, storage: ActiveLoadout["storage"]): TierLoadout {
  const stored = store.active();
  const active: ActiveLoadout = { ...stored, storage };
  const tier = parseTier(active.preset.id);
  const overStock = overStockOf(active);
  if (overStock.length === 0) return { tier, active, overStock };
  const { preset } = active;
  return { tier, active: { preset, storage, source: "preset", loadout: preset.loadout, refusedEdit: [] }, overStock };
}

export const GEAR_SCOPES = ["raid", "tiers", "editor"] as const;
export type GearScope = (typeof GEAR_SCOPES)[number];

type Envelope = Readonly<Record<string, unknown>> & Readonly<{ values: Readonly<Record<string, unknown>> }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function envelopeOf(raw: string | null): Envelope | null {
  let parsed: unknown;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  const { values } = parsed;
  return isRecord(values) ? { ...parsed, values } : null;
}

export class TierLoadouts {
  readonly #saved: SavedStorage;
  readonly #store: LoadoutStore;
  readonly #listeners = new Set<() => void>();
  readonly scope: GearScope;
  #tier: Tier;
  #snapshot: TierLoadout;

  constructor(saved: SavedStorage, tier: Tier, scope: GearScope) {
    this.#saved = saved;
    this.scope = scope;
    this.#tier = this.#offered(tier);
    this.#store = OCELLUS_LOADOUTS.store(scope === "editor" ? { getItem: (key) => this.#read(key), setItem: (key, value) => this.#write(key, value) } : this.#presetOnlyStorage());
    this.#store.select(tierPresetOf(this.#tier).id);
    this.#snapshot = this.#current();
  }

  readonly snapshot = (): TierLoadout => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  active(): ActiveLoadout {
    return this.#snapshot.active;
  }

  save(id: PresetId, loadout: CatalogLoadout): void {
    this.#store.save(id, loadout);
    this.#changed();
  }

  reset(id: PresetId): void {
    this.#store.reset(id);
    this.#changed();
  }

  select(id: PresetId): void {
    this.#tier = this.#offered(parseTier(id));
    this.#store.select(tierPresetOf(this.#tier).id);
    this.#changed();
  }

  selectTier(tier: Tier): void {
    this.select(tierPresetOf(tier).id);
  }

  #offered(tier: Tier): Tier {
    return this.scope === "raid" ? "raid" : tier;
  }

  #unedited(): string {
    return JSON.stringify({ version: 1, values: { selected: this.#tier, edits: {} } });
  }

  #presetOnlyStorage(): Pick<Storage, "getItem" | "setItem"> {
    return { getItem: () => this.#unedited(), setItem: () => undefined };
  }

  #read(key: string): string | null {
    const raw = this.#saved.getItem(key);
    if (raw === null) return this.#unedited();
    const envelope = envelopeOf(raw);
    return envelope === null ? raw : JSON.stringify({ ...envelope, values: { ...envelope.values, selected: this.#tier } });
  }

  #write(key: string, value: string): void {
    const edits = envelopeOf(value)?.values.edits;
    const stored = envelopeOf(this.#saved.getItem(key));
    if (JSON.stringify(edits) === JSON.stringify(stored?.values.edits ?? {})) return;
    const next = stored === null ? { version: 1, values: { selected: this.#tier, edits } } : { ...stored, values: { ...stored.values, edits } };
    this.#saved.setItem(key, JSON.stringify(next));
  }

  #current(): TierLoadout {
    return tierLoadout(this.#store, this.#saved.kept() ? "kept" : "session-only");
  }

  #changed(): void {
    this.#snapshot = this.#current();
    for (const listener of this.#listeners) listener();
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
