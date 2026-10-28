import { createHash } from "node:crypto";
import fs from "node:fs";
import { Settings, TrainerInstance } from "osrs-sdk";
import type { Quadrant } from "../../src/content/ocellus/fight/geometry";
import { carriedEntry, quadrantFrame } from "../../src/content/ocellus/full/fall";
import type { DrillSelection } from "../../src/content/ocellus/js/OcellusTimings";
import { OCELLUS_P4, fullFightConfig } from "../../src/content/ocellus/js/OcellusTimings";
import type { P4Entry, P4Watch } from "../../src/content/ocellus/js/p4/phase";
import { p4Phase } from "../../src/content/ocellus/js/p4/phase";
import { startDrill } from "../../src/content/ocellus/tests/drill";
import { seed, tick } from "../../src/sim/brands";
import { toRoom } from "../../src/sim/frame";
import { EncounterRegion } from "../../src/sim/sdk/EncounterRegion";
import { fence } from "../../src/sim/sdk/fence";

type Focus = NonNullable<DrillSelection["focus"]>;
type Play = "correct" | "idle";
type FightRun = Readonly<{ name: string; seed: number; selection: DrillSelection; play: Play; to: number }>;

const FOCUSES: readonly Focus[] = ["void-floor", "floor-holes", "lifeforce-orb", "explosions", "transition-attacks", "rifts"];

const RUNS: readonly FightRun[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 100].map((seed): FightRun => ({ name: `full-correct-${seed}`, seed, selection: {}, play: "correct", to: 260 })),
  ...[1, 2, 4, 100].map((seed): FightRun => ({ name: `full-idle-${seed}`, seed, selection: {}, play: "idle", to: 200 })),
  ...FOCUSES.flatMap((focus): FightRun[] => [
    { name: `${focus}-correct`, seed: 3, selection: { focus }, play: "correct", to: 200 },
    { name: `${focus}-cycle-start`, seed: 9, selection: { focus, drillStart: "cycle-start" }, play: "correct", to: 200 },
  ]),
  { name: "replay-v2-correct", seed: 1, selection: { specialSelection: "replay-v2" }, play: "correct", to: 200 },
  { name: "holes-v1-turn", seed: 5, selection: { floorHoleLayout: "v1-turn" }, play: "correct", to: 200 },
];

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

type CarriedRun = Readonly<{ name: string; seed: number; standing: Quadrant; to: number }>;

/** Phase 4 as the full fight runs it with Practice on: carried into the quadrant left standing, every choice at its default. */
const CARRIED: readonly CarriedRun[] = (["NW", "SE"] as const).flatMap((standing) => [1, 4].map((runSeed): CarriedRun => ({ name: `carried-${standing}-practice-${runSeed}`, seed: runSeed, standing, to: 200 })));

function carriedFight(run: CarriedRun) {
  Settings.readFromStorage();
  const entry: P4Entry = carriedEntry({ tick: tick(0), standing: run.standing, boss: { hp: 1313, defence: 250 }, voids: [] }, fullFightConfig(seed(run.seed)));
  const frame = quadrantFrame(run.standing);
  const watch: P4Watch = { invincible: true, mounted: null };
  const region = new EncounterRegion({
    room: { size: frame.size, drawFloor() {}, mount: (on) => ({ dispose() {}, walkable: (tiles) => void fence(on, tiles) }), spawn: toRoom(frame, OCELLUS_P4.geometry.playerSpawn.value) },
    phases: { p4: p4Phase<Readonly<{ p4: P4Entry }>>(watch) },
    start: { phase: "p4", entry },
    seed: seed(run.seed),
  });
  const trainer = new TrainerInstance(region);
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.getReadyTimer = 0;
  for (let guard = 0; (region.rows("p4").at(-1)?.tick ?? 0) < run.to && watch.mounted?.ocellus.runState().kind !== "ended"; guard++) {
    if (guard > run.to + 20) throw new Error(`${run.name} never reached P4 tick ${run.to}`);
    region.world.tickWorld();
  }
  const log = JSON.stringify(region.rows("p4"));
  const boss = watch.mounted && { hp: watch.mounted.ocellus.currentStats.hitpoint, run: watch.mounted.ocellus.runState() };
  trainer.dispose();
  return { log: JSON.parse(log), snapshot: plain(boss), bytes: createHash("sha256").update(log).digest("hex") };
}

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
    const log = JSON.stringify(drill.region.fightLog());
    fights[run.name] = { log: JSON.parse(log), snapshot: plain(drill.region.snapshot()), bytes: createHash("sha256").update(log).digest("hex") };
  }
  for (const run of CARRIED) fights[run.name] = carriedFight(run);
  fs.writeFileSync(out, `${JSON.stringify(fights, null, 1)}\n`);
  expect(Object.keys(fights)).toEqual([...RUNS, ...CARRIED].map(({ name }) => name));
});
