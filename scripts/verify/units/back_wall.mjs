import { sameJson, tilesUntilStop, walkOrders, walkPaces } from "../lib.mjs";

export const captures = () => ["tile-clicks.jsonl", "back-wall-log.json", "back-wall-top-down.png", "back-wall-flood.png", "back-wall-console.log", "back-wall-page-errors.json"];

export function judge({ read, env }) {
  const { BACK_WALL_START_TILE: backWallStart, BACK_WALL_END_TILE: backWallEnd, BACK_WALL_TOWARD_TILES: backWallToward, BACK_WALL_BACK_TILES: backWallBack } = env;
  const backWallLog = read("back-wall-log.json");
  const observed = {
    backWall: {
      orders: walkOrders(backWallLog),
      paces: walkPaces(backWallLog),
      toward: tilesUntilStop(backWallLog, JSON.parse(backWallEnd), 1),
      back: tilesUntilStop(backWallLog, JSON.parse(backWallStart), 2),
    },
  };
  const checks = {
    backWallWalksDiagonally: sameJson(observed.backWall.orders, `[${backWallStart},${backWallEnd},${backWallStart}]`) &&
      sameJson(observed.backWall.paces, JSON.stringify(["run-setting", "walk", "walk"])) && sameJson(observed.backWall.toward, backWallToward) && sameJson(observed.backWall.back, backWallBack),
  };
  return { observed, checks };
}
