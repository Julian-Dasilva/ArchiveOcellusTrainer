import { Unit } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import { tick } from "../../../../../sim/brands";
import type { Enter, Entries, Mounted, PhaseDef } from "../../../../../sim/encounter";
import { identity } from "../../../../../sim/frame";
import type { BossChange } from "../../../../../sim/script";
import { ScriptRun } from "../../../../../sim/script";
import type { EncounterBinding, Hooks } from "../../../../../sim/sdk/EncounterBinding";
import type { PlayerInput } from "../../../../../sim/sdk/EncounterPlayer";
import type { EncounterHost } from "../../../../../sim/sdk/EncounterRegion";
import { GRID, MIDDLE, fromSdk } from "../../../fight/geometry";
import { FightPlayer } from "../../../fight/units";
import { scaledHp } from "../../data/looks";
import { P2 } from "../../data/p2";
import { P2Script } from "../script";
import type { P2Cause, P2Entry, P2Row, P2Types } from "../types";
import { Arena } from "./arena";
import { P2Boss } from "./boss";
import type { ChatLine } from "./views";
import { P2Views } from "./views";

type P2Encounter = Readonly<{ input: PlayerInput; event: never; cause: P2Cause; snapshot: null; row: P2Row; end: never }>;

/** The sidebar's toggles: practice, the danger tiles, the phase 2 skip and pattern tiles, and whether his Defence opens drained. */
export type P2Settings = Readonly<{ practice: () => boolean; hazardTiles: () => boolean; skipMarkers: () => boolean; patternMarkers: () => boolean; defenceDrained: () => boolean }>;

export type P2Mount = Readonly<{ boss: P2Boss; views: P2Views; arena: Arena; script: P2Script<Entries>; now: () => number; started: () => boolean }>;
/** The page's hold on the running phase 2. */
export type P2Watch = { mounted: P2Mount | null };

export type P2Options<E extends Entries> = Readonly<{
  settings: P2Settings;
  watch: P2Watch;
  /** The chatbox outlives the phase, so its lines go to whoever keeps it. */
  say: (line: ChatLine) => void;
  /** Where enough's last tick leads: phase 3, with the blade's HP as it stands. */
  intoP3: (hp: number) => Enter<E>;
}>;

function applied(boss: P2Boss, player: Player, change: BossChange<P2Types>): void {
  switch (change.kind) {
    case "animation":
      void boss.playAnimation(change.id);
      return;
    case "pose":
      boss.pose = change.id;
      return;
    case "said":
      boss.setOverheadText(change.text);
      boss.overheadTextTimer = change.lasts;
      return;
    case "overhead":
      boss.overhead = change.overhead;
      return;
    case "faced-player":
      boss.face(player);
      return;
    case "faced-tile":
      boss.faceTile(change.tile);
      return;
    case "stepped":
      boss.stepTo(change.to);
      return;
    case "jumped":
      throw new Error("phase 2's blade does not jump");
    case "placed":
      boss.teleport(change.to);
      return;
    case "shown":
      boss.hidden = !change.visible;
      return;
    case "targetable":
      boss.attackable = change.targetable;
      return;
    case "spotanim":
      boss.addSpotAnim({ id: change.id, channel: change.channel });
      return;
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

/** Phase 2 written as closures, on the run's one player and in the full fight's arena. */
export function p2Phase<E extends Entries & Readonly<{ p2: P2Entry }>>(options: P2Options<E>): PhaseDef<E, "p2", P2Row, EncounterHost<E>> {
  const { settings, watch } = options;
  return {
    name: "p2",
    enter(host, entry): Mounted<P2Row> {
      const { region, player } = host;
      if (!(player instanceof FightPlayer)) throw new Error("phase 2 runs on the full fight's player");
      const poolMax = scaledHp(P2.hp, 1);
      let binding: EncounterBinding<P2Encounter> | null = null;
      const boss = new P2Boss(
        region,
        MIDDLE,
        {
          allowsDeath: () => false,
          afterHits: (form) => {
            form.currentStats.hitpoint = Math.max(form.currentStats.hitpoint, script.hpFloor(poolMax));
          },
          acceptsAttack: () => true,
          incomingDamageFactor: () => 1,
          defenceDrained: settings.defenceDrained,
        },
        poolMax,
        (actor, resolve) => {
          if (binding === null) resolve();
          else binding.npcTurn(actor, resolve);
        },
      );
      boss.currentStats.hitpoint = poolMax;
      const arena = new Arena(region, player, boss);
      const script: P2Script<E> = new P2Script<E>(arena, entry, (m) => {
        m.next(options.intoP3(m.boss.hp));
      });
      const run = new ScriptRun<E, P2Types>(
        script,
        {
          seed: host.seed,
          body: {
            at: () => boss.tile,
            hp: () => boss.currentStats.hitpoint,
            maxHp: () => boss.stats.hitpoint,
            defence: () => boss.currentStats.defence,
            apply: (change) => applied(boss, player, change),
            heal: (amount) => {
              boss.currentStats.hitpoint = Math.min(boss.stats.hitpoint, boss.currentStats.hitpoint + amount);
            },
          },
          player: () => ({ tile: player.arenaTile(), hp: player.currentStats.hitpoint, prayer: player.protection() }),
          healPlayer: (amount) => {
            player.currentStats.hitpoint = Math.min(player.stats.hitpoint, player.currentStats.hitpoint + amount);
          },
          next: (to) => host.next(to),
        },
        tick(0),
      );
      const hooks: Hooks<P2Encounter> = {
        "tick-opened": ({ time }) => run.open(time.encounter, time.world),
        "before-npc-hits": () => ({ snapshot: null, outputs: [] }),
        "npc-turn": () => ({ outputs: run.requested().map(({ cause, damage }) => ({ kind: "hit", damage, cause })), ending: null }),
        "hit-applied": ({ hit }) => {
          run.landed(hit.cause, hit.receipt);
          return [];
        },
        "player-hits-settled": ({ player: hp }) => (settings.practice() && script.outcome.kind === "running" && hp.hp <= 0 ? [{ kind: "heal", amount: hp.maxHp, limit: "max-hp" }] : []),
        "player-moved": () => undefined,
        "tick-ended": ({ inputs, combatDraws }) => ({ row: run.close(combatDraws, inputs), ending: null }),
      };
      binding = host.bind(tick(0), hooks);
      region.addMob(boss);
      region.setBoss(boss);
      const views = new P2Views(region, { player }, settings.hazardTiles, settings.skipMarkers, settings.patternMarkers, options.say);
      const bound = binding;
      watch.mounted = { boss, views, arena, script, now: () => run.now, started: () => bound.rows.length > 0 };
      return {
        frame: identity({ width: GRID, height: GRID }),
        rules: {
          judge: () => ({ outcome: "passed" }),
          hpFloor: () => script.hpFloor(poolMax),
          walk: (to) => (script.interceptWalk(fromSdk(to)) ? { kind: "handled" } : { kind: "sdk" }),
          canAttack: () => true,
          lineOfSight: () => "sdk",
        },
        ready() {},
        openTick: () => bound.openTick(),
        finishTick: () => {
          const row = bound.finishTick();
          if (row) views.present(row);
        },
        rows: () => bound.rows,
        leave() {
          run.leave();
          views.dispose();
          arena.dispose();
          region.removeMob(boss);
          if (player.aggro === boss) player.setAggro(null);
          watch.mounted = null;
        },
      };
    },
  };
}
