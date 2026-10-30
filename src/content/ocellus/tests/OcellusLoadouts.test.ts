import { Equipment, dressPlayer, loadoutIds, mapInventory } from "osrs-sdk";
import type { CatalogLoadout } from "osrs-sdk";
import { OCELLUS_LOADOUTS, OCELLUS_PRESETS, presetChoice, startingLoadout } from "../js/OcellusLoadout";
import type { Tier } from "../js/OcellusTimings";
import { TIERS } from "../js/OcellusTimings";
import { startDrill } from "./drill";

const heldItems = ({ equipment, inventory }: CatalogLoadout): number[] =>
  [...Object.values(equipment), ...inventory].flatMap((item) => (item ? [item.id] : [])).sort((a, b) => a - b);

const presetIds = (tier: Tier) => {
  const preset = OCELLUS_LOADOUTS.presets.find(({ id }) => id === tier);
  return preset ? loadoutIds(preset.loadout) : null;
};

const SUPPLIES_ROWS_5_TO_7 = [null, null, 3024, 3024, 6685, 6685, 3024, 3024, 6685, 6685];

const TIER_IDS = {
  max: {
    equipment: { weapon: 28922, offhand: null, helmet: 24419, chest: 24420, legs: 24421, gloves: null, cape: 21295, necklace: 29801, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [null, 26235, null, 27235, 33639, 27238, 27241, null, 12926, 20997, 2444, 2444, null, null, 23685, 12695, ...SUPPLIES_ROWS_5_TO_7, 10925, null],
  },
  high: {
    equipment: { weapon: null, offhand: null, helmet: 30750, chest: 30753, legs: 30756, gloves: 7462, cape: 21295, necklace: null, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [null, 27238, null, null, 33639, 27241, null, null, null, 12926, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
  mid: {
    equipment: { weapon: null, offhand: null, helmet: 30750, chest: 30753, legs: 30756, gloves: 7462, cape: 21295, necklace: 29801, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [null, 27238, null, null, null, 27241, 27235, null, null, 12926, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 10925, null],
  },
  low: {
    equipment: { weapon: null, offhand: null, helmet: null, chest: null, legs: null, gloves: 7462, cape: 21295, necklace: null, feet: null, ring: null, ammo: 33595 },
    inventory: [null, null, null, null, null, null, null, null, null, 12926, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
  poor: {
    equipment: { weapon: null, offhand: null, helmet: null, chest: null, legs: null, gloves: null, cape: 21295, necklace: null, feet: null, ring: null, ammo: 33595 },
    inventory: [null, null, null, null, null, null, 12926, null, null, null, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
};

type StyleBonuses = readonly [stab: number, slash: number, crush: number, magic: number, range: number];
type OtherBonuses = readonly [meleeStrength: number, rangedStrength: number, magicDamagePercent: number, prayer: number];

const WIKI_BONUSES: readonly (readonly [id: number, page: string, attack: StyleBonuses, defence: StyleBonuses, other: OtherBonuses])[] = [
  [24419, "Inquisitor's great helm rev 15352822", [0, 0, 10, -5, -5], [19, 10, 21, 0, 12], [6, 0, 0, 1]],
  [24420, "Inquisitor's hauberk rev 15352823", [0, 0, 16, -11, -10], [67, 55, 71, 0, 35], [4, 0, 0, 2]],
  [24421, "Inquisitor's plateskirt rev 15352824", [0, 0, 12, -9, -5], [42, 30, 49, 0, 22], [2, 0, 0, 2]],
  [30750, "Oathplate helm rev 15378889", [0, 10, 0, -2, -7], [50, 72, 45, 0, 50], [6, 0, 0, 0]],
  [30753, "Oathplate chest rev 15378890", [0, 16, 0, -16, -18], [105, 128, 100, -5, 112], [4, 0, 0, 0]],
  [30756, "Oathplate legs rev 15378891", [0, 12, 0, -12, -14], [75, 100, 73, -3, 81], [2, 0, 0, 0]],
  [21295, "Infernal cape rev 15359317", [4, 4, 4, 1, 1], [12, 12, 12, 12, 12], [8, 0, 0, 2]],
  [29801, "Amulet of rancour rev 15343231", [25, 25, 25, -6, -8], [0, 0, 0, 0, 0], [12, 0, 0, 2]],
  [33639, "Necklace of rupture rev 15379787", [0, 0, 0, 0, 20], [0, 0, 0, 0, 0], [0, 8, 0, 3]],
  [33595, "Seeking dragon arrow rev 15314450", [0, 0, 0, 0, 20], [0, 0, 0, 0, 0], [0, 60, 0, 0]],
  [28922, "Tonalztics of Ralos rev 15368852", [0, 0, 0, 0, 115], [0, 0, 0, 0, 0], [0, 55, 0, 2]],
  [20997, "Twisted bow rev 15363157", [0, 0, 0, 0, 70], [0, 0, 0, 0, 0], [0, 20, 0, 0]],
  [12926, "Toxic blowpipe rev 15376390, plus Dragon dart's +35 ranged strength", [0, 0, 0, 0, 30], [0, 0, 0, 0, 0], [0, 55, 0, 0]],
  [22981, "Ferocious gloves rev 15301367", [16, 16, 16, -16, -16], [0, 0, 0, 0, 0], [14, 0, 0, 0]],
  [7462, "Barrows gloves rev 15322401", [12, 12, 12, 6, 12], [12, 12, 12, 6, 12], [12, 0, 0, 0]],
  [26235, "Zaryte vambraces rev 15190607", [-8, -8, -8, 0, 18], [8, 8, 8, 5, 8], [0, 2, 0, 1]],
  [31097, "Avernic treads (max) rev 15320239", [5, 5, 5, 11, 15], [21, 25, 25, 10, 10], [6, 3, 2, 0]],
  [25485, "Ultor ring rev 15191287", [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [12, 0, 0, 0]],
  [11773, "Berserker ring (i) rev 15345632", [0, 0, 0, 0, 0], [0, 0, 8, 0, 0], [8, 0, 0, 0]],
  [27235, "Masori mask (f) rev 15190975", [0, 0, 0, -1, 12], [8, 10, 12, 12, 9], [0, 2, 0, 1]],
  [27238, "Masori body (f) rev 15190976", [0, 0, 0, -4, 43], [59, 52, 64, 74, 60], [0, 4, 0, 1]],
  [27241, "Masori chaps (f) rev 15190977", [0, 0, 0, -2, 27], [35, 30, 39, 46, 37], [0, 2, 0, 1]],
];

function simBonuses(id: number) {
  const built = OCELLUS_LOADOUTS.catalog.get(id)?.build();
  if (!(built instanceof Equipment)) return null;
  const { attack, defence, other } = built.bonuses;
  return {
    attack: [attack.stab, attack.slash, attack.crush, attack.magic, attack.range],
    defence: [defence.stab, defence.slash, defence.crush, defence.magic, defence.range],
    other: [other.meleeStrength, other.rangedStrength, Math.round(other.magicDamage * 100), other.prayer],
  };
}

describe("Ocellus loadouts", () => {
  test("offer the raid preset by default and the five gear tiers, each holding exactly the tier's items the sim can build", () => {
    expect({ presets: OCELLUS_LOADOUTS.presets.map(({ id, label }) => `${id} ${label}`), default: OCELLUS_LOADOUTS.defaultPreset }).toEqual({
      presets: ["raid Raid", "max Max", "high High", "mid Mid", "low Low", "poor Poor"],
      default: "raid",
    });
    expect({ max: presetIds("max"), high: presetIds("high"), mid: presetIds("mid"), low: presetIds("low"), poor: presetIds("poor") }).toEqual(TIER_IDS);
  });

  test("each tier starts with every weapon it offers in hand, unedited, holding the same items as its other starts", () => {
    const starts = Object.fromEntries(
      TIERS.map((tier) => {
        const loadouts = OCELLUS_PRESETS[tier].starts.map(({ weapon, label }) => ({ label, started: startingLoadout(presetChoice(tier), weapon) }));
        const items = heldItems(loadouts[0].started.loadout).join();
        return [tier, loadouts.map(({ label, started }) => ({ label, preset: started.preset, edited: started.edited, weapon: started.loadout.equipment.weapon?.id ?? null, sameItems: heldItems(started.loadout).join() === items }))];
      }),
    );
    const start = (tier: Tier, label: string, weapon: number) => ({ label, preset: tier, edited: false, weapon, sameItems: true });

    expect(starts).toEqual({
      raid: [start("raid", "Twisted bow (Masori)", 20997), start("raid", "Toxic blowpipe (Masori)", 12926), start("raid", "Scythe (Inquisitor's)", 22325)],
      max: [start("max", "Twisted bow (Masori)", 20997), start("max", "Toxic blowpipe (Masori)", 12926), start("max", "Tonalztics of Ralos (Inquisitor's)", 28922)],
      high: [start("high", "Toxic blowpipe (Masori)", 12926)],
      mid: [start("mid", "Toxic blowpipe (Masori)", 12926)],
      low: [start("low", "Toxic blowpipe", 12926)],
      poor: [start("poor", "Toxic blowpipe", 12926)],
    });
    expect(heldItems(startingLoadout(presetChoice("raid"), "melee").loadout).length).toBe(38);
  });

  test("each tier names every item it leaves out", () => {
    expect(Object.fromEntries(TIERS.map((tier) => [tier, OCELLUS_PRESETS[tier].notSimulated.map(({ name }) => name)]))).toEqual({
      raid: [],
      max: ["Book of the Dead", "Ferocious gloves", "Zaryte crossbow", "Blessed Dizana's quiver", "Lightbearer", "Sanguine scythe of Vitur", "Divine rune pouch"],
      high: ["Dragon warhammer", "Book of the Dead", "Amulet of blood fury", "Dragon crossbow", "Blessed Dizana's quiver", "Divine rune pouch", "Twisted buckler", "Dragon warhammer (cr)", "Scorching bow"],
      mid: ["Emberlight", "Ghommal's avernic defender 6", "Dragon crossbow", "Blessed Dizana's quiver", "Twisted buckler", "Necklace of anguish (or)", "Divine rune pouch", "Scorching bow", "Dragon warhammer", "Book of the Dead"],
      low: ["Emberlight", "Ghommal's avernic defender 6", "Magma helm", "Eclipse Moon chestplate", "Eclipse Moon tassets", "Amulet of blood fury", "Dragon boots", "Berserker ring (i)", "Dragon crossbow", "Blessed Dizana's quiver", "Divine rune pouch", "Necklace of anguish (or)", "Twisted buckler", "Book of the Dead", "Scorching bow", "Dragon warhammer"],
      poor: ["Emberlight", "Ghommal's avernic defender 6", "Void melee helm", "Elite void top", "Elite void robe", "Void knight gloves", "Amulet of blood fury", "Dragon boots", "Berserker ring (i)", "Dragon crossbow", "Void ranger helm", "Blessed Dizana's quiver", "Divine rune pouch", "Necklace of anguish (or)", "Twisted buckler", "Book of the Dead", "Scorching bow", "Dragon warhammer"],
    });
  });

  test("every worn tier item the sim builds has the wiki's bonuses, and an item left out has no class or other bonuses", () => {
    const tiers = TIERS.filter((tier) => tier !== "raid");
    const worn = new Set(
      tiers.flatMap((tier) => [...Object.values(OCELLUS_PRESETS[tier].loadout.equipment), ...OCELLUS_PRESETS[tier].loadout.inventory]).flatMap((id) => (id !== null && simBonuses(id) !== null ? [id] : [])),
    );
    const leftOut = new Map(tiers.flatMap((tier) => OCELLUS_PRESETS[tier].notSimulated.map(({ id, simulation }) => [id, simulation] as const)));
    const wiki = new Map(WIKI_BONUSES.map(([id, page, attack, defence, other]) => [id, { page, bonuses: { attack, defence, other } }]));

    expect([...worn].filter((id) => wiki.get(id) === undefined)).toEqual([]);
    expect([...worn].flatMap((id) => (JSON.stringify(simBonuses(id)) === JSON.stringify(wiki.get(id)?.bonuses) ? [] : [wiki.get(id)?.page]))).toEqual([]);
    expect(
      [...leftOut].map(([id, simulation]) => {
        const sim = simBonuses(id);
        const built = sim === null ? (OCELLUS_LOADOUTS.catalog.get(id) === undefined ? "no class" : "not equipment") : JSON.stringify(sim) === JSON.stringify(wiki.get(id)?.bonuses) ? "wiki bonuses" : "other bonuses";
        return `${id} ${simulation} ${built}`;
      }).filter((line) => !/ (no-item-class no class|stats-differ other bonuses)$/.test(line)),
    ).toEqual([]);
  });
});

for (const tier of ["max", "low"] as const) {
  test(`Alliance Supplies builds usable prayer and combo food for the ${tier} tier`, () => {
    const drill = startDrill();
    try {
      const shop = (id: number) => {
        const stocked = OCELLUS_LOADOUTS.supplyStock.find(({ item }) => item.id === id);
        if (!stocked) throw new Error(`Supply ${id} is not stocked`);
        return stocked.item;
      };
      const base = presetChoice(tier).loadout;
      const supplies = [shop(2434), shop(391), shop(32336)];
      const edited = { ...base, inventory: mapInventory(base.inventory, (item, index) => supplies[index] ?? item) };
      const player = drill.player();
      dressPlayer(player, edited);
      expect(player.inventory.slice(0, 3).map((item) => item?.itemId)).toEqual([2434, 391, 32336]);
      player.currentStats.prayer = 20;
      player.currentStats.hitpoint = 40;
      player.inventory[1]?.inventoryLeftClick(player);
      player.inventory[0]?.inventoryLeftClick(player);
      player.inventory[2]?.inventoryLeftClick(player);
      drill.region.world.tickWorld();
      expect([player.currentStats.prayer, player.currentStats.hitpoint]).toEqual([51, 82]);
      expect(player.inventory.slice(0, 3).map((item) => item?.itemId ?? null)).toEqual([139, null, null]);
    } finally {
      drill.dispose();
    }
  });
}
