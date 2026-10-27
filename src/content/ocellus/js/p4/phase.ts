import { SoundCache, cacheSound } from "osrs-sdk";
import type { DrillConfig, Loadout } from "../OcellusTimings";
import { OCELLUS_P4 } from "../OcellusTimings";
import { dress } from "../OcellusLoadout";
import type { TickRow } from "../P4Types";
import type { Entries, PhaseDef, Rules } from "../../../../sim/encounter";
import { identity } from "../../../../sim/frame";
import type { EncounterPlayer } from "../../../../sim/sdk/EncounterPlayer";
import type { EncounterHost } from "../../../../sim/sdk/EncounterRegion";
import { ExplosionViews } from "../entities/ExplosionViews";
import { BossLook, FloorHole, FragmentFlash, OrbView, PlayerLook, VoidField } from "../entities/P4Views";
import { BossFootprint, Ocellus } from "../mobs/Ocellus";
import { PLATFORM_ROOM } from "../rooms/platform";
import type { Views } from "./present";
import { presentRow } from "./present";

export type P4Entry = Readonly<{ kind: "drill"; config: DrillConfig; loadout: Loadout }>;

export type P4Mount = Readonly<{ ocellus: Ocellus; player: EncounterPlayer; views: Views }>;

/** The page's hold on the running P4: its practice toggle, and the units the drill's snapshot and chat read. */
export type P4Watch = { invincible: boolean; mounted: P4Mount | null };

const { sounds } = OCELLUS_P4.presentation;

function rules(player: EncounterPlayer): Rules {
  return {
    judge: () => {
      throw new Error("P4's boss judges each hit itself, on its binding's turn");
    },
    hpFloor: () => {
      throw new Error("P4's boss floors its own HP");
    },
    walk: () => ({ kind: "sdk" }),
    canAttack: (target) => {
      const swingsMelee = !player.manualSpellCastSelection && player.equipment.weapon?.isMeleeAttack === true;
      return !(swingsMelee && target instanceof Ocellus && target.outOfMeleeReach());
    },
    lineOfSight: () => "sdk",
  };
}

export function p4Phase<E extends Entries & Readonly<{ p4: P4Entry }>>(watch: P4Watch): PhaseDef<E, "p4", TickRow, EncounterHost<E>> {
  return {
    name: "p4",
    enter({ region, player, bind }, { config, loadout }) {
      const ocellus = new Ocellus(region, config, player, () => watch.invincible, bind);
      dress(player, loadout);
      Object.values(sounds).forEach((sound) => SoundCache.preload(cacheSound(sound.value)));
      const views: Views = {
        field: new VoidField(region),
        holes: ocellus.holes.tiles().map((at) => new FloorHole(region, at)),
        orbs: { "inner-void": new OrbView(region), "outer-void": new OrbView(region) },
        fragment: new FragmentFlash(region),
        explosions: new ExplosionViews(region),
        boss: new BossLook(ocellus),
        player: new PlayerLook(player),
        chat: [],
      };
      [views.field, ...views.holes, views.orbs["inner-void"], views.orbs["outer-void"], views.fragment].forEach((view) => region.addEntity(view));
      region.addEntity(new BossFootprint(region, ocellus));
      region.addMob(ocellus);
      region.setBoss(ocellus);
      watch.mounted = { ocellus, player, views };
      return {
        frame: identity(PLATFORM_ROOM.size),
        rules: rules(player),
        ready: () => ocellus.enterP4(),
        openTick: () => ocellus.binding.openTick(),
        finishTick: () => {
          const row = ocellus.binding.finishTick();
          if (row) presentRow(row, views);
        },
        rows: () => ocellus.binding.rows,
        leave: () => {
          throw new Error("P4 is the boss's last phase, so nothing enters after it");
        },
      };
    },
  };
}
