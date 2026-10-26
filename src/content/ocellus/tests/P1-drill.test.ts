import { Mob } from "osrs-sdk";
import type { HitReceipt } from "../../../sim/combat";
import type { At } from "./drill";
import { footprintCentre } from "./p3drill";
import { startP1Drill } from "./p1drill";

const loadTimings = () => vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");

const BESIDE_START: At = { x: 15, y: 18 };
const ON_FIRST_CRACK: At = { x: 21, y: 16 };
const OFF_THE_CRACKS: At = { x: 17, y: 22 };
const IN_THE_BLAST: At = { x: 19, y: 10 };

const receipt = (requested: number, beforeHp: number, prayer: "magic" | "ranged" | null): HitReceipt => ({ requested, applied: requested, beforeHp, afterHp: beforeHp - requested, prayer });
const tile = ({ x, y }: At) => [x, y];

describe("P1 drill", () => {
  test("from the start he walks one tile a tick, straight then diagonally, to his first corner, volleying every 5 ticks from P1 tick 4 under Protect from Melee, and charges the tick after his end pose", async () => {
    const drill = await startP1Drill({ seed: 1 });
    drill.tickTo(55);
    const observed = {
      stages: drill.events("stage-entered").map((event) => [event.at, event.stage]),
      volleys: drill.events("volley-cast").map((event) => [event.at, event.element, event.last, event.landsAt]),
      walkEnds: drill.events("walk-ended").map((event) => event.at),
      path: [4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => tile(drill.row(t).bossAt)),
      overheads: drill.events("overhead-switched").map((event) => [event.at, event.overhead]),
    };
    drill.dispose();
    expect(observed).toEqual({
      stages: [[0, "arrive"], [4, "walk-from-start"], [15, "corner"], [36, "walk-from-corner"], [52, "corner"]],
      volleys: [[4, "water", false, 8], [9, "water", false, 13], [36, "water", false, 40], [41, "water", false, 45], [46, "water", false, 50]],
      walkEnds: [14, 51],
      path: [[14, 16], [14, 15], [14, 14], [15, 13], [16, 12], [17, 11], [18, 10], [19, 9], [20, 8]],
      overheads: [[4, "protect-melee"], [14, null], [36, "protect-melee"], [51, null]],
    });
  });

  test.each([
    { prayer: "Protect from Magic" as const, hits: [[8, receipt(0, 99, "magic")], [13, receipt(0, 99, "magic")]] },
    { prayer: null, hits: [[8, receipt(19, 99, null)], [13, receipt(1, 80, null)]] },
  ])("a water volley deals 0 through Protect from Magic and 0 to 27 without it, with prayer $prayer", async ({ prayer, hits }) => {
    const drill = await startP1Drill({ seed: 1 });
    if (prayer !== null) drill.pray(prayer);
    drill.tickTo(13);
    const observed = drill.events("player-hit").map((event) => [event.at, event.receipt]);
    drill.dispose();
    expect(observed).toEqual(hits);
  });

  test("a volley lands 3 ticks after the cast on a player within 4 tiles of his 3x3 and 4 ticks after it beyond", async () => {
    const near = await startP1Drill({ seed: 1 });
    near.tickTo(1);
    await near.click(BESIDE_START);
    near.tickTo(4);
    const nearLanding = near.events("volley-cast")[0]?.landsAt;
    near.dispose();
    const far = await startP1Drill({ seed: 1 });
    far.tickTo(4);
    const farLanding = far.events("volley-cast")[0]?.landsAt;
    far.dispose();
    expect({ nearLanding, farLanding }).toEqual({ nearLanding: 7, farLanding: 8 });
  });

  test("his Protect from Melee turns melee hits to 0 while he walks to his corner, and they land once he charges there", async () => {
    const drill = await startP1Drill({ seed: 1, setup: "melee", invincible: true });
    drill.tickTo(3);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(23);
    const observed = drill.events("player-hit-judged").map((event) => [event.at, event.style, event.outcome, event.requested]);
    drill.dispose();
    expect(observed).toEqual([
      [8, "melee", "blocked", 0],
      [8, "melee", "blocked", 0],
      [8, "melee", "blocked", 0],
      [13, "melee", "blocked", 0],
      [13, "melee", "blocked", 3],
      [13, "melee", "blocked", 4],
      [18, "melee", "passed", 0],
      [18, "melee", "passed", 0],
      [18, "melee", "passed", 0],
      [23, "melee", "passed", 0],
      [23, "melee", "passed", 17],
      [23, "melee", "passed", 0],
    ]);
  });

  test("a corner opens 7 cracks 2 ticks apart, 8 tiles each, and each one nobody blocks closes 5 ticks on, charging his bar by 2 and healing him 2", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 2000 });
    drill.tickTo(35);
    const observed = {
      opened: drill.events("crack-opened").map((event) => [event.at, event.crack.tiles.length]),
      closed: drill.events("crack-closed").map((event) => [event.at, event.outcome]),
      meter: drill.row(35).meter,
      bossHp: drill.row(35).bossHp.atPostTick,
    };
    drill.dispose();
    expect(observed).toEqual({
      opened: [[15, 8], [17, 8], [19, 8], [21, 8], [23, 8], [25, 8], [27, 8]],
      closed: [[20, "charged"], [22, "charged"], [24, "charged"], [26, "charged"], [28, "charged"], [30, "charged"], [32, "charged"]],
      meter: 14,
      bossHp: 2014,
    });
  });

  test("drawing his heal splat for 100 frames makes no array calls beyond the SDK's own hitsplats", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 2000 });
    drill.tickTo(20);
    const context = new OffscreenCanvas(64, 64).getContext("2d");
    if (!context) throw new Error("no 2D context");
    const arrayCalls = (draw: () => void) => {
      const spies = (["map", "slice", "filter"] as const).map((method) => vi.spyOn(Array.prototype, method));
      for (let frame = 0; frame < 100; frame++) draw();
      const calls = spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
      spies.forEach((spy) => spy.mockRestore());
      return calls;
    };
    const boss = drill.boss();
    const drawn = arrayCalls(() => boss.drawHitsplats(context, 32));
    const sdk = arrayCalls(() => Mob.prototype.drawHitsplats.call(boss, context, 32));
    const observed = { healedAt: drill.events("boss-healed").map((event) => event.at), extraArrayCalls: drawn - sdk };
    drill.dispose();
    expect(observed).toEqual({ healedAt: [20], extraArrayCalls: 0 });
  });

  test("standing on a crack as it closes blocks it for 3 to 5 damage and no charge, and the damage comes back once the player steps off", async () => {
    const drill = await startP1Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Magic");
    drill.tickTo(15);
    await drill.click(ON_FIRST_CRACK);
    drill.tickTo(20);
    await drill.click(OFF_THE_CRACKS);
    drill.tickTo(24);
    const observed = {
      closedAt20: drill.events("crack-closed").filter((event) => event.at === 20).map((event) => event.outcome),
      blocks: drill.events("player-hit").filter((event) => event.hit.kind === "crack-blocked").map((event) => [event.at, event.receipt.applied]),
      refunds: drill.events("block-refunded").map((event) => [event.at, event.receipt.applied]),
      meterAt20: drill.row(20).meter,
    };
    drill.dispose();
    expect(observed).toEqual({ closedAt20: ["blocked"], blocks: [[20, 4]], refunds: [[22, 4]], meterAt20: 0 });
  });

  test("the blast a tick after he explodes hits a player within 2 tiles of his 3x3 for 26 to 34", async () => {
    const drill = await startP1Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Magic");
    drill.tickTo(25);
    await drill.click(IN_THE_BLAST);
    drill.tickTo(34);
    const observed = {
      exploded: drill.events("boss-exploded").map((event) => event.at),
      blasts: drill.events("blast-landed").map((event) => [event.at, event.tiles.length]),
      hits: drill.events("player-hit").filter((event) => event.hit.kind === "blast").map((event) => [event.at, event.receipt.applied]),
    };
    drill.dispose();
    expect(observed).toEqual({ exploded: [33], blasts: [[34, 37]], hits: [[34, 30]] });
  });

  test.each([
    { bossHp: 1651, expected: { stages: [[0, "arrive"], [4, "walk-from-start"]], volleyAt4: true } },
    { bossHp: 1650, expected: { stages: [[0, "arrive"], [4, "middle"]], volleyAt4: false } },
  ])("at or below ⌊2500 × 0.66⌋ = 1650 he teleports out on his next volley tick instead of casting: bosshp=$bossHp", async ({ bossHp, expected }) => {
    const drill = await startP1Drill({ seed: 1, bossHp });
    drill.tickTo(5);
    const observed = { stages: drill.events("stage-entered").map((event) => [event.at, event.stage]), volleyAt4: drill.events("volley-cast").some((event) => event.at === 4) };
    drill.dispose();
    expect(observed).toEqual(expected);
  });

  test("in the middle he lands at M + 4, faces each side clockwise for four beats of two cracks and a blast, tells the strike at M + 40, lands one shot through Protect from Magic at M + 43 and walks on at M + 49", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 1650, invincible: true });
    drill.pray("Protect from Magic");
    drill.tickTo(54);
    const observed = {
      teleports: [...drill.events("teleported-out").map((event) => ["out", event.at]), ...drill.events("teleported-in").map((event) => ["in", event.at, tile(event.to)])],
      beats: drill.events("boss-charged").map((event) => [event.at, tile(event.facing)]),
      cracks: drill.events("crack-opened").map((event) => [event.at, event.crack.closesAt]),
      blasts: drill.events("blast-landed").map((event) => [event.at, event.tiles.length]),
      shouts: drill.events("boss-shouted").map((event) => [event.at, event.text]),
      strike: drill.events("player-hit").filter((event) => event.hit.kind === "strike").map((event) => [event.at, event.receipt]),
      walk: drill.events("stage-entered").filter((event) => event.stage === "walk-from-middle").map((event) => event.at),
    };
    drill.dispose();
    expect(observed).toEqual({
      teleports: [["out", 4], ["in", 8, [14, 14]]],
      beats: [[12, [25, 13]], [20, [15, 23]], [28, [5, 13]], [36, [15, 3]]],
      cracks: [[12, 16], [12, 18], [20, 24], [20, 26], [28, 32], [28, 34], [36, 40], [36, 42]],
      blasts: [[19, 40], [27, 40], [35, 40], [43, 40]],
      shouts: [[0, "Now... ascension..."], [44, "Death... awaits..."]],
      strike: [[47, receipt(17, 99, "magic")]],
      walk: [53],
    });
  });

  test("each middle beat turns him to the side it charges, east, south, west then north, and the strike turns him back to the player south of him", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 1650, invincible: true });
    const facing = (at: number) => {
      drill.tickTo(at);
      const turn = drill.boss().getPerceivedRotation(1) % (2 * Math.PI);
      return Math.round(((turn + 2 * Math.PI) % (2 * Math.PI)) * 1000) / 1000;
    };
    const observed = { beats: [12, 20, 28, 36].map(facing), strike: facing(46) };
    drill.dispose();
    expect(observed).toEqual({ beats: [0, 4.712, 3.142, 1.571], strike: 4.712 });
  });

  test("at or below ⌊2500 × 0.25⌋ = 625 after the first middle's 8 unblocked cracks heal him 16, he goes back to the middle on its walk's first volley tick", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 609, invincible: true });
    drill.tickTo(60);
    const middles = drill.events("stage-entered").filter((event) => event.stage === "middle").map((event) => event.at);
    drill.dispose();
    expect(middles).toEqual([4, 53]);
  });

  test("a bar charged to 24 or more sends one more strike shot per 24 and tells it as \"Embrace... annihilation...\": bosshp=1651 on seed 1 with the bow on him from P1 tick 20", async () => {
    const drill = await startP1Drill({ seed: 1, bossHp: 1651, invincible: true });
    drill.tickTo(20);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(95);
    const told = drill.events("boss-shouted").find((event) => event.text !== "Now... ascension..." && event.at > 40);
    const observed = {
      middle: drill.events("stage-entered").filter((event) => event.stage === "middle").map((event) => event.at),
      barWhenTold: told === undefined ? null : drill.row(told.at - 1).meter,
      told: told === undefined ? null : [told.at, told.text],
      cast: drill.events("strike-cast").map((event) => [event.at, event.shots, event.landsAt]),
      shots: drill.events("player-hit").filter((event) => event.hit.kind === "strike").map((event) => event.at),
    };
    drill.dispose();
    expect(observed).toEqual({ middle: [51], barWhenTold: 30, told: [91, "Embrace... annihilation..."], cast: [[93, 2, 94]], shots: [94, 94] });
  });

  test.each([
    { name: "in the middle", clickAfter: 8, expected: { shout: 12, teleports: [["out", 4], ["in", 8]], transformed: 15, ended: [[22, "phase-cleared"]] } },
    { name: "walking to a corner", clickAfter: 102, expected: { shout: 106, teleports: [["out", 4], ["out", 53], ["out", 108], ["in", 8], ["in", 57], ["in", 111]], transformed: 113, ended: [[120, "phase-cleared"]] } },
  ])("at 0 HP $name he says his line, teleports to the middle when he is elsewhere, transforms 2 ticks after landing or 3 after the line, and phase 1 ends 7 ticks later", async ({ clickAfter, expected }) => {
    const drill = await startP1Drill({ seed: 100, bossHp: 1, invincible: true });
    drill.tickTo(clickAfter);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(clickAfter + 30);
    const observed = {
      shout: drill.events("boss-shouted").find((event) => event.text === "You... will disappear...")?.at,
      teleports: [...drill.events("teleported-out").map((event) => ["out", event.at]), ...drill.events("teleported-in").map((event) => ["in", event.at])],
      transformed: drill.events("transformed")[0]?.at,
      ended: drill.events("run-ended").map((event) => [event.at, event.reason.kind]),
    };
    drill.dispose();
    expect(observed).toEqual(expected);
  });

  test.each([
    { link: "?phase=p1&seed=1&focus=void-floor", flags: { p3: false, p1: true }, expected: { phase: "p1", rejected: ["focus=void-floor"] } },
    { link: "?phase=p1&seed=1&bosshp=2501", flags: { p3: false, p1: true }, expected: { phase: "p1", rejected: ["bosshp=2501"] } },
  ])("parseRequest opens $expected.phase for $link with flags $flags and rejects $expected.rejected", async ({ link, flags, expected }) => {
    const { parseRequest } = await loadTimings();
    const request = parseRequest(new URL(`http://127.0.0.1:8012/${link}`), () => 99, { ...flags, p2: false, full: false });
    expect({ phase: request.phase, rejected: request.rejected }).toEqual(expected);
  });

  test.each([
    { link: "?phase=p3&seed=1", flags: { p3: false, p1: true }, expected: { phase: "p4", rejected: ["phase=p3"] } },
    { link: "?phase=p1&seed=1", flags: { p3: true, p1: false }, expected: { phase: "p4", rejected: ["phase=p1"] } },
    { link: "?phase=p1&seed=1", flags: { p3: false, p1: false }, expected: { phase: "p4", rejected: ["phase=p1"] } },
  ])("guard: parseRequest opens $expected.phase for $link with flags $flags and rejects $expected.rejected", async ({ link, flags, expected }) => {
    const { parseRequest } = await loadTimings();
    const request = parseRequest(new URL(`http://127.0.0.1:8012/${link}`), () => 99, { ...flags, p2: false, full: false });
    expect({ phase: request.phase, rejected: request.rejected }).toEqual(expected);
  });
});
