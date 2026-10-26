import { same } from "./lib.mjs";

const readsInFull = (text) => text.action !== null && text.name !== null && text.action[1] < text.name[0] && text.name[1] <= text.width - 5;

const tileClickUnits = ["walkway", "control_walk", "back_wall", "corner", "boss_pathing", "floor_holes"];

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
};
