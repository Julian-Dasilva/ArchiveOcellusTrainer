import fs from "node:fs";
import type { DrillSelection } from "../../src/content/ocellus/js/OcellusTimings";
import { startDrill } from "../../src/content/ocellus/tests/drill";

type Focus = NonNullable<DrillSelection["focus"]>;
type Play = "correct" | "idle";
type FightRun = Readonly<{ name: string; seed: number; selection: DrillSelection; play: Play; to: number }>;

const FOCUSES: readonly Focus[] = ["void-floor", "floor-holes", "lifeforce-orb", "explosions", "transition-attacks", "rifts"];

const RUNS: readonly FightRun[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed): FightRun => ({ name: `full-correct-${seed}`, seed, selection: {}, play: "correct", to: 260 })),
  ...[1, 2].map((seed): FightRun => ({ name: `full-idle-${seed}`, seed, selection: {}, play: "idle", to: 200 })),
  ...FOCUSES.flatMap((focus): FightRun[] => [
    { name: `${focus}-correct`, seed: 3, selection: { focus }, play: "correct", to: 200 },
    { name: `${focus}-cycle-start`, seed: 9, selection: { focus, drillStart: "cycle-start" }, play: "correct", to: 200 },
  ]),
  { name: "replay-v2-correct", seed: 1, selection: { specialSelection: "replay-v2" }, play: "correct", to: 200 },
  { name: "holes-v1-turn", seed: 5, selection: { floorHoleLayout: "v1-turn" }, play: "correct", to: 200 },
];

const withoutEvidence = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutEvidence);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "evidence").map(([key, inner]) => [key, withoutEvidence(inner)]));
  }
  return value;
};

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test("seeded fights", async () => {
  const out = process.env.PARITY_OUT;
  if (out === undefined) throw new Error("set PARITY_OUT to the dump's path");
  const fights: Record<string, unknown> = {};
  for (const run of RUNS) {
    const drill = startDrill({ seed: run.seed, selection: run.selection });
    switch (run.play) {
      case "correct":
        await drill.playCorrectlyTo(run.to);
        break;
      case "idle":
        drill.tickTo(run.to);
        break;
      default: {
        const unknownPlay: never = run.play;
        throw new Error(`unknown play ${String(unknownPlay)}`);
      }
    }
    fights[run.name] = { log: withoutEvidence(plain(drill.region.fightLog())), snapshot: plain(drill.region.snapshot()) };
  }
  fs.writeFileSync(out, `${JSON.stringify(fights, null, 1)}\n`);
  expect(Object.keys(fights)).toEqual(RUNS.map(({ name }) => name));
});
