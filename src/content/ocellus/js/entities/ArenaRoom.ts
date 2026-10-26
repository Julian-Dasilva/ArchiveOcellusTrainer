import * as THREE from "three";
import { CollisionType, Entity, GROUND_OVERLAY_Y, LineOfSightMask } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Tick, TickSpan } from "../../../../sim/brands";
import type { Tile } from "../../../../sim/brands";
import { tile } from "../../../../sim/brands";
import { TileSet, beside } from "../../../../sim/tiles";
import type { Wedge } from "../p3/arena";
import { ARENA_SIZE, CHASM, FLOOR, MIDDLE, RIM, STANDING, WEDGES, WEDGE_FLOOR, wedgeOf } from "../p3/arena";
import { SpotAnimModel, rimEdges } from "./P4Views";

export type Cross = Readonly<{ kind: "floor" }> | Readonly<{ kind: "chasm"; stones: readonly Tile[] }>;

type Fall = Readonly<{ kind: "standing" }> | Readonly<{ kind: "crumbling"; lasts: TickSpan }> | Readonly<{ kind: "dropping" }>;

const FLOOR_Y = -0.5;
const RIM_TOP = GROUND_OVERLAY_Y + OCELLUS_P4.geometry.walkway.value.height;
const CLIFF_DEPTH = 6;
const PX = 48;
const LOOK = {
  rim: "#b4b49c",
  cliffTop: "#8a8b78",
  cliffBottom: "#0b0a0f",
  stone: "#8c8a74",
  bowl: "#6d5a3a",
  flame: "#ffa630",
  abyss: 0x07060b,
  crumble: new THREE.Color("#5a0a1c"),
} as const;
const PILLAR = { radius: 0.42, height: 1.6, flame: 0.42 } as const;
const DROP_GRAVITY = 9;
const DROP_HIDDEN_BELOW = -2 * CLIFF_DEPTH;
const SHAKE = 0.05;
const CRUMBLE_TINT = 0.6;
/** A tile off the floor painted white, so flames keep their own colour on the stone material. */
const WHITE_TEXEL = tile(0, 0);

type Point = readonly [number, number, number];

function hash(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function roomTexture(): THREE.CanvasTexture {
  const canvas = new OffscreenCanvas(ARENA_SIZE.width * PX, ARENA_SIZE.height * PX);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const facet = ({ x, y }: Tile) => {
      const base = 150 + Math.floor(hash(x, y) * 14);
      const shade = (delta: number) => `rgb(${base + delta - 4}, ${base + delta + 1}, ${base + delta - 16})`;
      const [x0, y0] = [x * PX, y * PX];
      const flip = hash(y, x) > 0.5;
      ctx.fillStyle = shade(0);
      ctx.fillRect(x0, y0, PX, PX);
      ctx.fillStyle = shade(-9);
      ctx.beginPath();
      ctx.moveTo(flip ? x0 + PX : x0, y0);
      ctx.lineTo(x0 + PX, y0 + PX);
      ctx.lineTo(x0, y0 + PX);
      ctx.closePath();
      ctx.fill();
    };
    [...STANDING.tiles(), ...CHASM.tiles()].forEach(facet);
    ctx.fillStyle = LOOK.rim;
    RIM.tiles().forEach(({ x, y }) => ctx.fillRect(x * PX, y * PX, PX, PX));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(WHITE_TEXEL.x * PX, WHITE_TEXEL.y * PX, PX, PX);
    const [cx, cy] = [(MIDDLE.x + 0.5) * PX, (MIDDLE.y + 0.5) * PX];
    ctx.strokeStyle = "rgba(70, 74, 60, 0.55)";
    for (const [radius, width] of [[7.6, 0.18], [8.4, 0.08]]) {
      ctx.lineWidth = PX * width;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * PX, 0, Math.PI * 2);
      ctx.stroke();
    }
    const star = (x: number, y: number, points: number, radius: (i: number) => number, turn: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const angle = (i * 2 * Math.PI) / points + turn;
        ctx.lineTo(x + Math.cos(angle) * radius(i) * PX, y + Math.sin(angle) * radius(i) * PX);
      }
      ctx.closePath();
      ctx.fill();
    };
    star(cx, cy, 16, (i) => (i % 4 === 0 ? 11.5 : i % 2 === 0 ? 6.8 : 2.6), -Math.PI / 2, "rgba(92, 97, 80, 0.33)");
    ctx.strokeStyle = "rgba(60, 64, 52, 0.45)";
    ctx.lineWidth = PX * 0.05;
    ctx.stroke();
    for (const [dx, dy] of [[6, -6], [-6, -6], [-6, 6], [6, 6]]) star(cx + dx * PX, cy + dy * PX, 8, (i) => (i % 2 === 0 ? 2.6 : 0.9), Math.PI / 8, "rgba(92, 97, 80, 0.22)");
    ctx.strokeStyle = "rgba(60, 62, 50, 0.18)";
    ctx.lineWidth = 2;
    for (const at of STANDING.tiles()) ctx.strokeRect(at.x * PX, at.y * PX, PX, PX);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const uvAt = (x: number, z: number): readonly [number, number] => [x / ARENA_SIZE.width, 1 - (z + 1) / ARENA_SIZE.height];

class Mesher {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colours: number[] = [];

  private vertex([x, y, z]: Point, colour: THREE.Color, uv: readonly [number, number]): void {
    this.positions.push(x, y, z);
    this.uvs.push(...uv);
    this.colours.push(colour.r, colour.g, colour.b);
  }

  floor(corners: readonly [Point, Point, Point, Point]): void {
    for (const i of [0, 1, 2, 0, 2, 3]) this.vertex(corners[i], WHITE, uvAt(corners[i][0], corners[i][2]));
  }

  quad(corners: readonly [Point, Point, Point, Point], colours: readonly [THREE.Color, THREE.Color, THREE.Color, THREE.Color], texel: Tile): void {
    const uv = uvAt(texel.x + 0.5, texel.y - 0.5);
    for (const i of [0, 1, 2, 0, 2, 3]) this.vertex(corners[i], colours[i], uv);
  }

  shape(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, colour: THREE.Color, texel: Tile): void {
    const flat = geometry.toNonIndexed().applyMatrix4(matrix);
    const position = flat.getAttribute("position");
    const uv = uvAt(texel.x + 0.5, texel.y - 0.5);
    for (let i = 0; i < position.count; i++) this.vertex([position.getX(i), position.getY(i), position.getZ(i)], colour, uv);
    flat.dispose();
    geometry.dispose();
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const colour = (hex: string) => new THREE.Color(hex);

function floorTops(mesher: Mesher, tiles: TileSet): void {
  for (const { x, y } of tiles.tiles()) mesher.floor([[x, FLOOR_Y, y - 1], [x, FLOOR_Y, y], [x + 1, FLOOR_Y, y], [x + 1, FLOOR_Y, y - 1]]);
}

function walls(mesher: Mesher, tiles: TileSet, open: (outside: Tile) => boolean, top: number, bottom: number, shades: readonly [THREE.Color, THREE.Color]): void {
  const [high, low] = shades;
  for (const { at, side, from, to } of rimEdges(tiles)) {
    if (!open(beside(at, side))) continue;
    mesher.quad([[from.x, top, from.z], [to.x, top, to.z], [to.x, bottom, to.z], [from.x, bottom, from.z]], [high, high, low, low], at);
  }
}

function fallsWith(dx: number, dy: number): Wedge | null {
  if (Math.abs(dx) <= 1 || Math.abs(dy) <= 1) return null;
  return wedgeOf(tile(MIDDLE.x + 2 * Math.sign(dx), MIDDLE.y + 2 * Math.sign(dy)));
}

const rimWedge = (at: Tile) => fallsWith(at.x - MIDDLE.x, at.y - MIDDLE.y);

function rimOf(mesher: Mesher, tiles: TileSet, floor: TileSet): void {
  const cliffTop = colour(LOOK.cliffTop);
  const bottom = colour(LOOK.cliffBottom);
  const rimTop = colour(LOOK.rim);
  const four = [rimTop, rimTop, rimTop, rimTop] as const;
  for (const at of tiles.tiles()) mesher.quad([[at.x, RIM_TOP, at.y - 1], [at.x, RIM_TOP, at.y], [at.x + 1, RIM_TOP, at.y], [at.x + 1, RIM_TOP, at.y - 1]], four, at);
  walls(mesher, tiles, (outside) => floor.contains(outside), RIM_TOP, FLOOR_Y, [rimTop, cliffTop]);
  walls(mesher, tiles, (outside) => !floor.contains(outside) && !RIM.contains(outside), RIM_TOP, FLOOR_Y - CLIFF_DEPTH, [cliffTop, bottom]);
}

function wedgeGeometry(wedge: Wedge, floor: TileSet): THREE.BufferGeometry {
  const mesher = new Mesher();
  const tiles = WEDGE_FLOOR[wedge];
  floorTops(mesher, tiles);
  walls(mesher, tiles, (outside) => !floor.contains(outside) && !RIM.contains(outside), FLOOR_Y, FLOOR_Y - CLIFF_DEPTH, [colour(LOOK.cliffTop), colour(LOOK.cliffBottom)]);
  rimOf(mesher, TileSet.at(RIM.tiles().filter((at) => rimWedge(at) === wedge)), floor);
  scenery(mesher, wedge);
  return mesher.build();
}

function octagonCorners(): readonly (readonly [number, number])[] {
  const offsets = STANDING.tiles().map(({ x, y }) => [Math.abs(x - MIDDLE.x), Math.abs(y - MIDDLE.y)] as const);
  const half = Math.max(...offsets.map(([dx]) => dx)) + 0.5;
  const along = Math.max(...offsets.map(([dx, dy]) => dx + dy)) + 0.5 - half;
  const [cx, cz] = [MIDDLE.x + 0.5, MIDDLE.y - 0.5];
  return [[along, half], [half, along], [half, -along], [along, -half], [-along, -half], [-half, -along], [-half, along], [-along, half]].map(([east, north]) => [cx + east, cz - north] as const);
}

const place = (x: number, y: number, z: number, turn = 0) => new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z);

function scenery(mesher: Mesher, wedge: Wedge | null): void {
  const texel = RIM.tiles()[0];
  for (const [x, z] of octagonCorners()) {
    if (fallsWith(x - (MIDDLE.x + 0.5), z - (MIDDLE.y - 0.5)) !== wedge) continue;
    mesher.shape(new THREE.CylinderGeometry(PILLAR.radius, PILLAR.radius + 0.08, PILLAR.height, 8), place(x, FLOOR_Y + PILLAR.height / 2, z), colour(LOOK.rim), texel);
    mesher.shape(new THREE.ConeGeometry(0.16, PILLAR.flame, 7), place(x, FLOOR_Y + PILLAR.height + PILLAR.flame / 2, z), colour(LOOK.flame), WHITE_TEXEL);
  }
  for (const at of OCELLUS_P3.arena.censers.value) {
    if (rimWedge(at) !== wedge) continue;
    const [x, z] = [at.x + 0.5, at.y - 0.5];
    const plinth = CLIFF_DEPTH + 1.1;
    mesher.shape(new THREE.CylinderGeometry(0.45, 0.55, plinth, 8), place(x, FLOOR_Y - CLIFF_DEPTH + plinth / 2, z), colour(LOOK.rim), texel);
    mesher.shape(new THREE.CylinderGeometry(0.55, 0.28, 0.32, 10), place(x, FLOOR_Y + 1.26, z), colour(LOOK.bowl), texel);
  }
}

function staticGeometry(cross: Cross, floor: TileSet): THREE.BufferGeometry {
  const mesher = new Mesher();
  rimOf(mesher, TileSet.at(RIM.tiles().filter((at) => rimWedge(at) === null)), floor);
  switch (cross.kind) {
    case "floor":
      floorTops(mesher, CHASM);
      walls(mesher, CHASM, (outside) => !floor.contains(outside) && !RIM.contains(outside), FLOOR_Y, FLOOR_Y - CLIFF_DEPTH, [colour(LOOK.cliffTop), colour(LOOK.cliffBottom)]);
      break;
    case "chasm":
      for (const stone of cross.stones) mesher.shape(new THREE.CylinderGeometry(0.5, 0.18, 0.9, 7), place(stone.x + 0.5, FLOOR_Y - 0.5, stone.y - 0.5, hash(stone.x, stone.y) * Math.PI), colour(LOOK.stone), stone);
      break;
    default: {
      const unhandled: never = cross;
      return unhandled;
    }
  }
  scenery(mesher, null);
  return mesher.build();
}

type WedgeView = { readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; seen: Fall; since: number };

class RoomModel implements Model {
  private readonly group = new THREE.Group();
  private readonly texture = roomTexture();
  private readonly wedges: ReadonlyMap<Wedge, WedgeView>;
  private time = 0;

  constructor(cross: Cross, private readonly fallOf: (wedge: Wedge) => Fall) {
    const floor = cross.kind === "floor" ? FLOOR : STANDING;
    const stone = () => new THREE.MeshLambertMaterial({ map: this.texture, vertexColors: true });
    this.wedges = new Map(WEDGES.map((wedge) => [wedge, { mesh: new THREE.Mesh(wedgeGeometry(wedge, floor), stone()), seen: STANDS, since: 0 }]));
    const abyss = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE.width * 4, ARENA_SIZE.height * 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LOOK.abyss }));
    abyss.position.set(ARENA_SIZE.width / 2, FLOOR_Y - CLIFF_DEPTH, ARENA_SIZE.height / 2);
    this.group.add(abyss, new THREE.Mesh(staticGeometry(cross, floor), stone()));
    this.wedges.forEach(({ mesh }) => this.group.add(mesh));
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    if (this.group.parent !== scene) scene.add(this.group);
    this.group.visible = visible;
    this.time += clockDelta;
    this.wedges.forEach((view, wedge) => this.settle(view, this.fallOf(wedge)));
  }

  private settle(view: WedgeView, fall: Fall): void {
    if (fall !== view.seen) {
      view.seen = fall;
      view.since = this.time;
    }
    const { mesh } = view;
    const t = this.time - view.since;
    switch (fall.kind) {
      case "standing":
        mesh.material.color.copy(WHITE);
        mesh.position.set(0, 0, 0);
        mesh.visible = true;
        return;
      case "crumbling": {
        const darkening = Math.min(1, t / (fall.lasts * SECONDS_PER_TICK));
        const throb = 0.5 + 0.5 * Math.sin(t * 6);
        mesh.material.color.copy(WHITE).lerp(LOOK.crumble, darkening * CRUMBLE_TINT * (0.5 + 0.5 * throb));
        mesh.position.set(SHAKE * darkening * Math.sin(t * 37), 0, SHAKE * darkening * Math.cos(t * 29));
        return;
      }
      case "dropping":
        mesh.material.color.copy(LOOK.crumble);
        mesh.position.set(0, -0.5 * DROP_GRAVITY * t * t, 0);
        mesh.visible = mesh.position.y > DROP_HIDDEN_BELOW;
        return;
      default: {
        const unhandled: never = fall;
        return unhandled;
      }
    }
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      object.material.dispose();
    });
    this.texture.dispose();
  }

  getWorldPosition(): THREE.Vector3 {
    return this.group.getWorldPosition(new THREE.Vector3());
  }

  async preload(): Promise<void> {}
}

const STANDS: Fall = { kind: "standing" };
const SECONDS_PER_TICK = 0.6;

export class ArenaRoom extends Entity {
  private readonly falls = new Map<Wedge, Fall>();

  constructor(region: Region, private readonly cross: Cross) {
    super(region, { x: 0, y: 0 });
  }

  crumble(wedge: Wedge, lasts: TickSpan): void {
    this.falls.set(wedge, { kind: "crumbling", lasts });
  }

  drop(wedge: Wedge): void {
    this.falls.set(wedge, { kind: "dropping" });
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
    return new RoomModel(this.cross, (wedge) => this.falls.get(wedge) ?? STANDS);
  }
}

class RubbleSpot extends Entity {
  private cue: Readonly<{ spotAnim: number; loops: boolean }> | null = null;

  constructor(region: Region) {
    super(region, { x: 0, y: 0 });
  }

  play(at: Tile, spotAnim: number): void {
    this.location = { x: at.x, y: at.y };
    this.cue = { spotAnim, loops: false };
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new SpotAnimModel(this, () => this.cue);
  }
}

const { rubble } = OCELLUS_P3.collapse;

export class Rubble {
  private readonly spots: readonly RubbleSpot[];
  private crumbling: Readonly<{ wedge: Wedge; from: Tick }> | null = null;

  constructor(region: Region) {
    this.spots = Array.from({ length: rubble.value.perWave }, () => new RubbleSpot(region));
    this.spots.forEach((spot) => region.addEntity(spot));
  }

  start(wedge: Wedge, from: Tick): void {
    this.crumbling = { wedge, from };
  }

  stop(): void {
    this.crumbling = null;
  }

  tick(at: Tick): void {
    const crumbling = this.crumbling;
    if (crumbling === null || (at - crumbling.from) % rubble.value.every !== 0) return;
    const tiles = WEDGE_FLOOR[crumbling.wedge].tiles();
    const looks = rubble.value.spotAnims;
    this.spots.forEach((spot, i) => spot.play(tiles[Math.floor(hash(at, i) * tiles.length)], looks[Math.floor(hash(i, at) * looks.length)]));
  }
}
