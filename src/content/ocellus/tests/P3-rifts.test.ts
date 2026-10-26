import type { Mob } from "osrs-sdk";
import type { At } from "./drill";
import { footprintCentre, startP3Drill } from "./p3drill";

const loadTimings = () => vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");

const KILL_CHAT = "Destroying the void rift empowers you!";

type Drill = Awaited<ReturnType<typeof startP3Drill>>;

function standingRift(drill: Drill): Mob {
  const found = drill.region.mobs.find((mob) => mob.mobName() === "Void Rift");
  if (!found) throw new Error("no Void Rift stands");
  return found;
}

function recordPoses(mob: Mob): number[] {
  const sequences: number[] = [];
  mob.setAnimationListener({ animationChanged: (id) => Promise.resolve(void sequences.push(id)), modelChanged: () => undefined });
  return sequences;
}

function tilesFromBoss(at: At, boss: Mob): number {
  const across = Math.max(boss.location.x - at.x, 0, at.x - (boss.location.x + boss.size - 1));
  const along = Math.max(boss.location.y - boss.size + 1 - at.y, 0, at.y - boss.location.y);
  return Math.max(across, along);
}

describe("P3 void rifts", () => {
  test("in quadrant 1 the first rift appears 32 ticks after the second special starts, at 86, and the next one 48 ticks later", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(134);
    const observed = {
      specials: drill.events("stage-entered").filter((event) => event.stage === "smite-1").map((event) => event.at),
      spawned: drill.events("rift-spawned").map((event) => [event.at, event.rift]),
    };
    drill.dispose();
    expect(observed).toEqual({ specials: [27, 54, 81, 108], spawned: [[86, "rift-86-0"], [134, "rift-134-0"]] });
  });

  test.each([{ start: 2 }, { start: 3 }])("in quadrant $start the first rift appears 3 ticks after the quadrant starts and each next one 48 ticks later", async ({ start }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true, start });
    drill.tickTo(99);
    const spawned = drill.events("rift-spawned").map((event) => [event.at, event.rift]);
    drill.dispose();
    expect(spawned).toEqual([[3, "rift-3-0"], [51, "rift-51-0"], [99, "rift-99-0"]]);
  });

  test("a rift appears on a floor tile of the boss's wedge, never closer than 2 tiles to his 3x3: seeds 1 to 12, rifts at 3 and 51 in quadrant 2", async () => {
    const { OCELLUS_P3 } = await loadTimings();
    const placed: { onWedge: boolean; fromBoss: number }[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const drill = await startP3Drill({ seed, invincible: true, start: 2 });
      for (const at of [3, 51]) {
        drill.tickTo(at);
        const [spawned] = drill.events("rift-spawned").filter((event) => event.at === at);
        placed.push({ onWedge: OCELLUS_P3.arena.grid.value[spawned.tile.y][spawned.tile.x] === "1", fromBoss: tilesFromBoss(spawned.tile, drill.boss()) });
      }
      drill.dispose();
    }
    expect({ rifts: placed.length, allOnWedge: placed.every((rift) => rift.onWedge), nearest: Math.min(...placed.map((rift) => rift.fromBoss)) }).toEqual({ rifts: 24, allOnWedge: true, nearest: 2 });
  });

  test("an unkilled rift detonates 30 ticks after it appears, at 33, hitting for seed 1's 39, and plays its detonate pose", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true, start: 2 });
    drill.tickTo(4);
    const poses = recordPoses(standingRift(drill));
    drill.tickTo(40);
    const observed = {
      bursts: drill.events("player-hit").flatMap(({ at, hit, receipt }) => (hit.kind === "rift-burst" ? [[at, hit.rift, receipt.requested]] : [])),
      destroyed: drill.events("rift-destroyed"),
      chat: drill.region.chat().filter((line) => line === KILL_CHAT),
      poses,
    };
    drill.dispose();
    expect(observed).toEqual({ bursts: [[33, "rift-3-0", 39]], destroyed: [], chat: [], poses: [14896, 14898] });
  });

  test("a rift killed by a bow shot is destroyed on the tick it dies, says the kill chat, resets the attack delay and never detonates", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true, start: 2 });
    drill.tickTo(4);
    const rift = standingRift(drill);
    const poses = recordPoses(rift);
    await drill.click(drill.events("rift-spawned")[0].tile);
    drill.tickTo(7);
    const hpBeforeKill = rift.currentStats.hitpoint;
    drill.tickTo(8);
    const attackDelayOnKill = drill.player().attackDelay;
    drill.tickTo(40);
    const observed = {
      hpBeforeKill,
      destroyed: drill.events("rift-destroyed").map((event) => [event.at, event.rift, event.tile]),
      attackDelayOnKill,
      bursts: drill.events("player-hit").filter(({ hit }) => hit.kind === "rift-burst").length,
      chat: drill.region.chat().filter((line) => line === KILL_CHAT),
      poses,
    };
    drill.dispose();
    expect(observed).toEqual({ hpBeforeKill: 44, destroyed: [[8, "rift-3-0", { x: 26, y: 9 }]], attackDelayOnKill: -1, bursts: 0, chat: [KILL_CHAT], poses: [14896, 14897] });
  });

  test("a standard ranged shot rolls on a phase 3 rift as on any target: seed 4's first bow shot takes 8 and the second finishes it on 13", async () => {
    const drill = await startP3Drill({ seed: 4, invincible: true, start: 2 });
    drill.tickTo(4);
    const rift = standingRift(drill);
    await drill.click(drill.events("rift-spawned")[0].tile);
    drill.tickTo(8);
    const hpAfterFirstShot = rift.currentStats.hitpoint;
    drill.tickTo(13);
    const destroyed = drill.events("rift-destroyed").map((event) => event.at);
    drill.dispose();
    expect({ hpAfterFirstShot, destroyed }).toEqual({ hpAfterFirstShot: 36, destroyed: [13] });
  });

  test.each([
    { name: "guard, it also holds where no rift ever spawns: no rift appears on the tick quadrant 2 breaks", bossHp: 2626, expected: { ended: [[3, "quadrant-cleared"]], spawned: [] } },
    { name: "the rift appears on that tick when quadrant 2 holds", bossHp: 2700, expected: { ended: [], spawned: [[3, "rift-3-0"]] } },
  ])("$name at ⌊5250 × 0.5⌋ = 2625: bosshp=$bossHp, seed 100's first shot of 54 lands on P3 tick 3", async ({ bossHp, expected }) => {
    const drill = await startP3Drill({ seed: 100, bossHp, start: 2 });
    drill.tickTo(0);
    await drill.click(footprintCentre(drill.boss()));
    drill.tickTo(4);
    const observed = {
      ended: drill.events("run-ended").map((event) => [event.at, event.reason.kind]),
      spawned: drill.events("rift-spawned").map((event) => [event.at, event.rift]),
    };
    drill.dispose();
    expect(observed).toEqual(expected);
  });
});
