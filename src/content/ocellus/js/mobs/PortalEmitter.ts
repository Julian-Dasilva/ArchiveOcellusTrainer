import { EmptyModel, Mob, Projectile } from "osrs-sdk";
import type { Model, Region } from "osrs-sdk";
import { OCELLUS_P2 } from "../OcellusTimingsP2";
import type { Tile } from "../../../../sim/brands";

const BOLT_HEIGHT = 0.2;

/**
 * An invisible launcher on a portal's first tile, as the game fires each portal's bolt from an invisible NPC. The bolt only shows
 * the volley; `p2/fight.ts` judges its hits.
 */
export class PortalEmitter extends Mob {
  constructor(region: Region, at: Tile) {
    super(region, { x: at.x, y: at.y });
  }

  /** The bolt is over the tile d out `cyclesPerTile × (d - 1)` client cycles after the volley, and gone past the last tile. */
  fire(to: Tile, tiles: number, cyclesPerTile: number, ticks: number): void {
    const visuals = { spotAnim: { id: OCELLUS_P2.spotAnims.portalBolt.value }, startCycleOffset: 0, endCycleOffset: cyclesPerTile * tiles, verticalOffset: BOLT_HEIGHT };
    this.region.addProjectile(new Projectile(null, 0, this, { x: to.x + 0.5, y: to.y - 0.5, z: BOLT_HEIGHT }, "magic", { setDelay: ticks, visuals }));
  }

  override setStats(): void {
    this.stats = { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: 1 };
    this.currentStats = { ...this.stats };
  }

  override mobName(): string {
    return "";
  }

  override get size(): number {
    return 1;
  }

  override visible(): boolean {
    return false;
  }

  override canBeAttacked(): boolean {
    return false;
  }

  override get consumesSpace(): boolean {
    return false;
  }

  override create3dModel(): Model {
    return EmptyModel.forRenderable(this);
  }

  override timerStep(): void {}

  override queueStep(): void {}

  override movementStep(): void {}

  override attackStep(): void {}
}
