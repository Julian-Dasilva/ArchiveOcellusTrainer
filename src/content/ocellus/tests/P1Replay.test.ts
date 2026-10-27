import type { FightLog } from "../js/OcellusTimings";
import { P1_REPLAYS } from "../full/p1/replays";
import type { P1Row } from "../full/p1/types";
import { startP1 } from "./p1run";

/** Each logged kind's ticks in the run, up to the last tick the log lists for it. */
function replayed(rows: readonly P1Row[], log: FightLog): Readonly<Record<string, readonly number[]>> {
  const table: Record<string, readonly number[]> = {};
  for (const [kind, replay] of Object.entries(P1_REPLAYS)) {
    if (replay.kind !== "log" || replay.log !== log) continue;
    const last = Math.max(...replay.ticks);
    table[kind] = rows.flatMap((row) => row.events.flatMap((event) => (event.kind === kind && row.tick <= last ? [row.tick] : [])));
  }
  return table;
}

function logged(log: FightLog): Readonly<Record<string, readonly number[]>> {
  const table: Record<string, readonly number[]> = {};
  for (const [kind, replay] of Object.entries(P1_REPLAYS)) if (replay.kind === "log" && replay.log === log) table[kind] = replay.ticks;
  return table;
}

describe("phase 1's replay rows match the fight log at the phase marks", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("L1's shout is tick 0 and the first volley is tick 4", () => {
    const f = startP1();
    close = f.close;
    f.tickTo(4);
    expect(replayed(f.rows(), "L1")).toEqual(logged("L1"));
  });
});
