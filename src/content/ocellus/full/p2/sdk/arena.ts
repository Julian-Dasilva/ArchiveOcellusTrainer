import { InvisibleMovementBlocker, Projectile } from "osrs-sdk";
import type { Location3, ProjectileVisuals, Region, Unit } from "osrs-sdk";
import { fullRoom } from "../../../fight/arena";
import type { ATile } from "../../../fight/geometry";
import { GRID, TileSet, at, fromSdk, key, toSdk } from "../../../fight/geometry";
import type { FightPlayer } from "../../../fight/units";
import { Emitter } from "../../../fight/units";
import { SPOT } from "../../data/looks";
import type { Fighter, P2World, Portal } from "../world";

/** His portal shot: aimed at the tile's centre, lifted a fifth of a tile, with no start delay. */
const SHOT = { aimX: 0.5, aimY: -0.5, aimZ: 0.4, verticalOffset: 0.2, startCycleOffset: 0 } as const;

class Shot extends Projectile {
  constructor(from: Unit, to: Location3, delay: number, visuals: ProjectileVisuals) {
    super(null, 0, from, to, "magic", { setDelay: delay, visuals });
  }
}

class PlayerPort implements Fighter {
  constructor(private readonly player: FightPlayer) {}

  /** Glides through the SDK's path interpolation, one tile of the path at a time. */
  hop(to: ATile): void {
    const player = this.player;
    const from = fromSdk(player.location);
    const target = toSdk(to);
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
    player.location = { x: target.x, y: target.y };
    player.destinationLocation = undefined;
    for (let i = 1; i <= steps; i++) {
      const step = toSdk(at(Math.round(from.x + ((to.x - from.x) * i) / steps), Math.round(from.z + ((to.z - from.z) * i) / steps)));
      player.visualPath.push({ x: step.x, y: step.y, run: true });
    }
    player.region.refreshUnitChunk(player);
  }

  teleport(to: ATile): void {
    const target = toSdk(to);
    this.player.setLocation({ x: target.x, y: target.y });
    this.player.destinationLocation = undefined;
  }
}

/** The room, the portal launchers, and the tiles the cross blocks. */
export class Arena implements P2World {
  readonly fighter: Fighter;
  private readonly floor = new TileSet(fullRoom());
  private readonly blocked = new TileSet();
  private readonly blockers = new Map<string, InvisibleMovementBlocker>();
  private readonly emitters = new Map<string, Emitter>();

  constructor(private readonly region: Region, private readonly player: FightPlayer, private readonly boss: Unit) {
    this.fighter = new PlayerPort(player);
    this.syncBlockers();
  }

  isWalkable(t: ATile): boolean {
    return this.floor.has(t) && !this.blocked.has(t);
  }

  hasFloor(t: ATile): boolean {
    return this.floor.has(t);
  }

  raise(portals: readonly Portal[]): void {
    const tiles: ATile[] = [];
    for (const portal of portals) {
      const emitter = new Emitter(this.region, portal.tiles[0]);
      this.region.addMob(emitter);
      this.emitters.set(key(portal.tiles[0]), emitter);
      tiles.push(portal.tiles[0], portal.tiles[1]);
    }
    for (const tile of tiles) this.blocked.add(tile);
    this.syncBlockers();
  }

  shoot(from: ATile, to: ATile, delayTicks: number, endCycleOffset: number): void {
    const emitter = this.emitters.get(key(from));
    if (emitter === undefined) return;
    const target = toSdk(to);
    const visuals: ProjectileVisuals = {
      spotAnim: { id: SPOT.portalProjectile },
      startCycleOffset: SHOT.startCycleOffset,
      endCycleOffset,
      verticalOffset: SHOT.verticalOffset,
    };
    this.region.addProjectile(new Shot(emitter, { x: target.x + SHOT.aimX, y: target.y + SHOT.aimY, z: SHOT.aimZ }, delayTicks, visuals));
  }

  release(): void {
    if (this.player.aggro === this.boss) this.player.setAggro(null);
  }

  /** Every launcher and blocker this phase placed leaves with it. */
  dispose(): void {
    for (const emitter of this.emitters.values()) {
      emitter.dying = 0;
      this.region.removeMob(emitter);
    }
    this.emitters.clear();
    const blockers = new Set<unknown>(this.blockers.values());
    this.region.entities = this.region.entities.filter((entity) => !blockers.has(entity));
    this.blockers.clear();
  }

  private syncBlockers(): void {
    const wanted = new Set<string>();
    for (let sx = 0; sx < GRID; sx++) {
      for (let sy = 0; sy < GRID; sy++) {
        const tile = fromSdk({ x: sx, y: sy });
        if (!this.isWalkable(tile)) wanted.add(key(tile));
      }
    }
    const gone = new Set<unknown>();
    for (const [id, blocker] of this.blockers) {
      if (wanted.has(id)) continue;
      gone.add(blocker);
      this.blockers.delete(id);
    }
    if (gone.size > 0) this.region.entities = this.region.entities.filter((entity) => !gone.has(entity));
    for (const id of wanted) {
      if (this.blockers.has(id)) continue;
      const [x, z] = id.split(",").map(Number);
      const blocker = new InvisibleMovementBlocker(this.region, toSdk(at(x, z)));
      this.blockers.set(id, blocker);
      this.region.addEntity(blocker);
    }
  }
}
