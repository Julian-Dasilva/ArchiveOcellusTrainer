import type { DrillSelection } from "../js/OcellusTimings";
import type { At } from "./drill";
import { startDrill } from "./drill";

const ORB_DRILL = { focus: "lifeforce-orb" } as const;
const INNER_ORB_SEED = 75;
const INNER_ORB: At = { x: 9, y: 4 };
const BESIDE_INNER_ORB: At = { x: 9, y: 3 };
const PAST_INNER_ORB: At = { x: 9, y: 5 };
const OUTER_ORB_FROM_SPAWN: At = { x: 4, y: 3 };
const NEAR_PLAYER_OUTER_ORB = { outerOrbTile: "safe-floor" } as const;
const V1_TURN = { floorHoleLayout: "v1-turn" } as const;

async function waitOnFirstInnerOrbUnderExplosions(dodgeFirst: boolean) {
  const drill = startDrill({ seed: INNER_ORB_SEED });
  drill.tickTo(12);
  await drill.click(INNER_ORB);
  if (dodgeFirst) {
    drill.tickTo(16);
    await drill.click(BESIDE_INNER_ORB);
    drill.tickTo(17);
    await drill.click(INNER_ORB);
  }
  drill.tickTo(26);
  return drill;
}

async function returnsAfterClickingAt(clickedAfter: number, selection: DrillSelection = {}) {
  const drill = startDrill({ selection: { ...ORB_DRILL, ...selection } });
  drill.tickTo(clickedAfter);
  await drill.click(drill.innerOrb());
  drill.tickTo(36);
  const observed = [drill.events("orb-returned").map((e) => e.at), drill.events("orb-expired").map((e) => e.at)];
  drill.dispose();
  return observed;
}

describe("U3 lifeforce hit and orb", () => {
  test("the lifeforce hit takes floor(current HP / 2) through any protection prayer", () => {
    const drill = startDrill({ selection: ORB_DRILL });
    drill.tickTo(10);
    drill.pray("Protect from Magic");
    drill.tickTo(40);
    drill.pray("Protect from Melee");
    drill.tickTo(43);
    expect(drill.events("lifeforce-told").map((e) => [e.at, e.void])).toEqual([[11, "inner-void"], [42, "outer-void"]]);
    expect(drill.events("lifeforce-drained").map((e) => [e.at, e.receipt])).toEqual([
      [12, { requested: 49, applied: 49, beforeHp: 99, afterHp: 50, prayer: "magic" }],
      [43, { requested: 25, applied: 25, beforeHp: 50, afterHp: 25, prayer: "melee" }],
    ]);
    drill.dispose();
  });

  test("guard: the inner orb forms on (9, 4) on the hit tick, 12, and returns the stolen HP once to a player waiting on it, on the tick it matures, 24", async () => {
    const drill = startDrill({ seed: INNER_ORB_SEED, selection: ORB_DRILL });
    drill.tickTo(12);
    expect(drill.events("orb-spawned").map((e) => [e.at, e.void, e.tile, e.credit])).toEqual([[12, "inner-void", { x: 9, y: 4 }, 49]]);
    await drill.click(INNER_ORB);
    drill.tickTo(29);
    expect(drill.row(16).playerAtBossStep.tile).toEqual({ x: 9, y: 4 });
    expect(drill.events("orb-matured").map((e) => [e.at, e.tile])).toEqual([[24, { x: 9, y: 4 }]]);
    expect(drill.events("orb-returned").map((e) => [e.at, e.tile, e.receipt])).toEqual([[24, { x: 9, y: 4 }, { requested: 49, applied: 49, beforeHp: 50, afterHp: 99 }]]);
    expect(drill.row(24).playerAtPostTick.hp).toBe(99);
    drill.dispose();
  });

  test("guard: a run collects the orb only where it ends the tick: crossing the glowing (9, 4) from (9, 3) to (9, 5) on 25 returns nothing, and stopping on it at 28 returns the HP at 29", async () => {
    const drill = startDrill({ seed: INNER_ORB_SEED, selection: ORB_DRILL });
    drill.tickTo(13);
    await drill.click(BESIDE_INNER_ORB);
    drill.tickTo(24);
    await drill.click(PAST_INNER_ORB);
    drill.tickTo(27);
    await drill.click(INNER_ORB);
    drill.tickTo(30);
    const observed = {
      tiles: [24, 25, 28].map((t) => [t, drill.row(t).playerAtPostTick.tile]),
      returned: drill.events("orb-returned").map((e) => [e.at, e.receipt]),
    };
    drill.dispose();
    expect(observed).toEqual({
      tiles: [[24, { x: 9, y: 3 }], [25, { x: 9, y: 5 }], [28, { x: 9, y: 4 }]],
      returned: [[29, { requested: 49, applied: 49, beforeHp: 50, afterHp: 99 }]],
    });
  });

  test("guard: the inner orb stays 6 ticks after the inner void clears at 30: its last pickup returns at 36, and arriving at the end of 36 is too late", async () => {
    expect([await returnsAfterClickingAt(33), await returnsAfterClickingAt(34)]).toEqual([
      [[36], []],
      [[], [36]],
    ]);
  });

  test("guard: the adjacent pickup option returns the orb to a player beside it; the default needs its tile", async () => {
    const standBeside = async (selection: DrillSelection) => {
      const drill = startDrill({ seed: INNER_ORB_SEED, selection: { ...ORB_DRILL, ...selection } });
      drill.tickTo(13);
      await drill.click(BESIDE_INNER_ORB);
      drill.tickTo(36);
      const observed = [drill.events("orb-returned").map((e) => [e.at, e.receipt.afterHp]), drill.events("orb-expired").map((e) => e.at)];
      drill.dispose();
      return observed;
    };
    expect([await standBeside({ orbPickupRadius: "adjacent" }), await standBeside({})]).toEqual([
      [[[24, 99]], []],
      [[], [36]],
    ]);
  });

  test("guard: the default outer orb forms on the rim tile farthest from where the player stepped into the 5x5, not from where they stand at the hit, or from the player who never entered", async () => {
    const outerOrbAfterEntering = async (clicks: readonly At[], selection: DrillSelection = {}) => {
      const drill = startDrill({ selection: { ...ORB_DRILL, ...selection } });
      for (const [i, on] of clicks.entries()) {
        drill.tickTo(34 + 3 * i);
        await drill.click(on);
      }
      drill.tickTo(43);
      const observed = drill.events("orb-spawned").filter((e) => e.void === "outer-void").map((e) => e.tile);
      drill.dispose();
      return observed;
    };
    expect([
      await outerOrbAfterEntering([{ x: 3, y: 3 }]),
      await outerOrbAfterEntering([{ x: 7, y: 3 }]),
      await outerOrbAfterEntering([{ x: 3, y: 3 }, { x: 7, y: 3 }]),
      await outerOrbAfterEntering([]),
      await outerOrbAfterEntering([{ x: 3, y: 3 }], NEAR_PLAYER_OUTER_ORB),
    ]).toEqual([[{ x: 7, y: 7 }], [{ x: 3, y: 7 }], [{ x: 7, y: 7 }], [{ x: 3, y: 7 }], [{ x: 6, y: 3 }]]);
  });

  test("guard: clicks onto (3, 2) and then over the hidden boss's corner onto (5, 4) run in through (4, 3), so the outer orb forms on the rim tile farthest from it, (7, 7)", async () => {
    const drill = startDrill({ selection: { ...ORB_DRILL, drillStart: "cycle-start" } });
    drill.tickTo(0);
    await drill.click({ x: 3, y: 2 });
    drill.tickTo(2);
    await drill.click({ x: 5, y: 4 });
    drill.tickTo(43);
    const walked = drill.rows().filter((row) => row.tick <= 3).map((row) => [row.tick, row.phase.boss, row.inputs.flatMap((input) => (input.kind === "walk-ordered" ? [input.destination] : [])), row.playerAtPostTick.tile]);
    const outerOrb = drill.events("orb-spawned").filter((e) => e.void === "outer-void").map((e) => [e.at, e.tile]);
    drill.dispose();
    expect({ walked, outerOrb }).toEqual({
      walked: [
        [0, "hidden", [], { x: 5, y: 1 }],
        [1, "hidden", [{ x: 3, y: 2 }], { x: 3, y: 2 }],
        [2, "hidden", [], { x: 3, y: 2 }],
        [3, "hidden", [{ x: 5, y: 4 }], { x: 5, y: 4 }],
      ],
      outerOrb: [[43, { x: 7, y: 7 }]],
    });
  });

  test("guard: an unclaimed outer orb heals the boss by its credit at hit + 19 (62); an unclaimed inner orb or a collected outer orb does not", async () => {
    const run = async (selection: DrillSelection, collectOuterOrb = false) => {
      const drill = startDrill({ selection: { ...ORB_DRILL, ...NEAR_PLAYER_OUTER_ORB, ...selection } });
      drill.tickTo(44);
      if (collectOuterOrb) await drill.click(OUTER_ORB_FROM_SPAWN);
      drill.tickTo(63);
      const observed = [
        drill.events("orb-expired").map((e) => [e.at, e.void, e.tile, e.credit]),
        drill.events("boss-healed").map((e) => [e.at, e.cause, e.receipt]),
        drill.row(62).bossHp,
      ];
      drill.dispose();
      return observed;
    };
    const expired = [[36, "inner-void", { x: 1, y: 5 }, 49], [61, "outer-void", { x: 4, y: 3 }, 25]];
    expect([await run({}), await run({ unclaimedOuterOrb: "off" }), await run({}, true)]).toEqual([
      [expired, [[62, { kind: "unclaimed-orb" }, { requested: 25, applied: 25, beforeHp: 1312, afterHp: 1337 }]], { atBossStep: 1312, atPostTick: 1337 }],
      [expired, [], { atBossStep: 1312, atPostTick: 1312 }],
      [[expired[0]], [], { atBossStep: 1312, atPostTick: 1312 }],
    ]);
  });

  test("guard: a return can pass max HP: HP regenerates at 199 between the fourth inner hit and its return", async () => {
    const drill = startDrill({ selection: { ...ORB_DRILL, drillStart: "cycle-start" } });
    await drill.playCorrectlyTo(206);
    expect(drill.events("orb-returned").map((e) => [e.at, e.receipt.requested, e.receipt.beforeHp, e.receipt.afterHp])).toEqual([
      [24, 49, 50, 99], [49, 49, 50, 99], [84, 49, 50, 99], [109, 49, 50, 99], [144, 49, 50, 99], [169, 49, 50, 99], [204, 49, 51, 100],
    ]);
    expect(drill.row(204).playerAtPostTick.hp).toBe(100);
    drill.dispose();
  });

  test("guard: an orb return due on the tick an explosion kills the player is skipped", async () => {
    const retrieve = async (dodgeFirst: boolean) => {
      const drill = await waitOnFirstInnerOrbUnderExplosions(dodgeFirst);
      const observed = {
        explosionHits: drill.events("explosion-resolved").flatMap((e) => (e.at <= 24 && e.outcome.kind === "hit" ? [[e.at, e.outcome.receipt.afterHp]] : [])),
        returned: drill.events("orb-returned").map((e) => [e.at, e.receipt.beforeHp, e.receipt.afterHp]),
        ended: drill.events("run-ended").map((e) => [e.at, e.reason]),
        hpAt24: drill.row(24).playerAtPostTick.hp,
      };
      drill.dispose();
      return observed;
    };
    expect(await retrieve(false)).toEqual({
      explosionHits: [[18, 35], [20, 21], [22, 6], [24, 0]],
      returned: [],
      ended: [[24, "death"]],
      hpAt24: 0,
    });
    expect(await retrieve(true)).toEqual({
      explosionHits: [[20, 36], [22, 21], [24, 7]],
      returned: [[24, 7, 56]],
      ended: [],
      hpAt24: 56,
    });
  });

  test("guard: on the tick an orb return falls due, the row lists the explosion hit that landed before it", async () => {
    const drill = await waitOnFirstInnerOrbUnderExplosions(true);
    const settled = drill.row(24).events.flatMap((e): (string | number)[][] => {
      if (e.kind === "orb-returned") return [[e.kind, e.receipt.beforeHp, e.receipt.afterHp]];
      if (e.kind === "explosion-resolved" && e.outcome.kind === "hit") return [[e.kind, e.outcome.receipt.beforeHp, e.outcome.receipt.afterHp]];
      return [];
    });
    drill.dispose();
    expect(settled).toEqual([["explosion-resolved", 21, 7], ["orb-returned", 7, 56]]);
  });

  test("guard: an orb never forms on a floor hole: seed 10's inner orb from the spawn", async () => {
    const drill = startDrill({ seed: 10, selection: V1_TURN });
    await drill.playCorrectlyTo(12);
    expect([drill.region.fightLog().header.choices.floorHoleLayout.key, drill.events("orb-spawned").map((e) => [e.at, e.void, e.tile])]).toEqual([
      "v1-turn", [[12, "inner-void", { x: 8, y: 4 }]],
    ]);
    drill.dispose();
  });
});
