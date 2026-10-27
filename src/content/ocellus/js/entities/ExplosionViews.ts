import { CollisionType, Entity, LineOfSightMask } from "osrs-sdk";
import type { Model, Region } from "osrs-sdk";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { RoomTile } from "../../../../sim/frame";
import type { VoidKind } from "../P4Types";
import { SpotAnimModel } from "./P4Views";

const CUE = { spotAnim: OCELLUS_P4.explosion.spotAnim.value, loops: false } as const;

type Blast = "marked" | "detonated";

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
    return new SpotAnimModel(this, () => CUE);
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
