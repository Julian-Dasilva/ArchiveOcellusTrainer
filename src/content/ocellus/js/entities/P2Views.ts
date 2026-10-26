import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import { OCELLUS_P2 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import type { Arm } from "../P2Types";
import type { Cue } from "./P4Views";
import { SpotAnimModel } from "./P4Views";

export type PortalLookKind = "inactive" | "lit";
export type PortalView = Readonly<{ arm: Arm; tiles: readonly [Tile, Tile]; look: PortalLookKind }>;

const LOOKS = OCELLUS_P2.portals.looks.value;
const ROTATION = OCELLUS_P2.portals.rotation.value;
const NO_OFFSETS: Location3[] = [];

type Shown = Readonly<{ look: PortalLookKind; model: CacheRenderInstancedModel }>;
type Placed = Readonly<{ key: string; look: PortalLookKind; location: Location3; yaw: number }>;

/** The portals are 2x1 locs: one instanced cache model each, swapped between the inactive and the lit model. */
class PortalModel implements Model {
  private readonly shown = new Map<string, Shown>();
  private portals: readonly PortalView[] | null = null;
  private placed: readonly Placed[] = [];

  constructor(private readonly cross: PortalCross) {}

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    const portals = this.cross.portals();
    if (portals !== this.portals) this.place(scene, portals);
    for (const { key, location: at, yaw } of this.placed) {
      this.shown.get(key)?.model.draw(scene, clockDelta, tickPercent, at, yaw, pitchRadians, visible, NO_OFFSETS);
    }
  }

  /** Runs when the portals or their looks change (a few times a round), never per frame. */
  private place(scene: THREE.Scene, portals: readonly PortalView[]): void {
    this.portals = portals;
    // A 2x1 loc draws about the middle of its footprint, and its rotation 0 already lies along x, so the quarter turn the instanced model adds for actors comes back off.
    this.placed = portals.map(({ arm, tiles: [a, b], look }): Placed => ({
      key: `${a.x},${a.y}`,
      look,
      location: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 },
      yaw: (-(ROTATION[arm] + 1) * Math.PI) / 2,
    }));
    const wanted = new Set(this.placed.map(({ key }) => key));
    for (const [key, shown] of this.shown) {
      if (wanted.has(key)) continue;
      shown.model.destroy(scene);
      this.shown.delete(key);
    }
    for (const { key, look } of this.placed) {
      const shown = this.shown.get(key);
      if (shown !== undefined && shown.look === look) continue;
      shown?.model.destroy(scene);
      this.shown.set(key, { look, model: CacheRenderInstancedModel.forRenderable(this.cross, CacheRenderReferences.model(LOOKS[look].model)) });
    }
  }

  destroy(scene: THREE.Scene): void {
    this.shown.forEach((shown) => shown.model.destroy(scene));
    this.shown.clear();
  }

  getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** The 24 portals on the cross's arms: orange while idle or a gap, purple while lit to fire. */
export class PortalCross extends Entity {
  constructor(region: Region, readonly portals: () => readonly PortalView[]) {
    super(region, { x: 0, y: 0 });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get drawOutline(): boolean {
    return false;
  }

  protected override create3dModel(): Model {
    return new PortalModel(this);
  }
}

/** A cache spotanim on one floor tile. */
export class FloorEffect extends Entity {
  private cue: Cue | null = null;

  constructor(region: Region, at: Tile) {
    super(region, { x: at.x, y: at.y });
  }

  play(spotAnim: number, loops: boolean): void {
    this.cue = { spotAnim, loops };
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get drawOutline(): boolean {
    return false;
  }

  protected override create3dModel(): Model {
    return new SpotAnimModel(this, () => this.cue);
  }
}
