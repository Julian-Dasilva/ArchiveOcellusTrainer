import { OCELLUS_P3 } from "../OcellusTimingsP3";
import { tick } from "../../../../sim/brands";
import type { Script, Slot } from "../../../../sim/schedule";
import { Schedule, slotTable } from "../../../../sim/schedule";
import type { P3Beat, P3Phase, P3Stage, Quadrant } from "../P3Types";

export type P3Schedule = Schedule<P3Stage, P3Phase, P3Beat, never>;

type Table = readonly [Slot<P3Phase, P3Beat>, ...Slot<P3Phase, P3Beat>[]];

const QUADRANTS: readonly Quadrant[] = [1, 2, 3];
const { chain, specials, spin, untether, insolence } = OCELLUS_P3;

const slot = (phase: P3Phase, beats: readonly P3Beat[]): Slot<P3Phase, P3Beat> => ({ phase: () => phase, beats: beats.map((beat) => () => beat) });

function table(length: number, beatsAt: (offset: number) => readonly P3Beat[], phaseAt: (offset: number) => P3Phase): Table {
  const { stage } = phaseAt(0);
  if (length < 1) throw new RangeError(`the ${stage} stage needs at least 1 tick, not ${length}`);
  return slotTable(Array.from({ length }, (_, offset) => slot(phaseAt(offset), beatsAt(offset))), stage);
}

const chasing = (stage: Extract<P3Phase, { boss: "chasing" }>["stage"]) => (): P3Phase => ({ stage, boss: "chasing" });
const move = (beat: P3Beat) => (offset: number): readonly P3Beat[] => (offset === 0 ? [beat] : []);

function spinTable(): Table {
  const saws = Array.from({ length: spin.saws.value }, (_, saw) => ({ saw, cut: spin.firstCut.value + saw * spin.cutEvery.value }));
  const lastCut = saws[saws.length - 1].cut;
  return table(
    lastCut + spin.nextMoveAfterLastCut.value,
    (offset) => [
      ...(offset === 0 ? [{ kind: "spin-starts" } as const] : []),
      ...(offset === spin.opensAfter.value ? [{ kind: "spin-opens" } as const] : []),
      ...saws.flatMap(({ saw, cut }): P3Beat[] => {
        if (offset === cut - 1) return [{ kind: "saw-tell", saw }];
        if (offset === cut) return [{ kind: "saw-cut", saw, last: cut === lastCut }];
        return [];
      }),
    ],
    (offset) => ({ stage: "spin", boss: offset < lastCut ? "standing" : "chasing" }),
  );
}

function untetherTable(): Table {
  const { magic, slam, fallsOrStandsAt } = untether;
  const at = (offset: number, ticks: readonly number[]) => ticks.some((t) => t === offset);
  return table(
    fallsOrStandsAt.value,
    (offset) => [
      ...(offset === 0 ? [{ kind: "untether-starts" } as const] : []),
      ...(at(offset, magic.value) ? [{ kind: "untether-magic" } as const] : []),
      ...(offset === slam.value ? [{ kind: "untether-slam" } as const] : []),
      ...(offset === slam.value + 1 ? [{ kind: "untether-aftershock" } as const] : []),
    ],
    () => ({ stage: "untether", boss: "levitating" }),
  );
}

function insolenceTable(): Table {
  const slashes = insolence.slashes.value;
  return table(
    insolence.swingsAgain.value,
    (offset) => [...(offset === 0 ? [{ kind: "insolence-starts" } as const] : []), ...slashes.flatMap((t, nth): P3Beat[] => (t === offset ? [{ kind: "superior-slash", nth }] : []))],
    chasing("insolence"),
  );
}

/**
 * Phase 3 as a chain of moves: each stage is one move and lasts until the next. Two swings and a slash make a set; after
 * `setsBeforeSpecial` sets comes the next special in turn. A panic is cut in by the turn when a swing finds nobody in reach.
 */
export function compileP3Schedule(): P3Schedule {
  const { firstAttackAfterStart, thresholds } = OCELLUS_P3;
  const order = specials.value;
  const afterSwingOrPanic = (visits: (stage: P3Stage) => number): P3Stage => ((visits("swing") + visits("panic")) % 2 === 1 ? "swing" : "shadow-slash");
  const script: Script<P3Stage, P3Phase, P3Beat> = {
    first: "arrive",
    stages: {
      arrive: { slots: table(firstAttackAfterStart.value, () => [], chasing("arrive")), breakable: true, then: () => "swing" },
      swing: { slots: table(chain.afterSwing.value, move({ kind: "swing" }), chasing("swing")), breakable: true, then: (_, visits) => afterSwingOrPanic(visits) },
      panic: { slots: table(chain.afterPanic.value, move({ kind: "panic" }), chasing("panic")), breakable: true, then: (_, visits) => afterSwingOrPanic(visits) },
      "shadow-slash": {
        slots: table(chain.afterSlash.value, move({ kind: "shadow-slash" }), chasing("shadow-slash")),
        breakable: true,
        then: (_, visits) => {
          if (visits("shadow-slash") % chain.setsBeforeSpecial.value !== 0) return "swing";
          return order[(visits("spin") + visits("untether") + visits("insolence")) % order.length];
        },
      },
      spin: { slots: spinTable(), breakable: true, then: () => "swing" },
      untether: { slots: untetherTable(), breakable: false, then: () => "untether-ends" },
      "untether-ends": { slots: table(untether.swingsAgain.value - untether.fallsOrStandsAt.value, () => [], chasing("untether-ends")), breakable: true, then: () => "swing" },
      insolence: { slots: insolenceTable(), breakable: true, then: () => "swing" },
      destroy: { slots: [slot({ stage: "destroy", boss: "standing" }, [{ kind: "quadrant-falls" }])], breakable: false, then: () => "destroy" },
    },
    breakpoints: QUADRANTS.map((quadrant) => ({ atOrBelow: thresholds.value[quadrant], enter: "destroy" })),
  };
  return new Schedule<P3Stage, P3Phase, P3Beat, never>(script, () => null, { kind: "full-fight" }, { kind: "cycle-start" }, tick(0));
}
