import { sameJson } from "../lib.mjs";

export const captures = () => [
  "loadout-before.json", "loadout-ranged.png", "icons.json", "equipment-ranged.png", "loadout-after.json", "loadout-melee.png", "loadout-spec.json", "loadout-spec-log.json",
  "loadout-spec.png", "equipment-melee.png", "loadout-console.log", "loadout-page-errors.json", "loadout-selector.json", "loadout-selector-page-errors.json",
  "loadout-start-options.json", "loadout-start-options-page-errors.json", "loadout-tier.json", "loadout-tier-panel.json", "loadout-tier-page-errors.json",
  "loadout-editor-draft.json", "loadout-editor-applied.json", "loadout-editor-page-errors.json",
];

export function judge({ read, env }) {
  const { LOADOUT_RANGED_WORN: rangedWorn, LOADOUT_MELEE_WORN: meleeWorn, LOADOUT_DIVISION_DRAIN: drain, EXPLOSION_DAMAGE_REDUCTION_PERCENT: explosionReduction,
    LOADOUT_TRAINER_ICONS: trainerIcons, START_DEFAULT_WEAPON: defaultWeapon, START_DRAINED_DEFENCE: drainedDefence, TIER_LOW_WORN: lowWorn,
    EDITOR_SHOP_ITEM: shopItem, EDITOR_SHOP_ITEM_ID: shopItemId } = env;
  const [dressed, switched, spec, selector, start] = ["loadout-before.json", "loadout-after.json", "loadout-spec.json", "loadout-selector.json", "loadout-start-options.json"].map(read);
  const icons = read("icons.json");
  const [tier, tierPanel] = ["loadout-tier.json", "loadout-tier-panel.json"].map(read);
  const [draft, applied] = ["loadout-editor-draft.json", "loadout-editor-applied.json"].map(read);
  const observed = {
    loadout: {
      worn: [dressed.player.equipped, switched.player.equipped, selector.player.equipped, start.player.equipped],
      startDefence: start.boss.defence,
      lowTier: { worn: tier.player.equipped, panel: tierPanel },
      editor: { draft, applied },
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
    startWeaponSelectorApplied: sameJson(selector.player.equipped, meleeWorn) && selector.player.inventory.includes(JSON.parse(rangedWorn).weapon),
    twistedBowStartsByDefault: start.player.equipped.weapon === Number(defaultWeapon) && start.player.inventory.includes(JSON.parse(rangedWorn).weapon),
    drainedStartsAtDefenceFloor: start.boss.defence === Number(drainedDefence),
    tierLinkDressesTheTier: sameJson(tier.player.equipped, lowWorn) && sameJson(tierPanel.starts, '["blowpipe"]') && tierPanel.tier === "low" && /^Not simulated yet, so left out: Emberlight, /.test(tierPanel.leftOut ?? ""),
    editorEditStartsTheRestartedRun:
      draft.paused && draft.preset === "Max (edited)" && draft.shop.some((entry) => entry.startsWith(shopItem)) &&
      applied.preset === "max" && applied.edited === true && applied.inventory[0] === Number(shopItemId),
    trainerItemsShowCacheIcons: Object.entries(JSON.parse(trainerIcons)).every(([id, size]) => icons[id]?.path === `/osrs-assets/item-icons/${id}.png` && icons[id].size === size),
  };
  return { observed, checks };
}
