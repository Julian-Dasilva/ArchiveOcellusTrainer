import { kindOf, pixels, sameJson } from "../lib.mjs";

export const captures = () => ["void-inner.png", "void-flood.png", "void-floor.json", "void-console.log", "void-page-errors.json"];

export function judge({ read, bytes, env }) {
  const { SPAWN_TILE: spawn, VOID_FLOOR_HITS: voidHits, VOID_RUN_END: voidEnd, VOID_PIXEL: voidPixel } = env;
  const { pixelShare } = pixels(bytes);
  const voidLog = read("void-floor.json");
  const spawnTile = JSON.parse(spawn);
  const want = [1, 3, 5].map((i) => parseInt(voidPixel.slice(i, i + 2), 16));
  const voidShare = (file) => pixelShare(file, (...rgb) => want.every((v, c) => Math.abs(rgb[c] - v) <= 10));
  const observed = {
    voidHits: voidLog.rows.flatMap((row) => row.events.filter((e) => e.kind === "floor-hit").map((e) => [e.at, e.receipt.applied])),
    voidHitTiles: [...new Set(voidLog.rows.flatMap((row) => row.events.filter((e) => e.kind === "floor-hit").map((e) => JSON.stringify(e.tile))))],
    voidRunEnd: voidLog.rows.flatMap((row) => row.events.filter((e) => e.kind === "run-ended").map((e) => [e.at, e.reason])),
    voidPixelShare: { "void-inner.png": voidShare("void-inner.png"), "void-flood.png": voidShare("void-flood.png") },
    invincible: { preventedWithoutTheParameter: kindOf(voidLog.rows, "death-prevented").map((e) => [e.at, e.source]) },
  };
  const share = observed.voidPixelShare;
  const { invincible } = observed;
  const checks = {
    floodHitsStandingStill: sameJson(observed.voidHits, voidHits) && sameJson(observed.voidHitTiles, JSON.stringify([JSON.stringify(spawnTile)])) && sameJson(observed.voidRunEnd, voidEnd),
    innerVoidDrawn: share["void-inner.png"] > 0.6 && share["void-inner.png"] < 3,
    mortalWithoutTheParameter: invincible.preventedWithoutTheParameter.length === 0 && sameJson(observed.voidRunEnd, voidEnd),
  };
  return { observed, checks };
}
