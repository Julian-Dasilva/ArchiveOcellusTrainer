import type { CatalogLoadout } from "osrs-sdk";
import { OCELLUS_LOADOUTS, startingLoadout } from "../js/OcellusLoadout";
import { START_WEAPONS } from "../js/OcellusTimings";

const heldItems = ({ equipment, inventory }: CatalogLoadout): number[] =>
  [...Object.values(equipment), ...inventory].flatMap((item) => (item ? [item.id] : [])).sort((a, b) => a - b);

describe("Ocellus loadouts", () => {
  test("define one raid preset, and each start weapon starts from it unedited with the same items, only swapped", () => {
    const starts = START_WEAPONS.map((start) => {
      const { preset, edited, loadout } = startingLoadout(start);
      return { start, preset, edited, weapon: loadout.equipment.weapon?.id ?? null, items: heldItems(loadout) };
    });
    const raid = heldItems(startingLoadout("twistedBow").loadout);

    expect({ presets: OCELLUS_LOADOUTS.presets.map(({ id }) => id), default: OCELLUS_LOADOUTS.defaultPreset }).toEqual({ presets: ["raid"], default: "raid" });
    expect(starts.map(({ items, ...start }) => ({ ...start, sameItems: items.join() === raid.join() }))).toEqual([
      { start: "twistedBow", preset: "raid", edited: false, weapon: 20997, sameItems: true },
      { start: "blowpipe", preset: "raid", edited: false, weapon: 12926, sameItems: true },
      { start: "melee", preset: "raid", edited: false, weapon: 22325, sameItems: true },
    ]);
    expect(raid.length).toBe(38);
  });
});
