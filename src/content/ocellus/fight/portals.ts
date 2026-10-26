import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import { PORTAL } from "./data";
import type { ATile } from "./geometry";
import { key, toSdk } from "./geometry";

export type PortalLook = "inactive" | "lit";
/** One 2x1 portal: its two tiles along the arm, its OSRS rotation in quarter turns, and how it looks now. */
export type PortalView = Readonly<{ tiles: readonly [ATile, ATile]; rotation: number; look: PortalLook }>;

const MODELS: Readonly<Record<PortalLook, number>> = { inactive: PORTAL.inactiveModel, lit: PORTAL.activeModel };
/** The 2D view's stand-ins: orange while idle or a gap, purple while lit to fire. */
const COLOURS: Readonly<Record<PortalLook, string>> = { inactive: "#ff9a2e", lit: "#b455ff" };

type Shown = { look: PortalLook; model: CacheRenderInstancedModel };

/** The game's own portal objects, one instanced cache model each, swapped between the inactive and active model. */
class PortalModel implements Model {
  private readonly shown = new Map<string, Shown>();

  constructor(private readonly cross: PortalCross) {
    // Load both looks up front so the first lighting doesn't wait on a fetch.
    for (const id of Object.values(MODELS)) {
      const warm = CacheRenderInstancedModel.forRenderable(cross, CacheRenderReferences.model(id));
      void warm.preload().then(() => warm.destroy(new THREE.Scene()));
    }
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, _location: Location3, _angle: number, pitchRadians: number, visible: boolean): void {
    const wanted = new Set<string>();
    for (const portal of this.cross.portals()) {
      const k = key(portal.tiles[0]);
      wanted.add(k);
      let shown = this.shown.get(k);
      if (shown && shown.look !== portal.look) {
        shown.model.destroy(scene);
        shown = undefined;
      }
      if (!shown) {
        shown = { look: portal.look, model: CacheRenderInstancedModel.forRenderable(this.cross, CacheRenderReferences.model(MODELS[portal.look])) };
        this.shown.set(k, shown);
      }
      // A 2x1 loc is drawn about the middle of its footprint. The instanced model adds a quarter turn for actors'
      // facing; a loc's rotation 0 already lies along x, so take it back off.
      const [a, b] = portal.tiles.map(toSdk);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
      shown.model.draw(scene, clockDelta, tickPercent, middle, (-(portal.rotation + 1) * Math.PI) / 2, pitchRadians, visible, []);
    }
    for (const [k, shown] of this.shown) {
      if (wanted.has(k)) continue;
      shown.model.destroy(scene);
      this.shown.delete(k);
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

/** Phase 2's "+" of 24 portals: inactive (orange) while idle or a gap, active (purple) while lit to fire. */
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

  override get size(): number {
    return 1;
  }

  override draw(tickPercent: number, context: OffscreenCanvasRenderingContext2D): void {
    const scale = Settings.tileSize;
    for (const { tiles, look } of this.portals()) {
      context.fillStyle = COLOURS[look];
      for (const tile of tiles) {
        const s = toSdk(tile);
        context.fillRect((s.x + 0.2) * scale, (s.y + 0.2) * scale, scale * 0.6, scale * 0.6);
      }
    }
  }

  protected override create3dModel(): Model {
    return new PortalModel(this);
  }
}
