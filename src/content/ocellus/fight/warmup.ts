import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, SoundCache, cacheSound } from "osrs-sdk";
import type { Renderable } from "osrs-sdk";
import type { StartPhase } from "../full/options";
import { START_PHASES } from "../full/options";
import { SOUND, SPOT } from "../full/data/looks";

/**
 * The floor effects (`fight.spot`) each phase draws. A floor effect builds its animation frames the first time it is
 * used, which mid-fight cost a visible stall (phase 3's first bombs and shadow slash), so they are built ahead.
 */
const FLOOR_SPOTS: Readonly<Record<StartPhase, readonly number[]>> = {
  1: [
    ...SPOT.crackStraightStart, ...SPOT.crackStraight, ...SPOT.crackStraightEnd,
    ...SPOT.crackDiagonalStart, ...SPOT.crackDiagonal, ...SPOT.crackDiagonalEnd,
    ...SPOT.p1ExplodeFloor,
  ],
  2: [SPOT.swordDrop, SPOT.swordDropExplosion, SPOT.swordRepair, SPOT.p2Pool, SPOT.safePortalSpawn, SPOT.safePortalIdle, SPOT.safePortalDespawn],
  3: [
    ...SPOT.collapsingExplosion, SPOT.bombIdle, SPOT.bombDrop, SPOT.bombImpact, SPOT.shadowSlash,
    SPOT.fallingDebris, SPOT.superiorSlash, SPOT.p2Pool, ...SPOT.unleashArena,
  ],
};

type Job = () => Promise<unknown>;

/** Run jobs one at a time in the browser's idle time, so warming never takes a frame the fight needs. */
function whenIdle(jobs: Job[]): void {
  const idle = (run: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 1500 }) : window.setTimeout(run, 30);
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    idle(() => {
      job().catch(() => undefined).finally(next);
    });
  };
  next();
}

const scratch = new THREE.Scene();

function floorSpot(anchor: Renderable, id: number): Job {
  return () => {
    const warm = CacheRenderInstancedModel.forRenderable(anchor, CacheRenderReferences.spotAnim([{ id, delay: 0, rotation: 0, height: 0 }]));
    return warm.preload().finally(() => warm.destroy(scratch));
  };
}

/** The start phase's floor effects, built behind the loading splash so its first attacks don't stall. */
export function warmStartPhase(anchor: Renderable, start: StartPhase): Promise<unknown> {
  return Promise.all(FLOOR_SPOTS[start].map((id) => floorSpot(anchor, id)().catch(() => undefined)));
}

/**
 * Once the fight is up: the later phases' floor effects in idle time, during the phases before them, then the
 * sounds (a cold sound only synthesizes on its first play). Anything still cold builds on first use, as before.
 */
export function warmLaterPhases(anchor: Renderable, start: StartPhase): void {
  const later = START_PHASES.filter((phase) => phase > start);
  const done = new Set(FLOOR_SPOTS[start]);
  const spots = [...new Set(later.flatMap((phase) => FLOOR_SPOTS[phase]))].filter((id) => !done.has(id));
  const sounds: Job[] = [...new Set(Object.values(SOUND).flat())].map((id) => () => SoundCache.preload(cacheSound(id)));
  whenIdle([...spots.map((id) => floorSpot(anchor, id)), ...sounds]);
}
