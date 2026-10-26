import type { DamageRange } from "../OcellusTimings";
import { OCELLUS_P3 } from "../OcellusTimings";
import type { Seed, Tick, TickSpan, Tile } from "../../../../sim/brands";
import { after, span, tick } from "../../../../sim/brands";
import type { BossHp } from "../../../../sim/schedule";
import type { HitRequest, Logged, Relocation } from "../../../../sim/sdk/EncounterBinding";
import type { FlickRule, P3Beat, P3End, P3Event, P3Hit, Quadrant, SpecialOrder, Spin } from "../P3Types";
import type { PlayerObservation } from "../P4Types";
import { roll, rollInt } from "../roll";
import { QUADRANT_1_FLOOR, UNTETHER_FOOTPRINT } from "./arena";
import type { Flick } from "./flick";
import { armFlick, judgeSpin, stepFlick } from "./flick";
import type { P3Schedule } from "./schedule";
import { compileP3Schedule } from "./schedule";

export type P3Rules = Readonly<{ seed: Seed; start: Quadrant; flick: FlickRule; missedFlickDamage: DamageRange; firstSpin: TickSpan; specials: SpecialOrder }>;
export type Hazard =
  | Readonly<{ kind: "rubble"; tile: Tile; landsAt: Tick; until: Tick }>
  | Readonly<{ kind: "purple-tiles"; under: Tile; tiles: readonly Tile[]; eruptsAt: Tick }>
  | Readonly<{ kind: "slam"; landsAt: Tick; damage: DamageRange }>;
export type P3Fight = Readonly<{ schedule: P3Schedule; flick: Flick; hazards: readonly Hazard[] }>;
export type Reach = "in-reach" | "out-of-reach";

export type TurnFacts = Readonly<{ at: Tick; player: PlayerObservation; boss: BossHp & Readonly<{ reach: Reach }> }>;

export type TurnOutput = Logged<P3Event> | HitRequest<P3Hit> | Relocation;
export type TurnStep = Readonly<{ fight: P3Fight; outputs: readonly TurnOutput[]; ending: P3End | null }>;
type Reaction = Readonly<{ outputs: readonly TurnOutput[]; ending: P3End | null; flick: Flick; hazards: readonly Hazard[] }>;

const logged = (event: P3Event): Logged<P3Event> => ({ kind: "event", event });
const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const { untether } = OCELLUS_P3;

export function startFight(rules: P3Rules): P3Fight {
  return { schedule: compileP3Schedule(rules.start, rules.firstSpin, rules.specials), flick: "unarmed", hazards: [] };
}

function purpleTiles(seed: Seed, at: Tick, under: Tile): readonly Tile[] {
  const count = rollInt(seed, "purpleTiles", at, untether.purpleTiles.perShowing.value, 0);
  const others = QUADRANT_1_FLOOR.tiles().filter((floor) => !sameTile(floor, under));
  for (let k = 0; k < count - 1; k++) {
    const pick = k + Math.floor(roll(seed, "purpleTiles", at, k + 1) * (others.length - k));
    [others[k], others[pick]] = [others[pick], others[k]];
  }
  return [under, ...others.slice(0, count - 1)];
}

function voidErupts(seed: Seed, at: Tick, player: Tile): Readonly<{ outputs: readonly TurnOutput[]; slam: Hazard }> {
  const { eruptionDamage, slamDamage, eruptionAfterBorder, slamAfterBorder } = untether;
  const erupted = !UNTETHER_FOOTPRINT.contains(player);
  const slam: Hazard = { kind: "slam", landsAt: after(at, span(slamAfterBorder.value - eruptionAfterBorder.value)), damage: erupted ? slamDamage.value.eruptionHit : slamDamage.value.eruptionMissed };
  const outcome: TurnOutput = erupted
    ? { kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "untetherDamage", at, eruptionDamage.value, 0) }, cause: { kind: "eruption", at, tile: player } }
    : logged({ kind: "hazard-avoided", at, hazard: "eruption", tile: player });
  return { outputs: [logged({ kind: "void-erupted", at }), outcome], slam };
}

function meleeHit(seed: Seed, at: Tick, { protectedDamage, unprotectedDamage }: Readonly<{ protectedDamage: DamageRange; unprotectedDamage: DamageRange }>, cause: P3Hit): HitRequest<P3Hit> {
  return {
    kind: "hit",
    damage: { kind: "by-prayer", style: "melee", protectedAmount: rollInt(seed, "swingDamage", at, protectedDamage, 0), unprotectedAmount: rollInt(seed, "swingDamage", at, unprotectedDamage, 0) },
    cause,
  };
}

function autoAttack(seed: Seed, at: Tick, reach: Reach): HitRequest<P3Hit> {
  switch (reach) {
    case "in-reach":
      return meleeHit(seed, at, { protectedDamage: OCELLUS_P3.swing.protectedDamage.value, unprotectedDamage: OCELLUS_P3.swing.unprotectedDamage.value }, { kind: "swing", at });
    case "out-of-reach":
      return { kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "swingDamage", at, OCELLUS_P3.voidShot.value, 0) }, cause: { kind: "void-shot", at } };
    default: {
      const unhandled: never = reach;
      return unhandled;
    }
  }
}

function spinLands(rules: P3Rules, spin: Spin, flick: Flick, facts: TurnFacts): Reaction {
  const { at, player } = facts;
  const verdict = judgeSpin(rules.flick, flick);
  const amount = verdict.kind === "blocked" ? 0 : rollInt(rules.seed, "spinDamage", at, rules.missedFlickDamage, 0);
  const hit: HitRequest<P3Hit> = { kind: "hit", damage: { kind: "fixed", amount }, cause: { kind: "spin", at, spin, verdict } };
  const rearmed = armFlick(rules.flick, player.prayer === "melee");
  if (spin.nth !== 1) return { outputs: [hit], ending: null, flick: rearmed, hazards: [] };
  const { landsAfterFirstSpin, lasts } = OCELLUS_P3.smite.rubble;
  const landsAt = after(at, landsAfterFirstSpin.value);
  const rubble: Hazard = { kind: "rubble", tile: player.tile, landsAt, until: tick(landsAt + lasts.value - 1) };
  return { outputs: [hit, logged({ kind: "rubble-aimed", at, tile: rubble.tile, landsAt: rubble.landsAt, until: rubble.until })], ending: null, flick: rearmed, hazards: [rubble] };
}

function react(rules: P3Rules, beat: P3Beat, flick: Flick, facts: TurnFacts): Reaction {
  const { at } = facts;
  const quiet = (outputs: readonly TurnOutput[]): Reaction => ({ outputs, ending: null, flick, hazards: [] });
  switch (beat.kind) {
    case "reach-attack":
      return quiet([autoAttack(rules.seed, at, facts.boss.reach)]);
    case "wave-cast":
      return quiet([logged({ kind: "wave-cast", at, toward: facts.player.tile })]);
    case "smite-opens":
      return { outputs: [meleeHit(rules.seed, at, OCELLUS_P3.smite.openingBlow.value, { kind: "smite-blow", at })], ending: null, flick: armFlick(rules.flick, facts.player.prayer === "melee"), hazards: [] };
    case "spin-lands":
      return spinLands(rules, beat.spin, flick, facts);
    case "untether-starts":
      return quiet([logged({ kind: "untether-started", at }), { kind: "relocate", to: untether.anchor.value }]);
    case "purple-tiles-show": {
      const tiles = purpleTiles(rules.seed, at, facts.player.tile);
      const eruptsAt = after(at, untether.purpleTiles.eruptAfter.value);
      return { outputs: [logged({ kind: "purple-tiles-shown", at, tiles, eruptsAt })], ending: null, flick, hazards: [{ kind: "purple-tiles", under: facts.player.tile, tiles, eruptsAt }] };
    }
    case "untether-magic": {
      const { protectedDamage, unprotectedDamage } = untether.magicDamage.value;
      return quiet([
        {
          kind: "hit",
          damage: { kind: "by-prayer", style: "magic", protectedAmount: rollInt(rules.seed, "untetherDamage", at, protectedDamage, 0), unprotectedAmount: rollInt(rules.seed, "untetherDamage", at, unprotectedDamage, 0) },
          cause: { kind: "untether-magic", at },
        },
      ]);
    }
    case "border-shows":
      return quiet([logged({ kind: "border-shown", at })]);
    case "void-erupts": {
      const { outputs, slam } = voidErupts(rules.seed, at, facts.player.tile);
      return { outputs, ending: null, flick, hazards: [slam] };
    }
    case "quadrant-cleared": {
      const reason: P3End = { kind: "quadrant-cleared", quadrant: rules.start };
      return { outputs: [logged({ kind: "run-ended", at, reason })], ending: reason, flick, hazards: [] };
    }
    default: {
      const unhandled: never = beat;
      return unhandled;
    }
  }
}

function lastTick(hazard: Hazard): Tick {
  switch (hazard.kind) {
    case "rubble":
      return hazard.until;
    case "purple-tiles":
      return hazard.eruptsAt;
    case "slam":
      return hazard.landsAt;
    default: {
      const unhandled: never = hazard;
      return unhandled;
    }
  }
}

function resolveHazard(seed: Seed, hazard: Hazard, facts: TurnFacts): readonly TurnOutput[] {
  const { at, player } = facts;
  switch (hazard.kind) {
    case "rubble": {
      if (at < hazard.landsAt || at > hazard.until) return [];
      if (sameTile(player.tile, hazard.tile)) {
        return [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "rubbleDamage", at, OCELLUS_P3.smite.rubble.damagePerTick.value, 0) }, cause: { kind: "rubble", at, tile: hazard.tile } }];
      }
      return at === hazard.landsAt ? [logged({ kind: "hazard-avoided", at, hazard: "rubble", tile: hazard.tile })] : [];
    }
    case "purple-tiles": {
      if (at !== hazard.eruptsAt) return [];
      if (!hazard.tiles.some((purple) => sameTile(purple, player.tile))) return [logged({ kind: "hazard-avoided", at, hazard: "purple-tile", tile: hazard.under })];
      return [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "untetherDamage", at, untether.purpleTiles.damage.value, 1) }, cause: { kind: "purple-tile", at, tile: player.tile } }];
    }
    case "slam": {
      if (at !== hazard.landsAt) return [];
      if (!UNTETHER_FOOTPRINT.contains(player.tile)) return [logged({ kind: "hazard-avoided", at, hazard: "slam", tile: player.tile })];
      return [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "untetherDamage", at, hazard.damage, 0) }, cause: { kind: "slam", at, tile: player.tile } }];
    }
    default: {
      const unhandled: never = hazard;
      return unhandled;
    }
  }
}

export function turn(rules: P3Rules, fight: P3Fight, facts: TurnFacts): TurnStep {
  const schedule = fight.schedule.advance(facts.at, facts.boss);
  const visit = schedule.visitAt(facts.at);
  const entered = visit.start === facts.at ? [logged({ kind: "stage-entered", at: facts.at, stage: visit.stage })] : [];
  const fromHazards = fight.hazards.flatMap((hazard) => resolveHazard(rules.seed, hazard, facts));
  const stepped: Reaction = { outputs: [], ending: null, flick: stepFlick(fight.flick, facts.player.prayer === "melee"), hazards: [] };
  const reacted = schedule.at(facts.at).beats.reduce<Reaction>((so, beat) => {
    const next = react(rules, beat, so.flick, facts);
    return { outputs: [...so.outputs, ...next.outputs], ending: so.ending ?? next.ending, flick: next.flick, hazards: [...so.hazards, ...next.hazards] };
  }, stepped);
  return {
    fight: { schedule, flick: reacted.flick, hazards: [...fight.hazards.filter((hazard) => lastTick(hazard) > facts.at), ...reacted.hazards] },
    outputs: [...entered, ...reacted.outputs, ...fromHazards],
    ending: reacted.ending,
  };
}
