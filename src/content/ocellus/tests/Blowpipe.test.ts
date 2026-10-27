import { AttackStyle, AttackStylesController, Settings, TrainerInstance, Viewport } from "osrs-sdk";
import { BossForm, FightPlayer } from "../fight/units";
import type { StartPhase } from "../full/options";
import type { FightRegion } from "../full/prefix";
import { fullFightStaged } from "../full/prefix";
import { BLOWPIPE, PHASE_RANGED_DEFENCE, dressFullFight } from "../fight/blowpipe";
import { QUADRANTS, quadrantOf } from "../fight/geometry";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { OCELLUS_P1 } from "../js/OcellusTimingsP1";
import { OCELLUS_P2 } from "../js/OcellusTimingsP2";
import { startP3 } from "./p3run";

let close: (() => void) | null = null;
afterEach(() => {
  close?.();
  close = null;
});

function open(startPhase: StartPhase, setup: "ranged" | "melee"): FightRegion {
  Settings.readFromStorage();
  const region = fullFightStaged(
    { seed: 1, party: 1, startPhase, hazardTiles: false, videoMarkers: false, skipMarkers: false, soloVine: true, invincible: true },
    (player) => dressFullFight(player, OCELLUS_P4.choices.setup.options[setup].value),
  );
  const trainer = new TrainerInstance(region, { force2d: true });
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.getReadyTimer = 0;
  Viewport.viewport.resize(800, 600);
  close = () => trainer.dispose();
  return region;
}

function player(region: FightRegion): FightPlayer {
  const first = region.players[0];
  if (!(first instanceof FightPlayer)) throw new Error("the region has no full-fight player");
  return first;
}

function boss(region: FightRegion, phase: StartPhase): BossForm {
  const mounted = phase === 1 ? region.p1.mounted : phase === 2 ? region.p2.mounted : region.p3.mounted;
  if (!mounted) throw new Error(`phase ${phase} is not running`);
  return mounted.boss;
}

describe("the full fight's toxic blowpipe", () => {
  test("phase 1 and the blade keep the drill's ranged defence", () => {
    expect(PHASE_RANGED_DEFENCE.p1).toEqual(OCELLUS_P1.boss.rangedDefence.value);
    expect(PHASE_RANGED_DEFENCE.blade).toEqual(OCELLUS_P2.blade.rangedDefence.value);
  });

  test("Rapid is 2 ticks at 5 tiles, and Accurate and Longrange are 3, with the charged dragon-dart bonuses", () => {
    const region = open(1, "ranged");
    const weapon = player(region).equipment.weapon;
    if (!weapon) throw new Error("the full fight dressed no weapon");
    const stance = (style: AttackStyle) => {
      AttackStylesController.controller.setWeaponAttackStyle(weapon, style);
      return { speed: weapon.attackSpeed, range: weapon.attackRange };
    };
    expect({
      name: weapon.itemName,
      id: weapon.cacheItemId,
      accurate: stance(AttackStyle.ACCURATE),
      rapid: stance(AttackStyle.RAPID),
      longrange: stance(AttackStyle.LONGRANGE),
      rangedAttack: weapon.bonuses.attack.range,
      rangedStrength: weapon.bonuses.other.rangedStrength,
    }).toEqual({
      name: "Toxic Blowpipe",
      id: 12926,
      accurate: { speed: 3, range: 5 },
      rapid: { speed: 2, range: 5 },
      longrange: { speed: 3, range: 7 },
      rangedAttack: 30,
      rangedStrength: 55,
    });
  });

  test("phase 1, 2 and 3 each start with it worn, and phase 1 and 2 roll darts against light ranged defence", () => {
    const worn = (phase: StartPhase, setup: "ranged" | "melee") => {
      const region = open(phase, setup);
      try {
        const name = player(region).equipment.weapon?.itemName ?? null;
        if (phase === 1) {
          for (let guard = 0; boss(region, 1).form !== "p1" && guard < 5; guard++) region.world.tickWorld();
        }
        return { name, range: boss(region, phase).bonuses.defence.range };
      } finally {
        close?.();
        close = null;
      }
    };
    expect({
      ranged: worn(1, "ranged"),
      inquisitor: worn(1, "melee"),
      blade: worn(2, "ranged"),
      phase3: worn(3, "ranged"),
    }).toEqual({
      ranged: { name: "Toxic Blowpipe", range: 50 },
      inquisitor: { name: "Toxic Blowpipe", range: 50 },
      blade: { name: "Toxic Blowpipe", range: 100 },
      phase3: { name: "Toxic Blowpipe", range: 250 },
    });
  });

  test("phase 1 shoots Ocellus with it every 2 ticks once he can be attacked", () => {
    const region = open(1, "ranged");
    const you = player(region);
    const ocellus = boss(region, 1);
    for (let guard = 0; !ocellus.attackable && guard < 8; guard++) region.world.tickWorld();
    you.setAggro(ocellus);
    const delays: number[] = [];
    const started = ocellus.currentStats.hitpoint;
    let lowest = started;
    for (let tick = 0; tick < 12; tick++) {
      region.world.tickWorld();
      delays.push(you.attackDelay);
      lowest = Math.min(lowest, ocellus.currentStats.hitpoint);
    }
    expect({ attackable: ocellus.attackable, form: ocellus.form, delays, hit: lowest < started }).toEqual({
      attackable: true,
      form: "p1",
      delays: [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
      hit: true,
    });
  });

  const RANGED_BAG = [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, 12695, 22461, 6685, 3024, 12695, 22461, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 20997, 3024];
  const MELEE_BAG = [28922, 20997, 27235, 27238, 27241, 26235, 28951, 33639, 28310, 12695, 22461, 6685, 3024, 12695, 22461, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 22325, 3024];

  function carried(you: FightPlayer): (number | null)[] {
    return you.inventory.map((item) => (typeof item?.cacheItemId === "number" ? item.cacheItemId : null));
  }

  test("phase 1 starts with the blowpipe worn and the twisted bow still in the bag", () => {
    const dressed = (setup: "ranged" | "melee") => {
      const region = open(1, setup);
      try {
        const you = player(region);
        return { worn: you.equipment.weapon?.cacheItemId ?? null, inventory: carried(you) };
      } finally {
        close?.();
        close = null;
      }
    };
    expect(dressed("ranged")).toEqual({ worn: BLOWPIPE.value.itemId, inventory: RANGED_BAG });
    expect(dressed("melee")).toEqual({ worn: BLOWPIPE.value.itemId, inventory: MELEE_BAG });
  });

  test("a click swaps the blowpipe and the twisted bow, and the next click swaps them back", () => {
    const region = open(1, "ranged");
    const you = player(region);
    const slot = you.inventory.findIndex((item) => item?.cacheItemId === 20997);
    const bow = slot >= 0 ? you.inventory[slot] : null;
    expect(bow?.itemName ?? null).toBe("Twisted Bow");
    if (!bow) return;
    bow.inventoryLeftClick(you);
    const stowed = you.inventory[slot];
    expect({ worn: you.equipment.weapon?.itemName ?? null, stowed: stowed?.itemName ?? null }).toEqual({
      worn: "Twisted Bow",
      stowed: "Toxic Blowpipe",
    });
    if (!stowed) return;
    stowed.inventoryLeftClick(you);
    expect({ worn: you.equipment.weapon?.itemName ?? null, stowed: you.inventory[slot]?.itemName ?? null }).toEqual({
      worn: "Toxic Blowpipe",
      stowed: "Twisted Bow",
    });
  });

  test("the blowpipe and the twisted bow are both still carried after the fall into phase 4", () => {
    const run = startP3({ setup: "ranged" });
    try {
      const fallTo = (count: number) => {
        for (let guard = 0; run.live().arena.destroyed.size < count; guard++) {
          if (guard > 100) throw new Error(`quadrant ${count} never fell`);
          run.tickOnce();
          if (run.region.current !== "p3") return;
          const crumbling = run.live().arena.floorState().crumbling;
          if (crumbling.length > 0 && quadrantOf(run.here()) === crumbling[0]) run.stepOff();
        }
      };
      for (const [floor, count] of [[75, 1], [50, 2]] as const) {
        run.tickTo(run.now() + 2, run.stayInReach);
        run.bossAt(floor);
        fallTo(count);
      }
      run.tickTo(run.now() + 2, run.stayInReach);
      run.bossAt(25);
      while (run.live().arena.floorState().crumbling.length === 0) run.tickOnce();
      const left = QUADRANTS.filter((quadrant) => !run.live().arena.destroyed.has(quadrant) && !run.live().arena.floorState().crumbling.includes(quadrant));
      const standing = left[0];
      if (!standing) throw new Error("no quadrant was left to stand on");
      run.standOn(standing);
      fallTo(3);
      const you = run.player();
      const ids = carried(you);
      expect({
        phase: run.region.current,
        worn: you.equipment.weapon?.cacheItemId ?? null,
        bow: ids.includes(20997),
        pipe: you.equipment.weapon?.cacheItemId === BLOWPIPE.value.itemId || ids.includes(BLOWPIPE.value.itemId),
      }).toEqual({ phase: "p4", worn: BLOWPIPE.value.itemId, bow: true, pipe: true });
    } finally {
      run.close();
    }
  });
});
