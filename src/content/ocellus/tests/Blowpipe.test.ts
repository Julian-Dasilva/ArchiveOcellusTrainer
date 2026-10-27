import { AttackStyle, AttackStylesController, Settings, TrainerInstance, Viewport } from "osrs-sdk";
import { BossForm, FightPlayer } from "../fight/units";
import type { StartPhase } from "../full/options";
import type { FightRegion } from "../full/prefix";
import { fullFightStaged } from "../full/prefix";
import { PHASE_RANGED_DEFENCE, dressFullFight } from "../fight/blowpipe";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { OCELLUS_P1 } from "../js/OcellusTimingsP1";
import { OCELLUS_P2 } from "../js/OcellusTimingsP2";

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
});
