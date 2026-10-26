import { between, pixels, same } from "../lib.mjs";

export const captures = () => ["attack-click.json", "ring-click.json", "flood-ring.png", "void-shot.json", "void-shot-console.log", "void-shot-page-errors.json"];

export function judge({ read, bytes, env }) {
  const { EDGE_STOP_TILE: edgeStop, NEAR_SQUARE: square, FLOOD_DAMAGE_TICK: floodDamage, FLOOD_LAST_TICK: floodLast, VOID_PIXEL: voidPixel } = env;
  const { pixelShare } = pixels(bytes);
  const shot = read("void-shot.json");
  const [edgeStopTile, nearSquare] = [edgeStop, square].map((tile) => JSON.parse(tile));
  const inSquare = (t) => t.x >= nearSquare.minX && t.x <= nearSquare.maxX && t.y >= nearSquare.minY && t.y <= nearSquare.maxY;
  const want = [1, 3, 5].map((i) => parseInt(voidPixel.slice(i, i + 2), 16));
  const voidShare = (file) => pixelShare(file, (...rgb) => want.every((v, c) => Math.abs(rgb[c] - v) <= 10));
  const flood = between(shot.rows, floodDamage, floodLast);
  const floorHit = (row) => row.events.some((e) => e.kind === "floor-hit" && same(e.tile, row.playerAtBossStep.tile));
  const launch = flood.find((row) => row.combatDraws > 0);
  const landing = flood.flatMap((row) => row.events.filter((e) => e.kind === "player-hit-judged" && e.style === "ranged").map((e) => ({ ...e, bossHp: row.bossHp })))[0];
  const observed = {
    floodShot: {
      launch: launch && { at: launch.tick, startedOn: launch.playerAtBossStep.tile, firedFrom: launch.playerAtPostTick.tile, floorHitOnStart: floorHit(launch) },
      landing: landing && { at: landing.at, style: landing.style, outcome: landing.outcome, damage: landing.requested, bossHp: [landing.bossHp.atBossStep, landing.bossHp.atPostTick] },
      walk: flood.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => [row.tick, i.destination])),
    },
    floodRows: flood.map((row) => [row.tick, row.playerAtBossStep.tile, floorHit(row)]),
    voidPixelShare: { "flood-ring.png": voidShare("flood-ring.png") },
  };
  const checks = {
    rangedShotFromTheFlood: launch !== undefined && !inSquare(edgeStopTile) && same(launch.playerAtBossStep.tile, edgeStopTile) && same(launch.playerAtPostTick.tile, edgeStopTile) && floorHit(launch),
    rangedShotLanded: launch !== undefined && landing !== undefined && landing.at > launch.tick && landing.outcome === "passed" && landing.requested > 0 &&
      landing.bossHp.atBossStep - landing.bossHp.atPostTick === landing.requested,
    ringSparedInFlood: flood.length === Number(floodLast) - Number(floodDamage) + 1 && flood.every((row) => floorHit(row) === !inSquare(row.playerAtBossStep.tile)) &&
      flood.some(floorHit) && inSquare(flood[flood.length - 1].playerAtBossStep.tile),
  };
  return { observed, checks };
}
