import * as THREE from "three";
import type { At } from "./drill";
import { footprintCentre, startP3Drill } from "./p3drill";

const loadTimings = () => vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");

/**
 * Phase 3's first quadrant against RuneLite fight logs recorded on 2026-10-23. P3 tick 0 is the tick he lands in his corner
 * (S in the logs), so his moves sit on the logs' S-relative ticks.
 */
const FAR_EAST: At = { x: 27, y: 9 };
const CORNER = { x: 21, y: 7 };
const U = 53;
const P = 24;
const I = 139;

type Drill = Awaited<ReturnType<typeof startP3Drill>>;
const hitsOf = (drill: Drill, kind: string) => drill.events("player-hit").filter((event) => event.hit.kind === kind).map((event) => [event.at, event.receipt.applied, event.receipt.prayer] as const);
/** The band he aimed on `at`, each tile as [east, south] of his middle tile. */
function bandFrom(drill: Drill, at: number): (readonly [number, number])[] {
  const aimed = drill.events("band-aimed").find((event) => event.at === at);
  if (!aimed) throw new Error(`no band aimed on P3 tick ${at}`);
  const { x, y } = drill.boss().location;
  return aimed.tiles.map((tile) => [tile.x - (x + 1), tile.y - (y - 1)] as const);
}
const has = (tiles: readonly (readonly [number, number])[], east: number, south: number) => tiles.some(([x, y]) => x === east && y === south);

describe("P3 drill", () => {
  test.each([
    { name: "the quadrant falls the tick after his HP reaches ⌊5250 × 0.76⌋ = 3990", bossHp: 4044, expected: { falls: [4], hpAfterShot: 3990, stageOnShot: "arrive", stageAt6: "destroy" } },
    { name: "guard: one HP above ⌊5250 × 0.76⌋ = 3990 the quadrant stands", bossHp: 4045, expected: { falls: [], hpAfterShot: 3991, stageOnShot: "arrive", stageAt6: "swing" } },
  ])("$name: bosshp=$bossHp, seed 100's first shot of 54 lands on P3 tick 3", async ({ bossHp, expected }) => {
    const drill = await startP3Drill({ seed: 100, bossHp });
    drill.tickTo(0);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(6);
    const shot = drill.row(3);
    const observed = {
      falls: drill.moves().flatMap(([at, move]) => (move === "quadrant-falls" ? [at] : [])),
      hpAfterShot: shot.bossHp.atPostTick,
      stageOnShot: shot.phase.stage,
      stageAt6: drill.row(6).phase.stage,
    };
    drill.dispose();
    expect(observed).toEqual(expected);
  });

  describe("the falling quadrant: shout F, loop F+2, escape shout F+11, the floor gone at F+13 with whoever still stands on it", () => {
    async function fallFromTick4(cross: At | null) {
      const drill = await startP3Drill({ seed: 100, bossHp: 4044 });
      drill.tickTo(0);
      await drill.click(footprintCentre(drill.boss()));
      drill.tickTo(4);
      if (cross) await drill.click(cross);
      drill.tickTo(30);
      const observed = {
        moves: drill.moves().filter(([at]) => at >= 4),
        chat: drill.region.chat().filter((line) => !line.startsWith("Invincible")),
        gone: drill.events("quadrant-gone").map((event) => [event.at, event.player]),
        fallHits: drill.events("player-hit").filter((event) => event.hit.kind === "quadrant-gone").map((event) => [event.at, event.receipt.requested, event.receipt.afterHp]),
        ended: drill.events("run-ended").map((event) => [event.at, event.reason.kind]),
        path: drill.rows().filter((row) => row.tick >= 4).map((row) => [row.tick, row.playerAtPostTick.tile.x, row.playerAtPostTick.tile.y]),
        bossShownAfterDrop: drill.region.snapshot()?.boss.visible,
      };
      drill.dispose();
      return observed;
    }

    test("left on the quadrant, the void takes the player as it drops and the run ends in death on F+13", async () => {
      const observed = await fallFromTick4(null);
      expect({ ...observed, path: observed.path.at(-1) }).toEqual({
        moves: [[4, "quadrant-falls"], [6, "fall-loop"], [15, "escape"]],
        chat: ["The quadrant begins to collapse! Jump across the stones!", "The void consumes you."],
        gone: [[17, "consumed"]],
        fallHits: [[17, 255, 0]],
        ended: [[17, "death"]],
        path: [17, 19, 9],
        bossShownAfterDrop: false,
      });
    });

    test("a click on the north arm's nearest stone walks to its bank, hops a stone a tick to the north-west wedge, and the run ends cleared on F+13 with the boss gone with his quadrant", async () => {
      const observed = await fallFromTick4({ x: 15, y: 9 });
      expect({ gone: observed.gone, fallHits: observed.fallHits, ended: observed.ended, path: observed.path, bossShownAfterDrop: observed.bossShownAfterDrop }).toEqual({
        bossShownAfterDrop: false,
        gone: [[17, "escaped"]],
        fallHits: [],
        ended: [[17, "quadrant-cleared"]],
        path: [[4, 19, 9], [5, 17, 9], [6, 15, 9], [7, 15, 6], [8, 15, 3], [9, 13, 3], [10, 13, 3], [11, 13, 3], [12, 13, 3], [13, 13, 3], [14, 13, 3], [15, 13, 3], [16, 13, 3], [17, 13, 3]],
      });
    });

    test("a click across the east arm onto the south-east wedge crosses by the east arm's stones", async () => {
      const observed = await fallFromTick4({ x: 24, y: 17 });
      expect({ ended: observed.ended, path: observed.path.slice(0, 7) }).toEqual({
        ended: [[17, "quadrant-cleared"]],
        path: [[4, 19, 9], [5, 19, 11], [6, 19, 13], [7, 22, 13], [8, 25, 13], [9, 25, 15], [10, 25, 15]],
      });
    });
  });

  test("quadrant 1 runs as the logs do: swings 4 and 7 after he lands, the slash at 10, the spin at 24, Untether at 53 and with the quadrant standing a swing at U+37", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(U + 38);
    const moves = drill.moves();
    drill.dispose();
    expect(moves).toEqual([
      [4, "swing"], [7, "swing"], [10, "shadow-slash"],
      [14, "swing"], [17, "swing"], [20, "shadow-slash"],
      [24, "spin"], [29, "last-saw"],
      [33, "swing"], [36, "swing"], [39, "shadow-slash"],
      [43, "swing"], [46, "swing"], [49, "shadow-slash"],
      [53, "untether"], [82, "slam"],
      [90, "swing"],
    ]);
  });

  test("the specials take turns as in every recorded quadrant 1: spin, Untether, spin, Insolence, spin, Untether", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(209);
    const specials = drill.moves().filter(([, move]) => move === "spin" || move === "untether");
    const insolence = drill.events("boss-shouted").filter((event) => event.text === "Insolence...").map((event) => event.at);
    drill.dispose();
    expect({ specials, insolence }).toEqual({ specials: [[24, "spin"], [53, "untether"], [110, "spin"], [179, "spin"], [208, "untether"]], insolence: [I] });
  });

  test.each([
    { prayer: "Protect from Melee" as const, hits: [[4, 2, "melee"], [7, 5, "melee"], [14, 4, "melee"], [17, 1, "melee"]] },
    { prayer: null, hits: [[4, 8, null], [7, 19, null], [14, 17, null], [17, 7, null]] },
  ])("a swing in reach is chip of 0 to 6 through Protect from Melee and up to 26 without it: $prayer", async ({ prayer, hits }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    if (prayer !== null) drill.pray(prayer);
    drill.tickTo(18);
    const swings = drill.events("player-hit").filter((event) => event.hit.kind === "swing").map((event) => [event.at, event.receipt.requested, event.receipt.prayer]);
    drill.dispose();
    expect(swings).toEqual(hits);
  });

  test("with nobody in reach as a swing comes, a panic shot takes its place, lands 2 ticks on as magic, and his next move comes 6 ticks after it", async () => {
    const drill = await startP3Drill({ seed: 1 });
    drill.pray("Protect from Magic");
    drill.tickTo(3);
    await drill.click(FAR_EAST);
    drill.tickTo(14);
    const observed = {
      moves: drill.moves(),
      shout: drill.events("boss-shouted").map((event) => [event.at, event.text]),
      panic: drill.events("player-hit").filter((event) => event.hit.kind === "panic").map((event) => [event.at, event.receipt.requested, event.receipt.prayer]),
      stage: drill.row(7).phase.stage,
    };
    drill.dispose();
    expect(observed).toEqual({ moves: [[4, "swing"], [7, "panic"], [13, "shadow-slash"]], shout: [[7, "Your panic... is futile..."]], panic: [[9, 0, "magic"]], stage: "panic" });
  });

  test("the shadow slash lands the tick after his animation, typeless, through Protect from Melee", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Melee");
    drill.tickTo(12);
    const slashes = hitsOf(drill, "shadow-slash");
    const aimed = drill.events("band-aimed").map((event) => [event.at, event.attack, event.landsAt]);
    drill.dispose();
    expect({ slashes, aimed }).toEqual({ slashes: [[11, 28, "melee"]], aimed: [[10, "shadow-slash", 11]] });
  });

  describe("the shadow slash is 3 wide from the ring around his body, snapped to the nearest of 8 directions from his middle tile", () => {
    async function slashAt(east: number, south: number) {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.tickTo(9);
      const { x, y } = drill.boss().location;
      drill.place({ x: x + 1 + east, y: y - 1 + south });
      drill.tickTo(10);
      const band = bandFrom(drill, 10);
      drill.dispose();
      return band;
    }

    test("straight: the 3 tiles in line with his body, out to the wedge's edge", async () => {
      const south = await slashAt(0, 2);
      expect({ inLine: south.every(([east, s]) => Math.abs(east) <= 1 && s >= 2), first: [-1, 0, 1].every((east) => has(south, east, 2)) }).toEqual({ inLine: true, first: true });
    });

    test("diagonal: 2 east and 1 south of his middle snaps to south-east, 3 wide from his corner and outside his 3x3", async () => {
      const se = await slashAt(2, 1);
      expect({
        diagonal: se.every(([east, south]) => east >= 1 && south >= 1 && Math.abs(east - south) <= 1),
        fromCorner: has(se, 2, 2) && has(se, 2, 1) && has(se, 1, 2),
        outside: has(se, 1, 1) || has(se, 3, 1),
      }).toEqual({ diagonal: true, fromCorner: true, outside: false });
    });
  });

  describe("the spin: its saw cuts 5 ticks in, and an overhead up the tick before is severed", () => {
    test("guard, already held: Protect from Melee kept up: severed on P+4 with the game's chat and locked off for 3 ticks, so the cut on P+5 hits and a click turns it on again only for P+8", async () => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.pray("Protect from Melee");
      drill.tickTo(P + 5);
      const chat = drill.region.chat().filter((line) => !line.startsWith("Invincible"));
      const prayerAfterClick = [P + 6, P + 7, P + 8].map((t) => {
        drill.pray("Protect from Melee");
        drill.tickTo(t);
        return [t, drill.row(t).playerAtBossStep.prayer];
      });
      const observed = { severed: drill.events("prayer-severed").map((event) => [event.at, event.lockedFor]), saw: hitsOf(drill, "saw"), chat, prayerAfterClick };
      drill.dispose();
      expect(observed).toEqual({
        severed: [[P + 4, 3]],
        saw: [[P + 5, 17, null]],
        chat: ["Ocellus disrupts your concentration, severing your prayer!", "You've been injured and can't use protection prayers!"],
        prayerAfterClick: [[P + 6, null], [P + 7, null], [P + 8, "melee"]],
      });
    });

    test("flicked, off for P+4 and back on for the cut: nothing severed and the cut is blocked", async () => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.pray("Protect from Melee");
      drill.tickTo(P + 3);
      drill.pray("Protect from Melee");
      drill.tickTo(P + 4);
      drill.pray("Protect from Melee");
      drill.tickTo(P + 6);
      const observed = { severed: drill.events("prayer-severed").length, saw: drill.events("player-hit").filter((event) => event.hit.kind === "saw").map((event) => [event.at, event.receipt.applied, event.receipt.prayer]) };
      drill.dispose();
      expect(observed).toEqual({ severed: 0, saw: [[P + 5, 0, "melee"]] });
    });

    test.each([
      { name: "off after P+1, on after P+4", toggles: [P + 1, P + 4], severed: [], saw: [[P + 5, 0, "melee"]] },
      { name: "off after P+3, on after P+4", toggles: [P + 3, P + 4], severed: [], saw: [[P + 5, 0, "melee"]] },
      { name: "off after P+1, on after P+5, a tick late", toggles: [P + 1, P + 5], severed: [], saw: [[P + 5, 17, null]] },
      { name: "off after P+4, during the tell", toggles: [P + 4], severed: [P + 4], saw: [[P + 5, 17, null]] },
      { name: "held through", toggles: [], severed: [P + 4], saw: [[P + 5, 17, null]] },
      { name: "off and on both after P+2", toggles: [P + 2, P + 2], severed: [P + 4], saw: [[P + 5, 17, null]] },
    ])("guard, PR 75's quadrant 1 flick rows moved to the S+5 landing: Protect from Melee on, then $name", async ({ toggles, severed, saw }) => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.pray("Protect from Melee");
      for (const after of toggles) {
        drill.tickTo(after);
        drill.pray("Protect from Melee");
      }
      drill.tickTo(P + 6);
      const observed = { severed: drill.events("prayer-severed").map((event) => event.at), saw: hitsOf(drill, "saw") };
      drill.dispose();
      expect(observed).toEqual({ severed, saw });
    });

    test.each([
      { prayer: "Protect from Melee" as const, opening: [[P + 1, "spin-opening", 0, 0, "melee"]] },
      { prayer: null, opening: [[P + 1, "spin-opening", 1, 1, null]] },
    ])("the spin opens with a melee hit on P+1 that Protect from Melee blocks: $prayer", async ({ prayer, opening }) => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      if (prayer !== null) drill.pray(prayer);
      drill.tickTo(P + 2);
      const observed = drill.events("player-hit").filter((event) => event.hit.kind === "spin-opening").map((event) => [event.at, event.hit.kind, event.receipt.requested, event.receipt.applied, event.receipt.prayer]);
      drill.dispose();
      expect(observed).toEqual(opening);
    });

    test("he stands through the spin and walks again after its last cut", async () => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.tickTo(P + 6);
      const stances = [P - 1, P, P + 4, P + 5].map((t) => drill.row(t).phase.boss);
      drill.dispose();
      expect(stances).toEqual(["chasing", "standing", "standing", "chasing"]);
    });
  });

  describe("Untether: he rises in his corner; be under his 3x3 by U+28 and one tile out on U+29", () => {
    async function untether(plan: Readonly<Record<27 | 28 | 29, "under" | "out">>) {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.tickTo(U - 2);
      drill.pray("Protect from Magic");
      drill.tickTo(U + 26);
      const tiles = { under: { x: CORNER.x + 1, y: CORNER.y }, out: { x: CORNER.x + 1, y: CORNER.y + 1 } };
      for (const t of [27, 28, 29] as const) {
        drill.tickTo(U + t);
        drill.place(tiles[plan[t]]);
      }
      drill.tickTo(U + 31);
      const typeless = drill.events("player-hit").filter((event) => event.hit.kind === "untether-slam" || event.hit.kind === "untether-aftershock").map((event) => [event.at - U, event.hit.kind]);
      const magic = hitsOf(drill, "untether-magic").map(([at, applied, prayer]) => [at - U, applied, prayer]);
      const slam = drill.moves().flatMap(([at, move]) => (move === "slam" ? [at - U] : []));
      const corner = { x: drill.boss().location.x, y: drill.boss().location.y };
      drill.dispose();
      return { typeless, magic, slam, corner };
    }

    test("guard, already held: the magic lands 10, 14, 18 and 22 ticks in, blocked by Protect from Magic, and he hovers in the corner the logs put him in", async () => {
      const { magic, corner } = await untether({ 27: "under", 28: "under", 29: "out" });
      expect({ magic, corner }).toEqual({ magic: [[10, 0, "magic"], [14, 0, "magic"], [18, 0, "magic"], [22, 0, "magic"]], corner: CORNER });
    });

    test.each([
      { plan: { 27: "under", 28: "under", 29: "out" } as const, typeless: [] },
      { plan: { 27: "under", 28: "out", 29: "out" } as const, typeless: [[29, "untether-slam"]] },
      { plan: { 27: "under", 28: "under", 29: "under" } as const, typeless: [[30, "untether-aftershock"]] },
      { plan: { 27: "out", 28: "out", 29: "out" } as const, typeless: [[29, "untether-slam"]] },
    ])("guard, already held: ending U+27, U+28 and U+29 $plan.27, $plan.28 and $plan.29, the slam on U+29 takes $typeless", async ({ plan, typeless }) => {
      const { slam, ...hits } = await untether(plan);
      expect({ slam, typeless: hits.typeless }).toEqual({ slam: [29], typeless });
    });

    test("the purple marker on his 3x3 keeps its 9 meshes from one tick to the next while he hovers in place", async () => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      const scene = new THREE.Scene();
      const models = drill.region.entities.map((entity) => ({ entity, model: entity.get3dModel() }));
      const purpleTilesAt = (t: number) => {
        drill.tickTo(t);
        models.forEach(({ entity, model }) => model?.draw(scene, 0, 0, entity.getPerceivedLocation(0), 0, 0, entity.visible(0), []));
        const tiles: THREE.Object3D[] = [];
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial && object.material.color.getHexString() === "9f48bd") tiles.push(object);
        });
        return tiles;
      };
      const [first, second] = [purpleTilesAt(U + 1), purpleTilesAt(U + 2)];
      drill.dispose();
      expect({ first: first.length, kept: second.filter((mesh) => first.includes(mesh)).length }).toEqual({ first: 9, kept: 9 });
    });
  });

  test("Insolence: superior slashes animate 2, 7 and 12 ticks after the shout and land 3 later, and his swings resume 20 after it", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(I + 21);
    const observed = {
      slashes: drill.moves().filter(([at, move]) => at >= I && move === "superior-slash").map(([at]) => at - I),
      landings: hitsOf(drill, "superior-slash").map(([at]) => at - I),
      next: drill.moves().find(([at, move]) => at > I && move === "swing")?.[0],
    };
    drill.dispose();
    expect(observed).toEqual({ slashes: [2, 7, 12], landings: [5, 10, 15], next: I + 20 });
  });

  describe("a quadrant falls the tick after his HP reaches its floor, whatever he is doing, except through Untether", () => {
    async function fallAfter(floorAt: number, until: number) {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.tickTo(floorAt);
      drill.bossHp(3990);
      drill.tickTo(until);
      const observed = drill.moves().filter(([at]) => at > floorAt - 4);
      drill.dispose();
      return observed;
    }

    test("between the second swing and the slash: the slash never comes", async () => {
      expect(await fallAfter(8, 12)).toEqual([[7, "swing"], [9, "quadrant-falls"], [11, "fall-loop"]]);
    });

    test("mid-spin: the rest of the spin goes with the quadrant", async () => {
      expect(await fallAfter(P + 2, P + 6)).toEqual([[P, "spin"], [P + 3, "quadrant-falls"], [P + 5, "fall-loop"]]);
    });

    test("through Untether: it waits for U+31", async () => {
      expect(await fallAfter(U + 11, U + 32)).toEqual([[U + 29, "slam"], [U + 31, "quadrant-falls"]]);
    });

    test("an attack already under way still lands", async () => {
      const drill = await startP3Drill({ seed: 1, invincible: true });
      drill.tickTo(10);
      drill.bossHp(3990);
      drill.tickTo(12);
      const observed = { slash: hitsOf(drill, "shadow-slash").map(([at]) => at), falls: drill.moves().flatMap(([at, move]) => (move === "quadrant-falls" ? [at] : [])) };
      drill.dispose();
      expect(observed).toEqual({ slash: [11], falls: [11] });
    });
  });

  test.each([
    { link: "?phase=p5&seed=1", expected: { phase: "p4", rejected: ["phase=p5"] } },
    { link: "?phase=p4&seed=1", expected: { phase: "p4", rejected: [] } },
    { link: "?phase=p3&seed=1&focus=void-floor", expected: { phase: "p3", rejected: ["focus=void-floor"] } },
  ])("with the P3 flag on, parseRequest opens $expected.phase for $link and rejects $expected.rejected", async ({ link, expected }) => {
    const { parseRequest } = await loadTimings();
    const request = parseRequest(new URL(`http://127.0.0.1:8002/${link}`), () => 99, { p3: true, p2: false });
    expect({ phase: request.phase, rejected: request.rejected }).toEqual(expected);
  });
});
