import { OCELLUS_P3 } from "../OcellusTimings";
import { span, tick } from "../../../../sim/brands";
import type { TickSpan } from "../../../../sim/brands";
import type { Script, Slot } from "../../../../sim/schedule";
import { Schedule, slotTable } from "../../../../sim/schedule";
import type { BossPosture, P3Beat, P3Phase, P3Stage, Quadrant, SpecialOrder, Spin, SpinCount } from "../P3Types";

export type P3Schedule = Schedule<P3Stage, P3Phase, P3Beat, never>;

const QUADRANTS: readonly Quadrant[] = [1, 2, 3];
const SMITE_STAGE: Readonly<Record<SpinCount, P3Stage>> = { 1: "smite-1", 2: "smite-2", 3: "smite-3" };
const SPINS: Readonly<Record<SpinCount, readonly Spin[]>> = {
  1: [{ nth: 1, of: 1 }],
  2: [{ nth: 1, of: 2 }, { nth: 2, of: 2 }],
  3: [{ nth: 1, of: 3 }, { nth: 2, of: 3 }, { nth: 3, of: 3 }],
};

const POSTURE: Readonly<Record<P3Stage, BossPosture>> = {
  arrive: "chasing",
  autos: "chasing",
  "smite-1": "chasing",
  "smite-2": "chasing",
  "smite-3": "chasing",
  untether: "floating",
  "untether-ends": "chasing",
  destroy: "chasing",
};

const slot = (stage: P3Stage, ...beats: readonly P3Beat[]): Slot<P3Phase, P3Beat> => {
  const phase: P3Phase = { stage, posture: POSTURE[stage] };
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

function untetherTable(): readonly Slot<P3Phase, P3Beat>[] {
  const { floatsFor, magicLandsAfterStart, purpleTiles, borderAfterStart, eruptionAfterBorder, slamAfterBorder } = OCELLUS_P3.untether;
  const eruption = borderAfterStart.value + eruptionAfterBorder.value;
  const slam = borderAfterStart.value + slamAfterBorder.value;
  if (!(eruption < slam && slam < floatsFor.value)) throw new RangeError(`Untether's eruption at ${eruption} must come before its slam at ${slam}, and both inside its float of ${floatsFor.value} ticks`);
  const beats = new Map<number, P3Beat[]>([[0, [{ kind: "untether-starts" }]]]);
  const add = (at: number, beat: P3Beat) => {
    if (at >= floatsFor.value) throw new RangeError(`Untether's ${beat.kind} at ${at} falls after its float of ${floatsFor.value} ticks`);
    beats.set(at, [...(beats.get(at) ?? []), beat]);
  };
  purpleTiles.showAfterStart.value.forEach((at) => add(at, { kind: "purple-tiles-show" }));
  magicLandsAfterStart.value.forEach((at) => add(at, { kind: "untether-magic" }));
  add(borderAfterStart.value, { kind: "border-shows" });
  add(eruption, { kind: "void-erupts" });
  return Array.from({ length: floatsFor.value }, (_, at) => slot("untether", ...(beats.get(at) ?? [])));
}

function nextSpecial(order: SpecialOrder, specialsSoFar: number, smite: P3Stage): P3Stage {
  switch (order) {
    case "alternate":
      return specialsSoFar % 2 === 0 ? smite : "untether";
    case "smite-only":
      return smite;
    default: {
      const unhandled: never = order;
      return unhandled;
    }
  }
}

export function compileP3Schedule(start: Quadrant, firstSpin: TickSpan, specials: SpecialOrder): P3Schedule {
  const { firstAttackAfterStart, thresholds, smite, untether } = OCELLUS_P3;
  const landed = atLeastOne("the autos after Untether's float", span(untether.autosResumeAfterStart.value - untether.floatsFor.value));
  const arrive = Array.from({ length: firstAttackAfterStart.value }, () => slot("arrive"));
  const smiteStage = (count: SpinCount) => ({ slots: slotTable(smiteTable(count, firstSpin), SMITE_STAGE[count]), breakable: true, then: (): P3Stage => "autos" });
  const script: Script<P3Stage, P3Phase, P3Beat> = {
    first: "arrive",
    stages: {
      arrive: { slots: slotTable(arrive, "arrive"), breakable: true, then: () => "autos" },
      autos: {
        slots: slotTable(autosTable(), "autos"),
        breakable: true,
        then: (_, visits) => nextSpecial(specials, visits("smite-1") + visits("smite-2") + visits("smite-3") + visits("untether"), SMITE_STAGE[smite.spinsByQuadrant.value[start]]),
      },
      "smite-1": smiteStage(1),
      "smite-2": smiteStage(2),
      "smite-3": smiteStage(3),
      untether: { slots: slotTable(untetherTable(), "untether"), breakable: false, then: () => "untether-ends" },
      "untether-ends": { slots: slotTable(Array.from({ length: landed }, () => slot("untether-ends")), "untether-ends"), breakable: true, then: () => "autos" },
      destroy: { slots: [slot("destroy", { kind: "quadrant-cleared" })], breakable: false, then: () => "destroy" },
    },
    breakpoints: QUADRANTS.filter((quadrant) => quadrant >= start).map((quadrant) => ({ atOrBelow: thresholds.value[quadrant], enter: "destroy" })),
  };
  return new Schedule<P3Stage, P3Phase, P3Beat, never>(script, () => null, { kind: "full-fight" }, { kind: "cycle-start" }, tick(0));
}
