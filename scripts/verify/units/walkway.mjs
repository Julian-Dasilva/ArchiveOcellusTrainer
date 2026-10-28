import { same, sameJson, tilesUntilStop, walkOrders, walkPaces } from "../lib.mjs";

export const captures = () => [
  "tile-clicks.jsonl", "walkway-click.json", "walkway-arrived.json", "walkway.json", "walkway-log.json", "walkway.png", "walkway-console.log", "walkway-page-errors.json",
  "walkway-run-end.json", "walkway-run-end-log.json", "walkway-run-end.png", "walkway-run-end-page-errors.json",
];

export function judge({ read, env }) {
  const { WALKWAY_ORDER_TILE: walkwayOrder, WALKWAY_STOP_TILE: walkwayStop,
    WALKWAY_RUN_END_TILE: walkwayRunEnd, WALKWAY_RUN_TILES: walkwayRunTiles, EDGE_HOLD_TICKS: holdTicks } = env;
  const [walkwayArrived, walkwayHeld, walkwayLog, walkwayRunEndHeld, walkwayRunEndLog] =
    ["walkway-arrived.json", "walkway.json", "walkway-log.json", "walkway-run-end.json", "walkway-run-end-log.json"].map(read);
  const observed = {
    walkway: {
      orders: walkOrders(walkwayLog),
      arrived: [walkwayArrived.tick, walkwayArrived.player],
      held: [walkwayHeld.tick, walkwayHeld.player],
      runEnd: { orders: walkOrders(walkwayRunEndLog), held: [walkwayRunEndHeld.tick, walkwayRunEndHeld.player] },
      paces: walkPaces(walkwayLog),
      tiles: tilesUntilStop(walkwayLog, JSON.parse(walkwayStop)),
    },
  };
  const checks = {
    walkwayClickStaysOnFloor: sameJson(observed.walkway.orders, `[${walkwayOrder}]`) && same(walkwayArrived.player, JSON.parse(walkwayStop)) && same(walkwayHeld.player, JSON.parse(walkwayStop)) &&
      walkwayHeld.tick - walkwayArrived.tick >= Number(holdTicks),
    eastEdgeRunsStraight: sameJson(observed.walkway.runEnd.orders, `[${walkwayRunEnd}]`) && same(walkwayRunEndHeld.player, JSON.parse(walkwayRunEnd)),
    plainClickRunsTwoTilesATick: sameJson(observed.walkway.paces, JSON.stringify(["run-setting"])) && sameJson(observed.walkway.tiles, walkwayRunTiles),
  };
  return { observed, checks };
}
