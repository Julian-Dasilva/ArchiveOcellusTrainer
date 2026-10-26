import type { DamageRange, PrayedHit } from "../OcellusTimings";
import { OCELLUS_P3 } from "../OcellusTimings";
import type { Seed, Tick, TickSpan, Tile } from "../../../../sim/brands";
import { after, tick } from "../../../../sim/brands";
import type { BossHp } from "../../../../sim/schedule";
import type { HitRequest, Logged } from "../../../../sim/sdk/EncounterBinding";
import type { FlickRule, P3Beat, P3End, P3Event, P3Hit, Quadrant, Spin } from "../P3Types";
import type { PlayerObservation } from "../P4Types";
import { rollInt } from "../roll";
import type { Flick } from "./flick";
import { armFlick, dueFlick, judgeSpin, stepFlick } from "./flick";
import type { P3Schedule } from "./schedule";
import { compileP3Schedule } from "./schedule";

export type P3Rules = Readonly<{ seed: Seed; start: Quadrant; flick: FlickRule; missedFlickDamage: DamageRange; firstSpin: TickSpan }>;
export type Hazard = Readonly<{ kind: "rubble"; tile: Tile; landsAt: Tick; until: Tick }> | Readonly<{ kind: "void-shot"; landsAt: Tick; until: Tick }>;
export type P3Fight = Readonly<{ schedule: P3Schedule; flick: Flick; hazards: readonly Hazard[] }>;
export type Reach = "in-reach" | "out-of-reach";

export type TurnFacts = Readonly<{ at: Tick; player: PlayerObservation; boss: BossHp & Readonly<{ reach: Reach }> }>;

export type TurnOutput = Logged<P3Event> | HitRequest<P3Hit>;
/** Changes the Mob applies to the SDK itself, because the binding has no output for them. */
export type ShellEffect = Readonly<{ kind: "lock-protection-prayers"; through: Tick }>;
export type TurnStep = Readonly<{ fight: P3Fight; outputs: readonly TurnOutput[]; shell: readonly ShellEffect[]; ending: P3End | null }>;
type Reaction = Readonly<{ outputs: readonly TurnOutput[]; ending: P3End | null; flick: Flick; hazards: readonly Hazard[]; shell: readonly ShellEffect[] }>;

const logged = (event: P3Event): Logged<P3Event> => ({ kind: "event", event });
const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

export function startFight(rules: P3Rules): P3Fight {
  return { schedule: compileP3Schedule(rules.start, rules.firstSpin), flick: "unarmed", hazards: [] };
}

function prayedHit(seed: Seed, at: Tick, { style, protectedDamage, unprotectedDamage }: PrayedHit, cause: P3Hit): HitRequest<P3Hit> {
  return {
    kind: "hit",
    damage: { kind: "by-prayer", style, protectedAmount: rollInt(seed, "swingDamage", at, protectedDamage, 0), unprotectedAmount: rollInt(seed, "swingDamage", at, unprotectedDamage, 0) },
    cause,
  };
}

function autoAttack(seed: Seed, at: Tick, reach: Reach, flick: Flick): Reaction {
  switch (reach) {
    case "in-reach": {
      const swing = prayedHit(seed, at, { style: "melee", protectedDamage: OCELLUS_P3.swing.protectedDamage.value, unprotectedDamage: OCELLUS_P3.swing.unprotectedDamage.value }, { kind: "swing", at });
      return { outputs: [swing], ending: null, flick, hazards: [], shell: [] };
    }
    case "out-of-reach": {
      const landsAt = after(at, OCELLUS_P3.voidShot.value.landsAfterCast);
      return { outputs: [logged({ kind: "void-shot-cast", at, landsAt })], ending: null, flick, hazards: [{ kind: "void-shot", landsAt, until: landsAt }], shell: [] };
    }
    default: {
      const unhandled: never = reach;
      return unhandled;
    }
  }
}

function spinWinds(rules: P3Rules, spin: Spin, flick: Flick, { at, player }: TurnFacts): Reaction {
  const winding = logged({ kind: "spin-winding", at, spin });
  const { thrownOnWind, landsAfterThrow, patch } = OCELLUS_P3.smite.rubble;
  if (thrownOnWind.value[spin.of] !== spin.nth) return { outputs: [winding], ending: null, flick, hazards: [], shell: [] };
  const landsAt = after(at, landsAfterThrow.value);
  const rubble: Hazard = { kind: "rubble", tile: player.tile, landsAt, until: tick(landsAt + rollInt(rules.seed, "rubbleDamage", landsAt, patch.value.lasts, 1) - 1) };
  return { outputs: [winding, logged({ kind: "rubble-aimed", at, tile: rubble.tile, landsAt, until: rubble.until })], ending: null, flick, hazards: [rubble], shell: [] };
}

function spinDue(rules: P3Rules, spin: Spin, flick: Flick, { at, player }: TurnFacts): Reaction {
  const due = dueFlick(rules.flick, flick, player.prayer);
  if (due !== "knocked") return { outputs: [], ending: null, flick: due, hazards: [], shell: [] };
  const through = tick(at + OCELLUS_P3.smite.knockedPrayerBackAfter.value - 1);
  return { outputs: [logged({ kind: "prayer-knocked-off", at, spin, until: through })], ending: null, flick: due, hazards: [], shell: [{ kind: "lock-protection-prayers", through }] };
}

function spinLands(rules: P3Rules, spin: Spin, flick: Flick, { at, player }: TurnFacts): Reaction {
  const verdict = judgeSpin(rules.flick, flick);
  const amount = verdict.kind === "blocked" ? 0 : rollInt(rules.seed, "spinDamage", at, rules.missedFlickDamage, 0);
  const hit: HitRequest<P3Hit> = { kind: "hit", damage: { kind: "fixed", amount }, cause: { kind: "spin", at, spin, verdict } };
  return { outputs: [hit], ending: null, flick: armFlick(rules.flick, player.prayer === "melee"), hazards: [], shell: [] };
}

function react(rules: P3Rules, beat: P3Beat, flick: Flick, facts: TurnFacts): Reaction {
  const { at } = facts;
  const quiet = (outputs: readonly TurnOutput[]): Reaction => ({ outputs, ending: null, flick, hazards: [], shell: [] });
  switch (beat.kind) {
    case "reach-attack":
      return autoAttack(rules.seed, at, facts.boss.reach, flick);
    case "wave-cast":
      return quiet([logged({ kind: "wave-cast", at, toward: facts.player.tile })]);
    case "smite-opens":
      return { outputs: [], ending: null, flick: armFlick(rules.flick, facts.player.prayer === "melee"), hazards: [], shell: [] };
    case "smite-blow":
      return quiet([prayedHit(rules.seed, at, OCELLUS_P3.smite.openingBlow.value, { kind: "smite-blow", at })]);
    case "spin-winds":
      return spinWinds(rules, beat.spin, flick, facts);
    case "spin-due":
      return spinDue(rules, beat.spin, flick, facts);
    case "spin-lands":
      return spinLands(rules, beat.spin, flick, facts);
    case "quadrant-cleared": {
      const reason: P3End = { kind: "quadrant-cleared", quadrant: rules.start };
      return { outputs: [logged({ kind: "run-ended", at, reason })], ending: reason, flick, hazards: [], shell: [] };
    }
    default: {
      const unhandled: never = beat;
      return unhandled;
    }
  }
}

function resolveHazard(seed: Seed, hazard: Hazard, facts: TurnFacts): readonly TurnOutput[] {
  const { at, player } = facts;
  switch (hazard.kind) {
    case "rubble": {
      const { damage, patch } = OCELLUS_P3.smite.rubble;
      const onTile = sameTile(player.tile, hazard.tile);
      if (at === hazard.landsAt) {
        return onTile
          ? [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "rubbleDamage", at, damage.value, 0) }, cause: { kind: "rubble", at, tile: hazard.tile } }]
          : [logged({ kind: "hazard-avoided", at, hazard: "rubble", tile: hazard.tile })];
      }
      const patchHits = onTile && at > hazard.landsAt && at <= hazard.until && (at - hazard.landsAt) % patch.value.every === 0;
      return patchHits ? [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "rubbleDamage", at, patch.value.damage, 0) }, cause: { kind: "void-patch", at, tile: hazard.tile } }] : [];
    }
    case "void-shot":
      return at === hazard.landsAt ? [prayedHit(seed, at, OCELLUS_P3.voidShot.value, { kind: "void-shot", at })] : [];
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
  const stepped: Reaction = { outputs: [], ending: null, flick: stepFlick(fight.flick, facts.player.prayer === "melee"), hazards: [], shell: [] };
  const reacted = schedule.at(facts.at).beats.reduce<Reaction>((so, beat) => {
    const next = react(rules, beat, so.flick, facts);
    return { outputs: [...so.outputs, ...next.outputs], ending: so.ending ?? next.ending, flick: next.flick, hazards: [...so.hazards, ...next.hazards], shell: [...so.shell, ...next.shell] };
  }, stepped);
  return {
    fight: { schedule, flick: reacted.flick, hazards: [...fight.hazards.filter((hazard) => hazard.until > facts.at), ...reacted.hazards] },
    outputs: [...entered, ...reacted.outputs, ...fromHazards],
    shell: reacted.shell,
    ending: reacted.ending,
  };
}
