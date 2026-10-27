import { InvisibleMovementBlocker } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import { fullRoom } from "../../../fight/arena";
import type { ATile } from "../../../fight/geometry";
import { GRID, TileSet, at, fromSdk, key, toSdk } from "../../../fight/geometry";
import type { FightPlayer } from "../../../fight/units";
import type { Fighter, P1World } from "../world";
import type { P1Boss } from "./boss";

/** A forced move glides through the SDK's own path interpolation, one tile of the path at a time. */
class PlayerPort implements Fighter {
  constructor(private readonly player: FightPlayer) {}

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
}

/** The open room. Tiles outside it are blocked while phase 1 runs, and leave with it. */
export class Arena implements P1World {
  readonly fighter: Fighter;
  private readonly floor = new TileSet(fullRoom());
  private readonly blockers = new Map<string, InvisibleMovementBlocker>();

  constructor(private readonly region: Region, player: FightPlayer, private readonly boss: P1Boss) {
    this.fighter = new PlayerPort(player);
    this.syncBlockers();
  }

  isFloor(tile: ATile): boolean {
    return this.floor.has(tile);
  }

  claim(): void {
    this.region.setBoss(this.boss);
  }

  reveal(): void {
    this.boss.become("p1");
  }

  revealed(): boolean {
    return this.boss.form === "p1";
  }

  releaseFace(): void {
    this.boss.face(null);
  }

  dispose(): void {
    const blockers = new Set<unknown>(this.blockers.values());
    this.region.entities = this.region.entities.filter((entity) => !blockers.has(entity));
    this.blockers.clear();
  }

  private syncBlockers(): void {
    for (let sx = 0; sx < GRID; sx++) {
      for (let sy = 0; sy < GRID; sy++) {
        const tile = fromSdk({ x: sx, y: sy });
        if (this.floor.has(tile)) continue;
        const id = key(tile);
        if (this.blockers.has(id)) continue;
        const blocker = new InvisibleMovementBlocker(this.region, toSdk(tile));
        this.blockers.set(id, blocker);
        this.region.addEntity(blocker);
      }
    }
  }
}
