import { Equipment, dressPlayer, loadoutIds, mapInventory } from "osrs-sdk";
import type { CatalogLoadout } from "osrs-sdk";
import { OCELLUS_LOADOUTS, OCELLUS_PRESETS, dressOcellus, presetChoice, startingLoadout } from "../js/OcellusLoadout";
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
    equipment: { weapon: 28922, offhand: 25818, helmet: 24419, chest: 24420, legs: 24421, gloves: 22981, cape: 21295, necklace: 29801, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [26374, 26235, 28955, 27235, 33639, 27238, 27241, 25975, 12926, 20997, 2444, 2444, 25739, 34715, 23685, 12695, 34681, 34696, ...SUPPLIES_ROWS_5_TO_7.slice(2), 10925, 27281],
  },
  high: {
    equipment: { weapon: 13576, offhand: 25818, helmet: 30750, chest: 30753, legs: 30756, gloves: 7462, cape: 21295, necklace: 24780, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [21902, 27238, 28955, 27281, 33639, 27241, 21000, 33335, 29591, 12926, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
  mid: {
    equipment: { weapon: 29589, offhand: 27552, helmet: 30750, chest: 30753, legs: 30756, gloves: 7462, cape: 21295, necklace: 29801, feet: 31097, ring: 25485, ammo: 33595 },
    inventory: [21902, 27238, 28955, 21000, 22249, 27241, 27235, 27281, 29591, 12926, 12695, 12695, 13576, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 10925, 25818],
  },
  low: {
    equipment: { weapon: 29589, offhand: 27552, helmet: 13199, chest: 29004, legs: 29007, gloves: 7462, cape: 21295, necklace: 24780, feet: 11840, ring: 11773, ammo: 33595 },
    inventory: [21902, null, 28955, 27281, 22249, null, 21000, 25818, 29591, 12926, 12695, 12695, 13576, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
  poor: {
    equipment: { weapon: 29589, offhand: 27552, helmet: 11665, chest: 13072, legs: 13073, gloves: 8842, cape: 21295, necklace: 24780, feet: 11840, ring: 11773, ammo: 33595 },
    inventory: [21902, 11664, 28955, 27281, 22249, 21000, 12926, 25818, 29591, 13576, 12695, 12695, null, null, 2444, 2444, ...SUPPLIES_ROWS_5_TO_7, 3024, 10925],
  },
};

type StyleBonuses = readonly [stab: number, slash: number, crush: number, magic: number, range: number];
type OtherBonuses = readonly [meleeStrength: number, rangedStrength: number, magicDamagePercent: number, prayer: number];

const WIKI_BONUSES: readonly (readonly [id: number, page: string, attack: StyleBonuses, defence: StyleBonuses, other: OtherBonuses])[] = [
  [13576, "Dragon warhammer rev 15362680", [-4,-4,95,-4,0], [0,0,0,0,0], [85,0,0,0]],
  [33335, "Soulreaper axe (o) rev 15273151", [28,134,66,0,0], [0,0,0,0,0], [125,0,0,0]],
  [34715, "Obligator rev 15386629", [22,-8,120,0,0], [0,16,0,3,8], [40,0,0,3]],
  [34681, "Ascension crossbows rev 15385929", [0,0,0,3,34], [-7,-5,0,10,0], [0,0,0,0]],
  [34696, "Diamond ascension bolts (e) rev 15383819", [0,0,0,0,0], [0,0,0,0,0], [0,58,0,0]],
  [29589, "Emberlight rev 15358485", [63,70,0,0,0], [0,3,2,5,0], [13,0,0,0]],
  [25739, "Sanguine scythe of Vitur rev 15345737", [70,125,30,-6,0], [-2,8,10,0,0], [75,0,0,0]],
  [26374, "Zaryte crossbow rev 15382611", [0,0,0,0,110], [14,14,12,15,16], [0,0,0,1]],
  [21902, "Dragon crossbow rev 15352978", [0,0,0,0,94], [0,0,0,0,0], [0,0,0,0]],
  [29591, "Scorching bow rev 15317455", [0,0,0,0,124], [0,0,0,0,0], [0,40,0,0]],
  [25975, "Lightbearer rev 15299656", [0,0,0,0,0], [0,0,0,0,0], [0,0,0,0]],
  [24780, "Amulet of blood fury rev 15355928", [10,10,10,10,10], [15,15,15,15,15], [8,0,0,5]],
  [28955, "Blessed Dizana's quiver rev 15357222", [0,0,0,0,18], [0,0,0,0,0], [0,3,0,0]],
  [13199, "Magma helm rev 15276020", [0.0, 0.0, 0.0, -5.0, -5.0], [52.0, 55.0, 58.0, 0.0, 50.0], [5.0, 0.0, 0.0, 0.0]],
  [11665, "Void melee helm rev 15260466", [0.0, 0.0, 0.0, 0.0, 0.0], [6.0, 6.0, 6.0, 6.0, 6.0], [0.0, 0.0, 0.0, 0.0]],
  [11664, "Void ranger helm rev 15260468", [0.0, 0.0, 0.0, 0.0, 0.0], [6.0, 6.0, 6.0, 6.0, 6.0], [0.0, 0.0, 0.0, 0.0]],
  [13072, "Elite void top rev 15260476", [0.0, 0.0, 0.0, 0.0, 0.0], [45.0, 45.0, 45.0, 45.0, 45.0], [0.0, 0.0, 0.0, 3.0]],
  [13073, "Elite void robe rev 15260481", [0.0, 0.0, 0.0, 0.0, 0.0], [30.0, 30.0, 30.0, 30.0, 30.0], [0.0, 0.0, 0.0, 3.0]],
  [8842, "Void knight gloves rev 15304461", [0.0, 0.0, 0.0, 0.0, 0.0], [6.0, 6.0, 6.0, 4.0, 6.0], [0.0, 0.0, 0.0, 0.0]],
  [29004, "Eclipse Moon chestplate rev 15354977", [0.0, 0.0, 0.0, -15.0, 31.0], [15.0, 18.0, 57.0, 55.0, 32.0], [3.0, 0.0, 0.0, 0.0]],
  [29007, "Eclipse Moon tassets rev 15354995", [0.0, 0.0, 0.0, -15.0, 17.0], [9.0, 13.0, 37.0, 31.0, 17.0], [1.0, 0.0, 0.0, 0.0]],
  [22249, "Necklace of anguish (or) rev 15188731", [0.0, 0.0, 0.0, 0.0, 15.0], [0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 5.0, 0.0, 2.0]],
  [27552, "Ghommal's avernic defender 6 rev 15324597", [30.0, 29.0, 28.0, -5.0, -4.0], [30.0, 29.0, 28.0, -5.0, -4.0], [8.0, 0.0, 0.0, 0.0]],
  [21000, "Twisted buckler rev 15188072", [-7.0, -8.0, -7.0, -10.0, 18.0], [22.0, 24.0, 22.0, 26.0, 58.0], [0.0, 10.0, 0.0, 0.0]],
  [11840, "Dragon boots rev 15364734", [0.0, 0.0, 0.0, -3.0, -1.0], [16.0, 17.0, 18.0, 0.0, 0.0], [4.0, 0.0, 0.0, 0.0]],
  [25818, "Book of the Dead rev 15317141", [0.0, 0.0, 0.0, 6.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 3.0]],
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
    expect(startingLoadout(presetChoice("poor"), "blowpipe").loadout.equipment.helmet?.id).toBe(11664);
  });

  test("each tier names every item it leaves out", () => {
    expect(Object.fromEntries(TIERS.map((tier) => [tier, OCELLUS_PRESETS[tier].notSimulated.map(({ name }) => name)]))).toEqual({
      raid: [],
      max: [],
      high: [],
      mid: [],
      low: [],
      poor: [],
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

const WEAPON_SLICE: readonly (readonly [Tier, readonly number[]])[] = [
  ["max", [26374, 28955, 25975, 25739, 34715, 34681, 34696]],
  ["high", [13576, 24780, 21902, 28955, 33335, 29591]],
  ["mid", [29589, 21902, 28955, 29591, 13576]],
  ["low", [29589, 24780, 21902, 28955, 29591, 13576]],
  ["poor", [29589, 24780, 21902, 28955, 29591, 13576]],
];

test.each(WEAPON_SLICE)("the %s weapon slice reaches the player's worn gear and inventory", (tier, expected) => {
  const drill = startDrill();
  try {
    const player = drill.player();
    dressPlayer(player, presetChoice(tier).loadout);
    const held = [...Object.values(player.equipment), ...player.inventory].flatMap((item) => item == null ? [] : [item.itemId]);
    expect(expected.filter((id) => !held.includes(id))).toEqual([]);
  } finally {
    drill.dispose();
  }
});

test("weapon slice demonbane applies to Ocellus rather than every NPC", () => {
  const drill = startDrill();
  try {
    expect(drill.boss().demonbaneMultiplier).toBe(1);
  } finally {
    drill.dispose();
  }
});

const CROSSBOW_AMMO: readonly (readonly [Tier, number, number])[] = [
  ["max", 26374, 21944],
  ["high", 21902, 9242],
  ["mid", 21902, 9242],
  ["low", 21902, 9242],
  ["poor", 21902, 9242],
];

test.each(CROSSBOW_AMMO)("the %s tier fires its crossbow from the carried quiver", (tier, crossbowId, boltId) => {
  const drill = startDrill();
  try {
    const player = drill.player();
    dressOcellus(player, presetChoice(tier).loadout);
    player.inventory.find((item) => item?.itemId === crossbowId)?.inventoryLeftClick(player);
    const weapon = player.equipment.weapon;
    if (!weapon) throw new Error("the tier has no weapon");
    player.setAggro(drill.boss());
    expect(player.equipment.ammo?.cacheItemId).toBe(11212);
    expect(player.equipment.cape?.itemId).not.toBe(28955);
    expect(player.attack()).toBe(true);
    player.useSpecialAttack = true;
    expect(player.attack()).toBe(true);
    expect(player.currentStats.specialAttack).toBe(crossbowId === 26374 ? 25 : 40);
    const quiver = player.inventory.find((item) => item?.itemId === 28955);
    quiver?.inventoryLeftClick(player);
    expect(player.equipment.cape?.itemId).toBe(28955);
    expect(player.equipment.cape?.bonuses.attack.range).toBe(28);
    expect(player.equipment.cape?.bonuses.other.rangedStrength).toBe(4);
    expect(player.ammunitionFor(weapon)?.itemId).toBe(boltId);
    expect(player.equipment.ammo?.cacheItemId).toBe(11212);
  } finally {
    drill.dispose();
  }
});

test("Max fires its Ascension crossbows once the carried diamond ascension bolts are worn", () => {
  const drill = startDrill();
  try {
    const player = drill.player();
    dressOcellus(player, presetChoice("max").loadout);
    const carried = (id: number) => player.inventory.find((item) => item?.itemId === id);
    carried(34681)?.inventoryLeftClick(player);
    player.setAggro(drill.boss());
    expect(player.equipment.weapon?.itemId).toBe(34681);
    expect(player.attack()).toBe(false);
    carried(34696)?.inventoryLeftClick(player);
    player.setAggro(drill.boss());
    expect(player.equipment.ammo?.itemId).toBe(34696);
    expect(player.attack()).toBe(true);
    expect(drill.boss().incomingProjectiles.at(-1)?.options.visuals.spotAnim?.id).toBe(4439);
  } finally {
    drill.dispose();
  }
});

const TIER_SPECIALS: readonly (readonly [tier: Tier, weapon: number, cost: number, graphic: Readonly<{ animation: number; spotAnims: readonly number[] }>])[] = [
  ["max", 26374, 75, { animation: 9168, spotAnims: [1995] }],
  ["max", 28922, 50, { animation: 10914, spotAnims: [2725, 2727, 2728, 2731, 2733] }],
  ["max", 12926, 50, { animation: 5061, spotAnims: [1043] }],
  ["high", 33335, 0, { animation: 10173, spotAnims: [4008] }],
  ["high", 13576, 50, { animation: 1378, spotAnims: [1292] }],
  ["high", 21902, 60, { animation: 7552, spotAnims: [27] }],
  ["high", 29591, 25, { animation: 11133, spotAnims: [2806, 2807, 2908] }],
  ["mid", 29589, 50, { animation: 11138, spotAnims: [2810] }],
];

test.each(TIER_SPECIALS)("the %s tier's special %i spends %i energy, hits Ocellus and plays its cache graphics", (tier, weaponId, cost, graphic) => {
  const drill = startDrill();
  try {
    const player = drill.player();
    const boss = drill.boss();
    dressOcellus(player, presetChoice(tier).loadout);
    if (player.equipment.weapon?.itemId !== weaponId) player.inventory.find((item) => item?.itemId === weaponId)?.inventoryLeftClick(player);
    expect(player.equipment.weapon?.itemId).toBe(weaponId);
    const played: number[] = [];
    player.setAnimationListener({ animationChanged: (id: number) => void played.push(id), spotAnimChanged: () => {} });
    const shown = new Set<number>();
    const seen = () => {
      for (const { id } of [...player.spotAnims, ...boss.spotAnims]) shown.add(id);
      for (const { options } of boss.incomingProjectiles) if (options.visuals.spotAnim) shown.add(options.visuals.spotAnim.id);
    };
    player.setAggro(boss);
    player.useSpecialAttack = true;
    expect(player.attack()).toBe(true);
    player.didAttack();
    seen();
    expect(player.currentStats.specialAttack).toBe(100 - cost);
    expect(played.at(-1)).toBe(graphic.animation);
    const hits = boss.incomingProjectiles.length;
    for (let tick = 0; tick < 24 && boss.incomingProjectiles.length > 0; tick++) {
      boss.processIncomingAttacks();
      seen();
    }
    expect({ landed: hits > 0 && boss.incomingProjectiles.length === 0, graphics: graphic.spotAnims.filter((id) => !shown.has(id)) }).toEqual({ landed: true, graphics: [] });
  } finally {
    drill.dispose();
  }
});
