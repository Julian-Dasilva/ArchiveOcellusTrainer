import type { CacheAssets } from "osrs-sdk/asset-manifest";
import { NPC, PORTAL, SEQ, SOUND, SPOT, VOID_LOC } from "./data";

const p1Seqs = {
  idle: SEQ.p1Idle,
  walk: SEQ.p1Walk,
  volleyStart: SEQ.p1VolleyStart,
  volleyEnd: SEQ.p1VolleyEnd,
  charge: SEQ.p1Charge,
  expend: SEQ.p1Expend,
  explode: SEQ.p1Explode,
  teleportOut: SEQ.p1TeleportOut,
  teleportIn: SEQ.p1TeleportIn,
  transformation: SEQ.p1Transformation,
};

// Only animations the fight plays: each one is baked into the payload as vertex frames.
const p3Seqs = {
  idle: SEQ.p3Idle,
  walk: SEQ.p3Walk,
  meleeBasic: SEQ.p3MeleeBasic,
  meleeHybrid: SEQ.p3MeleeHybrid,
  meleeSlash: SEQ.p3MeleeSlash,
  superiorSlash: SEQ.p3SuperiorSlash,
  projectileAll: SEQ.p3ProjectileAll,
  soulFragmentStart: SEQ.p3SoulFragmentStart,
  unleashIn: SEQ.p3UnleashIn,
  unleashLoop: SEQ.p3UnleashLoop,
  unleashOut: SEQ.p3UnleashOut,
  unleashOut90: SEQ.p3UnleashOut90,
  quadrantDestroyIn: SEQ.p3QuadrantDestroyIn,
  quadrantDestroyLoop: SEQ.p3QuadrantDestroyLoop,
  deflectIn: SEQ.p3DeflectIn,
  deflectLoop: SEQ.p3DeflectLoop,
  deflectOut: SEQ.p3DeflectOut,
  prayerIn: SEQ.p3PrayerIn,
  prayerLoop: SEQ.p3PrayerLoop,
  prayerOut: SEQ.p3PrayerOut,
  death: SEQ.p3Death,
};

function spots(): Record<string, { id: number }> {
  const out: Record<string, { id: number }> = {};
  for (const [name, value] of Object.entries(SPOT)) {
    if (typeof value === "number") out[`fight_${name}`] = { id: value };
    else value.forEach((id, i) => (out[`fight_${name}_${i}`] = { id }));
  }
  return out;
}

function sounds(): Record<string, { id: number }> {
  const out: Record<string, { id: number }> = {};
  for (const [name, value] of Object.entries(SOUND)) {
    if (typeof value === "number") out[`fight_${name}`] = { id: value };
    else value.forEach((id, i) => (out[`fight_${name}_${i}`] = { id }));
  }
  return out;
}

/** Everything the full fight renders or plays, extracted from the cache at build time. */
export const FIGHT_ASSETS = {
  npcs: {
    fightOcellusP1: { id: NPC.p1, animations: p1Seqs },
    fightOcellusP2: { id: NPC.p2, animations: { idle: SEQ.p2Idle, transformation: SEQ.p2Transformation, toP3Part1: SEQ.p2ToP3Part1, toP3Part2: SEQ.p2ToP3Part2 } },
    fightOcellusP3: { id: NPC.p3, animations: p3Seqs },
    fightVoidRift: { id: NPC.riftBasic, animations: { idle: SEQ.riftBasicIdle, spawn: SEQ.riftBasicSpawn, despawn: SEQ.riftBasicDespawn, detonate: SEQ.riftBasicDetonate } },
    fightHealingRift: { id: NPC.riftHeal, animations: { idle: SEQ.riftHealIdle, spawn: SEQ.riftHealSpawn, despawn: SEQ.riftHealDespawn, detonate: SEQ.riftHealDetonate } },
    fightVoidAugmenter: { id: NPC.riftBuff, animations: { idle: SEQ.riftBuffIdle, spawn: SEQ.riftBuffSpawn, despawn: SEQ.riftBuffDespawn, detonate: SEQ.riftBuffDetonate } },
    fightVoidVine: { id: NPC.vine, animations: {} },
  },
  spotAnims: spots(),
  playerAnimations: { fightHumanYamaShortJump: { id: SEQ.humanYamaShortJump } },
  sounds: sounds(),
} satisfies CacheAssets;

function voidLocModels(): Record<string, { id: number; animations: { idle: number } }> {
  const out: Record<string, { id: number; animations: { idle: number } }> = {};
  for (const [kind, loc] of Object.entries(VOID_LOC)) loc.models.forEach((id, i) => (out[`fightVoid_${kind}_${i}`] = { id, animations: { idle: loc.idle } }));
  return out;
}

/** Scenery is not NPCs, so the portals and the void hazards come in as bare cache models with their looping idle. */
export const FIGHT_MODELS = {
  fightPortalInactive: { id: PORTAL.inactiveModel, animations: { idle: PORTAL.idle } },
  fightPortalActive: { id: PORTAL.activeModel, animations: { idle: PORTAL.idle } },
  ...voidLocModels(),
};
