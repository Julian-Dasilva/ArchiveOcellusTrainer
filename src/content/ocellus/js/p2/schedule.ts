import { OCELLUS_P2 } from "../OcellusTimingsP2";
import type { Cycle, Tick } from "../../../../sim/brands";
import { tick } from "../../../../sim/brands";
import type { BeatAt, Script, Slot } from "../../../../sim/schedule";
import { Schedule, slotTable } from "../../../../sim/schedule";
import type { P2Beat, P2Phase, P2Stage } from "../P2Types";

export type P2Schedule = Schedule<P2Stage, P2Phase, P2Beat, never>;

const { timeline, round, swordRepair } = OCELLUS_P2;

type Beats = (offset: number) => readonly P2Beat[];

const when = (holds: boolean, ...beats: readonly P2Beat[]): readonly P2Beat[] => (holds ? beats : []);

/** The sword's repair glow runs on a clock of its own through the whole phase, until The Blade leaves. */
function repairAt(at: Tick): P2Beat | null {
  const { first, every } = swordRepair.value;
  return at >= first && at < timeline.enough.value && (at - first) % every === 0 ? { kind: "sword-repairs" } : null;
}

function table(stage: P2Stage, length: number, phase: (visit: Cycle) => P2Phase, beats: Beats): readonly [Slot<P2Phase, P2Beat>, ...Slot<P2Phase, P2Beat>[]] {
  const slots = Array.from({ length }, (_, offset): Slot<P2Phase, P2Beat> => ({
    phase,
    beats: [...beats(offset).map((beat): BeatAt<P2Beat> => () => beat), (_visit, start) => repairAt(tick(start + offset))],
  }));
  return slotTable(slots, stage);
}

function lightingBeats(offset: number): readonly P2Beat[] {
  const { count, every, fireAfter } = round.lightings.value;
  const nth = (from: number) => (offset >= from && (offset - from) % every === 0 ? (offset - from) / every : count);
  return [...when(nth(0) < count, { kind: "portals-light" }), ...when(nth(fireAfter) < count, { kind: "portals-fire", volley: "lit" })];
}

function roundBeats(offset: number): readonly P2Beat[] {
  const { poolsForm, allLight, safePortal, allFire, discharge, release } = round;
  const { opens, takesFrom, takesUntil, closes } = safePortal.value;
  return [
    ...when(offset === 0, { kind: "round-starts" }),
    ...lightingBeats(offset),
    ...when(offset === poolsForm.value, { kind: "pools-form" }),
    ...when(offset === allLight.value, { kind: "all-portals-light" }),
    ...when(offset === poolsForm.value + OCELLUS_P2.pools.burst.value.afterForming, { kind: "pools-burst" }),
    ...when(offset === opens, { kind: "safe-portal-opens" }),
    ...when(offset === discharge.value, { kind: "blade-discharges" }),
    ...when(offset >= takesFrom && offset <= takesUntil, { kind: "safe-portal-takes" }),
    ...when(offset === release.value, { kind: "blade-releases" }),
    ...when(offset === allFire.value, { kind: "portals-fire", volley: "all" }),
    ...when(offset === closes, { kind: "round-ends" }),
  ];
}

/**
 * `arrive` runs to the first round; `round` is rounds 1 and 2, which share one table, then `last-round` is round 3, which has no pools
 * and no floor portal and runs on through "This... is enough..." to the tick phase 3 would start, where `transition` ends the drill.
 */
export function compileP2Schedule(): P2Schedule {
  const [first, second, last] = timeline.rounds.value;
  const roundLength = second - first;
  if (last - second !== roundLength) throw new RangeError(`rounds 1 and 2 share one table, so they must last as long: ${roundLength} and ${last - second} ticks`);
  const lastBeat = Math.max(round.allFire.value, round.safePortal.value.closes);
  if (lastBeat >= roundLength) throw new RangeError(`a round's last beat at +${lastBeat} falls outside its ${roundLength} ticks`);
  const arrive: P2Phase = { stage: "arrive" };
  const lastRound: P2Phase = { stage: "last-round", round: 3 };
  const transition: P2Phase = { stage: "transition" };
  const script: Script<P2Stage, P2Phase, P2Beat> = {
    first: "arrive",
    stages: {
      arrive: {
        slots: table("arrive", first, () => arrive, (offset) => [
          ...when(offset === timeline.portalsRise.value, { kind: "portals-rise" }),
          ...when(offset === timeline.bladeWakes.value, { kind: "blade-wakes" }),
        ]),
        breakable: false,
        then: () => "round",
      },
      round: {
        slots: table("round", roundLength, (visit) => ({ stage: "round", round: visit === 1 ? 1 : 2 }), roundBeats),
        breakable: false,
        then: (_ended, visits) => (visits("round") < 2 ? "round" : "last-round"),
      },
      "last-round": {
        slots: table("last-round", timeline.phaseEnds.value - last, () => lastRound, (offset) => [
          ...when(offset === 0, { kind: "round-starts" }),
          ...lightingBeats(offset),
          ...when(offset === timeline.enough.value - last, { kind: "enough" }),
          ...when(offset === timeline.swordFalls.value - last, { kind: "sword-falls" }, { kind: "blade-releases" }),
        ]),
        breakable: false,
        then: () => "transition",
      },
      transition: { slots: [{ phase: () => transition, beats: [() => ({ kind: "phase-ends" })] }], breakable: false, then: () => "transition" },
    },
    breakpoints: [],
  };
  return new Schedule<P2Stage, P2Phase, P2Beat, never>(script, () => null, { kind: "full-fight" }, { kind: "cycle-start" }, tick(0));
}
