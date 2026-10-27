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

type Actor = "boss" | "player";

type WarmPlacement = Readonly<{ actor: Actor; id: number; channel: string }>;

/**
 * Not a pose this actor plays. The unset pose is -1, so -1 would show the mesh until the first real pose.
 */
const HIDDEN_POSE = 1_000_000_000;

const PHASE1_ACTOR_GRAPHICS = [
  ["boss", SPOT.waterOnBoss],
  ["boss", SPOT.fireOnBoss],
  ["player", SPOT.waterImpact],
  ["player", SPOT.fireImpact],
  ["boss", SPOT.p1Charge],
  ["boss", SPOT.p1ExplodeOnBoss],
  ["boss", SPOT.p1TeleportOut],
  ["boss", SPOT.p1TeleportIn],
  ["boss", SPOT.p1ToP2],
] as const;

type SpotHost = Readonly<{
  addSpotAnim: (spot: { id: number; channel?: string; animation?: number }) => void;
  clearSpotAnim: (channel: string) => void;
}>;

/** One channel per graphic id. A shared channel would drop the first graphic before its mesh exists. */
export function warmPlacements(entries: readonly (readonly [Actor, number])[]): readonly WarmPlacement[] {
  const placements = entries.map(([actor, id]) => ({ actor, id, channel: `p1-warm-${id}` }));
  if (new Set(placements.map((spot) => spot.channel)).size !== placements.length) {
    throw new Error("phase 1 warm graphics share a channel");
  }
  return placements;
}

const PHASE1_WARM = warmPlacements(PHASE1_ACTOR_GRAPHICS);

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
 * Call before the boss and player models are created. Their load builds a mesh for each attached graphic, so the
 * first real attach finds the mesh and does not convert its colours mid-tick.
 */
export function warmPhase1Actors(actors: Readonly<Record<Actor, SpotHost>>): void {
  for (const spot of PHASE1_WARM) actors[spot.actor].addSpotAnim({ id: spot.id, channel: spot.channel, animation: HIDDEN_POSE });
}

/**
 * Call once those models finish preload. The renderer shows the first placement of a graphic id, so a warm
 * placement left attached hides the fight's own later placement of that id. The built mesh stays.
 */
export function releasePhase1Actors(actors: Readonly<Record<Actor, SpotHost>>): void {
  for (const spot of PHASE1_WARM) actors[spot.actor].clearSpotAnim(spot.channel);
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
