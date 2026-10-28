import { sameJson } from "../lib.mjs";

export const captures = () => [
  "loadout-before.json", "loadout-ranged.png", "icons.json", "equipment-ranged.png", "loadout-after.json", "loadout-melee.png", "loadout-spec.json", "loadout-spec-log.json",
  "loadout-spec.png", "equipment-melee.png", "loadout-console.log", "loadout-page-errors.json", "loadout-selector.json", "loadout-selector-page-errors.json",
];

export function judge({ read, env }) {
  const { LOADOUT_RANGED_WORN: rangedWorn, LOADOUT_MELEE_WORN: meleeWorn, LOADOUT_DIVISION_DRAIN: drain, EXPLOSION_DAMAGE_REDUCTION_PERCENT: explosionReduction,
    LOADOUT_TRAINER_ICONS: trainerIcons } = env;
  const [dressed, switched, spec, selector] = ["loadout-before.json", "loadout-after.json", "loadout-spec.json", "loadout-selector.json"].map(read);
  const icons = read("icons.json");
  const observed = {
    loadout: {
      worn: [dressed.player.equipped, switched.player.equipped, selector.player.equipped],
      specialEnergy: [switched.player.specialEnergy, spec.player.specialEnergy],
      bossDefence: [switched.boss.defence, spec.boss.defence],
    },
    icons: Object.fromEntries(Object.keys(JSON.parse(trainerIcons)).map((id) => [id, icons[id] ?? null])),
  };
  const checks = {
    rangedSetupWorn: sameJson(dressed.player.equipped, rangedWorn),
    switchesWornByClick: sameJson(switched.player.equipped, meleeWorn),
    divisionSpentHalfTheBar: switched.player.specialEnergy === 100 && spec.player.specialEnergy === 50,
    divisionDrainedBossDefence: (() => {
      const kept = (e) => (e.outcome === "passed" ? e.requested : e.outcome === "reduced" ? Math.floor((e.requested * (100 - Number(explosionReduction))) / 100) : 0);
      const glaives = read("loadout-spec-log.json").rows.flatMap((row) => row.events.filter((e) => e.kind === "player-hit-judged")).slice(0, 2);
      return glaives.length === 2 && switched.boss.defence - spec.boss.defence === Number(drain) * glaives.filter((e) => kept(e) > 0).length;
    })(),
    // The full fight wields the blowpipe in every setup and carries the setup's own weapon.
    setupSelectorApplied: (() => {
      const melee = JSON.parse(meleeWorn);
      return sameJson(selector.player.equipped, JSON.stringify({ ...melee, weapon: JSON.parse(rangedWorn).weapon })) && selector.player.inventory.includes(melee.weapon);
    })(),
    trainerItemsShowCacheIcons: Object.entries(JSON.parse(trainerIcons)).every(([id, size]) => icons[id]?.path === `/osrs-assets/item-icons/${id}.png` && icons[id].size === size),
  };
  return { observed, checks };
}
