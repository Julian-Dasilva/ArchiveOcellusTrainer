import { Random } from "osrs-sdk";
import type { DrillSelection } from "../js/OcellusTimings";
import { parseDrillRequest } from "../js/OcellusTimings";
import { RING_NORTH, UNDER_BOSS, startDrill } from "./drill";

function posesRequested(selection: DrillSelection, start: number, through: number): [number, number][] {
  const drill = startDrill({ selection });
  drill.region.invincible = true;
  // playAnimation is the SDK's animation output, and jsdom renders no frames, so the spy reads each pose as the boss requests it.
  const play = vi.spyOn(drill.boss(), "playAnimation");
  const requested: [number, number][] = [];
  for (let t = start; t <= through; t++) {
    const before = play.mock.calls.length;
    drill.tickTo(t);
    requested.push(...play.mock.calls.slice(before).map(([id]): [number, number] => [t, id]));
  }
  drill.dispose();
  return requested;
}

describe("U1 cycle skeleton", () => {
  test("floor stages, overheads and boss state follow the reconciled schedule as separate tracks", async () => {
    const drill = startDrill();
    await drill.playCorrectlyTo(128);
    expect(drill.rows().map((row) => row.tick)).toEqual(Array.from({ length: 129 }, (_, t) => t));
    expect(drill.events("stage-entered").map((e) => [e.at, e.stage])).toEqual([
      [0, "lead-in"], [8, "inner-void"], [30, "after-inner"], [39, "outer-void"], [59, "after-outer"],
      [68, "inner-void"], [90, "after-inner"], [99, "outer-void"], [119, "after-outer"], [128, "inner-void"],
    ]);
    expect(drill.events("overhead-switched").map((e) => [e.at, e.overhead])).toEqual([
      [8, "deflect-melee"], [33, "soul-split"], [38, null], [39, "deflect-range"], [61, "soul-split"], [67, null],
      [68, "deflect-melee"], [93, "soul-split"], [98, null], [99, "deflect-range"], [121, "soul-split"], [127, null], [128, "deflect-melee"],
    ]);
    expect(drill.events("boss-state-changed").map((e) => [e.at, e.state])).toEqual([
      [0, "hidden"], [4, "present-damageable"], [8, "present-out-of-melee-reach"], [30, "present-damageable"],
      [68, "present-out-of-melee-reach"], [90, "present-damageable"], [128, "present-out-of-melee-reach"],
    ]);
    expect(drill.events("boss-shouted").map((e) => [e.at, e.text])).toEqual([[5, "End..."]]);
    drill.dispose();
  });

  test("the transition attack ordinal runs across cycles and each selection names its variants", async () => {
    const hits = async (options: Parameters<typeof startDrill>[0]) => {
      const drill = startDrill({ ...options, selection: { focus: "transition-attacks", ...options?.selection } });
      await drill.playCorrectlyTo(217);
      const out = drill.rows().flatMap((row) => row.beats.flatMap((b) => (b.kind === "special-hit" ? [[row.tick, b.ordinal, b.variant]] : [])));
      drill.dispose();
      return out;
    };
    expect(await hits({ selection: { specialSelection: "replay-v2" } })).toEqual([
      [37, 0, "vortex"], [65, 1, "spike-disk"], [97, 2, "black-disk"], [125, 3, "vortex"], [157, 4, "spike-disk"], [185, 5, "black-disk"], [217, 6, "vortex"],
    ]);
    expect(await hits({ seed: 1 })).toEqual([
      [37, 0, "black-disk"], [65, 1, "black-disk"], [97, 2, "spike-disk"], [125, 3, "spike-disk"], [157, 4, "spike-disk"], [185, 5, "vortex"], [217, 6, "black-disk"],
    ]);
    expect(await hits({ seed: 2 })).toEqual([
      [37, 0, "vortex"], [65, 1, "spike-disk"], [97, 2, "vortex"], [125, 3, "black-disk"], [157, 4, "black-disk"], [185, 5, "vortex"], [217, 6, "spike-disk"],
    ]);
  });

  test("a focus starts 5 ticks before its mechanic first acts, keeps the cycle running from there and lets only its mechanic's beats act", () => {
    const drill = startDrill({ selection: { focus: "transition-attacks" } });
    drill.tickTo(67);
    expect(drill.rows().flatMap((row) => row.beats.map((b) => [row.tick, b.kind]))).toEqual([
      [29, "boss-landing-starts"], [32, "special-tell"], [32, "special-sound"], [37, "special-hit"], [37, "special-sound"], [39, "soul-split-heal"],
      [60, "special-tell"], [60, "special-sound"], [65, "special-hit"], [65, "special-sound"], [67, "soul-split-heal"],
    ]);
    expect(drill.events("stage-entered").map((e) => [e.at, e.stage])).toEqual([[30, "after-inner"], [39, "outer-void"], [59, "after-outer"]]);
    drill.dispose();
  });

  test.each([
    [{ focus: "full-fight" }, 0],
    [{ focus: "void-floor" }, 5],
    [{ focus: "lifeforce-orb" }, 6],
    [{ focus: "orb-retrieval" }, 5],
    [{ focus: "explosions" }, 9],
    [{ focus: "transition-attacks" }, 27],
    [{ focus: "boss-heals" }, 6],
    [{ focus: "rifts" }, 62],
    [{ focus: "floor-holes" }, 0],
    [{ focus: "rifts", drillStart: "cycle-start" }, 0],
  ] as const)("the run under %o starts on P4 tick %i", (selection, start) => {
    const drill = startDrill({ selection });
    drill.tickTo(start + 1);
    expect(drill.rows().map((row) => row.tick)).toEqual([start, start + 1]);
    drill.dispose();
  });

  test.each([
    [{ focus: "explosions" }, 9, 33, [[29, 14865]]],
    [{ focus: "transition-attacks" }, 27, 33, [[29, 14865], [32, 14844]]],
  ] as const)("a drill under %o that joins the inner void at P4 tick %i requests through %i only the poses of its later beats, not the void's rise: %j", (selection, start, through, poses) => {
    expect(posesRequested(selection, start, through)).toEqual(poses);
  });

  test.each([
    [{ focus: "full-fight" }, 0, 33, [[8, 14863], [29, 14865], [32, 14844]]],
    [{ focus: "void-floor" }, 5, 33, [[8, 14863], [29, 14865]]],
    [{ focus: "lifeforce-orb" }, 6, 33, [[8, 14863], [29, 14865]]],
    [{ focus: "orb-retrieval" }, 5, 33, [[8, 14863], [29, 14865]]],
    [{ focus: "boss-heals" }, 6, 33, [[8, 14863], [29, 14865], [32, 14844]]],
    [{ focus: "rifts" }, 62, 68, [[68, 14863]]],
    [{ focus: "floor-holes" }, 0, 33, [[8, 14863], [29, 14865]]],
  ] as const)("guard: under %o, from its start at P4 tick %i through %i the boss requests the pose of every stage and beat that begins there: %j", (selection, start, through, poses) => {
    expect(posesRequested(selection, start, through)).toEqual(poses);
  });

  test("GET READY ticks write no row, and the first boss step is P4 tick 0", () => {
    const drill = startDrill();
    drill.tickTo(0);
    expect(drill.rows().map((row) => [row.tick, row.worldTick, row.phase])).toEqual([
      [0, 6, { stage: "lead-in", boss: "hidden", overhead: null }],
    ]);
    drill.dispose();
  });

  test("the boss enters phase 4 at the selected share of the selected max HP", () => {
    const entry = (options: Parameters<typeof startDrill>[0]) => {
      const drill = startDrill(options);
      const boss = drill.region.snapshot()?.boss;
      drill.dispose();
      return boss;
    };
    expect(entry({})).toEqual({ npcId: 16677, hp: 1312, maxHp: 5250, visible: false, defence: 250 });
    expect(entry({ selection: { bossMaxHp: "footage-fit" } })).toEqual({ npcId: 16677, hp: 1355, maxHp: 5420, visible: false, defence: 250 });
    expect(entry({ selection: { entryHpFraction: "v1-observed" } })).toEqual({ npcId: 16677, hp: 1307, maxHp: 5250, visible: false, defence: 250 });
  });

  test("guard: a restart starts a new run: entry HP again and a log from P4 tick 0", async () => {
    const drill = startDrill({ seed: 100 });
    drill.tickTo(4);
    await drill.click(UNDER_BOSS);
    drill.tickTo(9);
    expect(drill.region.snapshot()?.boss.hp).toBe(1258);
    drill.restart();
    drill.tickTo(1);
    expect([drill.region.snapshot()?.boss.hp, drill.rows().map((row) => row.tick)]).toEqual([1312, [0, 1]]);
    drill.dispose();
  });

  test("guard: the boss is hidden through P4 tick 3, then drawn, targetable and damageable from 4, so a shot from the lead-in lands in full before the first inner void", async () => {
    const drill = startDrill();
    const presence = [0, 1, 2, 3, 4].map((t) => {
      drill.tickTo(t);
      return [drill.region.snapshot()?.boss.visible, drill.boss().canBeAttacked()];
    });
    expect(presence).toEqual([[false, false], [false, false], [false, false], [false, false], [true, true]]);
    drill.dispose();
    const shotFromTheRing = async (clickAt: number) => {
      const shooter = startDrill({ seed: 100 });
      await shooter.click(RING_NORTH);
      shooter.tickTo(clickAt);
      await shooter.click(UNDER_BOSS);
      shooter.tickTo(clickAt + 3);
      const landed = [shooter.events("player-hit-judged").map((e) => [e.at, e.outcome, e.requested]), shooter.row(clickAt + 3).bossHp];
      shooter.dispose();
      return landed;
    };
    expect([await shotFromTheRing(4), await shotFromTheRing(5)]).toEqual([
      [[[7, "passed", 54]], { atBossStep: 1312, atPostTick: 1258 }],
      [[[8, "passed", 54]], { atBossStep: 1312, atPostTick: 1258 }],
    ]);
  });

  test("guard: a lethal hit on the boss ends the run before that tick's beats act", async () => {
    const drill = startDrill({ seed: 100, bossHp: 1 });
    drill.tickTo(8);
    await drill.click(UNDER_BOSS);
    drill.tickTo(20);
    expect(drill.events("run-ended").map((e) => [e.at, e.reason])).toEqual([[12, "kill"]]);
    expect(drill.rows().slice(-2).map((row) => [row.tick, row.beats.map((b) => b.kind)])).toEqual([[11, ["lifeforce-tell", "floor-damage"]], [12, []]]);
    expect(drill.region.snapshot()?.run).toEqual({ kind: "ended", at: 12, reason: "kill" });
    expect([drill.row(12).events.map((e) => e.kind), drill.row(12).playerAtPostTick.hp]).toEqual([["player-hit-judged", "run-ended"], 99]);
    drill.dispose();
    const idle = startDrill({ seed: 100, bossHp: 1 });
    idle.tickTo(12);
    expect([idle.row(12).events.map((e) => e.kind), idle.row(12).playerAtPostTick.hp]).toEqual([["lifeforce-drained", "orb-spawned"], 50]);
    idle.dispose();
  });

  test.each([
    {
      at: 8,
      clickAt: 4,
      phase: { stage: "inner-void", cycle: 1, boss: "present-out-of-melee-reach", overhead: "deflect-melee" },
      entered: [
        { kind: "stage-entered", at: 8, stage: "inner-void" },
        { kind: "overhead-switched", at: 8, overhead: "deflect-melee" },
        { kind: "boss-state-changed", at: 8, state: "present-out-of-melee-reach" },
      ],
    },
    {
      at: 39,
      clickAt: 36,
      phase: { stage: "outer-void", cycle: 1, boss: "present-damageable", overhead: "deflect-range" },
      entered: [
        { kind: "stage-entered", at: 39, stage: "outer-void" },
        { kind: "overhead-switched", at: 39, overhead: "deflect-range" },
      ],
    },
  ])("guard: a lethal hit on phase-change tick $at logs the phase that tick enters and none of its beats", async ({ at, clickAt, phase, entered }) => {
    const drill = startDrill({ seed: 100, bossHp: 1 });
    await drill.playCorrectlyTo(clickAt);
    await drill.click(UNDER_BOSS);
    drill.tickTo(at + 2);
    const row = drill.row(at);
    expect([row.phase, row.beats, row.events]).toEqual([
      phase,
      [],
      [
        { kind: "player-hit-judged", at, style: "ranged", outcome: "passed", requested: 1 },
        ...entered,
        { kind: "run-ended", at, reason: "kill" },
      ],
    ]);
    drill.dispose();
  });

  test("guard: a lethal hit on the player ends the run on the tick it lands", () => {
    const drill = startDrill({ selection: { focus: "void-floor" } });
    drill.tickTo(60);
    expect(drill.events("run-ended").map((e) => [e.at, e.reason])).toEqual([[54, "death"]]);
    expect(drill.rows().map((row) => row.tick).slice(-1)).toEqual([54]);
    expect(drill.row(54).playerAtPostTick.hp).toBe(0);
    drill.dispose();
  });

  test("the log records a walk order and a protection prayer on the row they act in", () => {
    const drill = startDrill();
    drill.tickTo(9);
    drill.walkTo({ x: 9, y: 1 });
    drill.tickTo(10);
    drill.pray("Protect from Magic");
    drill.tickTo(11);
    expect([drill.row(10).inputs, drill.row(10).playerAtPostTick.tile]).toEqual([[{ kind: "walk-ordered", destination: { x: 9, y: 1 }, pace: "run-setting" }], { x: 7, y: 1 }]);
    expect([drill.row(11).inputs, drill.row(11).playerAtBossStep.prayer]).toEqual([[{ kind: "prayer-published", prayer: "magic" }], "magic"]);
    drill.dispose();
  });

  test("a Control-click walk order walks one tile a tick with run on, and the log records its pace", () => {
    const drill = startDrill();
    drill.tickTo(9);
    drill.player().moveTo(9, 1, "walk");
    drill.tickTo(13);
    expect([drill.row(10).inputs, [10, 11, 12, 13].map((t) => drill.row(t).playerAtPostTick.tile), drill.player().running]).toEqual([
      [{ kind: "walk-ordered", destination: { x: 9, y: 1 }, pace: "walk" }],
      [{ x: 6, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 1 }, { x: 9, y: 1 }],
      true,
    ]);
    drill.dispose();
  });

  test("guard: native combat rolls replay from the seed, and the SDK's random source is restored between ticks", async () => {
    const fight = async (global: number) => {
      Random.setRandom(() => global);
      const drill = startDrill({ selection: { focus: "rifts", drillStart: "cycle-start" } });
      drill.tickTo(8);
      await drill.click(UNDER_BOSS);
      drill.tickTo(40);
      const out = { bossHp: drill.rows().map((row) => row.bossHp.atPostTick), draws: drill.rows().reduce((sum, row) => sum + row.combatDraws, 0), after: Random.get() };
      drill.dispose();
      return out;
    };
    const original = Random.randomFn;
    const [low, high] = [await fight(0.25), await fight(0.75)];
    Random.setRandom(original);
    expect([low.after, high.after]).toEqual([0.25, 0.75]);
    expect(low.bossHp).toEqual(high.bossHp);
    expect([low.bossHp[low.bossHp.length - 1], low.draws]).toEqual([1267, 9]);
  });

  test("the URL selects data-file options and lists unknown keys, options and seeds by name", () => {
    const parsed = parseDrillRequest(new URL("http://127.0.0.1:8002/?seed=7&explosions=wiki-six&focus=everything&nope=1"), () => 99);
    expect([parsed.config.seed, parsed.config.choices.explosions.key, parsed.config.choices.focus.key, parsed.rejected]).toEqual([
      7, "wiki-six", "full-fight", ["nope=1", "focus=everything"],
    ]);
    const unseeded = parseDrillRequest(new URL("http://127.0.0.1:8002/?seed=-3"), () => 99);
    expect([unseeded.config.seed, unseeded.rejected]).toEqual([99, ["seed=-3"]]);
  });
});
