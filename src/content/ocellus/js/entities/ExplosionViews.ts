import * as THREE from "three";
import { CollisionType, Entity, GROUND_OVERLAY_Y, LineOfSightMask } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { RoomTile } from "../../../../sim/frame";
import type { VoidKind } from "../P4Types";
import { SpotAnimModel } from "./P4Views";

const CUE = { spotAnim: OCELLUS_P4.explosion.spotAnim.value, loops: false } as const;
const RING = OCELLUS_P4.explosion.spin.value;

type Blast = "marked" | "detonated";

function ringGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let shard = 0; shard < RING.count; shard++) {
    const angle = (2 * Math.PI * shard) / RING.count;
    const ox = Math.cos(angle);
    const oz = Math.sin(angle);
    const tip = RING.radius + RING.lean;
    const half = RING.halfWidth;
    const ring = RING.radius;
    positions.push(
      ox * ring - oz * half, 0, oz * ring + ox * half,
      ox * ring + oz * half, 0, oz * ring - ox * half,
      ox * tip, RING.height, oz * tip,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

class MarkedTileModel implements Model {
  private readonly spot: SpotAnimModel;
  // A transparent double-sided material is two draw calls unless this is set.
  private readonly material = new THREE.MeshBasicMaterial({ color: RING.colour, side: THREE.DoubleSide, transparent: true, forceSinglePass: true });
  private readonly mesh = new THREE.Mesh(ringGeometry(), this.material);
  private flare = 0;

  constructor(renderable: Entity, private readonly blast: () => Blast) {
    this.spot = new SpotAnimModel(renderable, () => CUE);
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean, modelOffsets: Location3[]): void {
    this.spot.draw(scene, clockDelta, tickPercent, location, angleRadians, pitchRadians, visible, modelOffsets);
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.flare = this.blast() === "detonated" ? Math.min(1, this.flare + clockDelta / RING.flareSeconds) : 0;
    this.mesh.visible = visible && this.flare < 1;
    this.mesh.position.set(location.x + 0.5, GROUND_OVERLAY_Y, location.y - 0.5);
    this.mesh.rotation.y += clockDelta * RING.radPerSec;
    this.mesh.scale.setScalar(1 + this.flare);
    this.material.opacity = 1 - this.flare;
  }

  destroy(scene: THREE.Scene): void {
    this.spot.destroy(scene);
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  getWorldPosition(): THREE.Vector3 {
    return this.mesh.getWorldPosition(new THREE.Vector3());
  }

  async preload(): Promise<void> {
    await this.spot.preload();
  }
}

class ExplosionView extends Entity {
  private blast: Blast = "marked";

  constructor(region: Region, at: RoomTile) {
    super(region, { x: at.x, y: at.y });
  }

  detonate(): void {
    this.blast = "detonated";
  }

  override tick(): void {
    if (this.blast === "detonated") this.dying = 0;
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new MarkedTileModel(this, () => this.blast);
  }
}

export class ExplosionViews {
  private readonly live = new Map<string, ExplosionView>();

  constructor(private readonly region: Region) {}

  mark(kind: VoidKind, pulse: number, at: RoomTile): void {
    const view = new ExplosionView(this.region, at);
    this.region.addEntity(view);
    this.live.set(`${kind}:${pulse}`, view);
  }

  detonate(kind: VoidKind, pulse: number): void {
    this.live.get(`${kind}:${pulse}`)?.detonate();
    this.live.delete(`${kind}:${pulse}`);
  }

  retire(): void {
    this.live.forEach((view) => {
      view.dying = 0;
    });
    this.live.clear();
  }
}
