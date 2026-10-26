import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, GROUND_OVERLAY_Y, LineOfSightMask } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import { TileSet, beside } from "../../../../sim/tiles";
import { CURB, PLATFORM, WALKWAY } from "../p4/floor";
import { rimEdges } from "./P4Views";

const LOOK = OCELLUS_P4.geometry.walkway.value;
const BRAZIER = OCELLUS_P4.geometry.brazier.value;
const DIAGONAL_TILES = TileSet.at(CURB.flatMap((curb) => (curb.shape === "diagonal" ? [curb.at] : [])));

type Vertex = readonly [number, number, number];

function walkwayGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const triangle = (corners: readonly [Vertex, Vertex, Vertex], colour: THREE.Color) => {
    for (const corner of corners) {
      positions.push(...corner);
      colors.push(colour.r, colour.g, colour.b);
    }
  };
  const quad = ([a, b, c, d]: readonly [Vertex, Vertex, Vertex, Vertex], colour: THREE.Color) => {
    triangle([a, b, c], colour);
    triangle([a, c, d], colour);
  };
  const [top, face, shade] = [LOOK.top, LOOK.face, LOOK.shade].map((hex) => new THREE.Color(hex));
  const ground = GROUND_OVERLAY_Y;
  const raised = GROUND_OVERLAY_Y + LOOK.height;
  for (const curb of CURB) {
    const { x, y } = curb.at;
    switch (curb.shape) {
      case "square":
        quad([[x, raised, y - 1], [x + 1, raised, y - 1], [x + 1, raised, y], [x, raised, y]], top);
        break;
      case "diagonal": {
        const [from, to] = curb.cut;
        const { wallCorner } = curb;
        triangle([[from.x, raised, from.y - 1], [wallCorner.x, raised, wallCorner.y - 1], [to.x, raised, to.y - 1]], top);
        quad([[from.x, ground, from.y - 1], [to.x, ground, to.y - 1], [to.x, raised, to.y - 1], [from.x, raised, from.y - 1]], face);
        break;
      }
      default: {
        const unhandled: never = curb;
        return unhandled;
      }
    }
  }
  for (const { at, side, from, to } of rimEdges(WALKWAY)) {
    if (DIAGONAL_TILES.contains(at)) continue;
    quad([[from.x, ground, from.z], [to.x, ground, to.z], [to.x, raised, to.z], [from.x, raised, from.z]], PLATFORM.contains(beside(at, side)) ? face : shade);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

class WalkwayModel implements Model {
  private readonly mesh = new THREE.Mesh(walkwayGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.mesh.visible = visible;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  getWorldPosition(): THREE.Vector3 {
    return this.mesh.getWorldPosition(new THREE.Vector3());
  }

  async preload(): Promise<void> {}
}

export class Walkway extends Entity {
  constructor(region: Region) {
    super(region, { x: 0, y: 0 });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  protected override create3dModel(): Model {
    return new WalkwayModel();
  }
}

export class Brazier extends Entity {
  constructor(region: Region, at: Tile) {
    super(region, { x: at.x, y: at.y });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override getPerceivedLocation(tickPercent: number): Location3 {
    return { ...this.location, z: LOOK.height };
  }

  protected override create3dModel(): Model {
    return CacheRenderInstancedModel.forRenderable(this, CacheRenderReferences.model(BRAZIER.model));
  }
}
