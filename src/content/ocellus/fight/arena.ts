import * as THREE from "three";
import { CollisionType, Entity, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import type { ATile, Quadrant } from "./geometry";
import { C, GRID, ROOM_DIAGONAL, ROOM_HALF, at, inRoom, key, toSdk } from "./geometry";
import { borderOf, edgeOf } from "./effects";

export type CenserLook = Readonly<{ tile: ATile; god: "bandos" | "saradomin" | "armadyl" | "zaros"; lit: boolean }>;

export type FloorState = Readonly<{
  /** Changes whenever the floor's shape changes, so the mesh is only rebuilt then. */
  key: string;
  floor: readonly ATile[];
  stones: readonly ATile[];
  censers: readonly CenserLook[];
  /** Quadrants currently crumbling (drawn shaking and darkening before they drop). */
  crumbling: readonly Quadrant[];
  /** Quadrants that fell: their parapet, torches and censer go with them. */
  destroyed: readonly Quadrant[];
}>;

const FLOOR_Y = -0.5;
const CLIFF_DEPTH = 5;
const PX = 64;
const GOD_COLOUR: Readonly<Record<CenserLook["god"], number>> = {
  bandos: 0xd9a441,
  saradomin: 0x66b7ff,
  armadyl: 0xf1f1e0,
  zaros: 0xa05bdc,
};

function hash(x: number, z: number): number {
  let h = Math.imul(x * 374761393 + z * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The engraved stone floor of the whole room, drawn once: faceted tiles, the outer ring and the eight-point star. */
function roomTexture(): THREE.CanvasTexture {
  const size = GRID * PX;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#9ea08d";
    ctx.fillRect(0, 0, size, size);
    for (let sx = 0; sx < GRID; sx++) {
      for (let sy = 0; sy < GRID; sy++) {
        const base = 150 + Math.floor(hash(sx, sy) * 14);
        const x0 = sx * PX;
        const y0 = sy * PX;
        const flip = hash(sy, sx) > 0.5;
        const shade = (delta: number) => `rgb(${base + delta - 4}, ${base + delta + 1}, ${base + delta - 16})`;
        ctx.fillStyle = shade(0);
        ctx.beginPath();
        if (flip) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + PX, y0);
          ctx.lineTo(x0, y0 + PX);
        } else {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + PX, y0);
          ctx.lineTo(x0 + PX, y0 + PX);
        }
        ctx.fill();
        ctx.fillStyle = shade(-9);
        ctx.beginPath();
        if (flip) {
          ctx.moveTo(x0 + PX, y0);
          ctx.lineTo(x0 + PX, y0 + PX);
          ctx.lineTo(x0, y0 + PX);
        } else {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + PX, y0 + PX);
          ctx.lineTo(x0, y0 + PX);
        }
        ctx.fill();
      }
    }
    // The middle, in texture pixels: arena (0, 0) is the centre of SDK tile (C, C).
    const mid = toSdk(at(0, 0));
    const cx = (mid.x + 0.5) * PX;
    const cy = (mid.y + 0.5) * PX;
    ctx.strokeStyle = "rgba(70, 74, 60, 0.55)";
    ctx.lineWidth = PX * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, 7.6 * PX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = PX * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, 8.4 * PX, 0, Math.PI * 2);
    ctx.stroke();
    // Eight-point star: long points on the axes, short on the diagonals.
    const points: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8 - Math.PI / 2;
      const radius = i % 4 === 0 ? 11.5 : i % 2 === 0 ? 6.8 : 2.6;
      points.push([cx + Math.cos(angle) * radius * PX, cy + Math.sin(angle) * radius * PX]);
    }
    ctx.fillStyle = "rgba(92, 97, 80, 0.33)";
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 64, 52, 0.45)";
    ctx.lineWidth = PX * 0.05;
    ctx.stroke();
    ctx.fillStyle = "rgba(120, 124, 104, 0.5)";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.4 * PX, 0, Math.PI * 2);
    ctx.fill();
    // Smaller stars in each quadrant, as in the room.
    for (const [qx, qz] of [[6, 6], [6, -6], [-6, -6], [-6, 6]]) {
      const q = toSdk(at(qx, qz));
      const qcx = (q.x + 0.5) * PX;
      const qcy = (q.y + 0.5) * PX;
      ctx.fillStyle = "rgba(92, 97, 80, 0.22)";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + Math.PI / 8;
        const radius = i % 2 === 0 ? 2.6 : 0.9;
        const x = qcx + Math.cos(angle) * radius * PX;
        const y = qcy + Math.sin(angle) * radius * PX;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Faint grout lines.
    ctx.strokeStyle = "rgba(60, 62, 50, 0.18)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * PX, 0);
      ctx.lineTo(i * PX, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * PX);
      ctx.lineTo(size, i * PX);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

type Corner = Readonly<{ world: [number, number]; quadrant: Quadrant }>;

function quadrantAt(x: number, z: number): Quadrant {
  if (x > 0) return z > 0 ? "NE" : "SE";
  return z > 0 ? "NW" : "SW";
}

/** Corners of the room's octagon, in world (x, z), with the quadrant each belongs to. */
function octagon(): Corner[] {
  // Tile centres sit on integers, so the room's outer edge is half a tile past the last tile.
  const h = ROOM_HALF + 0.5;
  const d = ROOM_DIAGONAL + 0.5 - h;
  const pts: [number, number][] = [
    [d, h], [h, d], [h, -d], [d, -h], [-d, -h], [-h, -d], [-h, d], [-d, h],
  ];
  // Arena (x, z) to world: x + C + 0.5, and z to C - z - 0.5 (world z is SDK y, which runs south).
  return pts.map(([x, z]) => ({ world: [x + C + 0.5, C - z - 0.5], quadrant: quadrantAt(x, z) }));
}

class ArenaModel implements Model {
  private readonly group = new THREE.Group();
  private readonly dynamic = new THREE.Group();
  private readonly texture = roomTexture();
  private readonly floorMaterial = new THREE.MeshLambertMaterial({ map: this.texture });
  private readonly cliffMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x8c8a74 });
  private readonly wallMaterial = new THREE.MeshLambertMaterial({ color: 0xb4b49c });
  private readonly bowlMaterial = new THREE.MeshLambertMaterial({ color: 0x6d5a3a });
  private readonly flames = new Map<string, THREE.Mesh>();
  /** Parapet pieces and torches, with the quadrants they stand over; hidden once all of those have fallen. */
  private readonly rim: { object: THREE.Object3D; quadrants: readonly Quadrant[] }[] = [];
  private readonly crumbleMaterial = new THREE.MeshBasicMaterial({ color: 0x3a0612, transparent: true, opacity: 0.3, depthWrite: false });
  private built: string | null = null;
  private time = 0;

  constructor(private readonly state: () => FloorState) {
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID * 4, GRID * 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x07060b }),
    );
    abyss.position.set(GRID / 2, FLOOR_Y - CLIFF_DEPTH, GRID / 2);
    this.group.add(abyss);
    this.group.add(this.dynamic);
    this.addParapetAndTorches();
  }

  private addParapetAndTorches(): void {
    const corners = octagon();
    const wallHeight = 0.55;
    const thickness = 0.35;
    for (let i = 0; i < corners.length; i++) {
      const [ax, az] = corners[i].world;
      const [bx, bz] = corners[(i + 1) % corners.length].world;
      const edgeQuadrants = [...new Set([corners[i].quadrant, corners[(i + 1) % corners.length].quadrant])];
      const length = Math.hypot(bx - ax, bz - az);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, wallHeight, thickness), this.wallMaterial);
      wall.position.set((ax + bx) / 2, FLOOR_Y + wallHeight / 2, (az + bz) / 2);
      wall.rotation.y = -Math.atan2(bz - az, bx - ax);
      // Push the wall outward by half its thickness so it sits outside the floor.
      const centreX = C + 0.5;
      const centreZ = C - 0.5;
      const outX = wall.position.x - centreX;
      const outZ = wall.position.z - centreZ;
      const outLength = Math.hypot(outX, outZ);
      wall.position.x += (outX / outLength) * thickness / 2;
      wall.position.z += (outZ / outLength) * thickness / 2;
      this.group.add(wall);
      this.rim.push({ object: wall, quadrants: edgeQuadrants });

      const torch = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.6, 8), this.wallMaterial);
      pillar.position.set(ax, FLOOR_Y + 0.8, az);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 7), new THREE.MeshBasicMaterial({ color: 0xffa630 }));
      flame.position.set(ax, FLOOR_Y + 1.85, az);
      this.flames.set(`torch${i}`, flame);
      torch.add(pillar, flame);
      this.group.add(torch);
      this.rim.push({ object: torch, quadrants: [corners[i].quadrant] });
    }
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    if (this.group.parent !== scene) scene.add(this.group);
    this.time += clockDelta;
    const state = this.state();
    if (state.key !== this.built) this.rebuild(state);
    for (const [name, flame] of this.flames) {
      const wobble = 1 + 0.12 * Math.sin(this.time * 9 + name.length * 3.1);
      flame.scale.set(1, wobble, 1);
    }
    this.crumbleMaterial.opacity = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(this.time * 6));
    this.group.visible = visible;
  }

  private ownsMaterial(material: THREE.Material): boolean {
    return material !== this.floorMaterial && material !== this.cliffMaterial && material !== this.stoneMaterial && material !== this.wallMaterial && material !== this.crumbleMaterial && material !== this.bowlMaterial;
  }

  private clearDynamic(): void {
    this.dynamic.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (this.ownsMaterial(material)) material.dispose();
    });
    this.dynamic.clear();
    for (const name of [...this.flames.keys()]) if (name.startsWith("censer")) this.flames.delete(name);
  }

  private rebuild(state: FloorState): void {
    this.built = state.key;
    this.clearDynamic();
    const fallen = new Set(state.destroyed);
    for (const { object, quadrants } of this.rim) object.visible = quadrants.some((q) => !fallen.has(q));

    // Floor top: one quad per tile, UVs into the room texture.
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const tile of state.floor) {
      const s = toSdk(tile);
      const quad: [number, number][] = [[s.x, s.y - 1], [s.x + 1, s.y], [s.x + 1, s.y - 1], [s.x, s.y - 1], [s.x, s.y], [s.x + 1, s.y]];
      for (const [x, z] of quad) {
        positions.push(x, FLOOR_Y + 0.001, z);
        // Texture v runs down the canvas, which is SDK y; world z = sdk y - 1 at the tile's north edge.
        uvs.push(x / GRID, 1 - (z + 1) / GRID);
      }
    }
    const floor = new THREE.BufferGeometry();
    floor.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    floor.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    floor.computeVertexNormals();
    const floorMesh = new THREE.Mesh(floor, this.floorMaterial);
    floorMesh.receiveShadow = false;
    this.dynamic.add(floorMesh);

    // A crumbling quadrant throbs dark red until it drops.
    if (state.crumbling.length > 0) {
      const crumbling = new Set(state.crumbling);
      const tiles = state.floor.filter((t) => crumbling.has(quadrantAt(t.x, t.z)) && Math.abs(t.x) >= 2 && Math.abs(t.z) >= 2);
      const crumblePositions: number[] = [];
      for (const tile of tiles) {
        const s = toSdk(tile);
        for (const [x, z] of [[s.x, s.y - 1], [s.x + 1, s.y], [s.x + 1, s.y - 1], [s.x, s.y - 1], [s.x, s.y], [s.x + 1, s.y]]) {
          crumblePositions.push(x, FLOOR_Y + 0.006, z);
        }
      }
      const crumble = new THREE.BufferGeometry();
      crumble.setAttribute("position", new THREE.Float32BufferAttribute(crumblePositions, 3));
      this.dynamic.add(new THREE.Mesh(crumble, this.crumbleMaterial));
    }

    // Cliffs: every floor edge that does not meet floor drops into the abyss.
    const cliffPositions: number[] = [];
    const cliffColours: number[] = [];
    const top = new THREE.Color(0x6f705f);
    const bottom = new THREE.Color(0x0b0a0f);
    const vertex = (x: number, y: number, z: number, c: THREE.Color) => {
      cliffPositions.push(x, y, z);
      cliffColours.push(c.r, c.g, c.b);
    };
    for (const { tile, side } of borderOf(state.floor)) {
      const e = edgeOf(tile, side);
      const yTop = FLOOR_Y;
      const yBottom = FLOOR_Y - CLIFF_DEPTH;
      vertex(e.ax, yTop, e.az, top);
      vertex(e.bx, yTop, e.bz, top);
      vertex(e.bx, yBottom, e.bz, bottom);
      vertex(e.ax, yTop, e.az, top);
      vertex(e.bx, yBottom, e.bz, bottom);
      vertex(e.ax, yBottom, e.az, bottom);
    }
    const cliffs = new THREE.BufferGeometry();
    cliffs.setAttribute("position", new THREE.Float32BufferAttribute(cliffPositions, 3));
    cliffs.setAttribute("color", new THREE.Float32BufferAttribute(cliffColours, 3));
    cliffs.computeVertexNormals();
    this.dynamic.add(new THREE.Mesh(cliffs, this.cliffMaterial));

    // Stepping stones: flat-topped rocks floating in the chasm, a little below the banks.
    for (const stone of state.stones) {
      const s = toSdk(stone);
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.18, 0.9, 7), this.stoneMaterial);
      rock.position.set(s.x + 0.5, FLOOR_Y - 0.5, s.y - 0.5);
      rock.rotation.y = hash(stone.x, stone.z) * Math.PI;
      this.dynamic.add(rock);
    }

    // Censers: a bowl on a plinth, its fire lit in the god's colour once used.
    for (const censer of state.censers) {
      const q = quadrantAt(censer.tile.x, censer.tile.z);
      if (fallen.has(q)) continue;
      const s = toSdk(censer.tile);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 8), this.wallMaterial);
      plinth.position.set(s.x + 0.5, FLOOR_Y + 0.55, s.y - 0.5);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.3, 10), this.bowlMaterial);
      bowl.position.set(s.x + 0.5, FLOOR_Y + 1.25, s.y - 0.5);
      this.dynamic.add(plinth, bowl);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(censer.lit ? 0.3 : 0.12, censer.lit ? 0.8 : 0.25, 8),
        new THREE.MeshBasicMaterial({ color: censer.lit ? GOD_COLOUR[censer.god] : 0x3a3328 }),
      );
      flame.position.set(s.x + 0.5, FLOOR_Y + 1.65, s.y - 0.5);
      this.flames.set(`censer${key(censer.tile)}`, flame);
      this.dynamic.add(flame);
    }
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.clearDynamic();
    this.texture.dispose();
    this.floorMaterial.dispose();
    this.cliffMaterial.dispose();
    this.stoneMaterial.dispose();
    this.wallMaterial.dispose();
    this.crumbleMaterial.dispose();
    this.bowlMaterial.dispose();
    for (const flame of this.flames.values()) {
      flame.geometry.dispose();
      if (!Array.isArray(flame.material)) flame.material.dispose();
    }
  }

  getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** The room: floor, cliffs into the abyss, parapet, torches, stepping stones and censers. */
export class ArenaFloor extends Entity {
  constructor(region: Region, private readonly state: () => FloorState) {
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
    const { floor, stones } = this.state();
    for (const tile of floor) {
      const s = toSdk(tile);
      context.fillStyle = (tile.x + tile.z) % 2 === 0 ? "#8e907d" : "#858773";
      context.fillRect(s.x * scale, s.y * scale, scale, scale);
    }
    context.fillStyle = "#5d5a4c";
    for (const stone of stones) {
      const s = toSdk(stone);
      context.fillRect((s.x + 0.15) * scale, (s.y + 0.15) * scale, scale * 0.7, scale * 0.7);
    }
  }

  protected override create3dModel(): Model {
    return new ArenaModel(this.state);
  }
}

export function fullRoom(): ATile[] {
  const tiles: ATile[] = [];
  for (let x = -ROOM_HALF; x <= ROOM_HALF; x++) {
    for (let z = -ROOM_HALF; z <= ROOM_HALF; z++) {
      if (inRoom(at(x, z))) tiles.push(at(x, z));
    }
  }
  return tiles;
}
