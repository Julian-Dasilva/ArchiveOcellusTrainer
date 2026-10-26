import { OCELLUS_P1 } from "../OcellusTimingsP1";
import type { Seed, Tick } from "../../../../sim/brands";
import { tick } from "../../../../sim/brands";
import type { BeatAt, Script, Slot } from "../../../../sim/schedule";
import { Schedule, slotTable } from "../../../../sim/schedule";
import type { Corner, P1Beat, P1Phase, P1Stage, P1WalkStage } from "../P1Types";
import { roll } from "../roll";
import { CLOCKWISE, CORNERS, cornerAfter, stepsBetween } from "./arena";

export type P1Schedule = Schedule<P1Stage, P1Phase, P1Beat, never>;
type P1Slot = Slot<P1Phase, P1Beat>;

const { room, arrive, route, walk, corner, blast, middle, end } = OCELLUS_P1;

const slot = (phase: P1Phase, ...beats: readonly BeatAt<P1Beat>[]): P1Slot => ({ phase: () => phase, beats });
const beat = (b: P1Beat): BeatAt<P1Beat> => () => b;

/** The first corner is an even pick; each later one is weighted by the turn from the corner he is at. */
export function cornerOfLeg(seed: Seed, leg: number, from: Corner | null): Corner {
  const draw = roll(seed, "cornerRoute", tick(0), leg);
  if (from === null) return CORNERS[Math.floor(draw * CORNERS.length)];
  const weights = route.value;
  const total = weights.anticlockwise + weights.clockwise + weights.across;
  const pick = draw * total;
  if (pick < weights.anticlockwise) return cornerAfter(from, "anticlockwise");
  if (pick < weights.anticlockwise + weights.clockwise) return cornerAfter(from, "clockwise");
  return cornerAfter(from, "across");
}

/** He takes his first step on the walk's first tick, so a walk of n steps arrives on its tick n - 1. */
function walkSlots(stage: P1WalkStage, steps: number): readonly P1Slot[] {
  const every = walk.volleyEvery.value;
  const { lastVolley, endPose } = walk.chargeAfter.value;
  const arrival = steps - 1;
  const guarded: P1Phase = { stage, boss: "present-damageable", overhead: walk.overhead.value };
  const bare: P1Phase = { stage, boss: "present-damageable", overhead: null };
  const slots: P1Slot[] = [];
  for (let at = 0; ; at += every) {
    if (at < arrival) {
      slots.push(slot(guarded, beat({ kind: "volley", last: false })), ...Array.from({ length: every - 1 }, () => slot(guarded)));
      continue;
    }
    if (at === arrival) {
      slots.push(slot(guarded, beat({ kind: "volley", last: true })), ...Array.from({ length: lastVolley - 2 }, () => slot(guarded)), slot(bare));
      return slots;
    }
    slots.push(slot(bare, beat({ kind: "walk-ends" })), ...Array.from({ length: endPose - 1 }, () => slot(bare)));
    return slots;
  }
}

function legSteps(from: "corner" | "middle"): number {
  const corners = room.corners.value;
  const steps = CORNERS.flatMap((to) => (from === "middle" ? [stepsBetween(room.middle.value, corners[to])] : CORNERS.filter((at) => at !== to).map((at) => stepsBetween(corners[at], corners[to]))));
  const [first, ...rest] = steps;
  if (first === undefined || rest.some((n) => n !== first)) throw new RangeError(`walks from a ${from} take ${steps.join(", ")} steps, and one walk table needs them equal`);
  return first;
}

function cornerSlots(seed: Seed): readonly P1Slot[] {
  const phase: P1Phase = { stage: "corner", boss: "present-damageable", overhead: null };
  const cracks = corner.cracks.value;
  const glow = corner.glow.value;
  const taunt = corner.taunt.value;
  const explodeAt = corner.explodeAt.value;
  const blastAt = explodeAt + blast.afterExplode.value;
  const length = corner.walkAt.value;
  const beats: BeatAt<P1Beat>[][] = Array.from({ length }, () => []);
  const put = (offset: number, label: string, b: BeatAt<P1Beat>) => {
    if (offset < 0 || offset >= length) throw new RangeError(`${label} at corner offset ${offset} is outside the ${length}-tick corner`);
    beats[offset].push(b);
  };
  put(0, "charge", beat({ kind: "charge" }));
  for (let nth = 0; nth < cracks.count; nth++) put(nth * cracks.every, `crack ${nth}`, beat({ kind: "corner-crack", nth }));
  for (let at: number = glow.from; at < explodeAt; at += glow.every) put(at, "glow", beat({ kind: "glow" }));
  put(taunt.at, "taunt", (_, start) => ({ kind: "boss-shouts", text: taunt.texts[Math.floor(roll(seed, "taunt", tick(start + taunt.at), 0) * taunt.texts.length)], lasts: taunt.lasts }));
  put(explodeAt, "explode", beat({ kind: "explode" }));
  put(blastAt, "blast", beat({ kind: "blast" }));
  return beats.map((at) => slot(phase, ...at));
}

/** The middle's first beat faces a seeded side and each later one the next side clockwise. */
export function beatSide(seed: Seed, middleStart: Tick, nth: number): (typeof CLOCKWISE)[number] {
  const first = Math.floor(roll(seed, "beatSide", middleStart, 0) * CLOCKWISE.length);
  return CLOCKWISE[(first + nth) % CLOCKWISE.length];
}

function middleSlots(seed: Seed): readonly P1Slot[] {
  const { hiddenAfter, inAfter } = middle.teleport.value;
  const beats = middle.beats.value;
  const strike = middle.strike.value;
  const lastExplode = beats.first + (beats.count - 1) * beats.every + beats.explodeAfter;
  const told = lastExplode + strike.toldAfterLastExplode;
  const length = told + middle.walkAfterTold.value;
  const at: BeatAt<P1Beat>[][] = Array.from({ length }, () => []);
  const put = (offset: number, label: string, b: BeatAt<P1Beat>) => {
    if (offset < 0 || offset >= length) throw new RangeError(`${label} at middle offset ${offset} is outside the ${length}-tick middle`);
    at[offset].push(b);
  };
  put(0, "teleport out", beat({ kind: "teleport-out" }));
  put(inAfter, "teleport in", beat({ kind: "teleport-in" }));
  for (let nth = 0; nth < beats.count; nth++) {
    const start = beats.first + nth * beats.every;
    put(start, `beat ${nth}`, (_, middleStart) => ({ kind: "beat", side: beatSide(seed, middleStart, nth) }));
    beats.glowAfter.forEach((after) => put(start + after, `beat ${nth} glow`, beat({ kind: "glow" })));
    put(start + beats.explodeAfter, `beat ${nth} explode`, beat({ kind: "explode" }));
    put(start + beats.explodeAfter + blast.afterExplode.value, `beat ${nth} blast`, beat({ kind: "blast" }));
  }
  put(told, "strike told", beat({ kind: "strike-told" }));
  put(told + strike.castAfterTold, "strike cast", beat({ kind: "strike-cast" }));
  const boss = (offset: number): P1Phase["boss"] => (offset === 0 ? "present-invulnerable" : offset >= hiddenAfter && offset < inAfter ? "hidden" : "present-damageable");
  return at.map((slotBeats, offset) => slot({ stage: "middle", boss: boss(offset), overhead: null }, ...slotBeats));
}

function arriveSlots(): readonly P1Slot[] {
  const shout = arrive.shout.value;
  const hooded = arrive.hoodedFor.value;
  return Array.from({ length: arrive.walkAfter.value }, (_, offset) =>
    slot({ stage: "arrive", boss: offset < hooded ? "present-invulnerable" : "present-damageable", overhead: null }, ...(offset === 0 ? [beat({ kind: "boss-shouts", text: shout.text, lasts: shout.lasts })] : [])),
  );
}

export function compileP1Schedule(seed: Seed): P1Schedule {
  const firstCorner = cornerOfLeg(seed, 0, null);
  const script: Script<P1Stage, P1Phase, P1Beat> = {
    first: "arrive",
    stages: {
      arrive: { slots: slotTable(arriveSlots(), "arrive"), breakable: false, then: () => "walk-from-start" },
      "walk-from-start": { slots: slotTable(walkSlots("walk-from-start", stepsBetween(room.start.value, room.corners.value[firstCorner])), "walk-from-start"), breakable: true, then: () => "corner" },
      "walk-from-corner": { slots: slotTable(walkSlots("walk-from-corner", legSteps("corner")), "walk-from-corner"), breakable: true, then: () => "corner" },
      "walk-from-middle": { slots: slotTable(walkSlots("walk-from-middle", legSteps("middle")), "walk-from-middle"), breakable: true, then: () => "corner" },
      corner: { slots: slotTable(cornerSlots(seed), "corner"), breakable: false, then: () => "walk-from-corner" },
      middle: { slots: slotTable(middleSlots(seed), "middle"), breakable: false, then: () => "walk-from-middle" },
    },
    breakpoints: middle.thresholds.value.map((atOrBelow) => ({ atOrBelow, enter: "middle" })),
  };
  return new Schedule<P1Stage, P1Phase, P1Beat, never>(script, () => null, { kind: "full-fight" }, { kind: "cycle-start" }, tick(0));
}

/** His end at 0 HP, entered on any tick outside the schedule: from the middle he transforms in place, from elsewhere he teleports there first. */
export function endSlots(atMiddle: boolean): readonly P1Slot[] {
  const { shout, teleportOutAfter, teleportInAfter, transformAfterLanding, transformAtMiddleAfter, phase2AfterTransform } = end.value;
  const transformAt = atMiddle ? transformAtMiddleAfter : teleportInAfter + transformAfterLanding;
  const length = transformAt + phase2AfterTransform + 1;
  const hidden = (offset: number) => !atMiddle && offset > teleportOutAfter && offset < teleportInAfter;
  return Array.from({ length }, (_, offset) => {
    const beats: BeatAt<P1Beat>[] = [];
    if (offset === 0) beats.push(beat({ kind: "boss-shouts", text: shout.text, lasts: shout.lasts }));
    if (!atMiddle && offset === teleportOutAfter) beats.push(beat({ kind: "teleport-out" }));
    if (!atMiddle && offset === teleportInAfter) beats.push(beat({ kind: "teleport-in" }));
    if (offset === transformAt) beats.push(beat({ kind: "transform" }));
    if (offset === transformAt + phase2AfterTransform) beats.push(beat({ kind: "phase-ends" }));
    return slot({ stage: "transform", boss: hidden(offset) ? "hidden" : "present-invulnerable", overhead: null }, ...beats);
  });
}
