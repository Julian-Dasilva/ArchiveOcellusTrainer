import * as THREE from "three";
import { CollisionType, EmptyModel, Entity, GROUND_OVERLAY_Y, GraphicsObject, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region, Unit } from "osrs-sdk";
import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Tick, Tile } from "../../../../sim/brands";
import type { Spin } from "../P3Types";
import type { Cue } from "./P4Views";
import { SpotAnimModel } from "./P4Views";

const { blades, blades2d, rubbleLook, rubble2d } = OCELLUS_P3.smite;
const BLADE_CHANNEL = "smite-blades";
const { faceColour, rgb } = OCELLUS_P4.presentation.tellCentre.value;
const BLADE_CENTRE = { [faceColour]: rgb };
const BLADE_ARMS = 3;
const BLADE_REACH = { inner: 1.7, outer: 2.6, width: 0.3 } as const;

export class SmiteBlades extends Entity {
  private spinning = false;
  private turns = 0;

  constructor(region: Region, private readonly boss: Unit) {
    super(region, { x: 0, y: 0 });
  }

  open(): void {
    this.spinning = true;
    this.boss.addSpotAnim({ id: blades.windUp.value, channel: BLADE_CHANNEL, recolor: BLADE_CENTRE });
  }

  land(spin: Spin): void {
    const last = spin.nth === spin.of;
    this.boss.addSpotAnim({ id: (last ? blades.windDown : blades.spin).value, channel: BLADE_CHANNEL, recolor: BLADE_CENTRE });
    this.spinning = !last;
  }

  override tick(): void {
    this.turns++;
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override draw(tickPercent: number, context: OffscreenCanvasRenderingContext2D): void {
    if (!this.spinning) return;
    const scale = Settings.tileSize;
    const { size } = this.boss;
    const at = this.boss.getPerceivedLocation(tickPercent);
    const [cx, cy] = [(at.x + size / 2) * scale, (at.y - size / 2 + 1) * scale];
    const turned = ((this.turns + tickPercent) * 2 * Math.PI) / BLADE_ARMS;
    context.save();
    context.translate(cx, cy);
    context.fillStyle = blades2d.value;
    for (let arm = 0; arm < BLADE_ARMS; arm++) {
      context.rotate((2 * Math.PI) / BLADE_ARMS);
      context.save();
      context.rotate(turned);
      context.fillRect(BLADE_REACH.inner * scale, (-BLADE_REACH.width / 2) * scale, (BLADE_REACH.outer - BLADE_REACH.inner) * scale, BLADE_REACH.width * scale);
      context.restore();
    }
    context.restore();
  }

  protected override create3dModel(): Model {
    return new EmptyModel();
  }
}

type RubbleState = "falling" | "landed" | "clearing" | "gone";
const RUBBLE_OVERHANG = 0.15;

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

  override draw(_tickPercent: number, context: OffscreenCanvasRenderingContext2D): void {
    const scale = Settings.tileSize;
    const [x, y] = [this.location.x * scale, this.location.y * scale];
    switch (this.state) {
      case "falling":
        context.strokeStyle = rubble2d.value.falling;
        context.lineWidth = Math.max(2, scale * RUBBLE_OVERHANG);
        context.strokeRect(x - scale * RUBBLE_OVERHANG, y - scale * RUBBLE_OVERHANG, scale * (1 + 2 * RUBBLE_OVERHANG), scale * (1 + 2 * RUBBLE_OVERHANG));
        return;
      case "landed":
        context.fillStyle = rubble2d.value.landed;
        context.fillRect(x - scale * RUBBLE_OVERHANG, y - scale * RUBBLE_OVERHANG, scale * (1 + 2 * RUBBLE_OVERHANG), scale * (1 + 2 * RUBBLE_OVERHANG));
        return;
      case "clearing":
      case "gone":
        return;
      default: {
        const unhandled: never = this.state;
        return unhandled;
      }
    }
  }

  protected override create3dModel(): Model {
    return new SpotAnimModel(this, () => RUBBLE_CUES[this.state]);
  }
}

const { band, bandRings, telegraph } = OCELLUS_P3.wave;
let telegraphMaterial: THREE.MeshBasicMaterial | null = null;

function markGeometry(tiles: readonly Tile[], inset: number): THREE.BufferGeometry {
  const corners = tiles.flatMap(({ x, y }) => {
    const [west, east, north, south] = [x + inset, x + 1 - inset, y - 1 + inset, y - inset];
    return [[west, north], [east, north], [east, south], [west, north], [east, south], [west, south]];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([x, z]) => [x, GROUND_OVERLAY_Y, z]), 3));
  return geometry;
}

class TileMarksModel implements Model {
  private readonly mesh: THREE.Mesh;

  constructor(tiles: readonly Tile[]) {
    const { colour, opacity, inset } = telegraph.value;
    telegraphMaterial ??= new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mesh = new THREE.Mesh(markGeometry(tiles, inset), telegraphMaterial);
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.mesh.visible = visible;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }

  getWorldPosition(): THREE.Vector3 {
    return this.mesh.getWorldPosition(new THREE.Vector3());
  }

  async preload(): Promise<void> {}
}

export class WaveBand extends Entity {
  private landed = false;

  constructor(region: Region, private readonly line: readonly Tile[], private readonly landsAt: Tick) {
    super(region, { x: 0, y: 0 });
  }

  show(at: Tick): void {
    if (this.landed || at < this.landsAt) return;
    this.landed = true;
    const { tiles, delayCycles } = bandRings.value;
    this.line.forEach(({ x, y }, nearest) => this.region.addEntity(new GraphicsObject(this.region, { x, y }, band.value, { delay: delayCycles * (Math.floor(nearest / tiles) + 1) })));
    this.dying = 0;
  }

  get done(): boolean {
    return this.landed;
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new TileMarksModel(this.line);
  }
}
