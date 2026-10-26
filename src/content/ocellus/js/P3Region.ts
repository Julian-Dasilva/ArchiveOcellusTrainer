import { InvisibleMovementBlocker, Region } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { P3Config } from "./OcellusTimings";
import { OCELLUS_P3, OCELLUS_P4 } from "./OcellusTimings";
import { dress, loadoutSnapshot } from "./OcellusLoadout";
import type { OcellusPlayer } from "./OcellusPlayer";
import { P3Player } from "./P3Player";
import type { Tile } from "../../../sim/brands";
import { tile } from "../../../sim/brands";
import type { BossMove, P3Event, P3HitSource, P3Log, P3Snapshot } from "./P3Types";
import { P3Marks } from "./entities/P3Marks";
import { FloorHole, PlayerLook } from "./entities/P4Views";
import { OcellusP3 } from "./mobs/OcellusP3";
import { ARENA_SIZE, BRAZIERS, STANDING, STONES, footprint } from "./p3/arena";
import { ArenaRoom, Rubble } from "./entities/ArenaRoom";
import { Brazier } from "./entities/Scenery";

const LETHAL_HIT: Readonly<Record<P3HitSource, string>> = {
  swing: "a swing",
  panic: "a panic shot",
  "shadow-slash": "a shadow slash",
  "spin-opening": "the spin's opening hit",
  saw: "a saw of the spin",
  "untether-magic": "Untether's magic",
  "untether-slam": "Untether's slam",
  "untether-aftershock": "Untether's aftershock",
  "superior-slash": "a superior slash",
  bomb: "a void bomb",
  void: "a void",
  rubble: "falling rubble",
  "rift-detonation": "a void rift",
  "quadrant-gone": "the falling quadrant",
};

const { bossPoses, spin, shoutLasts, collapse } = OCELLUS_P3;
type MoveLook = Readonly<{ pose: number | null; spots: readonly number[] }>;
const NO_SPOTS: readonly number[] = [];
const MOVE_LOOK: Readonly<Record<BossMove, MoveLook>> = {
  swing: { pose: bossPoses.swing.value, spots: NO_SPOTS },
  panic: { pose: bossPoses.panic.value, spots: NO_SPOTS },
  "shadow-slash": { pose: bossPoses.shadowSlash.value, spots: NO_SPOTS },
  spin: { pose: bossPoses.spinStarts.value, spots: NO_SPOTS },
  saw: { pose: bossPoses.spinLoops.value, spots: NO_SPOTS },
  "last-saw": { pose: bossPoses.spinEnds.value, spots: NO_SPOTS },
  untether: { pose: bossPoses.untetherStarts.value, spots: NO_SPOTS },
  slam: { pose: bossPoses.slam.value, spots: NO_SPOTS },
  "superior-slash": { pose: bossPoses.superiorSlash.value, spots: NO_SPOTS },
  "quadrant-falls": { pose: bossPoses.quadrantFalls.value, spots: collapse.bossSpotAnims.falls.value },
  "fall-loop": { pose: null, spots: collapse.bossSpotAnims.loops.value },
  escape: { pose: bossPoses.escapeShout.value, spots: collapse.bossSpotAnims.escape.value },
};

type Views = Readonly<{ region: Region; boss: OcellusP3; marks: P3Marks; player: PlayerLook; room: ArenaRoom; rubble: Rubble; holes: FloorHole[]; chat: string[] }>;
type Mounted = Readonly<{ kind: "unmounted" }> | (Readonly<{ kind: "mounted"; unit: OcellusPlayer }> & Views);

function present(event: P3Event, { region, boss, marks, player, room, rubble, holes, chat }: Views): void {
  switch (event.kind) {
    case "boss-moved": {
      const { pose, spots } = MOVE_LOOK[event.move];
      if (pose !== null) boss.playAnimation(pose);
      spots.forEach((id) => boss.addSpotAnim({ id, channel: `move-${id}` }));
      return;
    }
    case "quadrant-collapsing":
      room.crumble(1, collapse.goneAfter.value);
      rubble.start(1, event.at);
      chat.push(collapse.chat.value);
      return;
    case "quadrant-gone":
      room.drop(1);
      rubble.stop();
      holes.splice(0).forEach((hole) => region.removeEntity(hole));
      if (event.player === "consumed") chat.push(collapse.consumedChat.value);
      return;
    case "boss-shouted":
      boss.setOverheadText(event.text);
      boss.overheadTextTimer = shoutLasts.value;
      return;
    case "band-aimed":
      marks.aim(event.attack, event.tiles, event.landsAt);
      return;
    case "prayer-severed":
      chat.push(...spin.severChat.value);
      return;
    case "hazard-shown":
      marks.aim(event.hazard, [event.tile], event.landsAt);
      return;
    case "void-formed": {
      const hole = new FloorHole(region, event.tile);
      holes.push(hole);
      region.addEntity(hole);
      return;
    }
    case "rift-destroyed":
      chat.push(OCELLUS_P4.rifts.killChat.value);
      return;
    case "rift-detonated":
      player.riftBurst();
      return;
    case "death-prevented":
      chat.push(`Invincible: ${LETHAL_HIT[event.source]} would have killed you on tick ${event.at}.`);
      return;
    case "run-ended":
      marks.clear();
      return;
    case "stage-entered":
    case "player-hit":
    case "vine-rooted":
    case "vine-cut":
    case "rift-spawned":
      return;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export class P3Region extends Region {
  private mounted: Mounted = { kind: "unmounted" };
  invincible = false;

  constructor(private readonly config: P3Config) {
    super();
  }

  override getName(): string {
    return "Ocellus";
  }

  override get width(): number {
    return ARENA_SIZE.width;
  }

  override get height(): number {
    return ARENA_SIZE.height;
  }

  initialiseRegion(): { player: Player } {
    const player: OcellusPlayer = new P3Player(this, { ...OCELLUS_P3.arena.playerSpawn.value }, () => boss.binding, (target) => target === boss && boss.levitating());
    const boss: OcellusP3 = new OcellusP3(this, this.config, player, () => this.invincible);
    const marks = new P3Marks(this);
    const room = new ArenaRoom(this, { kind: "chasm", stones: STONES });
    dress(player, this.config.choices.setup.option.value);
    for (const edge of STANDING.surround().tiles()) this.addEntity(new InvisibleMovementBlocker(this, { ...edge }));
    this.addEntity(room);
    BRAZIERS.tiles().forEach((at) => this.addEntity(new Brazier(this, at)));
    this.addEntity(marks);
    this.addPlayer(player);
    this.addMob(boss);
    this.setBoss(boss);
    this.mounted = { kind: "mounted", region: this, boss, unit: player, marks, player: new PlayerLook(player), room, rubble: new Rubble(this), holes: [], chat: [] };
    return { player };
  }

  /** Unit constructors and Region.reset's setStats pass write SDK default stats, so P3 entry is applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    if (this.mounted.kind === "mounted") this.mounted.boss.enterP3();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    if (this.mounted.kind === "mounted") this.mounted.boss.binding.openTick();
  }

  override postTick(): void {
    const views = this.mounted;
    if (views.kind === "unmounted") return;
    const row = views.boss.binding.finishTick();
    if (!row) return;
    const zone: readonly Tile[] = row.phase.boss === "levitating" ? footprint(tile(views.boss.location.x, views.boss.location.y)).tiles() : [];
    views.marks.settle(row.tick, zone);
    row.events.forEach((event) => present(event, views));
    views.rubble.tick(row.tick);
  }

  snapshot(): P3Snapshot | null {
    if (this.mounted.kind === "unmounted") return null;
    const { boss, unit: player } = this.mounted;
    return {
      run: boss.runState(),
      boss: { npcId: OCELLUS_P4.boss.npcId.value, hp: boss.currentStats.hitpoint, maxHp: boss.stats.hitpoint, visible: boss.visible(), defence: boss.currentStats.defence },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.mounted.kind === "mounted" ? [...this.mounted.chat] : [];
  }

  fightLog(): P3Log {
    const rows = this.mounted.kind === "mounted" ? [...this.mounted.boss.binding.rows] : [];
    return { header: { phase: "p3", seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
