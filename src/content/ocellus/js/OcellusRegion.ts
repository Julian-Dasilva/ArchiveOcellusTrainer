import type { DrillConfig, Loadout } from "./OcellusTimings";
import { OCELLUS_P4, defaultLoadout } from "./OcellusTimings";
import { loadoutSnapshot } from "./OcellusLoadout";
import type { FightLog, FightSnapshot } from "./P4Types";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import type { P4Entry, P4Watch } from "./p4/phase";
import { p4Phase } from "./p4/phase";
import { PLATFORM_ROOM } from "./rooms/platform";

type DrillEntries = Readonly<{ p4: P4Entry }>;
type DrillPhases = Readonly<{ p4: ReturnType<typeof p4Phase<DrillEntries>> }>;

export class OcellusRegion extends EncounterRegion<DrillEntries, DrillPhases> {
  private readonly watch: P4Watch;

  constructor(private readonly config: DrillConfig, loadout: Loadout = defaultLoadout(config.choices.setup.option.value)) {
    const watch: P4Watch = { invincible: false, mounted: null };
    super({ room: PLATFORM_ROOM, phases: { p4: p4Phase<DrillEntries>(watch) }, start: { phase: "p4", entry: { kind: "drill", config, loadout } }, seed: config.seed });
    this.watch = watch;
  }

  override getName(): string {
    return "Ocellus";
  }

  get invincible(): boolean {
    return this.watch.invincible;
  }

  set invincible(on: boolean) {
    this.watch.invincible = on;
  }

  snapshot(): FightSnapshot | null {
    const mounted = this.watch.mounted;
    if (mounted === null) return null;
    const { ocellus, player } = mounted;
    return {
      run: ocellus.runState(),
      boss: { npcId: OCELLUS_P4.boss.npcId.value, hp: ocellus.currentStats.hitpoint, maxHp: ocellus.stats.hitpoint, visible: ocellus.visible(), defence: ocellus.currentStats.defence },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.watch.mounted === null ? [] : [...this.watch.mounted.views.chat];
  }

  fightLog(): FightLog {
    const rows = this.watch.mounted === null ? [] : [...this.watch.mounted.ocellus.binding.rows];
    return { header: { seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
