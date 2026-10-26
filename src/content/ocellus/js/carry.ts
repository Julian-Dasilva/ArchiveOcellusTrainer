import { BastionPotion, SaradominBrew, SuperCombatPotion, SuperRestore } from "osrs-sdk";
import type { Item, Player, UnitEquipment } from "osrs-sdk";
import type { Brand, TickSpan, Tile, Unbranded } from "../../../sim/brands";
import { span, tile } from "../../../sim/brands";
import type { DrillConfig, GearSlot, SupplyKey } from "./OcellusTimings";
import { GEAR_SLOTS, OCELLUS_P4 } from "./OcellusTimings";
import { ITEMS } from "./OcellusLoadout";
import { OcellusRegion } from "./OcellusRegion";
import { PLATFORM } from "./p4/floor";

export type ItemId = Brand<"ItemId">;
export type Dose = 1 | 2 | 3 | 4;
export type CarriedItem = Readonly<{ kind: "gear"; id: ItemId }> | Readonly<{ kind: "supply"; id: ItemId; doses: Dose }>;

const PRAYERS = [
  "Thick Skin", "Burst of Strength", "Clarity of Thought", "Sharp Eye", "Mystic Will", "Rock Skin", "Superhuman Strength", "Improved Reflexes", "Rapid Restore", "Rapid Heal",
  "Protect Item", "Hawk Eye", "Mystic Lore", "Steel Skin", "Ultimate Strength", "Incredible Reflexes", "Protect from Magic", "Protect from Range", "Protect from Melee", "Eagle Eye",
  "Mystic Might", "Retribution", "Redemption", "Smite", "Preserve", "Chivalry", "Piety", "Rigour", "Augury",
] as const;
export type PrayerName = (typeof PRAYERS)[number];

const LEVELS = ["attack", "strength", "defence", "range", "magic"] as const;
type Level = (typeof LEVELS)[number];
export type Levels = Readonly<Record<Level, number>>;

/** The fight a player brings into P4. `at` is a P4 tile; `levels` are current levels, boosts and drains included. */
export type Carried = Readonly<{
  player: Readonly<{
    at: Tile;
    hp: number;
    prayer: number;
    prayers: readonly PrayerName[];
    equipment: Readonly<Record<GearSlot, ItemId | null>>;
    inventory: readonly (CarriedItem | null)[];
    special: number;
    run: number;
    levels: Levels;
    attackDelay: TickSpan;
  }>;
  boss: Readonly<{ hp: number; defence: number }>;
}>;

const SUPPLIES: { readonly [K in SupplyKey]: (doses: Dose) => Item } = {
  superCombatPotion: (doses) => new SuperCombatPotion(doses),
  bastionPotion: (doses) => new BastionPotion(doses),
  saradominBrew: (doses) => new SaradominBrew(doses),
  superRestore: (doses) => new SuperRestore(doses),
};

type Entry =
  | Readonly<{ kind: "gear"; slot: GearSlot; make: () => Item; wear: (equipment: UnitEquipment) => void }>
  | Readonly<{ kind: "supply"; make: (doses: Dose) => Item }>;

function gearFor<S extends GearSlot>(slot: S): readonly Entry[] {
  return Object.values<() => NonNullable<UnitEquipment[S]>>(ITEMS[slot]).map((make) => ({ kind: "gear", slot, make, wear: (equipment) => void (equipment[slot] = make()) }));
}

let catalogue: ReadonlyMap<number, Entry> | null = null;

/** Every item a P4 player can wear or carry, by cache item id, read off one constructed copy of each. */
function items(): ReadonlyMap<number, Entry> {
  if (catalogue !== null) return catalogue;
  const byId = new Map<number, Entry>();
  for (const entry of [...GEAR_SLOTS.flatMap(gearFor), ...Object.values(SUPPLIES).map((make): Entry => ({ kind: "supply", make }))]) {
    const id = entry.kind === "gear" ? entry.make().cacheItemId : entry.make(4).cacheItemId;
    if (typeof id !== "number" || byId.has(id)) throw new Error(`P4's items need one distinct cache item id each, and ${id} is not`);
    byId.set(id, entry);
  }
  catalogue = byId;
  return byId;
}

const isItemId = (n: Unbranded): n is Unbranded & ItemId => items().has(n);

const VERSION = "1";
const FIELDS = 12;
const EMPTY = "-";
const INVENTORY_SIZE = 28;
const LARGEST_BOSS_HP = Math.max(...Object.values(OCELLUS_P4.choices.bossMaxHp.options).map((option) => option.value));
const slug = (name: PrayerName) => name.toLowerCase().replace(/ /g, "-");

/** Fields split on `_` and lists on `.`, characters URLSearchParams leaves unescaped, so a link stays readable. */
export function encodeCarried(c: Carried): string {
  const { player, boss } = c;
  const stack = (item: CarriedItem | null) => (item === null ? EMPTY : item.kind === "supply" ? `${item.id}*${item.doses}` : `${item.id}`);
  return [
    VERSION,
    `${player.at.x}.${player.at.y}`,
    player.hp,
    player.prayer,
    player.prayers.map(slug).join("."),
    GEAR_SLOTS.map((slot) => player.equipment[slot] ?? EMPTY).join("."),
    player.inventory.map(stack).join("."),
    player.special,
    player.run,
    LEVELS.map((level) => player.levels[level]).join("."),
    player.attackDelay,
    `${boss.hp}.${boss.defence}`,
  ].join("_");
}

class Malformed extends Error {}

function reject(): never {
  throw new Malformed();
}

function count(raw: string, min: number, max: number): number {
  const n = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  return n >= min && n <= max ? n : reject();
}

function list(raw: string, length: number): (index: number) => string {
  const parts = raw.split(".");
  if (parts.length !== length) reject();
  return (index) => parts[index] ?? reject();
}

function itemId(raw: string): ItemId {
  const n = count(raw, 1, 99999);
  return isItemId(n) ? n : reject();
}

function worn(slot: GearSlot, raw: string): ItemId | null {
  if (raw === EMPTY) return null;
  const id = itemId(raw);
  const entry = items().get(id);
  return entry?.kind === "gear" && entry.slot === slot ? id : reject();
}

function carriedItem(raw: string): CarriedItem | null {
  if (raw === EMPTY) return null;
  const [rawId = "", rawDoses, ...rest] = raw.split("*");
  const id = itemId(rawId);
  if (rest.length > 0) reject();
  if (items().get(id)?.kind === "gear") return rawDoses === undefined ? { kind: "gear", id } : reject();
  const doses = count(rawDoses ?? "", 1, 4);
  return doses === 1 || doses === 2 || doses === 3 || doses === 4 ? { kind: "supply", id, doses } : reject();
}

function prayers(raw: string): readonly PrayerName[] {
  return raw === "" ? [] : raw.split(".").map((part) => PRAYERS.find((name) => slug(name) === part) ?? reject());
}

function bySlot<T>(of: (slot: GearSlot) => T): Readonly<Record<GearSlot, T>> {
  return { weapon: of("weapon"), helmet: of("helmet"), chest: of("chest"), legs: of("legs"), gloves: of("gloves"), cape: of("cape"), necklace: of("necklace"), feet: of("feet"), ring: of("ring"), ammo: of("ammo") };
}

function byLevel(of: (level: Level) => number): Levels {
  return { attack: of("attack"), strength: of("strength"), defence: of("defence"), range: of("range"), magic: of("magic") };
}

function parse(s: string): Carried {
  const fields = s.split("_");
  if (fields.length !== FIELDS || fields[0] !== VERSION) reject();
  const field = (index: number) => fields[index] ?? reject();
  const at = list(field(1), 2);
  const spot = tile(count(at(0), 0, 99), count(at(1), 0, 99));
  if (!PLATFORM.contains(spot)) reject();
  const wornIds = list(field(5), GEAR_SLOTS.length);
  const inventory = list(field(6), INVENTORY_SIZE);
  const levels = list(field(9), LEVELS.length);
  const boss = list(field(11), 2);
  return {
    player: {
      at: spot,
      hp: count(field(2), 1, 255),
      prayer: count(field(3), 0, 255),
      prayers: prayers(field(4)),
      equipment: bySlot((slot) => worn(slot, wornIds(GEAR_SLOTS.indexOf(slot)))),
      inventory: Array.from({ length: INVENTORY_SIZE }, (_, index) => carriedItem(inventory(index))),
      special: count(field(7), 0, 100),
      run: count(field(8), 0, 10000),
      levels: byLevel((level) => count(levels(LEVELS.indexOf(level)), 1, 255)),
      attackDelay: span(count(field(10), 0, 20)),
    },
    boss: { hp: count(boss(0), 1, LARGEST_BOSS_HP), defence: count(boss(1), 0, OCELLUS_P4.boss.stats.value.defence) },
  };
}

/** Null for any field out of shape or range, so a bad link opens the drill instead. */
export function decodeCarried(s: string): Carried | null {
  try {
    return parse(s);
  } catch (error) {
    if (error instanceof Malformed) return null;
    throw error;
  }
}

function made(item: CarriedItem | null): Item | null {
  const entry = item === null ? undefined : items().get(item.id);
  if (entry?.kind === "gear") return entry.make();
  return entry?.kind === "supply" && item?.kind === "supply" ? entry.make(item.doses) : null;
}

function enter(player: Player, carried: Carried["player"]): void {
  player.setLocation(carried.at);
  player.destinationLocation = { ...carried.at };
  player.pathTargetLocation = { ...carried.at };
  for (const slot of GEAR_SLOTS) {
    const id = carried.equipment[slot];
    const entry = id === null ? undefined : items().get(id);
    if (entry?.kind === "gear") entry.wear(player.equipment);
    else player.equipment[slot] = undefined;
  }
  carried.inventory.forEach((item, index) => {
    const replacement = made(item);
    if (replacement !== null) player.inventory[index] = replacement;
    else player.inventory[index]?.consumeItem(player);
  });
  player.equipmentChanged();
  const stats = player.currentStats;
  stats.hitpoint = carried.hp;
  stats.prayer = carried.prayer;
  stats.specialAttack = carried.special;
  stats.run = carried.run;
  for (const level of LEVELS) stats[level] = carried.levels[level];
  player.attackDelay = carried.attackDelay;
  for (const name of carried.prayers) player.prayerController.findPrayerByName(name).activate(player);
}

/** P4 entered from a carried fight: the drill's own entry runs first, then the carried state replaces it. */
export class CarriedRegion extends OcellusRegion {
  constructor(config: DrillConfig, private readonly carried: Carried) {
    super(config);
  }

  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    enter(result.player, this.carried.player);
    const boss = this.primaryBoss;
    if (boss) {
      boss.currentStats.hitpoint = Math.min(this.carried.boss.hp, boss.stats.hitpoint);
      boss.currentStats.defence = this.carried.boss.defence;
    }
    if (startWorld) this.world.startTicking();
    return result;
  }
}
