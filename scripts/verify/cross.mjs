import { same } from "./lib.mjs";

const readsInFull = (text) => text.action !== null && text.name !== null && text.action[1] < text.name[0] && text.name[1] <= text.width - 5;

const tileClickUnits = ["walkway", "control_walk", "back_wall", "corner", "boss_pathing", "floor_holes"];

const pageErrors = {
  p4_cycle: ["page-errors.json"],
  focus: ["focus-page-errors.json"],
  void_floor: ["void-page-errors.json"],
  void_shot: ["void-shot-page-errors.json"],
  lifeforce_orb: ["orb-page-errors.json", "orb-skip-page-errors.json"],
  explosions: ["explosion-page-errors.json", "explosion-under-page-errors.json"],
  dodge_speedup: ["dodge-speedup-page-errors.json"],
  explosion_run_end: ["explosion-run-end-page-errors.json"],
  transition_attack: ["special-page-errors.json", "special-late-page-errors.json"],
  loadouts: ["loadout-page-errors.json", "loadout-selector-page-errors.json"],
  defence_floor: ["defence-floor-page-errors.json"],
  supplies: ["supplies-page-errors.json"],
  keybinds: ["keybinds-page-errors.json"],
  overheads_rifts: ["rift-page-errors.json", "rift-ralos-page-errors.json", "rift-melee-page-errors.json", "deflect-page-errors.json", "reflect-page-errors.json"],
  seed: ["seed-page-errors.json"],
  floor_holes: ["holes-page-errors.json"],
  orb_off_holes: ["orb-off-holes-page-errors.json"],
  orb_late_and_entry: ["orb-late-page-errors.json", "orb-entry-page-errors.json"],
  walkway: ["walkway-page-errors.json", "walkway-run-end-page-errors.json"],
  control_walk: ["control-walk-page-errors.json"],
  click_correction: ["click-correction-page-errors.json"],
  back_wall: ["back-wall-page-errors.json"],
  corner: ["corner-page-errors.json", "corner-view-page-errors.json"],
  boss_pathing: ["pathing-page-errors.json", "pathing-reroute-page-errors.json", "pathing-control-page-errors.json", "pathing-out-page-errors.json"],
  invincible: ["invincible-page-errors.json", "invincible-orb-page-errors.json"],
  cues: ["cue-fresh-page-errors.json", "cue-toggle-page-errors.json", "cue-page-errors.json"],
};

export const crossChecks = {
  floodDrawn: {
    units: ["void_floor", "void_shot"],
    judge: ({ observed: { voidPixelShare: share } }) => share["void-flood.png"] > 3 && share["flood-ring.png"] > 3,
  },
  hoverTextOnCanvas: {
    units: ["supplies", "keybinds"],
    judge: ({ observed }) => readsInFull(observed.hoverText["brew-heal.png"]) &&
      (readsInFull(observed.hoverText["keybinds.png"]) || (observed.hoverText["keybinds.png"].action === null && observed.hoverText["keybinds.png"].name === null)),
  },
  projectedClicksOrderTheirTiles: {
    units: tileClickUnits,
    judge: ({ text, env }) => {
      const tileClicks = tileClickUnits.flatMap((unit) => text(unit, "tile-clicks.jsonl").split("\n").filter(Boolean).map((line) => JSON.parse(line)));
      return tileClicks.length === Number(env.PROJECTED_TILE_CLICKS) && tileClicks.every(({ tile, ordered }) => same(ordered, tile));
    },
  },
  noPageErrors: {
    units: Object.keys(pageErrors),
    judge: ({ read }) => Object.entries(pageErrors).flatMap(([unit, files]) => files.map((file) => read(unit, file))).every((list) => list.length === 0),
  },
};
