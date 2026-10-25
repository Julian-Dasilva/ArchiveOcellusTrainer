import { OCELLUS_P1 } from "../OcellusTimings";
import type { Seed, Tick, TickSpan, Tile } from "../../../../sim/brands";
import { after, cycle, tick } from "../../../../sim/brands";
import type { BossHp, Slot } from "../../../../sim/schedule";
import type { HitRequest, Landed, Logged } from "../../../../sim/sdk/EncounterBinding";
import type { Corner, Crack, Element, P1Beat, P1End, P1Event, P1Hit, P1Phase, Step, Tendril } from "../P1Types";
import { crackId } from "../P1Types";
import type { PlayerObservation } from "../P4Types";
import { roll, rollInt } from "../roll";
import { CORNERS, beatLine, blastTiles, cornerLine, distanceToBody, facing, lineTiles, middleCentre, sameTile, stepToward } from "./arena";
import type { Line } from "./arena";
import type { P1Schedule } from "./schedule";
import { compileP1Schedule, cornerOfLeg, endSlots } from "./schedule";

const { boss, room, volley, corner, blast, crackBlock, middle } = OCELLUS_P1;

type InFlight = Readonly<{ landsAt: Tick; request: HitRequest<P1Hit> }>;
type Ending = Readonly<{ at: Tick; slots: readonly Slot<P1Phase, P1Beat>[] }>;

/** What the boss carries from tick to tick; the schedule holds his timeline, the rest is where he is and what he has charged. */
export type P1Fight = Readonly<{
  schedule: P1Schedule;
  ending: Ending | null;
  phase: P1Phase | null;
  bossAt: Tile;
  heading: Corner;
  legs: number;
  /** His HP as he last decided a volley; HP breakpoints read this, so he goes to the middle only on a volley tick. */
  decidedHp: number;
  element: Element;
  meter: number;
  strikeShots: number;
  blastFrom: Tile | null;
  cracks: readonly Crack[];
  owed: number;
  inFlight: readonly InFlight[];
}>;

export type TurnFacts = Readonly<{ at: Tick; player: PlayerObservation; boss: BossHp }>;
export type BossHeal = Readonly<{ kind: "boss-heal"; amount: number }>;
export type Refund = Readonly<{ kind: "refund"; amount: number }>;
export type TurnOutput = Logged<P1Event> | HitRequest<P1Hit> | BossHeal | Refund;
export type TurnStep = Readonly<{ fight: P1Fight; outputs: readonly TurnOutput[]; ending: P1End | null }>;
export type Moment = Readonly<{ phase: P1Phase; beats: readonly P1Beat[] }>;

const flip = (step: Step): Step => (step === 1 ? -1 : step === -1 ? 1 : 0);
const fixed = (amount: number, cause: P1Hit): HitRequest<P1Hit> => ({ kind: "hit", damage: { kind: "fixed", amount }, cause });

export function startFight(seed: Seed): P1Fight {
  return {
    schedule: compileP1Schedule(seed),
    ending: null,
    phase: null,
    bossAt: room.start.value,
    heading: cornerOfLeg(seed, 0, null),
    legs: 0,
    decidedHp: boss.maxHp.value,
    element: roll(seed, "volleyElement", tick(0), 0) < 0.5 ? "fire" : "water",
    meter: 0,
    strikeShots: 0,
    blastFrom: null,
    cracks: [],
    owed: 0,
    inFlight: [],
  };
}

export function momentAt(fight: P1Fight, at: Tick): Moment {
  if (fight.ending === null || at < fight.ending.at) return fight.schedule.at(at);
  const { slots, at: start } = fight.ending;
  const slot = slots[Math.min(at - start, slots.length - 1)];
  return { phase: slot.phase(cycle(1)), beats: slot.beats.flatMap((beat) => beat(cycle(1), start) ?? []) };
}

function cornerAt(anchor: Tile): Corner {
  const found = CORNERS.find((at) => sameTile(room.corners.value[at], anchor));
  if (found === undefined) throw new RangeError(`a corner crack needs him at a corner, not at ${anchor.x}, ${anchor.y}`);
  return found;
}

function isWalk(phase: P1Phase): boolean {
  return phase.stage === "walk-from-start" || phase.stage === "walk-from-corner" || phase.stage === "walk-from-middle";
}

const decides = (beat: P1Beat) => beat.kind === "volley" || beat.kind === "walk-ends";

/** One tick of his turn, in the order he acts: his end at 0 HP, the schedule, his step, his beats, the cracks closing, a refund for blocks, and hits landing. */
class TurnBuilder {
  readonly outputs: TurnOutput[] = [];
  ending: P1End | null = null;

  constructor(private readonly seed: Seed, public fight: P1Fight, private readonly facts: TurnFacts) {}

  log(event: P1Event): void {
    this.outputs.push({ kind: "event", event });
  }

  update(change: Partial<P1Fight>): void {
    this.fight = { ...this.fight, ...change };
  }

  enterEnd(): void {
    const { at } = this.facts;
    this.fight.cracks.forEach((crack) => this.log({ kind: "crack-closed", at, crack, outcome: "faded" }));
    this.update({ ending: { at, slots: endSlots(sameTile(this.fight.bossAt, room.middle.value)) }, cracks: [], blastFrom: null, strikeShots: 0 });
  }

  advance(): Moment {
    const { at, boss: hp } = this.facts;
    const { ending } = this.fight;
    if (ending !== null) {
      if (ending.at === at) this.log({ kind: "stage-entered", at, stage: "transform" });
      return momentAt(this.fight, at);
    }
    const decidedHp = this.fight.schedule.at(at).beats.some(decides) ? hp.hp : this.fight.decidedHp;
    const schedule = this.fight.schedule.advance(at, { hp: decidedHp, maxHp: hp.maxHp });
    this.update({ schedule, decidedHp });
    const visit = schedule.visitAt(at);
    if (visit.start === at) {
      this.log({ kind: "stage-entered", at, stage: visit.stage });
      if (visit.stage === "corner") this.update({ legs: this.fight.legs + 1, heading: cornerOfLeg(this.seed, this.fight.legs + 1, this.fight.heading) });
    }
    return schedule.at(at);
  }

  phaseChanged(now: P1Phase): void {
    const { at } = this.facts;
    const last = this.fight.phase;
    if ((last?.overhead ?? null) !== now.overhead) this.log({ kind: "overhead-switched", at, overhead: now.overhead });
    if (last?.boss !== now.boss) this.log({ kind: "boss-state-changed", at, state: now.boss });
    this.update({ phase: now });
  }

  walkOn(phase: P1Phase, heading: Corner): void {
    const target = room.corners.value[heading];
    if (isWalk(phase) && !sameTile(this.fight.bossAt, target)) this.update({ bossAt: stepToward(this.fight.bossAt, target) });
  }

  openCrack(line: Line, length: number, closesAfter: TickSpan, nth: number): void {
    const { at } = this.facts;
    const [first, ...rest] = lineTiles(line, length);
    if (first === undefined) return;
    const crack: Crack = { id: crackId(at, nth), tiles: [first, ...rest], growth: { dx: flip(line.run.dx), dy: flip(line.run.dy) }, openedAt: at, closesAt: after(at, closesAfter) };
    this.update({ cracks: [...this.fight.cracks, crack] });
    this.log({ kind: "crack-opened", at, crack });
  }

  react(beat: P1Beat): void {
    const { at, player } = this.facts;
    const { seed } = this;
    switch (beat.kind) {
      case "boss-shouts":
        this.log({ kind: "boss-shouted", at, text: beat.text, lasts: beat.lasts });
        return;
      case "volley": {
        const element: Element = roll(seed, "volleyElement", at, 0) < volley.switchChance.value ? (this.fight.element === "fire" ? "water" : "fire") : this.fight.element;
        const { nearWithin, near, far } = volley.flight.value;
        const landsAt = after(at, distanceToBody(this.fight.bossAt, player.tile) <= nearWithin ? near : far);
        const request: HitRequest<P1Hit> = {
          kind: "hit",
          damage: {
            kind: "by-prayer",
            style: volley.styles.value[element],
            protectedAmount: rollInt(seed, "volleyDamage", at, volley.protectedDamage.value, 0),
            unprotectedAmount: rollInt(seed, "volleyDamage", at, volley.unprotectedDamage.value, 1),
          },
          cause: { kind: "volley", at: landsAt, element, launchedAt: at },
        };
        this.update({ element, inFlight: [...this.fight.inFlight, { landsAt, request }] });
        this.log({ kind: "volley-cast", at, element, last: beat.last, landsAt, toward: player.tile });
        return;
      }
      case "walk-ends":
        this.log({ kind: "walk-ended", at });
        return;
      case "charge":
        this.log({ kind: "boss-charged", at, facing: middleCentre() });
        return;
      case "corner-crack": {
        const { firstFrom } = corner.tendrils.value;
        const first = firstFrom[cornerAt(this.fight.bossAt)];
        const other = first === "x" ? "y" : "x";
        const cornerSecond = roll(seed, "crackShape", this.fight.schedule.visitAt(at).start, 0) < 0.5;
        const order: readonly Tendril[] = cornerSecond ? [first, "corner", other] : [first, other, "corner"];
        const { length, closesAfter } = corner.cracks.value;
        this.openCrack(cornerLine(this.fight.bossAt, order[beat.nth % order.length], roll(seed, "crackShape", at, 1)), length, closesAfter, beat.nth);
        return;
      }
      case "glow":
        this.log({ kind: "boss-glowed", at });
        return;
      case "explode":
        this.update({ blastFrom: this.fight.bossAt });
        this.log({ kind: "boss-exploded", at });
        return;
      case "blast": {
        const from = this.fight.blastFrom ?? this.fight.bossAt;
        this.update({ blastFrom: null });
        this.log({ kind: "blast-landed", at, tiles: blastTiles(from).tiles() });
        if (distanceToBody(from, player.tile) <= blast.radius.value) this.outputs.push(fixed(rollInt(seed, "blastDamage", at, blast.damage.value, 0), { kind: "blast", at }));
        return;
      }
      case "teleport-out":
        this.log({ kind: "teleported-out", at, from: this.fight.bossAt });
        return;
      case "teleport-in":
        this.update({ bossAt: room.middle.value });
        this.log({ kind: "teleported-in", at, to: room.middle.value });
        return;
      case "beat": {
        const { length, closesAfter } = middle.beats.value;
        this.log({ kind: "boss-charged", at, facing: facing(this.fight.bossAt, beat.side) });
        this.openCrack(beatLine(this.fight.bossAt, beat.side, 0), length, closesAfter[0], 0);
        this.openCrack(beatLine(this.fight.bossAt, beat.side, 1), length, closesAfter[1], 1);
        return;
      }
      case "strike-told": {
        const strike = middle.strike.value;
        const shots = 1 + Math.floor(this.fight.meter / strike.meterPerExtraShot);
        this.update({ strikeShots: shots, meter: 0 });
        this.log({ kind: "boss-shouted", at, text: shots > 1 ? strike.texts.several : strike.texts.one, lasts: strike.lasts });
        this.log({ kind: "meter-changed", at, meter: 0 });
        return;
      }
      case "strike-cast": {
        const strike = middle.strike.value;
        const landsAt = after(at, strike.flight);
        const shots = Array.from({ length: this.fight.strikeShots }, (_, shot): InFlight => ({
          landsAt,
          request: fixed(rollInt(seed, "strikeDamage", at, strike.damage, shot), { kind: "strike", at: landsAt, shot }),
        }));
        this.log({ kind: "strike-cast", at, shots: shots.length, landsAt });
        this.update({ strikeShots: 0, inFlight: [...this.fight.inFlight, ...shots] });
        return;
      }
      case "transform":
        this.log({ kind: "transformed", at });
        return;
      case "phase-ends": {
        const reason: P1End = { kind: "phase-cleared" };
        this.ending = reason;
        this.log({ kind: "run-ended", at, reason });
        return;
      }
      default: {
        const unhandled: never = beat;
        return unhandled;
      }
    }
  }

  closeCracks(): void {
    const { at, player } = this.facts;
    const due = this.fight.cracks.filter((crack) => crack.closesAt === at);
    if (due.length === 0) return;
    const { meter, bossHeal, meterMax } = crackBlock.unblocked.value;
    this.update({ cracks: this.fight.cracks.filter((crack) => crack.closesAt !== at) });
    due.forEach((crack, draw) => {
      if (crack.tiles.some((tile) => sameTile(tile, player.tile))) {
        this.outputs.push(fixed(rollInt(this.seed, "blockDamage", at, crackBlock.damage.value, draw), { kind: "crack-blocked", at, crack: crack.id }));
        this.log({ kind: "crack-closed", at, crack, outcome: "blocked" });
        return;
      }
      const charged = Math.min(meterMax, this.fight.meter + meter);
      this.update({ meter: charged });
      this.log({ kind: "crack-closed", at, crack, outcome: "charged" });
      this.log({ kind: "meter-changed", at, meter: charged });
      this.outputs.push({ kind: "boss-heal", amount: bossHeal });
    });
  }

  refundBlocks(): void {
    const { player } = this.facts;
    const onCrack = this.fight.cracks.some((crack) => crack.tiles.some((tile) => sameTile(tile, player.tile)));
    if (this.fight.owed === 0 || onCrack) return;
    this.outputs.push({ kind: "refund", amount: this.fight.owed });
    this.update({ owed: 0 });
  }

  land(): void {
    const { at } = this.facts;
    this.fight.inFlight.filter((shot) => shot.landsAt === at).forEach((shot) => this.outputs.push(shot.request));
    this.update({ inFlight: this.fight.inFlight.filter((shot) => shot.landsAt !== at) });
  }
}

export function turn(seed: Seed, fight: P1Fight, facts: TurnFacts): TurnStep {
  const step = new TurnBuilder(seed, fight, facts);
  if (fight.ending === null && facts.boss.hp <= 0) step.enterEnd();
  const moment = step.advance();
  step.phaseChanged(moment.phase);
  step.walkOn(moment.phase, step.fight.heading);
  moment.beats.forEach((beat) => step.react(beat));
  step.closeCracks();
  step.refundBlocks();
  step.land();
  return { fight: step.fight, outputs: step.outputs, ending: step.ending };
}

/** A block's damage is owed back to the player until they step off the cracks. */
export function landed(fight: P1Fight, { cause, receipt }: Landed<P1Hit>): P1Fight {
  return cause.kind === "crack-blocked" ? { ...fight, owed: fight.owed + receipt.applied } : fight;
}
