import type { At } from "./drill";
import { FLOOD_NORTH_OF_RING, RING_NORTH, SPAWN_ON_FLOOD, UNDER_BOSS, startDrill } from "./drill";

const EXPLOSIONS = { focus: "explosions" } as const;
const BESIDE_SPAWN: At = { x: 6, y: 1 };
const BOW_ROLLS_24_9_13_53 = 38;

describe("U4 personal explosions", () => {
  test("the series starts at hit + 2, then a mark every 2 ticks from hit + 5 captures the player's tile, and 16 lands on that tile a tick later", () => {
    const drill = startDrill({ selection: EXPLOSIONS });
    drill.tickTo(46);
    expect(drill.events("explosion-series-started")).toEqual([
      { kind: "explosion-series-started", at: 14, void: "inner-void" },
      { kind: "explosion-series-started", at: 45, void: "outer-void" },
    ]);
    expect(drill.events("explosion-marked").map((e) => [e.at, e.void, e.pulse, e.tile])).toEqual([
      [17, "inner-void", 0, { x: 5, y: 1 }], [19, "inner-void", 1, { x: 5, y: 1 }], [21, "inner-void", 2, { x: 5, y: 1 }],
      [23, "inner-void", 3, { x: 5, y: 1 }], [25, "inner-void", 4, { x: 5, y: 1 }], [27, "inner-void", 5, { x: 5, y: 1 }],
    ]);
    const resolved = drill.events("explosion-resolved");
    expect(resolved[0]).toEqual({
      kind: "explosion-resolved", at: 18, void: "inner-void", pulse: 0, tile: { x: 5, y: 1 }, underBoss: false,
      outcome: { kind: "hit", receipt: { requested: 16, applied: 16, beforeHp: 99, afterHp: 83, prayer: null } },
    });
    expect(resolved.map((e) => [e.at, e.pulse, e.outcome.kind === "hit" ? e.outcome.receipt.afterHp : null])).toEqual([
      [18, 0, 83], [20, 1, 67], [22, 2, 51], [24, 3, 35], [26, 4, 19], [28, 5, 3],
    ]);
    drill.dispose();
  });

  test("guard: a one-tile step during each mark tick leaves every mark behind and counts as a dodge", async () => {
    const drill = startDrill({ selection: EXPLOSIONS });
    const steps: readonly (readonly [number, At])[] = [[16, BESIDE_SPAWN], [18, SPAWN_ON_FLOOD], [20, BESIDE_SPAWN], [22, SPAWN_ON_FLOOD], [24, BESIDE_SPAWN], [26, SPAWN_ON_FLOOD]];
    for (const [after, to] of steps) {
      drill.tickTo(after);
      await drill.click(to);
    }
    drill.tickTo(29);
    expect(drill.events("explosion-marked").map((e) => [e.at, e.tile])).toEqual([
      [17, { x: 5, y: 1 }], [19, { x: 6, y: 1 }], [21, { x: 5, y: 1 }], [23, { x: 6, y: 1 }], [25, { x: 5, y: 1 }], [27, { x: 6, y: 1 }],
    ]);
    expect(drill.events("explosion-resolved").map((e) => [e.at, e.outcome.kind])).toEqual([
      [18, "dodged"], [20, "dodged"], [22, "dodged"], [24, "dodged"], [26, "dodged"], [28, "dodged"],
    ]);
    expect(drill.row(28).playerAtPostTick.hp).toBe(99);
    drill.dispose();
  });

  test("guard: a step first taken on the impact tick is late: the hit lands on the marked tile", async () => {
    const drill = startDrill({ selection: EXPLOSIONS });
    drill.tickTo(17);
    await drill.click(BESIDE_SPAWN);
    drill.tickTo(18);
    expect(drill.events("explosion-resolved").map((e) => [e.at, e.outcome.kind, e.tile])).toEqual([[18, "hit", { x: 5, y: 1 }]]);
    expect(drill.row(18).playerAtPostTick.tile).toEqual({ x: 6, y: 1 });
    drill.dispose();
  });

  test("a kill on an impact tick ends the run with the pending mark no longer drawn", async () => {
    const drill = startDrill({ seed: BOW_ROLLS_24_9_13_53, bossHp: 1, selection: EXPLOSIONS });
    await drill.click(RING_NORTH);
    drill.tickTo(15);
    await drill.click(UNDER_BOSS);
    drill.tickTo(17);
    const marked = drill.drawnMarks();
    drill.tickTo(18);
    expect([marked, drill.events("run-ended").map((e) => [e.at, e.reason]), drill.drawnMarks()]).toEqual([[RING_NORTH], [[18, "kill"]], []]);
    drill.dispose();
  });

  test("guard: standing under the boss gives no cover: stepping under on a mark tick leaves that mark behind, and the next mark under the boss hits", async () => {
    const drill = startDrill({ selection: EXPLOSIONS });
    await drill.click(FLOOD_NORTH_OF_RING);
    drill.tickTo(16);
    drill.walkTo(UNDER_BOSS);
    drill.tickTo(20);
    expect(drill.events("explosion-resolved").map((e) => [e.at, e.tile, e.underBoss, e.outcome.kind])).toEqual([
      [18, { x: 5, y: 2 }, false, "avoided"],
      [20, { x: 5, y: 5 }, true, "hit"],
    ]);
    drill.dispose();
  });

  test.each([
    { option: "wiki-six", marks: [15, 17, 19, 21, 23, 25] },
  ] as const)("the $option option sets the count and the first mark, each mark still lands a tick later, and the series still starts at hit + 2", ({ option, marks }) => {
    const drill = startDrill({ selection: { ...EXPLOSIONS, explosions: option } });
    drill.tickTo(30);
    expect([
      drill.events("explosion-series-started").map((e) => e.at),
      drill.events("explosion-marked").map((e) => e.at),
      drill.events("explosion-resolved").map((e) => e.at),
    ]).toEqual([[14], marks, marks.map((at) => at + 1)]);
    drill.dispose();
  });

  test.each([
    { reduction: "the default wiki-60", selection: {}, clickAt: 13, landed: [[16, "passed", 24, 1288], [21, "reduced", 9, 1285], [26, "reduced", 13, 1280], [31, "passed", 53, 1227]] },
    { reduction: "the default wiki-60", selection: {}, clickAt: 14, landed: [[17, "reduced", 24, 1303], [22, "reduced", 9, 1300], [27, "reduced", 13, 1295], [32, "passed", 53, 1242]] },
    { reduction: "the default wiki-60", selection: {}, clickAt: 10, landed: [[13, "passed", 24, 1288], [18, "reduced", 9, 1285], [23, "reduced", 13, 1280], [28, "reduced", 53, 1259], [33, "passed", 0, 1259]] },
    { reduction: "the default wiki-60", selection: {}, clickAt: 11, landed: [[14, "passed", 24, 1288], [19, "reduced", 9, 1285], [24, "reduced", 13, 1280], [29, "passed", 53, 1227], [34, "passed", 0, 1227]] },
    { reduction: "wiki-50", selection: { explosionDamageReduction: "wiki-50" }, clickAt: 14, landed: [[17, "reduced", 24, 1300], [22, "reduced", 9, 1296], [27, "reduced", 13, 1290], [32, "passed", 53, 1237]] },
  ] as const)("under $reduction, a hit that lands from the first mark at 17 to the last impact at 28 loses that share, rounded down: bow shots clicked after P4 tick $clickAt", async ({ selection, clickAt, landed }) => {
    const drill = startDrill({ seed: BOW_ROLLS_24_9_13_53, selection: { ...EXPLOSIONS, ...selection } });
    await drill.click(RING_NORTH);
    drill.tickTo(clickAt);
    await drill.click(UNDER_BOSS);
    drill.tickTo(34);
    expect(drill.events("player-hit-judged").map((e) => [e.at, e.outcome, e.requested, drill.row(e.at).bossHp.atPostTick])).toEqual(landed);
    drill.dispose();
  });

  test.each([
    { bossHp: 8, landed: [[17, "reduced", 8, 0]], splat: [8], ended: [[17, "kill"]] },
    { bossHp: 10, landed: [[17, "reduced", 10, 1]], splat: [9], ended: [] },
  ] as const)("a bow roll of 24 landing at 17 on a boss with $bossHp HP keeps floor(24 x 0.4) = 9 of the roll, capped to the HP left", async ({ bossHp, landed, splat, ended }) => {
    const drill = startDrill({ seed: BOW_ROLLS_24_9_13_53, bossHp, selection: EXPLOSIONS });
    await drill.click(RING_NORTH);
    drill.tickTo(14);
    await drill.click(UNDER_BOSS);
    drill.tickTo(17);
    const judged = drill.events("player-hit-judged").map((e) => [e.at, e.outcome, e.requested, drill.row(e.at).bossHp.atPostTick]);
    expect([judged, drill.boss().hitsThisTick.map((hit) => hit.damage), drill.events("run-ended").map((e) => [e.at, e.reason])]).toEqual([landed, splat, ended]);
    drill.dispose();
  });
});
