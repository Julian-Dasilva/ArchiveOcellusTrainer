import { fromCentreOf, isGlow, isSpotAnimGlow, isSpotAnimShard, kindOf, pixels, sameJson } from "../lib.mjs";

export const captures = ({ EXPLOSION_RUN_END_FRAMES }) => [
  "explosion-run-end-marked-1.png", "explosion-run-end-marked-2.png", "explosion-run-end.json", "explosion-run-end-console.log", "explosion-run-end-page-errors.json",
  ...Array.from({ length: Number(EXPLOSION_RUN_END_FRAMES) }, (_, i) => `explosion-run-end-${i + 1}.png`), "canvas-centre.json",
];

export function judge({ read, bytes, env }) {
  const { EXPLOSION_PIXEL: explosionPixel, EXPLOSION_GLOW_BOX: explosionGlowBox, EXPLOSION_RUN_END_EXPECTED: explosionRunEndExpected,
    EXPLOSION_RUN_END_MIN_SHARE: explosionRunEndMinShare, EXPLOSION_RUN_END_MAX_SHARE: explosionRunEndMaxShare, EXPLOSION_RUN_END_FRAMES: explosionRunEndFrames } = env;
  const { x: centreX, y: centreY } = read("canvas-centre.json");
  const { spot } = pixels(bytes);
  const fromCentre = fromCentreOf(centreX, centreY);
  const runEndLog = read("explosion-run-end.json");
  const shardRgb = [1, 3, 5].map((i) => parseInt(explosionPixel.slice(i, i + 2), 16));
  const isShardColour = (...rgb) => shardRgb.every((v, c) => Math.abs(rgb[c] - v) <= 12);
  const markDrawn = (file) => spot(file, (...rgb) => isGlow(...rgb) || isShardColour(...rgb) || isSpotAnimGlow(...rgb) || isSpotAnimShard(...rgb), fromCentre(explosionGlowBox)).share;
  const observed = {
    explosions: {
      runEnd: {
        marked: kindOf(runEndLog.rows, "explosion-marked").map((e) => [e.at, e.tile]),
        ended: kindOf(runEndLog.rows, "run-ended").map((e) => [e.at, e.reason]),
        resolved: kindOf(runEndLog.rows, "explosion-resolved").map((e) => e.at),
        drawnWhileMarked: Math.max(...[1, 2].map((frame) => markDrawn(`explosion-run-end-marked-${frame}.png`))),
        drawnAfterTheEnd: Array.from({ length: Number(explosionRunEndFrames) }, (_, frame) => markDrawn(`explosion-run-end-${frame + 1}.png`)),
      },
    },
  };
  const checks = {
    markGoneWhenTheRunEnds: (({ marked, ended, resolved, drawnWhileMarked, drawnAfterTheEnd }) =>
      sameJson({ marked, ended, resolved }, explosionRunEndExpected) && drawnWhileMarked >= Number(explosionRunEndMinShare) && drawnAfterTheEnd.every((share) => share <= Number(explosionRunEndMaxShare)))(observed.explosions.runEnd),
  };
  return { observed, checks };
}
