import * as THREE from "three";
import { CacheRenderModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import type { ATile } from "./geometry";
import { toSdk } from "./geometry";

/** One cache object on a 1x1 tile: its models, all drawn there, each looping its own baked idle. */
export type LocView = Readonly<{ tile: ATile; models: readonly number[] }>;

const FIRST_CAPACITY = 32;

/** The SDK's meshes may come from another copy of three.js, so `instanceof` cannot find them. */
const isMesh = (node: THREE.Object3D): node is THREE.Mesh => "isMesh" in node && node.isMesh === true;

/**
 * One cache model on every tile that shows it. The model loads and poses once, on the first tile; every other tile
 * draws an instance of its posed meshes, so a band of void costs the same as one tile.
 */
class LocCopies {
  private readonly model: CacheRenderModel;
  private copies: readonly THREE.InstancedMesh[] = [];
  private capacity = FIRST_CAPACITY;
  private readonly shift = new THREE.Matrix4();
  private readonly placed = new THREE.Matrix4();

  constructor(field: LocField, id: number) {
    // Scenery: no effects attach to it, so skip building a mesh for every spotanim in the bundle.
    this.model = CacheRenderModel.forRenderable(field, CacheRenderReferences.model(id));
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, pitchRadians: number, visible: boolean, tiles: readonly ATile[]): void {
    const first = tiles[0];
    const origin = first ? toSdk(first) : { x: 0, y: 0 };
    // A loc's rotation 0; the instanced model adds a quarter turn meant for actors.
    this.model.draw(scene, clockDelta, tickPercent, { x: origin.x, y: origin.y, z: 0 }, -Math.PI / 2, pitchRadians, visible && first !== undefined, []);
    const root = this.model.sceneRoot();
    const meshes = root.children.filter(isMesh);
    this.fit(scene, meshes, tiles.length - 1);
    root.updateMatrixWorld(true);
    this.copies.forEach((copy, i) => {
      const mesh = meshes[i];
      for (let n = 1; n < tiles.length; n++) {
        const s = toSdk(tiles[n]);
        this.shift.makeTranslation(s.x - origin.x, 0, s.y - origin.y);
        copy.setMatrixAt(n - 1, this.placed.multiplyMatrices(this.shift, mesh.matrixWorld));
      }
      copy.count = Math.max(0, tiles.length - 1);
      copy.instanceMatrix.needsUpdate = true;
      copy.visible = root.visible;
    });
  }

  clientTick(): void {
    this.model.clientTick();
  }

  destroy(scene: THREE.Scene): void {
    this.removeCopies();
    this.model.destroy(scene);
  }

  /** The model builds its meshes once it loads, so the copies follow whatever meshes it holds now. */
  private fit(scene: THREE.Scene, meshes: readonly THREE.Mesh[], needed: number): void {
    if (needed <= 0 && this.copies.length === 0) return;
    const current = this.copies.length === meshes.length && this.copies.every((copy, i) => copy.geometry === meshes[i].geometry && copy.material === meshes[i].material);
    if (current && needed <= this.capacity) return;
    this.capacity = Math.max(needed, this.capacity * (needed > this.capacity ? 2 : 1));
    this.removeCopies();
    this.copies = meshes.map((mesh) => {
      const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, this.capacity);
      // Its bounds are one tile's model; the instances spread across the floor.
      copy.frustumCulled = false;
      copy.renderOrder = mesh.renderOrder;
      scene.add(copy);
      return copy;
    });
  }

  private removeCopies(): void {
    this.copies.forEach((copy) => {
      copy.removeFromParent();
      copy.dispose();
    });
    this.copies = [];
  }
}

class LocFieldModel implements Model {
  private readonly sets = new Map<number, LocCopies>();

  constructor(private readonly field: LocField) {}

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, _location: Location3, _angle: number, pitchRadians: number, visible: boolean): void {
    const tiles = new Map<number, ATile[]>();
    for (const view of this.field.views()) {
      for (const id of view.models) {
        const list = tiles.get(id);
        if (list) list.push(view.tile);
        else tiles.set(id, [view.tile]);
      }
    }
    for (const id of tiles.keys()) if (!this.sets.has(id)) this.sets.set(id, new LocCopies(this.field, id));
    this.sets.forEach((set, id) => set.draw(scene, clockDelta, tickPercent, pitchRadians, visible, tiles.get(id) ?? []));
  }

  clientTick(): void {
    this.sets.forEach((set) => set.clientTick());
  }

  destroy(scene: THREE.Scene): void {
    this.sets.forEach((set) => set.destroy(scene));
    this.sets.clear();
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
