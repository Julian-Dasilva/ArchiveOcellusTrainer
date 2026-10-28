import { fromCentreOf, isSpotAnimGlow, isSpotAnimShard, kindOf, pixels, rowAt, same, sameJson } from "../lib.mjs";

export const captures = () => [
  "explosion-before.png", "explosion-left.png", "explosion-after.png", "explosion-standing.png", "explosions.json", "explosion-audio.json", "explosion-console.log",
  "explosion-page-errors.json", "explosion-under.png", "explosions-under.json", "explosion-under-console.log", "explosion-under-page-errors.json", "canvas-centre.json",
];

export function judge({ read, bytes, env }) {
  const { SPAWN_TILE: spawn, EXPLOSION_INNER_MARKS, EXPLOSION_OUTER_MARKS, EXPLOSION_EXPECTED: explosionExpected, SOUND_SAMPLES: soundSamples,
    EXPLOSION_SOUNDS: explosionSounds, EXPLOSION_GLOW_BOX: explosionGlowBox, EXPLOSION_GLOW_MIN_SHARE: explosionGlowMinShare,
    EXPLOSION_GLOW_MAX_SHARE: explosionGlowMaxShare, EXPLOSION_OVERHEAD_BOX: explosionOverheadBox, EXPLOSION_OVERHEAD_MIN_SHARE: explosionOverheadMinShare } = env;
  const innerMarks = `[${EXPLOSION_INNER_MARKS.replaceAll(" ", ",")}]`;
  const lateMark = EXPLOSION_OUTER_MARKS.split(" ")[0];
  const { x: centreX, y: centreY } = read("canvas-centre.json");
  const { spot } = pixels(bytes);
  const fromCentre = fromCentreOf(centreX, centreY);
  const [explosionLog, explosionAudio, underLog] = ["explosions.json", "explosion-audio.json", "explosions-under.json"].map(read);
  const spawnTile = JSON.parse(spawn);
  const expectedExplosions = JSON.parse(explosionExpected);
  const stepped = (rows, t) => rowAt(rows, t)?.inputs.some((input) => input.kind === "walk-ordered") ?? false;
  const markedAt = (rows, t) => kindOf(rows, "explosion-marked").find((e) => e.at === t);
  const resolvedAt = (rows, t) => kindOf(rows, "explosion-resolved").find((e) => e.at === t);
  const late = Number(lateMark);
  const soundBySamples = Object.fromEntries(Object.entries(JSON.parse(soundSamples)).map(([id, samples]) => [samples, Number(id)]));
  const glow = (file, box = explosionGlowBox, isLit = isSpotAnimGlow) => spot(file, isLit, fromCentre(box));
  const overhead = (file) => spot(file, isSpotAnimShard, fromCentre(explosionOverheadBox));
  const observed = {
    explosions: {
      dodges: JSON.parse(innerMarks).map((t) => ({ mark: t, stepped: stepped(explosionLog.rows, t), tile: markedAt(explosionLog.rows, t)?.tile ?? null, outcome: resolvedAt(explosionLog.rows, t + 1)?.outcome.kind ?? null })),
      late: {
        standing: rowAt(explosionLog.rows, late)?.playerAtBossStep.tile ?? null,
        marked: markedAt(explosionLog.rows, late)?.tile ?? null,
        steppedOnMark: stepped(explosionLog.rows, late),
        steppedOnImpact: stepped(explosionLog.rows, late + 1),
        resolved: resolvedAt(explosionLog.rows, late + 1) ?? null,
        endTile: rowAt(explosionLog.rows, late + 1)?.playerAtPostTick.tile ?? null,
      },
      under: kindOf(underLog.rows, "explosion-resolved").map((e) => [e.at, e.tile, e.underBoss, e.outcome.kind, e.outcome.receipt?.afterHp ?? null]),
      overhead: Object.fromEntries(["explosion-before.png", "explosion-standing.png", "explosion-after.png"].map((file) => [file, overhead(file)])),
      glow: { "explosion-left.png": glow("explosion-left.png"), "explosion-under.png": glow("explosion-under.png") },
      sounds: {
        heard: explosionAudio.filter((s) => s.rate === 22050 && soundBySamples[s.samples] !== undefined).map((s) => [s.tick, soundBySamples[s.samples]]),
        contexts: [...new Set(explosionAudio.map((s) => s.state))],
        starts: explosionAudio.length,
      },
    },
  };
  const { dodges, late: lateStep, under, overhead: overheadSpots, sounds } = observed.explosions;
  const [leftGlow, standing] = [observed.explosions.glow["explosion-left.png"], overheadSpots["explosion-standing.png"]];
  const checks = {
    explosionsDodgedOnMarkTicks: dodges.every((d) => d.stepped && d.outcome === "avoided") && same(dodges[0].tile, spawnTile),
    lateStepHitOnMarkedTile: lateStep.standing !== null && lateStep.resolved?.outcome.kind === "hit" && sameJson(lateStep.resolved.outcome.receipt, JSON.stringify(expectedExplosions.lateHit)) &&
      same(lateStep.marked, lateStep.standing) && same(lateStep.resolved.tile, lateStep.standing) && !lateStep.steppedOnMark && lateStep.steppedOnImpact && !same(lateStep.endTile, lateStep.standing),
    campingUnderBossHit: sameJson(under, JSON.stringify(expectedExplosions.under)),
    explosionSoundsOnSchedule: sameJson(sounds.heard, explosionSounds) && sameJson(sounds.contexts, JSON.stringify(["running"])),
    markGlowsBrightPurple: Object.values(observed.explosions.glow).every((g) => g.share >= Number(explosionGlowMinShare)),
    // The dodge's mark stays on the tile it captured, off the centre the camera follows; the mark on the tile under the boss, where the player stays, is centred.
    markerStaysOnCapturedTile: leftGlow.dx !== null && Math.abs(leftGlow.dx) >= 0.01 && observed.explosions.glow["explosion-under.png"].dx !== null &&
      Math.abs(observed.explosions.glow["explosion-under.png"].dx) <= 0.016 && standing.share >= Number(explosionOverheadMinShare),
    shardsOverTheHeadOnlyOnMarkTicks: standing.share >= Number(explosionOverheadMinShare) &&
      ["explosion-before.png", "explosion-after.png"].every((file) => overheadSpots[file].share <= Number(explosionGlowMaxShare)),
  };
  return { observed, checks };
}
