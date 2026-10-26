import { OCELLUS_P3 } from "../OcellusTimings";
import { span, tick } from "../../../../sim/brands";
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
  const { autos, wave } = OCELLUS_P3;
  const starts = autos.value.map((_, k) => autos.value.slice(0, k).reduce((at, { next }) => at + atLeastOne("the gap after an auto-attack", next), 0));
  const length = starts[starts.length - 1] + atLeastOne("the gap after the last auto-attack", autos.value[autos.value.length - 1].next);
  const aimLead = wave.aimedBeforeCast.value;
  const landsIn = span(aimLead + wave.landsAfterCast.value);
  const beats: readonly (readonly [at: number, beat: P3Beat])[] = autos.value.flatMap(({ attack }, k): readonly (readonly [number, P3Beat])[] => {
    switch (attack) {
      case "melee":
        return [[starts[k], { kind: "reach-attack" }]];
      case "wave":
        if (starts[k] < aimLead) throw new RangeError(`the wave at ${starts[k]} would be aimed before the autos table starts`);
        return [[starts[k] - aimLead, { kind: "wave-aimed", landsIn }], [starts[k], { kind: "wave-cast" }]];
      default: {
        const unhandled: never = attack;
        return unhandled;
      }
    }
  });
  return Array.from({ length }, (_, at) => slot("autos", ...beats.filter(([when]) => when === at).map(([, beat]) => beat)));
}

function smiteTable(count: SpinCount, firstSpin: TickSpan): readonly Slot<P3Phase, P3Beat>[] {
  const stage = SMITE_STAGE[count];
  const first = atLeastOne("the smite's first spin", firstSpin);
  const gap = atLeastOne("the gap between spins", OCELLUS_P3.smite.spinGap.value);
  const resume = atLeastOne("the autos after the last spin", OCELLUS_P3.smite.autosResumeAfterLastSpin.value);
  const landings = new Map(SPINS[count].map((spin, k) => [first + k * gap, spin]));
  return Array.from({ length: first + (count - 1) * gap + resume }, (_, at) => {
    const spin = landings.get(at);
    if (at === 0) return slot(stage, { kind: "smite-opens" });
    return spin ? slot(stage, { kind: "spin-lands", spin }) : slot(stage);
  });
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
