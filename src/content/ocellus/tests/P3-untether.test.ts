import type { At } from "./drill";
import { footprintCentre, startP3Drill } from "./p3drill";

const U = 54;
const B = U + 25;
const SPAWN: At = { x: 19, y: 9 };
const FAR_EAST: At = { x: 27, y: 9 };
const UNDER_EDGE: At = { x: 20, y: 8 };
const UNDER_CENTRE: At = { x: 21, y: 7 };
const OFF_THE_FIRST_TILES: At = { x: 19, y: 10 };

type Drill = Awaited<ReturnType<typeof startP3Drill>>;

const untetherHits = (drill: Drill, kinds: readonly string[]) => drill.events("player-hit").filter((event) => kinds.includes(event.hit.kind)).map((event) => [event.at, event.hit.kind, event.receipt.requested]);
const avoided = (drill: Drill, hazards: readonly string[]) => drill.events("hazard-avoided").filter((event) => hazards.includes(event.hazard)).map((event) => [event.at, event.hazard, event.tile]);

describe("P3 Untether", () => {
  test.each([
    {
      specials: "alternate",
      stages: [[0, "arrive"], [7, "autos"], [27, "smite-1"], [34, "autos"], [54, "untether"], [85, "untether-ends"], [91, "autos"], [111, "smite-1"], [118, "autos"], [138, "untether"]],
    },
    {
      specials: "smite-only",
      stages: [[0, "arrive"], [7, "autos"], [27, "smite-1"], [34, "autos"], [54, "smite-1"], [61, "autos"], [81, "smite-1"], [88, "autos"], [108, "smite-1"], [115, "autos"], [135, "smite-1"], [142, "autos"]],
    },
  ])("specials=$specials: the stages to P3 tick 150", async ({ specials, stages }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true, specials });
    drill.tickTo(150);
    const observed = drill.events("stage-entered").map((event) => [event.at, event.stage]);
    drill.dispose();
    expect(observed).toEqual(stages);
  });

  test("Untether at 54 shows purple tiles at 60, 64, 68 and 72, the border at 79 and erupts at 83; he lands at 85 and swings again at 91", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(95);
    const kinds = ["untether-started", "purple-tiles-shown", "border-shown", "void-erupted"];
    const observed = {
      untether: drill.rows().flatMap((row) => row.events.filter((event) => kinds.includes(event.kind)).map((event) => [event.at, event.kind])),
      firstAutoAfter: drill.events("player-hit").filter((event) => event.at > U && (event.hit.kind === "swing" || event.hit.kind === "void-shot")).map((event) => [event.at, event.hit.kind])[0],
    };
    drill.dispose();
    expect(observed).toEqual({
      untether: [[54, "untether-started"], [60, "purple-tiles-shown"], [64, "purple-tiles-shown"], [68, "purple-tiles-shown"], [72, "purple-tiles-shown"], [79, "border-shown"], [83, "void-erupted"]],
      firstAutoAfter: [91, "swing"],
    });
  });

  test("he moves to (20, 8) on the shout and stays there while the player runs east, until he lands at 85; he steps after the player at 86", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    const at: Record<number, At> = {};
    for (const t of [U - 1, U, U + 1, B + 5, U + 31, U + 32]) {
      drill.tickTo(t);
      if (t === U + 1) await drill.click(FAR_EAST);
      at[t] = { ...drill.boss().location };
    }
    drill.dispose();
    expect(at).toEqual({ 53: { x: 19, y: 8 }, 54: { x: 20, y: 8 }, 55: { x: 20, y: 8 }, 84: { x: 20, y: 8 }, 85: { x: 20, y: 8 }, 86: { x: 21, y: 9 } });
  });

  test.each([
    { prayer: "Protect from Magic" as const, magic: [[64, 0, "magic"], [68, 0, "magic"], [72, 0, "magic"], [76, 0, "magic"]] },
    { prayer: null, magic: [[64, 25, null], [68, 15, null], [72, 23, null], [76, 15, null]] },
  ])("his magic lands at 64, 68, 72 and 76, with prayer $prayer", async ({ prayer, magic }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    if (prayer !== null) drill.pray(prayer);
    drill.tickTo(80);
    const observed = drill.events("player-hit").filter((event) => event.hit.kind === "untether-magic").map((event) => [event.at, event.receipt.requested, event.receipt.prayer]);
    drill.dispose();
    expect(observed).toEqual(magic);
  });

  test("a player who stands still is under every showing of purple tiles and takes each 4 ticks later, through Protect from Magic", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Magic");
    drill.tickTo(80);
    const observed = untetherHits(drill, ["purple-tile"]);
    drill.dispose();
    expect(observed).toEqual([[64, "purple-tile", 23], [68, "purple-tile", 23], [72, "purple-tile", 25], [76, "purple-tile", 25]]);
  });

  test("a player who steps one tile south after the tiles show at 60 is not hit when they erupt at 64", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(60);
    await drill.click(OFF_THE_FIRST_TILES);
    drill.tickTo(64);
    const observed = { hits: untetherHits(drill, ["purple-tile"]), avoided: avoided(drill, ["purple-tile"]) };
    drill.dispose();
    expect(observed).toEqual({ hits: [], avoided: [[64, "purple-tile", SPAWN]] });
  });

  test.each([
    { from: UNDER_EDGE, clickAfter: B + 2, out: { x: 19, y: 8 }, hits: [[83, "eruption", 34]], avoided: [[84, "slam", { x: 19, y: 8 }]] },
    { from: UNDER_EDGE, clickAfter: B + 3, out: { x: 19, y: 8 }, hits: [], avoided: [[83, "eruption", UNDER_EDGE], [84, "slam", { x: 19, y: 8 }]] },
    { from: UNDER_EDGE, clickAfter: B + 4, out: { x: 19, y: 8 }, hits: [[84, "slam", 36]], avoided: [[83, "eruption", UNDER_EDGE]] },
    { from: UNDER_CENTRE, clickAfter: B + 2, out: { x: 19, y: 7 }, hits: [[83, "eruption", 34]], avoided: [[84, "slam", { x: 19, y: 7 }]] },
    { from: UNDER_CENTRE, clickAfter: B + 3, out: { x: 19, y: 7 }, hits: [], avoided: [[83, "eruption", UNDER_CENTRE], [84, "slam", { x: 19, y: 7 }]] },
    { from: UNDER_CENTRE, clickAfter: B + 4, out: { x: 19, y: 7 }, hits: [[84, "slam", 36]], avoided: [[83, "eruption", UNDER_CENTRE]] },
  ])("under him from $from at 75, a click on him after $clickAfter runs out to $out: $hits", async ({ from, clickAfter, out, hits, avoided: expectedAvoided }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Magic");
    drill.tickTo(74);
    drill.walkTo(from);
    drill.tickTo(clickAfter);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(86);
    const observed = { out: { ...drill.player().location }, hits: untetherHits(drill, ["eruption", "slam"]), avoided: avoided(drill, ["eruption", "slam"]) };
    drill.dispose();
    expect(observed).toEqual({ out, hits, avoided: expectedAvoided });
  });

  test.each([
    { name: "standing outside him takes the eruption at 83 and nothing at 84", walkAfter: null, hits: [[83, "eruption", 34]], avoided: [[84, "slam", SPAWN]] },
    { name: "outside at 82 and under him at 83 takes the eruption, then 19 from the slam", walkAfter: B + 3, hits: [[83, "eruption", 34], [84, "slam", 19]], avoided: [] },
  ])("$name", async ({ walkAfter, hits, avoided: expectedAvoided }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Magic");
    if (walkAfter !== null) {
      drill.tickTo(walkAfter);
      drill.walkTo(UNDER_EDGE);
    }
    drill.tickTo(86);
    const observed = { hits: untetherHits(drill, ["eruption", "slam"]), avoided: avoided(drill, ["eruption", "slam"]) };
    drill.dispose();
    expect(observed).toEqual({ hits, avoided: expectedAvoided });
  });

  test("setup=melee: a click on him at 54 lands no hit while he floats to 84; once he lands at 85 the melee reaches him and takes 7 by 91", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true, setup: "melee" });
    drill.tickTo(U);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(91);
    const hp = Object.fromEntries([U, B + 5, 90, 91].map((t) => [t, drill.row(t).bossHp.atPostTick]));
    drill.dispose();
    expect(hp).toEqual({ 54: 5250, 84: 5250, 90: 5250, 91: 5243 });
  });

  test("bosshp=3938: ranged shots take him to 3926 at 77, under the 75% break, but the quadrant falls only when Untether ends at 85", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true, bossHp: 3938 });
    drill.tickTo(U);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(90);
    const observed = {
      hpAt77: drill.row(77).bossHp.atPostTick,
      stagesAfterU: drill.events("stage-entered").filter((event) => event.at >= U).map((event) => [event.at, event.stage]),
      ended: drill.events("run-ended").map((event) => [event.at, event.reason.kind]),
    };
    drill.dispose();
    expect(observed).toEqual({ hpAt77: 3926, stagesAfterU: [[54, "untether"], [85, "destroy"]], ended: [[85, "quadrant-cleared"]] });
  });
});
