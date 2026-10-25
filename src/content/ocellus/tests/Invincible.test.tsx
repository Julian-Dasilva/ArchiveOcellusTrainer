import { startDrill } from "./drill";
import { captureNavigation, loadPage } from "./page";

const VOID_FLOOR = { focus: "void-floor" } as const;

function standOnTheFlood(turnOffAt: number | null) {
  const drill = startDrill({ selection: VOID_FLOOR });
  drill.region.invincible = true;
  if (turnOffAt !== null) {
    drill.tickTo(turnOffAt);
    drill.region.invincible = false;
  }
  drill.tickTo(56);
  const observed = {
    floorHits: drill.events("floor-hit").map((e) => [e.at, e.receipt.requested, e.receipt.applied, e.receipt.beforeHp, e.receipt.afterHp]),
    prevented: drill.events("death-prevented"),
    hpAfter: drill.rows().map((row) => row.playerAtPostTick.hp).slice(-3),
    ended: drill.events("run-ended").map((e) => [e.at, e.reason]),
    chat: drill.region.chat(),
  };
  drill.dispose();
  return observed;
}

const HITS_TO_THE_LETHAL_ONE = [
  [44, 9, 9, 99, 90], [45, 11, 11, 90, 79], [46, 10, 10, 79, 69], [47, 11, 11, 69, 58], [48, 10, 10, 58, 48], [49, 9, 9, 48, 39],
  [50, 9, 9, 39, 30], [51, 10, 10, 30, 20], [52, 9, 9, 20, 11], [53, 10, 10, 11, 1], [54, 10, 1, 1, 0],
];

describe("Invincible", () => {
  test("with invincible on, the floor's lethal hit still lands, HP returns to full and the log and chat name the tick and the source", () => {
    expect(standOnTheFlood(null)).toEqual({
      floorHits: [...HITS_TO_THE_LETHAL_ONE, [55, 9, 9, 99, 90], [56, 9, 9, 90, 81]],
      prevented: [{ kind: "death-prevented", at: 54, source: "floor-hit", clearedOrbCredit: 0 }],
      hpAfter: [99, 90, 81],
      ended: [],
      chat: ["Invincible: the void floor would have killed you on tick 54."],
    });
  });

  test("guard, mortal play: with invincible turned off before it, the same lethal hit ends the run on tick 54", () => {
    expect(standOnTheFlood(50)).toEqual({
      floorHits: HITS_TO_THE_LETHAL_ONE,
      prevented: [],
      hpAfter: [11, 1, 0],
      ended: [[54, "death"]],
      chat: [],
    });
  });

  test("guard, damage unchanged: a hit that leaves HP above 0 lands the same with invincible on or off", () => {
    const hitsBeforeTick54 = (invincible: boolean) => {
      const drill = startDrill({ selection: VOID_FLOOR });
      drill.region.invincible = invincible;
      drill.tickTo(53);
      const hits = drill.events("floor-hit").map((e) => [e.at, e.receipt.requested, e.receipt.applied, e.receipt.beforeHp, e.receipt.afterHp]);
      const hp = drill.row(53).playerAtPostTick.hp;
      drill.dispose();
      return { hits, hp };
    };
    const nonLethal = { hits: HITS_TO_THE_LETHAL_ONE.slice(0, 10), hp: 1 };
    expect({ off: hitsBeforeTick54(false), on: hitsBeforeTick54(true) }).toEqual({ off: nonLethal, on: nonLethal });
  });

  test("guard, damage unchanged: with invincible on, the lifeforce steal still halves the player's HP", () => {
    const drill = startDrill({ selection: { focus: "lifeforce-orb" } });
    drill.region.invincible = true;
    drill.tickTo(13);
    expect([drill.events("lifeforce-drained").map((e) => [e.at, e.receipt]), drill.row(12).playerAtPostTick.hp]).toEqual([
      [[12, { requested: 49, applied: 49, beforeHp: 99, afterHp: 50, prayer: null }]],
      50,
    ]);
    drill.dispose();
  });

  test("a prevented death clears the stolen HP, so the orb collected after it returns nothing", () => {
    const drill = startDrill();
    drill.region.invincible = true;
    drill.walkTo({ x: 5, y: 5 });
    drill.tickTo(19);
    drill.walkTo({ x: 4, y: 8 });
    drill.tickTo(25);
    const observed = {
      spawned: drill.events("orb-spawned").map((e) => [e.at, e.tile, e.credit]),
      prevented: drill.events("death-prevented"),
      returned: drill.events("orb-returned").map((e) => [e.at, e.receipt]),
      hpAfterReturn: drill.row(25).playerAtPostTick.hp,
    };
    drill.dispose();
    expect(observed).toEqual({
      spawned: [[12, { x: 4, y: 8 }, 38]],
      prevented: [
        { kind: "death-prevented", at: 15, source: "floor-hit", clearedOrbCredit: 38 },
        { kind: "death-prevented", at: 24, source: "explosion-resolved", clearedOrbCredit: 0 },
      ],
      returned: [[25, { requested: 0, applied: 0, beforeHp: 99, afterHp: 99 }]],
      hpAfterReturn: 99,
    });
  });

  test("guard, orb return unchanged: with no death prevented, the orb returns the stolen HP the same with invincible on or off", () => {
    const orbReturn = (invincible: boolean) => {
      const drill = startDrill({ selection: { focus: "lifeforce-orb" } });
      drill.region.invincible = invincible;
      drill.tickTo(12);
      drill.walkTo(drill.innerOrb());
      drill.tickTo(25);
      const observed = { returned: drill.events("orb-returned").map((e) => [e.at, e.receipt]), hp: drill.row(25).playerAtPostTick.hp };
      drill.dispose();
      return observed;
    };
    const returned = { returned: [[25, { requested: 49, applied: 49, beforeHp: 50, afterHp: 99 }]], hp: 99 };
    expect({ off: orbReturn(false), on: orbReturn(true) }).toEqual({ off: returned, on: returned });
  });

  test.each([
    {
      lethal: "two reflections land on one tick and the second is lethal",
      seed: 20, at: 255,
      blocked: [["melee", "blocked", 17], ["melee", "blocked", 16], ["melee", "blocked", 0]],
      hits: [["deflect-reflected", 1, 1, 2, 1], ["deflect-reflected", 1, 1, 1, 0]],
      source: "deflect-reflected",
      chat: "Invincible: a deflected hit's reflection would have killed you on tick 255.",
    },
    {
      lethal: "a lethal reflection lands before two rift bursts",
      seed: 13, at: 270,
      blocked: [["melee", "blocked", 24], ["melee", "blocked", 0], ["melee", "blocked", 2]],
      hits: [["deflect-reflected", 2, 1, 1, 0], ["rift-burst", 14, 0, 0, 0], ["rift-burst", 14, 0, 0, 0]],
      source: "deflect-reflected",
      chat: "Invincible: a deflected hit's reflection would have killed you on tick 270.",
    },
    {
      lethal: "a reflection leaves 3 HP and the rift burst after it is lethal",
      seed: 2, at: 270,
      blocked: [["melee", "blocked", 1], ["melee", "blocked", 10], ["melee", "blocked", 0]],
      hits: [["deflect-reflected", 1, 1, 4, 3], ["rift-burst", 14, 3, 3, 0], ["rift-burst", 14, 0, 0, 0]],
      source: "rift-burst",
      chat: "Invincible: a void rift burst would have killed you on tick 270.",
    },
  ] as const)("scythe swings into Deflect Melee, $lethal: off, the run dies on those receipts; on, one death is prevented, naming the first lethal hit", ({ seed, at, blocked, hits, source, chat }) => {
    const scytheTheBoss = (invincible: boolean) => {
      const drill = startDrill({ seed, selection: { focus: "rifts", setup: "melee", hoverMeleeReach: "reachable", drillStart: "cycle-start" } });
      drill.region.invincible = invincible;
      drill.tickTo(13);
      drill.player().setAggro(drill.boss());
      drill.tickTo(at);
      const observed = {
        blocked: drill.events("player-hit-judged").filter((e) => e.at === at).map((e) => [e.style, e.outcome, e.requested]),
        hits: drill.row(at).events.flatMap((e) => (e.kind === "deflect-reflected" || e.kind === "rift-burst" ? [[e.kind, e.receipt.requested, e.receipt.applied, e.receipt.beforeHp, e.receipt.afterHp]] : [])),
        prevented: drill.events("death-prevented"),
        hp: drill.row(at).playerAtPostTick.hp,
        ended: drill.events("run-ended").map((e) => [e.at, e.reason]),
        dying: drill.player().isDying(),
        chat: drill.region.chat(),
      };
      drill.dispose();
      return observed;
    };
    expect({ off: scytheTheBoss(false), on: scytheTheBoss(true) }).toEqual({
      off: { blocked, hits, prevented: [], hp: 0, ended: [[at, "death"]], dying: true, chat: [] },
      on: { blocked, hits, prevented: [{ kind: "death-prevented", at, source, clearedOrbCredit: 0 }], hp: 99, ended: [], dying: false, chat: [chat] },
    });
  });

  test("the Invincible box starts unchecked, a link with invincible=on starts it checked, and Restart carries what the box shows", () => {
    localStorage.removeItem("osrs-sdk:settings");
    const navigation = captureNavigation();
    const plain = loadPage("/?seed=7");
    const checkedOnLoad = [plain.checked("invincible")];
    plain.click("invincible");
    plain.type("seed", "7");
    plain.click("restart");
    plain.close();
    const linked = loadPage(navigation.assigned[0]);
    checkedOnLoad.push(linked.checked("invincible"));
    linked.click("invincible");
    linked.type("seed", "7");
    linked.click("restart");
    linked.close();
    navigation.restore();
    expect({ checkedOnLoad, navigation: navigation.assigned }).toEqual({
      checkedOnLoad: [false, true],
      navigation: ["http://localhost/?seed=7&setup=ranged&focus=full-fight&invincible=on", "http://localhost/?seed=7&setup=ranged&focus=full-fight"],
    });
  });
});
