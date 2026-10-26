import { Settings, TestNpc, Viewport, World } from "osrs-sdk";
import { seed, tile } from "../brands";
import type { PhaseDef, Rules, Walk } from "../encounter";
import { EncounterPlayer } from "./EncounterPlayer";
import { EncounterRegion } from "./EncounterRegion";
import { identity, toRoom } from "../frame";

type Drill = Readonly<{ only: Readonly<{ kind: "fresh" }> }>;

function started(walk: () => Walk, sight: () => "sdk" | "granted") {
  const log: string[] = [];
  const rules: Rules = {
    judge: () => ({ outcome: "passed" }),
    hpFloor: () => 0,
    walk,
    canAttack: () => true,
    lineOfSight: sight,
  };
  const size = { width: 20, height: 20 };
  const only: PhaseDef<Drill, "only", Readonly<{ n: number }>> = {
    name: "only",
    enter(host, entry) {
      return {
        frame: identity(size),
        rules,
        ready() {
          log.push(`${entry.kind} ${host.seed}`);
        },
        openTick() {},
        finishTick() {},
        rows: () => [],
        leave() {},
      };
    },
  };
  const region = new EncounterRegion({
    room: {
      size,
      drawFloor() {},
      mount() {
        return { dispose() {} };
      },
      spawn: toRoom(identity(size), tile(10, 10)),
    },
    phases: { only },
    start: { phase: "only", entry: { kind: "fresh" } },
    seed: seed(1),
  });
  Settings.readFromStorage();
  const world = new World();
  region.world = world;
  world.addRegion(region);
  Viewport.setupViewport(region, document.createElement("canvas"), document.createElement("div"), true);
  const { player } = region.reset(false);
  if (!(player instanceof EncounterPlayer)) throw new Error("the region built a different player");
  return { region, player, log };
}

describe("an encounter region", () => {
  test("the room sizes the region, and reset readies the start phase", () => {
    const { region, player, log } = started(
      () => ({ kind: "sdk" }),
      () => "sdk",
    );
    expect(region.width).toBe(20);
    expect(region.height).toBe(20);
    expect(player.location).toEqual({ x: 10, y: 10 });
    expect(log).toEqual(["fresh 1"]);
    expect(player.weaponStyle()).toBe("melee");
  });

  test("a hop lands on the phase's tile and drops the current walk, a handled walk stays, and a direct walk still orders the tile", () => {
    let walk: Walk = { kind: "hop", tiles: [tile(3, 4)] };
    const { player } = started(
      () => walk,
      () => "sdk",
    );
    player.destinationLocation = { x: 9, y: 9 };
    player.moveTo(8, 8);
    expect(player.location).toEqual({ x: 3, y: 4 });
    expect(player.destinationLocation).toBeUndefined();

    walk = { kind: "handled" };
    player.moveTo(1, 1);
    expect(player.location).toEqual({ x: 3, y: 4 });
    expect(player.destinationLocation).toBeUndefined();

    walk = { kind: "sdk" };
    player.moveTo(12, 12);
    expect(player.location).toEqual({ x: 3, y: 4 });
    expect(player.destinationLocation).toEqual({ x: 12, y: 12 });

    walk = { kind: "handled" };
    player.destinationLocation = undefined;
    player.walkDirect(tile(6, 6));
    expect(player.location).toEqual({ x: 3, y: 4 });
    expect(player.destinationLocation).toEqual({ x: 6, y: 6 });
  });

  test("granted sight reaches a target, and no target has no line", () => {
    const { region, player } = started(
      () => ({ kind: "sdk" }),
      () => "granted",
    );
    player.setHasLOS();
    expect(player.hasLOS).toBe(false);
    const npc = new TestNpc(region, { x: 12, y: 12 }, {});
    region.addMob(npc);
    player.setAggro(npc);
    player.setHasLOS();
    expect(player.hasLOS).toBe(true);
  });
});
