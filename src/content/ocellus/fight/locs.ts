import * as THREE from "three";
import { CacheRenderModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import type { ATile } from "./geometry";
import { toSdk } from "./geometry";

/** One cache object on a 1x1 tile: its models, all drawn there, each looping its own baked idle. */
export type LocView = Readonly<{ key: string; tile: ATile; models: readonly number[] }>;

/** Textured cache models (the void hazards are textured, which the instanced renderer does not draw). */
class LocFieldModel implements Model {
  private readonly shown = new Map<string, CacheRenderModel[]>();

  constructor(private readonly field: LocField) {}

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, _location: Location3, _angle: number, pitchRadians: number, visible: boolean): void {
    const wanted = new Set<string>();
    for (const view of this.field.views()) {
      wanted.add(view.key);
      let models = this.shown.get(view.key);
      if (!models) {
        // Scenery: no effects attach to it, so skip building a mesh for every spotanim in the bundle.
        models = view.models.map((id) => CacheRenderModel.forRenderable(this.field, CacheRenderReferences.model(id)));
        this.shown.set(view.key, models);
      }
      const s = toSdk(view.tile);
      // A loc's rotation 0; the instanced model adds a quarter turn meant for actors.
      for (const model of models) model.draw(scene, clockDelta, tickPercent, { x: s.x, y: s.y, z: 0 }, -Math.PI / 2, pitchRadians, visible, []);
    }
    for (const [key, models] of this.shown) {
      if (wanted.has(key)) continue;
      models.forEach((model) => model.destroy(scene));
      this.shown.delete(key);
    }
  }

  clientTick(): void {
    this.shown.forEach((models) => models.forEach((model) => model.clientTick()));
  }

  destroy(scene: THREE.Scene): void {
    this.shown.forEach((models) => models.forEach((model) => model.destroy(scene)));
    this.shown.clear();
  }

  getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** Game objects the fight places on the floor (phase 3's void patches), drawn from their cache models. */
export class LocField extends Entity {
  constructor(region: Region, readonly views: () => readonly LocView[]) {
    super(region, { x: 0, y: 0 });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get size(): number {
    return 1;
  }

  /** Scenery: no Player/NPC outline. */
  override get drawOutline(): boolean {
    return false;
  }

  /** The asset recipe bakes each loc model's idle as pose 0. */
  override get animationIndex(): number {
    return 0;
  }

  override draw(tickPercent: number, context: OffscreenCanvasRenderingContext2D): void {
    const scale = Settings.tileSize;
    context.fillStyle = "#1a0f2e";
    for (const { tile } of this.views()) {
      const s = toSdk(tile);
      context.fillRect(s.x * scale, s.y * scale, scale, scale);
    }
  }

  protected override create3dModel(): Model {
    return new LocFieldModel(this);
  }
}
