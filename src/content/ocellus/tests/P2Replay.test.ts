import type { FightLog } from "../js/OcellusTimings";
import { P2_REPLAYS } from "../full/p2/replays";
import type { P2Row } from "../full/p2/types";
import { startP2 } from "./p2run";

/** L2 wrote these portals-lit lines and skipped +42, +53, +84 and +95. The offsets it did write match L1. */
const L2_LIT = [11, 16, 21, 26, 31, 36, 58, 63, 68, 73, 78, 100, 105, 110, 115, 120] as const;

/** Each logged kind's ticks in the run, up to the last tick the log lists for it. */
function replayed(rows: readonly P2Row[], log: FightLog): Readonly<Record<string, readonly number[]>> {
  const table: Record<string, readonly number[]> = {};
  for (const [kind, replay] of Object.entries(P2_REPLAYS)) {
    if (replay.kind !== "log" || replay.log !== log) continue;
    const last = Math.max(...replay.ticks);
    table[kind] = rows.flatMap((row) => row.events.flatMap((event) => (event.kind === kind && row.tick <= last ? [row.tick] : [])));
  }
  return table;
}

function logged(log: FightLog): Readonly<Record<string, readonly number[]>> {
  const table: Record<string, readonly number[]> = {};
  for (const [kind, replay] of Object.entries(P2_REPLAYS)) if (replay.kind === "log" && replay.log === log) table[kind] = replay.ticks;
  return table;
}

describe("phase 2's replay rows match the fight logs at the phase marks", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("L1's blade, lights, pools, safe portal and enough, and every portals-lit tick L2 recorded", () => {
    const f = startP2();
    close = f.close;
    f.tickTo(130);
    const lit = f.ofKind("portals-lit").map(([tick]) => tick);
    expect(replayed(f.rows(), "L1")).toEqual(logged("L1"));
    expect(L2_LIT.every((tick) => lit.includes(tick))).toBe(true);
  });
});
