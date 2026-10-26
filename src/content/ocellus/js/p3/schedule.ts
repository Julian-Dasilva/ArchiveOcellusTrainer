import { OCELLUS_P3 } from "../OcellusTimings";
import { tick } from "../../../../sim/brands";
import type { TickSpan } from "../../../../sim/brands";
import type { Script, Slot } from "../../../../sim/schedule";
import { Schedule, slotTable } from "../../../../sim/schedule";
import type { P3Beat, P3Phase, P3Stage, Quadrant, Spin, SpinCount } from "../P3Types";

export type P3Schedule = Schedule<P3Stage, P3Phase, P3Beat, never>;

const QUADRANTS: readonly Quadrant[] = [1, 2, 3];
const SMITE_STAGE: Readonly<Record<SpinCount, P3Stage>> = { 1: "smite-1", 2: "smite-2", 3: "smite-3" };
const SPINS: Readonly<Record<SpinCount, readonly Spin[]>> = {
  1: [{ nth: 1, of: 1 }],
  2: [{ nth: 1, of: 2 }, { nth: 2, of: 2 }],
  3: [{ nth: 1, of: 3 }, { nth: 2, of: 3 }, { nth: 3, of: 3 }],
};

const slot = (stage: P3Stage, ...beats: readonly P3Beat[]): Slot<P3Phase, P3Beat> => {
  const phase: P3Phase = { stage };
  return { phase: () => phase, beats: beats.map((beat) => () => beat) };
};

function atLeastOne(name: string, gap: TickSpan): TickSpan {
  if (gap < 1) throw new RangeError(`${name} needs at least 1 tick, not ${gap}`);
  return gap;
}

function autosTable(): readonly Slot<P3Phase, P3Beat>[] {
  return OCELLUS_P3.autos.value.flatMap(({ attack, next }) => {
    const beat: P3Beat = attack === "melee" ? { kind: "reach-attack" } : { kind: "wave-cast" };
    return [slot("autos", beat), ...Array.from({ length: atLeastOne("the gap after an auto-attack", next) - 1 }, () => slot("autos"))];
  });
}

function smiteTable(count: SpinCount, firstSpin: TickSpan): readonly Slot<P3Phase, P3Beat>[] {
  const { spinGap, windsBeforeLanding, autosResumeAfterLastSpin, openingBlow } = OCELLUS_P3.smite;
  const stage = SMITE_STAGE[count];
  const first = atLeastOne("the smite's first spin", firstSpin);
  const gap = atLeastOne("the gap between spins", spinGap.value);
  const resume = atLeastOne("the autos after the last spin", autosResumeAfterLastSpin.value);
  const winds = windsBeforeLanding.value;
  if (winds >= first) throw new RangeError(`the blades wind ${winds} ticks before a landing, which is before a first spin ${first} ticks in starts`);
  const beats = new Map<number, P3Beat[]>();
  const add = (at: number, beat: P3Beat) => beats.set(at, [...(beats.get(at) ?? []), beat]);
  add(0, { kind: "smite-opens" });
  add(atLeastOne("the smite's opening blow", openingBlow.value.afterStart), { kind: "smite-blow" });
  SPINS[count].forEach((spin, k) => {
    const landing = first + k * gap;
    add(landing - winds, { kind: "spin-winds", spin });
    add(landing - 1, { kind: "spin-due", spin });
    add(landing, { kind: "spin-lands", spin });
  });
  return Array.from({ length: first + (count - 1) * gap + resume }, (_, at) => slot(stage, ...(beats.get(at) ?? [])));
}

export function compileP3Schedule(start: Quadrant, firstSpin: TickSpan): P3Schedule {
  const { firstAttackAfterStart, thresholds, smite } = OCELLUS_P3;
  const arrive = Array.from({ length: firstAttackAfterStart.value }, () => slot("arrive"));
  const smiteStage = (count: SpinCount) => ({ slots: slotTable(smiteTable(count, firstSpin), SMITE_STAGE[count]), breakable: true, then: (): P3Stage => "autos" });
  const script: Script<P3Stage, P3Phase, P3Beat> = {
    first: "arrive",
    stages: {
      arrive: { slots: slotTable(arrive, "arrive"), breakable: true, then: () => "autos" },
      autos: { slots: slotTable(autosTable(), "autos"), breakable: true, then: () => SMITE_STAGE[smite.spinsByQuadrant.value[start]] },
      "smite-1": smiteStage(1),
      "smite-2": smiteStage(2),
      "smite-3": smiteStage(3),
      destroy: { slots: [slot("destroy", { kind: "quadrant-cleared" })], breakable: false, then: () => "destroy" },
    },
    breakpoints: QUADRANTS.filter((quadrant) => quadrant >= start).map((quadrant) => ({ atOrBelow: thresholds.value[quadrant], enter: "destroy" })),
  };
  return new Schedule<P3Stage, P3Phase, P3Beat, never>(script, () => null, { kind: "full-fight" }, { kind: "cycle-start" }, tick(0));
}
