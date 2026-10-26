import { sameJson, tilesUntilStop, walkOrders, walkPaces } from "../lib.mjs";

export const captures = () => [
  "tile-clicks.jsonl", "control-walk.png", "control-walk-menu.json", "control-walk-log.json", "control-walk-right-click.json", "control-walk-console.log", "control-walk-page-errors.json",
];

export function judge({ read, env }) {
  const { WALKWAY_ORDER_TILE: walkwayOrder, WALKWAY_STOP_TILE: walkwayStop, CONTROL_WALK_TILES: controlWalkTiles } = env;
  const [controlWalkMenu, controlWalkLog, controlWalkRightClick] = ["control-walk-menu.json", "control-walk-log.json", "control-walk-right-click.json"].map(read);
  const observed = {
    controlWalk: {
      orders: walkOrders(controlWalkLog),
      paces: walkPaces(controlWalkLog),
      tiles: tilesUntilStop(controlWalkLog, JSON.parse(walkwayStop)),
      ...controlWalkMenu,
      rightClickMenu: controlWalkRightClick,
    },
  };
  const checks = {
    controlClickWalksOneTileATick: sameJson(observed.controlWalk.orders, `[${walkwayOrder}]`) && sameJson(observed.controlWalk.paces, JSON.stringify(["walk"])) &&
      sameJson(observed.controlWalk.tiles, controlWalkTiles),
    controlClickOpensNoMenu: observed.controlWalk.menu === null && (!observed.controlWalk.platform.startsWith("Mac") || observed.controlWalk.contextMenus > 0),
    rightClickStillOpensMenu: Array.isArray(observed.controlWalk.rightClickMenu) && observed.controlWalk.rightClickMenu.includes("Walk Here"),
  };
  return { observed, checks };
}
