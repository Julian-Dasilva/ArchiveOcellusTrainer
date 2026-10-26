import { Region, SoundCache, cacheSound } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { DrillConfig, Loadout } from "./OcellusTimings";
import { OCELLUS_P4, defaultLoadout } from "./OcellusTimings";
import { dress, loadoutSnapshot } from "./OcellusLoadout";
import { OcellusPlayer } from "./OcellusPlayer";
import type { FightLog, FightSnapshot } from "./P4Types";
import { ExplosionViews } from "./entities/ExplosionViews";
import { BossLook, FloorHole, FragmentFlash, OrbView, PlayerLook, VoidField } from "./entities/P4Views";
import { BossFootprint, Ocellus } from "./mobs/Ocellus";
import { PLATFORM_ROOM } from "./rooms/platform";
import type { Views } from "./p4/present";
import { presentRow } from "./p4/present";

const { sounds } = OCELLUS_P4.presentation;

type Mounted =
  | Readonly<{ kind: "unmounted" }>
  | Readonly<{ kind: "mounted"; ocellus: Ocellus; player: OcellusPlayer; views: Views }>;

export class OcellusRegion extends Region {
  private mounted: Mounted = { kind: "unmounted" };
  invincible = false;

  constructor(private readonly config: DrillConfig, private readonly loadout: Loadout = defaultLoadout(config.choices.setup.option.value)) {
    super();
  }

  override getName(): string {
    return "Ocellus";
  }

  override get width(): number {
    return PLATFORM_ROOM.size.width;
  }

  override get height(): number {
    return PLATFORM_ROOM.size.height;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    PLATFORM_ROOM.drawFloor(context, scale);
  }

  initialiseRegion(): { player: Player } {
    const player: OcellusPlayer = new OcellusPlayer(
      this,
      { ...PLATFORM_ROOM.spawn },
      () => ocellus.binding,
      (target) => target instanceof Ocellus && target.outOfMeleeReach(),
    );
    const ocellus: Ocellus = new Ocellus(this, this.config, player, () => this.invincible);
    dress(player, this.loadout);
    Object.values(sounds).forEach((sound) => SoundCache.preload(cacheSound(sound.value)));
    const views: Views = {
      field: new VoidField(this),
      holes: ocellus.holes.tiles().map((at) => new FloorHole(this, at)),
      orbs: { "inner-void": new OrbView(this), "outer-void": new OrbView(this) },
      fragment: new FragmentFlash(this),
      explosions: new ExplosionViews(this),
      boss: new BossLook(ocellus),
      player: new PlayerLook(player),
      chat: [],
    };
    [views.field, ...views.holes, views.orbs["inner-void"], views.orbs["outer-void"], views.fragment].forEach((view) => this.addEntity(view));
    PLATFORM_ROOM.mount(this);
    this.addEntity(new BossFootprint(this, ocellus));
    this.addPlayer(player);
    this.addMob(ocellus);
    this.setBoss(ocellus);
    this.mounted = { kind: "mounted", ocellus, player, views };
    return { player };
  }

  /** Unit constructors and Region.reset's setStats pass write SDK default stats, so P4 entry is applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    if (this.mounted.kind === "mounted") this.mounted.ocellus.enterP4();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    if (this.mounted.kind === "mounted") this.mounted.ocellus.binding.openTick();
  }

  override postTick(): void {
    if (this.mounted.kind === "unmounted") return;
    const row = this.mounted.ocellus.binding.finishTick();
    if (row) presentRow(row, this.mounted.views);
  }

  snapshot(): FightSnapshot | null {
    if (this.mounted.kind === "unmounted") return null;
    const { ocellus, player } = this.mounted;
    return {
      run: ocellus.runState(),
      boss: { npcId: OCELLUS_P4.boss.npcId.value, hp: ocellus.currentStats.hitpoint, maxHp: ocellus.stats.hitpoint, visible: ocellus.visible(), defence: ocellus.currentStats.defence },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.mounted.kind === "mounted" ? [...this.mounted.views.chat] : [];
  }

  fightLog(): FightLog {
    const rows = this.mounted.kind === "mounted" ? [...this.mounted.ocellus.binding.rows] : [];
    return { header: { seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
