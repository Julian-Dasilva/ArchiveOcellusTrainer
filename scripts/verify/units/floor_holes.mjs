import { pixels, same, sameJson } from "../lib.mjs";

export const captures = () => [
  "holes-drawn.png", "holes-pixels.json", "holes-flood.png", "hole-click.json", "hole-hit.png", "holes.json", "holes-console.log", "holes-page-errors.json", "tile-clicks.jsonl", "canvas-centre.json",
];

export function judge({ read, bytes, env }) {
  const { HOLE_LAYOUT: holeLayout, HOLE_BOX_HALF_PX: holeBoxHalf, HOLE_MIN_DARK_SHARE: holeMinDark,
    HOLE_MAX_DARK_SHARE: holeMaxDark, HOLE_TILE: holeTile, HOLE_HITS: holeHits, HOLE_DAMAGE: holeDamage } = env;
  const { holes: holePixels, free: freePixels } = read("holes-pixels.json");
  const { pixelShare } = pixels(bytes);
  const holesLog = read("holes.json");
  const holeTiles = JSON.parse(holeLayout).tiles;
  const onHole = (tile) => holeTiles.some((hole) => same(tile, hole));
  const darkAround = (file, { x, y }) => {
    const half = Number(holeBoxHalf);
    return pixelShare(file, (r, g, b) => Math.max(r, g, b) <= 30, { minX: x - half, maxX: x + half, minY: y - half, maxY: y + half });
  };
  const observed = {
    holes: {
      layout: { key: holesLog.header.choices.floorHoleLayout.key, tiles: holesLog.header.choices.floorHoleLayout.option.value.tiles },
      darkShare: holePixels.map((box) => ({ tile: box.tile, drawn: darkAround("holes-drawn.png", box), flood: darkAround("holes-flood.png", box) })),
      freeDarkShare: freePixels.map((box) => ({ tile: box.tile, drawn: darkAround("holes-drawn.png", box) })),
      rows: holesLog.rows.map((row) => ({
        tick: row.tick,
        stage: row.phase.stage,
        startedOn: row.playerAtBossStep.tile,
        hits: row.events.filter((e) => e.kind === "hole-hit").map((e) => ({ at: e.at, tile: e.tile, requested: e.receipt.requested })),
      })),
    },
  };
  const checks = {
    holesDrawnOnLayout: sameJson(observed.holes.layout, holeLayout) && observed.holes.darkShare.every((box) => onHole(box.tile) && box.drawn >= Number(holeMinDark)) &&
      observed.holes.freeDarkShare.every((box) => !onHole(box.tile) && box.drawn <= Number(holeMaxDark)),
    holesHiddenUnderFlood: observed.holes.darkShare.every((box) => box.flood <= Number(holeMaxDark)),
    holeHitsStandingOnIt: (() => {
      const { rows } = observed.holes, hits = rows.flatMap((row) => row.hits), damage = JSON.parse(holeDamage);
      return rows.every((row) => row.hits.length === (onHole(row.startedOn) ? 1 : 0) && row.hits.every((hit) => hit.at === row.tick)) && rows.some((row) => !onHole(row.startedOn)) &&
        hits.length >= Number(holeHits) && hits.every((hit) => same(hit.tile, JSON.parse(holeTile)) && hit.requested >= damage.min && hit.requested <= damage.max);
    })(),
  };
  return { observed, checks };
}
