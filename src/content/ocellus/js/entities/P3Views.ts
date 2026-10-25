import { CollisionType, EmptyModel, Entity, LineOfSightMask } from "osrs-sdk";
import type { Model, Region, Unit } from "osrs-sdk";
import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Tick, Tile } from "../../../../sim/brands";
import type { Spin } from "../P3Types";
import type { Cue } from "./P4Views";
import { SpotAnimModel } from "./P4Views";

const { blades, rubbleLook } = OCELLUS_P3.smite;
const BLADE_CHANNEL = "smite-blades";
const { faceColour, rgb } = OCELLUS_P4.presentation.tellCentre.value;
const BLADE_CENTRE = { [faceColour]: rgb };

export class SmiteBlades extends Entity {
  constructor(region: Region, private readonly boss: Unit) {
    super(region, { x: 0, y: 0 });
  }

  open(): void {
    this.boss.addSpotAnim({ id: blades.windUp.value, channel: BLADE_CHANNEL, recolor: BLADE_CENTRE });
  }

  land(spin: Spin): void {
    const last = spin.nth === spin.of;
    this.boss.addSpotAnim({ id: (last ? blades.windDown : blades.spin).value, channel: BLADE_CHANNEL, recolor: BLADE_CENTRE });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new EmptyModel();
  }
}

type RubbleState = "falling" | "landed" | "clearing" | "gone";

const RUBBLE_CUES: Readonly<Record<RubbleState, Cue | null>> = {
  falling: { spotAnim: rubbleLook.falling.value, loops: false },
  landed: { spotAnim: rubbleLook.idle.value, loops: true },
  clearing: { spotAnim: rubbleLook.despawn.value, loops: false },
  gone: null,
};

export class RubbleView extends Entity {
  private state: RubbleState = "falling";

  constructor(region: Region, at: Tile, private readonly landsAt: Tick, private readonly until: Tick) {
    super(region, { x: at.x, y: at.y });
  }

  show(at: Tick): void {
    this.state = at < this.landsAt ? "falling" : at <= this.until ? "landed" : at === this.until + 1 ? "clearing" : "gone";
    if (this.state === "gone") this.dying = 0;
  }

  get done(): boolean {
    return this.state === "gone";
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new SpotAnimModel(this, () => RUBBLE_CUES[this.state]);
  }
}
