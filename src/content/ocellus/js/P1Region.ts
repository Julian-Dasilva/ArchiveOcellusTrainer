import { CardinalDirection, InvisibleMovementBlocker, Projectile, Region } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { P1Config } from "./OcellusTimings";
import { OCELLUS_P4 } from "./OcellusTimings";
import { OCELLUS_P1 } from "./OcellusTimingsP1";
import { dress, loadoutSnapshot } from "./OcellusLoadout";
import { OcellusPlayer } from "./OcellusPlayer";
import type { Tile } from "../../../sim/brands";
import { tile } from "../../../sim/brands";
import type { P1Event, P1HitSource, P1Log, P1Snapshot } from "./P1Types";
import { FloorViews } from "./entities/P1Views";
import { OcellusP1 } from "./mobs/OcellusP1";
import { ARENA_SIZE, RIM, ROOM, distanceToBody } from "./p1/arena";

const LETHAL_HIT: Readonly<Record<P1HitSource, string>> = {
  volley: "a volley",
  blast: "the blast",
  "crack-blocked": "a blocked crack",
  strike: "the strike",
};

const { bossPoses, spotAnims, shot } = OCELLUS_P1.presentation;
const FLOOR = ["#4a4339", "#3f392f"] as const;
const SHOT_HEIGHT = 0.4;
/** Client cycles between the strike's shots when the bar sends more than one; each lands with its hit a tick after the cast. */
const STRIKE_SHOT_SPACING = 6;
const CYCLES_PER_TICK = 30;

type Mounted = Readonly<{ kind: "unmounted" }> | Readonly<{ kind: "mounted"; boss: OcellusP1; player: OcellusPlayer; floor: FloorViews; chat: string[] }>;

function playerTile(player: Player): Tile {
  return tile(player.location.x, player.location.y);
}

export class P1Region extends Region {
  private mounted: Mounted = { kind: "unmounted" };
  invincible = false;

  constructor(private readonly config: P1Config) {
    super();
  }

  override getName(): string {
    return "Ocellus";
  }

  /** The player starts south of him, by the room's entrance, and looks north into the room. */
  override get initialFacing(): CardinalDirection {
    return CardinalDirection.NORTH;
  }

  override get width(): number {
    return ARENA_SIZE.width;
  }

  override get height(): number {
    return ARENA_SIZE.height;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    const paint = (at: Tile, colour: string) => {
      context.fillStyle = colour;
      context.fillRect(at.x * scale, at.y * scale, scale, scale);
    };
    ROOM.tiles().forEach((at) => paint(at, (at.x + at.y) % 2 === 0 ? FLOOR[0] : FLOOR[1]));
    RIM.tiles().forEach((at) => paint(at, OCELLUS_P4.geometry.walkway.value.top));
  }

  initialiseRegion(): { player: Player } {
    const player: OcellusPlayer = new OcellusPlayer(this, { ...OCELLUS_P1.room.playerSpawn.value }, () => boss.binding, () => false);
    const boss: OcellusP1 = new OcellusP1(this, this.config, player, () => this.invincible);
    dress(player, this.config.choices.setup.option.value);
    for (const edge of ROOM.surround().tiles()) this.addEntity(new InvisibleMovementBlocker(this, { ...edge }));
    this.addPlayer(player);
    this.addMob(boss);
    this.setBoss(boss);
    this.mounted = { kind: "mounted", boss, player, floor: new FloorViews(this), chat: [] };
    return { player };
  }

  /** Unit constructors and Region.reset's setStats pass write SDK default stats, so P1 entry is applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    if (this.mounted.kind === "mounted") this.mounted.boss.enterP1();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    if (this.mounted.kind === "mounted") this.mounted.boss.binding.openTick();
  }

  override postTick(): void {
    if (this.mounted.kind === "unmounted") return;
    const row = this.mounted.boss.binding.finishTick();
    if (!row) return;
    row.events.forEach((event) => this.present(event));
    this.mounted.floor.settle(row.tick);
  }

  private present(event: P1Event): void {
    if (this.mounted.kind === "unmounted") return;
    const { boss, player, floor, chat } = this.mounted;
    switch (event.kind) {
      case "boss-shouted":
        boss.setOverheadText(event.text);
        boss.overheadTextTimer = event.lasts;
        return;
      case "volley-cast": {
        const fire = event.element === "fire";
        boss.facePlayer();
        boss.playAnimation((event.last ? bossPoses.lastVolley : bossPoses.volley).value);
        boss.addSpotAnim({ id: (fire ? spotAnims.fireOnBoss : spotAnims.waterOnBoss).value, channel: "volley" });
        const { startCycle, nearEndCycle, farEndCycle } = shot.value;
        const flight = event.landsAt - event.at;
        this.shoot((fire ? spotAnims.fireShot : spotAnims.waterShot).value, event.toward, flight, startCycle, flight <= OCELLUS_P1.volley.flight.value.near ? nearEndCycle : farEndCycle);
        return;
      }
      case "walk-ended":
        boss.playAnimation(bossPoses.lastVolley.value);
        return;
      case "boss-charged":
        boss.face(event.facing);
        boss.playAnimation(bossPoses.charge.value);
        return;
      case "boss-glowed":
        boss.addSpotAnim({ id: spotAnims.glow.value, channel: "charge" });
        return;
      case "crack-opened":
        floor.openCrack(event.crack);
        return;
      case "crack-closed":
        if (event.outcome === "faded") floor.fadeCrack(event.crack);
        else floor.closeCrack(event.crack, event.at);
        return;
      case "boss-exploded":
        boss.playAnimation(bossPoses.explode.value);
        boss.addSpotAnim({ id: spotAnims.explodeOnBoss.value, channel: "explode" });
        return;
      case "blast-landed": {
        const at = tile(boss.location.x, boss.location.y);
        floor.blast(event.tiles, (place) => distanceToBody(at, place), event.at);
        return;
      }
      case "teleported-out":
        boss.playAnimation(bossPoses.teleportOut.value);
        boss.addSpotAnim({ id: spotAnims.teleportOut.value, channel: "teleport" });
        return;
      case "teleported-in":
        boss.playAnimation(bossPoses.teleportIn.value);
        boss.addSpotAnim({ id: spotAnims.teleportIn.value, channel: "teleport" });
        return;
      case "strike-cast": {
        const target = playerTile(player);
        boss.facePlayer();
        boss.playAnimation(bossPoses.expend.value);
        const flight = event.landsAt - event.at;
        for (let nth = 0; nth < event.shots; nth++) this.shoot(spotAnims.strikeShot.value, target, flight, nth * STRIKE_SHOT_SPACING, flight * CYCLES_PER_TICK + nth * STRIKE_SHOT_SPACING);
        return;
      }
      case "transformed":
        boss.addSpotAnim({ id: spotAnims.transform.value, channel: "transform" });
        return;
      case "player-hit":
        if (event.hit.kind === "volley") player.addSpotAnim({ id: (event.hit.element === "fire" ? spotAnims.fireImpact : spotAnims.waterImpact).value, channel: "p1-impact" });
        return;
      case "death-prevented":
        chat.push(`Invincible: ${LETHAL_HIT[event.source]} would have killed you on tick ${event.at}.`);
        return;
      case "stage-entered":
      case "overhead-switched":
      case "boss-state-changed":
      case "meter-changed":
      case "boss-healed":
      case "player-hit-judged":
      case "block-refunded":
      case "run-ended":
        return;
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  /** A shot that only draws, from `startCycle` to `endCycle` client cycles after the cast: the hit itself is the fight's. */
  private shoot(spotAnim: number, to: Tile, flight: number, startCycle: number, endCycle: number): void {
    if (this.mounted.kind === "unmounted") return;
    this.addProjectile(
      new Projectile(null, 0, this.mounted.boss, { x: to.x + 0.5, y: to.y - 0.5, z: SHOT_HEIGHT }, "magic", {
        setDelay: flight,
        visuals: { spotAnim: { id: spotAnim }, startCycleOffset: startCycle, endCycleOffset: endCycle, verticalOffset: shot.value.height },
      }),
    );
  }

  snapshot(): P1Snapshot | null {
    if (this.mounted.kind === "unmounted") return null;
    const { boss, player } = this.mounted;
    return {
      run: boss.runState(),
      boss: { npcId: OCELLUS_P1.boss.npcId.value, hp: boss.currentStats.hitpoint, maxHp: boss.stats.hitpoint, visible: boss.visible(), defence: boss.currentStats.defence, meter: boss.meter() },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.mounted.kind === "mounted" ? [...this.mounted.chat] : [];
  }

  fightLog(): P1Log {
    const rows = this.mounted.kind === "mounted" ? [...this.mounted.boss.binding.rows] : [];
    return { header: { phase: "p1", seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
