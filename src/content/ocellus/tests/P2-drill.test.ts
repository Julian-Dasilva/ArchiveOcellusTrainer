import * as THREE from "three";
import { CacheRenderInstancedModel, TileMarker } from "osrs-sdk";
import type { Location3 } from "osrs-sdk";
import { fromMiddle, startP2Drill } from "./p2drill";

const loadTimings = () => vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");

const ROUND_1_VOLLEYS = [15, 20, 25, 30, 35, 40];

describe("P2 drill", () => {
  test("phase 2 runs on the recorded clock: portals at 2, The Blade at 7, rounds at 11, 53 and 95 moving clockwise, releases at 46, 88 and 124, and the interim end at 131", async () => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(131);
    const at = (kind: "portals-rose" | "blade-woke" | "safe-portal-opened" | "blade-released" | "enough" | "sword-fell") => drill.events(kind).map((event) => event.at);
    const observed = {
      walls: at("portals-rose"),
      blade: at("blade-woke"),
      rounds: drill.events("round-started").map((event) => [event.at, event.round, event.wedge]),
      lit: drill.events("portals-fired").filter((event) => event.volley === "lit").map((event) => event.at),
      allTwelve: drill.events("portals-fired").filter((event) => event.volley === "all").map((event) => event.at),
      pools: drill.events("pools-formed").map((event) => [event.at, event.tiles.length]),
      floorPortals: at("safe-portal-opened"),
      releases: at("blade-released"),
      enough: at("enough"),
      swordFalls: at("sword-fell"),
      ended: drill.events("run-ended").map((event) => [event.at, event.reason.kind]),
    };
    drill.dispose();
    expect(observed).toEqual({
      walls: [2],
      blade: [7],
      rounds: [[11, 1, "north-east"], [53, 2, "south-east"], [95, 3, "south-west"]],
      lit: [15, 20, 25, 30, 35, 40, 57, 62, 67, 72, 77, 82, 99, 104, 109, 114, 119, 124],
      allTwelve: [51, 93],
      pools: [[39, 13], [81, 13]],
      floorPortals: [44, 86],
      releases: [46, 88, 124],
      enough: [123],
      swordFalls: [124],
      ended: [[131, "phase-cleared"]],
    });
  });

  test.each([
    { tile: fromMiddle(4, 4), hits: [15, 15], why: "4 out on row 4 and column 4: both reach it on the volley tick" },
    { tile: fromMiddle(5, 4), hits: [15], why: "5 out on row 4, the farthest a volley reaches on its own tick; column 5 is the east arm's gap" },
    { tile: fromMiddle(6, 6), hits: [16], why: "6 out on row 6, a tick later; column 6 is the east arm's gap" },
    { tile: fromMiddle(10, 2), hits: [15, 16], why: "2 out on column 10 on the volley tick, and 10 out on row 2, the farthest it reaches a tick later" },
    { tile: fromMiddle(11, 1), hits: [15, 17], why: "1 out on column 11 on the volley tick, and 11 out on row 1 two ticks later" },
  ])("seed 1's first volley at P2 tick 15 hits a player standing $tile.x, $tile.y on $hits: $why", async ({ tile, hits }) => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(3);
    await drill.click(tile);
    drill.tickTo(17);
    const observed = {
      gaps: drill.first("portals-lit").gaps,
      at: drill.tile(),
      hits: drill.events("player-hit").filter((event) => event.hit.kind === "volley" && event.at >= 15 && event.at <= 17).map((event) => event.at),
    };
    drill.dispose();
    expect(observed).toEqual({ gaps: [5, 2], at: tile, hits });
  });

  test.each([
    { skip: true, hits: [] },
    { skip: false, hits: [16, 21, 21, 26, 31, 31, 36, 36, 41, 41] },
  ])("the portal skip: waiting 6 out on the diagonal and, with skip $skip, clicking 4 out a tick before each of round 1's volleys takes volley hits on $hits", async ({ skip, hits }) => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(3);
    await drill.click(fromMiddle(6, 6));
    for (const volley of ROUND_1_VOLLEYS) {
      drill.tickTo(volley - 1);
      if (skip) await drill.click(fromMiddle(4, 4));
      drill.tickTo(volley);
      if (skip) await drill.click(fromMiddle(6, 6));
    }
    drill.tickTo(44);
    const volleyHits = drill.events("player-hit").filter((event) => event.hit.kind === "volley").map((event) => event.at);
    drill.dispose();
    expect(volleyHits).toEqual(hits);
  });

  test.each([
    { onPool: true, bursts: [[43, 30]] },
    { onPool: false, bursts: [] },
  ])("pools burst once, 4 ticks after they form at P2 tick 39: a player on a pool $onPool takes $bursts", async ({ onPool, bursts }) => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(39);
    const [nearest] = drill.first("pools-formed").tiles;
    if (onPool) await drill.click(nearest);
    drill.tickTo(50);
    const observed = drill.events("player-hit").flatMap((event) => (event.hit.kind === "pool-burst" ? [[event.at, event.receipt.requested]] : []));
    drill.dispose();
    expect(observed).toEqual(bursts);
  });

  test.each([
    { escape: true, expected: { escaped: [[48, fromMiddle(10, 5), fromMiddle(5, -10), "south-east"]], allTwelveHits: [] } },
    { escape: false, expected: { escaped: [], allTwelveHits: [51, 51] } },
  ])("the floor portal at P2 tick 44 takes a player standing on it while it idles to its tile turned a quarter clockwise, out of the all-twelve volley at 51: escape $escape, clicked after 44 from 6 tiles away, so on it at 48", async ({ escape, expected }) => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(44);
    if (escape) await drill.click(drill.first("safe-portal-opened").tile);
    drill.tickTo(53);
    const observed = {
      escaped: drill.events("escaped").map((event) => [event.at, event.from, event.to, event.wedge]),
      allTwelveHits: drill.events("player-hit").filter((event) => event.hit.kind === "volley" && event.hit.volley === "all").map((event) => event.at),
    };
    const landedOn = drill.tile();
    drill.dispose();
    expect(observed).toEqual(expected);
    if (escape) expect(landedOn).toEqual(fromMiddle(5, -10));
  });

  test("The Blade can be attacked from P2 tick 7 until 123 and stores what it takes; Ocellus's bar holds until 46, then drops by half of it, rounded down", async () => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    const attackable = (t: number) => {
      drill.tickTo(t);
      return drill.region.snapshot()?.boss.attackable;
    };
    const before = [attackable(6), attackable(7)];
    await drill.click(fromMiddle(1, 1));
    let landed = 0;
    for (let t = 8; t <= 46; t++) {
      drill.tickTo(t);
      landed += drill.boss().hitsThisTick.reduce((sum, hit) => sum + hit.damage, 0);
    }
    const [release] = drill.events("blade-released");
    const observed = {
      before,
      hpAt45: drill.row(45).bossHp.atPostTick,
      hpAt46: drill.row(46).bossHp.atPostTick,
      landed,
      release: release === undefined ? null : [release.stored, release.released],
      after: [attackable(122), attackable(123)],
    };
    drill.dispose();
    expect(observed).toEqual({ before: [false, true], hpAt45: 5250, hpAt46: 5250 - 46, landed: 92, release: [92, 46], after: [true, false] });
  });

  test("The Blade stores each hit's full roll, not the hit the SDK caps to Ocellus's displayed HP", async () => {
    const drill = await startP2Drill({ seed: 1, invincible: true, bossHp: 1 });
    drill.tickTo(7);
    await drill.click(fromMiddle(1, 1));
    drill.tickTo(46);
    const [release] = drill.events("blade-released");
    drill.dispose();
    expect(release === undefined ? null : release.stored).toBe(92);
  });

  test("drawing 120 unchanged frames of the risen portals hands the SDK one empty offsets list of the region's own, not one per portal per frame", async () => {
    const drill = await startP2Drill({ seed: 1, invincible: true });
    drill.tickTo(14);
    const draws = vi.spyOn(CacheRenderInstancedModel.prototype, "draw");
    const scene = new THREE.Scene();
    const none: Location3[] = [];
    for (let frame = 0; frame < 120; frame++) drill.region.entities.forEach((entity) => entity.get3dModel()?.draw(scene, 1 / 60, 0.5, entity.getPerceivedLocation(0.5), 0, 0, true, none));
    const offsets = draws.mock.calls.map((args) => args[7]);
    draws.mockRestore();
    drill.dispose();
    const observed = { draws: offsets.length, listsOfItsOwn: new Set(offsets.filter((offset) => offset !== none)).size, empty: offsets.every((offset) => offset.length === 0) };
    expect(observed).toEqual({ draws: 3000, listsOfItsOwn: 1, empty: true });
  });

  test("markers=skip-tiles marks the wait and run tiles, 6 and 4 out on each wedge's diagonal, until Settings switches them off", async () => {
    const drill = await startP2Drill({ seed: 1, markers: "skip-tiles" });
    const marked = () =>
      drill.region.entities
        .filter((entity) => entity instanceof TileMarker)
        .map(({ location }) => [location.x, location.y])
        .sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
    const shown = marked();
    drill.region.showSkipTiles(false);
    const hidden = marked();
    drill.dispose();
    const tiles = [[6, 6], [4, 4], [6, -6], [4, -4], [-6, -6], [-4, -4], [-6, 6], [-4, 4]].map(([east, north]) => fromMiddle(east, north)).map(({ x, y }) => [x, y]);
    expect({ shown, hidden }).toEqual({ shown: tiles.sort(([ax, ay], [bx, by]) => ax - bx || ay - by), hidden: [] });
  });

  test.each([
    { link: "?phase=p2&seed=1&markers=skip-tiles", flags: { p3: false, p2: true }, expected: { phase: "p2", rejected: [] } },
    { link: "?phase=p2&seed=1&focus=void-floor&reach=within-two", flags: { p3: true, p2: true }, expected: { phase: "p2", rejected: ["focus=void-floor", "reach=within-two"] } },
  ])("with flags $flags, parseRequest opens $expected.phase for $link and rejects $expected.rejected", async ({ link, flags, expected }) => {
    const { parseRequest } = await loadTimings();
    const request = parseRequest(new URL(`http://127.0.0.1:8002/${link}`), () => 99, { ...flags, p1: false, full: false });
    expect({ phase: request.phase, rejected: request.rejected }).toEqual(expected);
  });

  test.each([
    { link: "?phase=p3&seed=1", flags: { p3: false, p2: true }, expected: { phase: "p4", rejected: ["phase=p3"] } },
    { link: "?phase=p2&seed=1", flags: { p3: true, p2: false }, expected: { phase: "p4", rejected: ["phase=p2"] } },
    { link: "?phase=p2&seed=1", flags: { p3: false, p2: false }, expected: { phase: "p4", rejected: ["phase=p2"] } },
  ])("guard: with flags $flags, parseRequest opens $expected.phase for $link and rejects $expected.rejected", async ({ link, flags, expected }) => {
    const { parseRequest } = await loadTimings();
    const request = parseRequest(new URL(`http://127.0.0.1:8002/${link}`), () => 99, { ...flags, p1: false, full: false });
    expect({ phase: request.phase, rejected: request.rejected }).toEqual(expected);
  });
});
