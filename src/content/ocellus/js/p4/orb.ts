import type { OuterOrbTile, ResolvedChoices } from "../OcellusTimings";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { Seed, Tick, Tile } from "../../../../sim/brands";
import { after } from "../../../../sim/brands";
import type { HitReceipt } from "../../../../sim/combat";
import type { Heal, HitRequest, Logged } from "../../../../sim/sdk/EncounterBinding";
import type { FightEvent, PlayerHit, VoidKind } from "../P4Types";
import type { TileSet } from "../../../../sim/tiles";
import { reach } from "../../../../sim/tiles";
import { FOOTPRINT, NEAR_SQUARE, PLATFORM, VOID_MASKS } from "./floor";
import { roll } from "../roll";

const { orbDistance, drainDivisor, returnAfterStep, returnAfterMaturing } = OCELLUS_P4.lifeforceOrb;
const RIM = NEAR_SQUARE.minus(FOOTPRINT);

type Orb =
  | Readonly<{ kind: "dormant"; stolen: number; owed: number; tile: Tile }>
  | Readonly<{ kind: "available"; stolen: number; owed: number; tile: Tile }>
  | Readonly<{ kind: "claimed"; stolen: number; owed: number; tile: Tile; returnsAt: Tick }>
  | Readonly<{ kind: "expired"; stolen: number; tile: Tile }>;

type Formed = Readonly<Record<VoidKind, Orb | null>>;

export type Orbs = Readonly<{ formed: Formed; entered: Tile | null }>;
export type OrbStep<O> = Readonly<{ orbs: Orbs; outputs: readonly O[] }>;
export type OrbRules = Readonly<{ seed: Seed; choices: ResolvedChoices; holes: TileSet }>;
export type BossHeal = Readonly<{ kind: "boss-heal"; amount: number }>;

export const NO_ORBS: Orbs = { formed: { "inner-void": null, "outer-void": null }, entered: null };

const straightLine = (a: Tile, b: Tile) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function enteredSquare(entered: Tile | null, player: Tile): Tile | null {
  return NEAR_SQUARE.contains(player) ? (entered ?? player) : null;
}

function placement(kind: VoidKind, choices: ResolvedChoices): OuterOrbTile {
  switch (kind) {
    case "inner-void":
      return { kind: "near-player" };
    case "outer-void":
      return choices.outerOrbTile.option.value;
    default: {
      const unhandled: never = kind;
      return unhandled;
    }
  }
}

function nearPlayer(player: Tile, kind: VoidKind, holes: TileSet): readonly Tile[] {
  const { min, max } = orbDistance.value;
  const allowed = PLATFORM.tiles().filter(
    (candidate) => !FOOTPRINT.contains(candidate) && !holes.contains(candidate) && !VOID_MASKS[kind].contains(candidate) && reach(candidate, player) >= min,
  );
  const nearest = Math.min(...allowed.map((candidate) => reach(candidate, player)));
  return allowed.filter((candidate) => reach(candidate, player) <= Math.max(max, nearest));
}

function oppositeEntry(entered: Tile, holes: TileSet): readonly Tile[] {
  const allowed = RIM.tiles().filter((candidate) => !holes.contains(candidate));
  const farthest = Math.max(...allowed.map((candidate) => straightLine(candidate, entered)));
  return allowed.filter((candidate) => straightLine(candidate, entered) === farthest);
}

function allowedTiles(rule: OuterOrbTile, player: Tile, entered: Tile, kind: VoidKind, holes: TileSet): readonly Tile[] {
  switch (rule.kind) {
    case "near-player":
      return nearPlayer(player, kind, holes);
    case "opposite-entry":
      return oppositeEntry(entered, holes);
    default: {
      const unhandled: never = rule;
      return unhandled;
    }
  }
}

function orbTile({ seed, choices, holes }: OrbRules, at: Tick, player: Tile, entered: Tile, kind: VoidKind): Tile {
  const candidates = [...allowedTiles(placement(kind, choices), player, entered, kind, holes)].sort((a, b) => a.y - b.y || a.x - b.x);
  if (candidates.length === 0) throw new RangeError(`no ${kind} orb tile is left for a player on ${player.x}, ${player.y}`);
  return candidates[Math.floor(roll(seed, "orbTile", at, 0) * candidates.length)];
}

function withOrb(orbs: Orbs, kind: VoidKind, orb: Orb | null): Orbs {
  return { ...orbs, formed: { ...orbs.formed, [kind]: orb } };
}

function eachOrb(formed: Formed, next: (orb: Orb, kind: VoidKind) => Orb | null): Formed {
  const each = (kind: VoidKind) => {
    const orb = formed[kind];
    return orb === null ? null : next(orb, kind);
  };
  return { "inner-void": each("inner-void"), "outer-void": each("outer-void") };
}

export function drain(rules: OrbRules, orbs: Orbs, kind: VoidKind, at: Tick, player: Tile): HitRequest<PlayerHit> {
  const orb = orbTile(rules, at, player, orbs.entered ?? player, kind);
  return { kind: "hit", damage: { kind: "fraction-current-hp", divisor: drainDivisor.value }, cause: { kind: "lifeforce-drained", at, void: kind, orb } };
}

export function formOrb(orbs: Orbs, drained: Extract<PlayerHit, { kind: "lifeforce-drained" }>, receipt: HitReceipt): OrbStep<FightEvent> {
  const stolen = receipt.applied;
  return {
    orbs: withOrb(orbs, drained.void, { kind: "dormant", stolen, owed: stolen, tile: drained.orb }),
    outputs: [
      { kind: "lifeforce-drained", at: drained.at, void: drained.void, receipt },
      { kind: "orb-spawned", at: drained.at, void: drained.void, tile: drained.orb, credit: stolen },
    ],
  };
}

/** `standingOn` is the player's tile as the tick opens: a player already there takes the orb as it matures. */
export function matureOrb(orbs: Orbs, kind: VoidKind, at: Tick, standingOn: Tile, radius: number): OrbStep<FightEvent> {
  const orb = orbs.formed[kind];
  if (orb?.kind !== "dormant") return { orbs, outputs: [] };
  const matured: Orb = reach(orb.tile, standingOn) <= radius ? { ...orb, kind: "claimed", returnsAt: after(at, returnAfterMaturing.value) } : { ...orb, kind: "available" };
  return { orbs: withOrb(orbs, kind, matured), outputs: [{ kind: "orb-matured", at, void: kind, tile: orb.tile }] };
}

export function expireOrb(orbs: Orbs, kind: VoidKind, at: Tick): OrbStep<FightEvent> {
  const orb = orbs.formed[kind];
  if (orb?.kind !== "dormant" && orb?.kind !== "available") return { orbs, outputs: [] };
  return { orbs: withOrb(orbs, kind, { kind: "expired", stolen: orb.stolen, tile: orb.tile }), outputs: [{ kind: "orb-expired", at, void: kind, tile: orb.tile, credit: orb.stolen }] };
}

export function releaseUnclaimedOuterOrb(orbs: Orbs): OrbStep<BossHeal> {
  const orb = orbs.formed["outer-void"];
  if (orb?.kind !== "expired") return { orbs, outputs: [] };
  return { orbs: withOrb(orbs, "outer-void", null), outputs: [{ kind: "boss-heal", amount: orb.stolen }] };
}

export function moveOver(orbs: Orbs, steps: readonly Tile[], stoppedOn: Tile, at: Tick, radius: number): Orbs {
  const returnsAt = after(at, returnAfterStep.value);
  return {
    formed: eachOrb(orbs.formed, (orb) => (orb.kind === "available" && reach(orb.tile, stoppedOn) <= radius ? { ...orb, kind: "claimed", returnsAt } : orb)),
    entered: steps.reduce(enteredSquare, orbs.entered),
  };
}

export function returnDueOrbs(orbs: Orbs, at: Tick, hpAfterHits: number): OrbStep<Logged<FightEvent> | Heal> {
  const outputs: (Logged<FightEvent> | Heal)[] = [];
  let beforeHp = hpAfterHits;
  const formed = eachOrb(orbs.formed, (orb, kind) => {
    if (orb.kind !== "claimed" || orb.returnsAt !== at) return orb;
    if (beforeHp > 0) {
      const afterHp = beforeHp + orb.owed;
      const receipt = { requested: orb.owed, applied: orb.owed, beforeHp, afterHp };
      outputs.push({ kind: "heal", amount: orb.owed, limit: "allow-overheal" }, { kind: "event", event: { kind: "orb-returned", at, void: kind, tile: orb.tile, receipt } });
      beforeHp = afterHp;
    }
    return null;
  });
  return { orbs: { ...orbs, formed }, outputs };
}

export function forgiveOrbDebt(orbs: Orbs): Readonly<{ orbs: Orbs; cleared: number }> {
  const cleared = Object.values(orbs.formed).reduce((sum, orb) => sum + (orb === null || orb.kind === "expired" ? 0 : orb.owed), 0);
  return { orbs: { ...orbs, formed: eachOrb(orbs.formed, (orb) => (orb.kind === "expired" ? orb : { ...orb, owed: 0 })) }, cleared };
}
