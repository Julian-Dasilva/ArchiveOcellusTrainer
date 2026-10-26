import { act } from "react";
import { OcellusRegion } from "../js/OcellusRegion";
import type { HandOver } from "../js/carry";
import { decodeCarried, handOverToP4 } from "../js/carry";
import { captureNavigation, loadPage } from "./page";

const WORN = "20997.27235.27238.27241.26235.28951.33639.31097.28310.11212";
const SWITCHES = "28922.22325.24419.24420.24421.22981.21295.29801.25485";
const SUPPLIES_TWO_BREW_DOSES_USED = "12695*4.22461*4.6685*2.3024*4.12695*4.22461*4.6685*4.3024*4.6685*4.6685*4.6685*4.3024*4.6685*4.6685*4.6685*4.3024*4.6685*4.6685*4.3024*4";
const CARRIED = `1_2.2_37_12_protect-from-range.rigour_${WORN}_${SWITCHES}.${SUPPLIES_TWO_BREW_DOSES_USED}_50_6400_92.92.118.104.92_3_3937.200`;

const probe = () => {
  if (!window.__archiveOcellusProbe) throw new Error("the page exposed no probe");
  return window.__archiveOcellusProbe;
};

async function loadP4(url: string) {
  const built = vi.spyOn(OcellusRegion.prototype, "initialiseRegion");
  const page = loadPage(url);
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  const region = built.mock.contexts.at(-1);
  built.mockRestore();
  if (!(region instanceof OcellusRegion)) throw new Error("the page built no P4 region");
  return { page, region };
}

function playerState(region: OcellusRegion) {
  const [player] = region.players;
  if (!player) throw new Error("the region has no player");
  const { hitpoint, prayer, specialAttack, run, attack, strength, defence, range, magic } = player.currentStats;
  return {
    at: { x: player.location.x, y: player.location.y },
    stats: { hitpoint, prayer, specialAttack, run, attack, strength, defence, range, magic },
    attackDelay: player.attackDelay,
    doses: player.inventory.map((item) => (item && "doses" in item ? item.doses : null)),
    prayers: player.prayerController.activePrayers().map(({ name }) => name),
  };
}

describe("P4 entered from a carried fight, behind ARCHIVE_FULL", () => {
  beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));
  afterEach(() => vi.unstubAllEnvs());

  test("a hand-made carried link opens P4 with the player's tile, HP, prayer, gear, potion doses, energies, levels and attack delay, the boss at 3/4 HP and drained Defence, and the prayers on from the first tick", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const { page, region } = await loadP4(`/?seed=1&carry=${CARRIED}`);
    const { fight, rejected } = probe().snapshot();
    const entered = playerState(region);
    region.world.tickWorld();
    const prayersAfterOneTick = playerState(region).prayers;
    page.close();

    expect({ boss: fight?.boss, loadout: fight?.player, rejected, entered: { ...entered, prayers: prayersAfterOneTick } }).toEqual({
      boss: { npcId: 16677, hp: 3937, maxHp: 5250, visible: false, defence: 200 },
      loadout: {
        equipped: { weapon: 20997, offhand: null, helmet: 27235, chest: 27238, legs: 27241, gloves: 26235, cape: 28951, necklace: 33639, feet: 31097, ring: 28310, ammo: 11212 },
        inventory: [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, 12695, 22461, 6685, 3024, 12695, 22461, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 3024],
        specialEnergy: 50,
      },
      rejected: [],
      entered: {
        at: { x: 2, y: 2 },
        stats: { hitpoint: 37, prayer: 12, specialAttack: 50, run: 6400, attack: 92, strength: 92, defence: 118, range: 104, magic: 92 },
        attackDelay: 3,
        doses: [null, null, null, null, null, null, null, null, null, 4, 4, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        prayers: ["Protect from Range", "Rigour"],
      },
    });
  });

  test("a malformed carried link opens the drill at its entry HP and spawn and lists the link as rejected", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const malformed = CARRIED.replace("_3_3937.200", "_3_3937");
    const { page, region } = await loadP4(`/?seed=1&carry=${malformed}`);
    const { fight, rejected } = probe().snapshot();
    const { at, stats } = playerState(region);
    page.close();

    expect({ bossHp: fight?.boss.hp, at, hp: stats.hitpoint, rejected }).toEqual({ bossHp: 1312, at: { x: 5, y: 1 }, hp: 99, rejected: [`carry=${malformed}`] });
  });

  test("guard: with ARCHIVE_FULL off, carry is an option the drill rejects, and P4 opens at its entry HP and spawn", async () => {
    const { page, region } = await loadP4(`/?seed=1&carry=${CARRIED}`);
    const { fight, rejected } = probe().snapshot();
    const { at } = playerState(region);
    page.close();

    expect({ bossHp: fight?.boss.hp, at, rejected }).toEqual({ bossHp: 1312, at: { x: 5, y: 1 }, rejected: [`carry=${CARRIED}`] });
  });

  test.each([
    ["an unknown version", CARRIED.replace(/^1_/, "2_")],
    ["a missing field", CARRIED.replace("_3_3937.200", "_3937.200")],
    ["a tile off the platform", CARRIED.replace("1_2.2_", "1_0.0_")],
    ["0 HP", CARRIED.replace("_37_12_", "_0_12_")],
    ["an unknown prayer", CARRIED.replace("protect-from-range", "protect-from-everything")],
    ["a potion in the helmet slot", CARRIED.replace(`_20997.27235.`, "_20997.6685.")],
    ["an item the trainer does not stock", CARRIED.replace("_28922.", "_4151.")],
    ["a potion without its doses", CARRIED.replace(".6685*2.", ".6685.")],
    ["doses on a weapon", CARRIED.replace("_28922.", "_28922*4.")],
    ["27 inventory slots", CARRIED.replace(".3024*4_50_", "_50_")],
    ["special energy over 100", CARRIED.replace("_50_6400_", "_101_6400_")],
    ["boss Defence above its level", CARRIED.replace("3937.200", "3937.251")],
    ["boss HP above the largest max", CARRIED.replace("3937.200", "5421.200")],
  ])("decodeCarried rejects %s", (_, link) => {
    expect(decodeCarried(link)).toBeNull();
  });

  const gear = (name: string) => ({ name, doses: null });
  const potion = (name: string, doses: number | null = 4) => ({ name, doses });
  const SWITCH_NAMES = ["Tonalztics of Ralos", "Scythe of Vitur", "Inquisitor's great helm", "Inquisitor's hauberk", "Inquisitor's plateskirt", "Ferocious gloves", "Infernal cape", "Amulet of rancour", "Ultor ring"];
  const SUPPLY_NAMES = ["Super combat potion", "Bastion Potion", "Saradomin Brew", "Super Restore", "Super combat potion", "Bastion Potion", "Saradomin Brew", "Super Restore", "Saradomin Brew", "Saradomin Brew", "Saradomin Brew", "Super Restore", "Saradomin Brew", "Saradomin Brew", "Saradomin Brew", "Super Restore", "Saradomin Brew", "Saradomin Brew", "Super Restore"];
  const TWO_BREW_DOSES_USED = [...SWITCH_NAMES.map(gear), ...SUPPLY_NAMES.map((name, index) => potion(name, index === 2 ? 2 : 4))];
  const NO_DOSES = [...SWITCH_NAMES.map(gear), ...SUPPLY_NAMES.map((name) => potion(name, null))];
  const handOver = (tile: Readonly<{ x: number; z: number }>, inventory: HandOver["player"]["inventory"] = TWO_BREW_DOSES_USED, weapon = "Twisted Bow"): HandOver => ({
    player: {
      tile,
      hp: 37,
      prayerPoints: 12,
      prayers: ["Protect from Range", "Rigour"],
      equipment: { weapon, offhand: null, helmet: "Masori mask (f)", chest: "Masori body (f)", legs: "Masori chaps (f)", gloves: "Zaryte Vambraces", cape: "Dizana's Quiver", necklace: "Necklace of rupture", feet: "Avernic treads (max)", ring: "Venator ring", ammo: "Dragon arrow" },
      inventory,
      specialEnergy: 50,
      runEnergy: 6400,
      levels: { attack: 92, strength: 92, defence: 118, range: 104, magic: 92 },
      attackDelay: 3,
    },
    boss: { hp: 3937, defence: 200 },
  });
  const carriedAt = (tile: string) => `&carry=${CARRIED.replace("1_2.2_", `1_${tile}_`)}`;

  test.each([
    ["the north-east quadrant", handOver({ x: 3, z: 3 }), carriedAt("2.2"), []],
    ["the south-east quadrant", handOver({ x: 3, z: -3 }), carriedAt("2.2"), []],
    ["the south-west quadrant", handOver({ x: -3, z: -3 }), carriedAt("2.2"), []],
    ["the north-west quadrant", handOver({ x: -3, z: 3 }), carriedAt("2.2"), []],
    ["an arm off P4's platform", handOver({ x: 0, z: -10 }), carriedAt("5.1"), []],
    ["potions without their doses", handOver({ x: 3, z: -3 }, NO_DOSES), "", ["full fight: P4 starts as the drill, because the hand-over gives Super combat potion no doses"]],
    ["a weapon the trainer does not stock", handOver({ x: 3, z: -3 }, TWO_BREW_DOSES_USED, "Abyssal whip"), "", ["full fight: P4 starts as the drill, because P4 does not stock a worn item"]],
  ])("handOverToP4 from %s reloads P4 with the seed, setup and practice, and a carry link with the tile turned onto P4's platform and each potion's doses, or no link and a logged reason when the state does not fit", (_, state, carry, logged) => {
    window.history.replaceState(null, "", "/?mode=full&phase=3&seed=77&setup=ranged&practice=1&tiles=1");
    const navigation = captureNavigation();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    handOverToP4(state, true);
    const reasons = errors.mock.calls.map(([reason]) => reason);
    errors.mockRestore();
    navigation.restore();

    expect({ navigation: navigation.assigned, reasons }).toEqual({ navigation: [`http://localhost/?seed=77&setup=ranged&invincible=on${carry}`], reasons: logged });
  });
});
