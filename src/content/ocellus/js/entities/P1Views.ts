import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask } from "osrs-sdk";
import type { Location3, Model, Region, Renderable } from "osrs-sdk";
import { OCELLUS_P1 } from "../OcellusTimingsP1";
import type { Tick, Tile } from "../../../../sim/brands";
import { after, span } from "../../../../sim/brands";
import type { Crack, CrackId, Direction } from "../P1Types";

const { crackPieces, crackTiming, floorExplosions } = OCELLUS_P1.presentation;
/** How long an end piece or a floor explosion is kept after it starts; both play once and are shorter. */
const ONE_SHOT_TICKS = span(4);

/** `delay` is in client cycles; a looping cue starts again at once each time it ends. */
type Cue = Readonly<{ spotAnim: number; delay: number; loops: boolean }>;

class Playing {
  ended = false;
  readonly model: CacheRenderInstancedModel;

  constructor(renderable: Renderable, readonly cue: Cue, delay: number) {
    this.model = CacheRenderInstancedModel.forRenderable(renderable, CacheRenderReferences.spotAnim([{ id: cue.spotAnim, delay }]), {
      onSpotAnimComplete: () => {
        this.ended = true;
      },
    });
  }
}

class FloorSpotModel implements Model {
  private playing: Playing | null = null;

  constructor(private readonly renderable: Renderable, private readonly cue: () => Cue) {}

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean, modelOffsets: Location3[]): void {
    const cue = this.cue();
    const replay = this.playing !== null && this.playing.cue === cue && this.playing.ended && cue.loops;
    if (this.playing !== null && (this.playing.cue !== cue || replay)) {
      this.playing.model.destroy(scene);
      this.playing = null;
    }
    if (this.playing === null) this.playing = new Playing(this.renderable, cue, replay ? 0 : cue.delay);
    this.playing.model.draw(scene, clockDelta, tickPercent, location, 0, pitchRadians, visible, modelOffsets);
  }

  destroy(scene: THREE.Scene): void {
    this.playing?.model.destroy(scene);
  }

  getWorldPosition(): THREE.Vector3 {
    return this.playing?.model.getWorldPosition() ?? new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** One floor tile of a crack or a blast: its cache spotanim. */
export class FloorSpot extends Entity {
  constructor(region: Region, at: Tile, private cue: Cue) {
    super(region, { x: at.x, y: at.y });
  }

  play(cue: Cue): void {
    this.cue = cue;
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
    return new FloorSpotModel(this, () => this.cue);
  }
}

function piecesFor({ dx, dy }: Direction): Readonly<{ start: number; piece: number; end: number }> {
  if (dx === 0) return (dy < 0 ? crackPieces.straight.north : crackPieces.straight.south).value;
  if (dy === 0) return (dx > 0 ? crackPieces.straight.east : crackPieces.straight.west).value;
  if (dx > 0) return (dy < 0 ? crackPieces.diagonal["north-east"] : crackPieces.diagonal["south-east"]).value;
  return (dy > 0 ? crackPieces.diagonal["south-west"] : crackPieces.diagonal["north-west"]).value;
}

type OpenCrack = Readonly<{ crack: Crack; spots: readonly FloorSpot[] }>;
type Fading = Readonly<{ spot: FloorSpot; removeAt: Tick }>;

/** Open cracks drawn piece by piece from the far end back toward him, their end pieces, and the blast's floor explosions. */
export class FloorViews {
  private readonly open = new Map<CrackId, OpenCrack>();
  private fading: readonly Fading[] = [];

  constructor(private readonly region: Region) {}

  openCrack(crack: Crack): void {
    const { openDelay, perTile } = crackTiming.value;
    const pieces = piecesFor(crack.growth);
    const last = crack.tiles.length - 1;
    const spots = crack.tiles.map((at, i) => new FloorSpot(this.region, at, { spotAnim: i === last ? pieces.start : pieces.piece, delay: openDelay + perTile * (last - i), loops: true }));
    spots.forEach((spot) => this.region.addEntity(spot));
    this.open.set(crack.id, { crack, spots });
  }

  closeCrack(crack: Crack, at: Tick): void {
    const { spots } = this.open.get(crack.id) ?? { spots: [] };
    this.open.delete(crack.id);
    const { perTile } = crackTiming.value;
    const { end } = piecesFor(crack.growth);
    const last = spots.length - 1;
    spots.forEach((spot, i) => {
      spot.play({ spotAnim: end, delay: perTile * (last - i), loops: false });
    });
    this.fading = [...this.fading, ...spots.map((spot) => ({ spot, removeAt: after(at, ONE_SHOT_TICKS) }))];
  }

  fadeCrack(crack: Crack): void {
    this.open.get(crack.id)?.spots.forEach((spot) => this.region.removeEntity(spot));
    this.open.delete(crack.id);
  }

  blast(tiles: readonly Tile[], ring: (at: Tile) => number, at: Tick): void {
    const { pieces, ringDelays } = floorExplosions.value;
    const spots = tiles.map((place) => new FloorSpot(this.region, place, { spotAnim: pieces[(place.x * 7 + place.y * 3) % pieces.length], delay: ringDelays[ring(place) - 1] ?? 0, loops: false }));
    spots.forEach((spot) => this.region.addEntity(spot));
    this.fading = [...this.fading, ...spots.map((spot) => ({ spot, removeAt: after(at, ONE_SHOT_TICKS) }))];
  }

  /** At the end of a tick: finished end pieces and floor explosions go. */
  settle(at: Tick): void {
    this.fading.filter((fading) => fading.removeAt <= at).forEach(({ spot }) => this.region.removeEntity(spot));
    this.fading = this.fading.filter((fading) => fading.removeAt > at);
  }
}
