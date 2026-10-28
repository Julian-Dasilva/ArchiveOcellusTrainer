import { ControlPanelController, Settings, Viewport } from "osrs-sdk";
import type { Item, TrainerInstance } from "osrs-sdk";
import { loadoutSnapshot } from "../js/OcellusLoadout";
import type { DrillConfig } from "../js/OcellusTimings";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import type { FightLog, FightSnapshot } from "../js/P4Types";
import type { Pause, RunClock } from "../../../sim/sdk/RunClock";
import { toLocal, toRoom } from "../../../sim/frame";
import { tile } from "../../../sim/brands";
import type { FightRegion } from "./region";

type At = Readonly<{ x: number; y: number }>;

declare global {
  interface Window {
    /** Phase 4 as the verification harness reads it, in the platform's own tiles. Every field is null until phase 4 opens. */
    __archiveOcellusProbe?: Readonly<{
      snapshot(): P4ProbeSnapshot;
      log(): P4ProbeLog;
      tileCentre(at: At): At | null;
      /** Sets phase 4's boss HP, so a check reaches a kill in a few hits. */
      setBossHp(hp: number): void;
    }>;
  }
}

type P4ProbeSnapshot = Readonly<{
  ticking: boolean;
  tick: number;
  player: At | null;
  destination: At | null;
  fight: FightSnapshot | null;
  panel: Readonly<{ tab: string | null; keys: Readonly<Record<"inventory" | "spellbook" | "prayer" | "equipment" | "combat", string>> }>;
  menu: readonly string[] | null;
  icons: Readonly<Record<string, Readonly<{ path: string; size: string }>>>;
}>;

type P4ProbeLog = FightLog & Readonly<{ pauses: readonly Pause[] }>;

function drawnIcons(items: readonly (Item | null | undefined)[]): P4ProbeSnapshot["icons"] {
  return Object.fromEntries(
    items.flatMap((item) => {
      if (!item || typeof item.cacheItemId !== "number" || !(item.inventorySprite instanceof HTMLImageElement)) return [];
      const { src, naturalWidth, naturalHeight } = item.inventorySprite;
      return [[item.cacheItemId, { path: new URL(src).pathname, size: `${naturalWidth}x${naturalHeight}` }]];
    }),
  );
}

export function exposeP4Probe(trainer: TrainerInstance, region: FightRegion, clock: RunClock, config: DrillConfig): void {
  window.__archiveOcellusProbe = Object.freeze({
    snapshot(): P4ProbeSnapshot {
      const { player, world } = trainer.getSnapshot();
      const { contextMenu } = Viewport.viewport;
      const p4 = region.p4.mounted;
      const local = (at: At | null | undefined): At | null => (p4 && at ? { ...toLocal(p4.frame, at) } : null);
      return {
        ticking: !world.isPaused,
        tick: world.globalTickCounter,
        player: local(player?.location),
        destination: local(player?.destinationLocation),
        fight: p4 && {
          run: p4.ocellus.runState(),
          boss: { npcId: OCELLUS_P4.boss.npcId.value, hp: p4.ocellus.currentStats.hitpoint, maxHp: p4.ocellus.stats.hitpoint, visible: p4.ocellus.visible(), defence: p4.ocellus.currentStats.defence },
          player: loadoutSnapshot(p4.player),
        },
        panel: {
          tab: Object.entries(ControlPanelController.controls).find(([, control]) => control === ControlPanelController.controller.selectedControl)?.[0] ?? null,
          keys: { inventory: Settings.inventory_key, spellbook: Settings.spellbook_key, prayer: Settings.prayer_key, equipment: Settings.equipment_key, combat: Settings.combat_key },
        },
        menu: contextMenu.isActive ? contextMenu.menuOptions.map((option) => option.text.map((block) => `${block.text}`).join("")) : null,
        icons: player ? drawnIcons([...player.inventory, ...Object.values(player.equipment)]) : {},
      };
    },
    log: () => ({ header: { seed: config.seed, choices: config.choices }, rows: region.rows("p4"), pauses: clock.pauses() }),
    tileCentre: (at) => {
      const p4 = region.p4.mounted;
      return p4 && Viewport.viewport.projectTile(toRoom(p4.frame, tile(at.x, at.y)), trainer.getSnapshot().world);
    },
    setBossHp: (hp) => {
      const p4 = region.p4.mounted;
      if (p4) p4.ocellus.currentStats.hitpoint = hp;
    },
  });
}
