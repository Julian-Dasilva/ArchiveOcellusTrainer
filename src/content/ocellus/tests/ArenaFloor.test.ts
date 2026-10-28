import * as THREE from "three";
import { TestRegion } from "osrs-sdk";
import type { FloorState } from "../fight/arena";
import { ArenaFloor, fullRoom } from "../fight/arena";
import type { Quadrant } from "../fight/geometry";
import { ARMS, C, CENSERS, GRID, QUADRANTS, quadrantOf, stonesOf } from "../fight/geometry";
import { phase4Opening } from "../full/fall";

const KIND: Readonly<Record<string, string>> = {
  b4b49c: "masonry",
  "8c8a74": "stone",
  "6d5a3a": "bowl",
  ffa630: "torch flame",
  "3a3328": "censer flame",
};

function afterFalls(destroyed: readonly Quadrant[]): FloorState {
  return {
    key: destroyed.join(",") || "open",
    floor: fullRoom().filter((tile) => {
      const quadrant = quadrantOf(tile);
      return quadrant === null || !destroyed.includes(quadrant);
    }),
    stones: ARMS.flatMap((arm) => stonesOf(arm)),
    censers: QUADRANTS.map((quadrant) => ({ tile: CENSERS[quadrant].tile, god: CENSERS[quadrant].god, lit: false })),
    crumbling: [],
    destroyed,
  };
}

/** The quadrants a set of world points spans, in arena terms: x east of the middle tile, z north of it. */
function quadrantsOf(points: readonly THREE.Vector3[]): string {
  const spanned = new Set<string>();
  for (const p of points) {
    const x = p.x - C - 0.5;
    const z = C - 0.5 - p.z;
    spanned.add(`${z > 0 ? "N" : "S"}${x > 0 ? "E" : "W"}`);
  }
  return [...spanned].sort().join("+");
}

/**
 * Each piece is a closed solid, so inside one every edge borders exactly two triangles. Joining triangles over those
 * edges finds the pieces, whether each is its own mesh or part of a merged one: walls that meet along a corner edge
 * give it four triangles, and a wall meets its torch pillar at one point.
 */
function piecesOf(mesh: THREE.Mesh): THREE.Vector3[][] {
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  const triangles: { points: THREE.Vector3[]; parent: number }[] = [];
  const root = (t: number): number => {
    const up = triangles[t].parent;
    return up === t ? t : root(up);
  };
  const byEdge = new Map<string, number[]>();
  for (let i = 0; i < (index ? index.count : position.count); i += 3) {
    const t = triangles.length;
    const points = [i, i + 1, i + 2].map((corner) =>
      new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(corner) : corner).applyMatrix4(mesh.matrixWorld),
    );
    const keys = points.map((p) => p.toArray().map((n) => n.toFixed(3)).join(","));
    // A cone's apex row is zero-area triangles, which draw nothing.
    if (new Set(keys).size < 3) continue;
    triangles.push({ points, parent: t });
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = [keys[a], keys[b]].sort().join("|");
      byEdge.set(edge, [...(byEdge.get(edge) ?? []), t]);
    }
  }
  for (const [a, b, ...more] of byEdge.values()) {
    if (b !== undefined && more.length === 0) triangles[root(a)].parent = root(b);
  }
  const pieces = new Map<number, THREE.Vector3[]>();
  triangles.forEach(({ points }, t) => pieces.set(root(t), [...(pieces.get(root(t)) ?? []), ...points]));
  return [...pieces.values()];
}

function drawnPieces(state: FloorState): string[] {
  const model = new ArenaFloor(new TestRegion(GRID, GRID), () => state).get3dModel();
  if (!model) throw new Error("the arena made no model");
  const scene = new THREE.Scene();
  model.draw(scene, 0, 0, { x: 0, y: 0, z: 0 }, 0, 0, true, []);
  scene.updateMatrixWorld(true);
  const drawn: string[] = [];
  scene.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material: unknown = node.material;
    if (!(material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshBasicMaterial)) return;
    const kind = KIND[material.color.getHexString()];
    if (kind) for (const piece of piecesOf(node)) drawn.push(`${kind} ${quadrantsOf(piece)}`);
  });
  return drawn.sort();
}

/** What a standing quadrant shows: its own parapet wall, two torches, and its censer on a plinth. */
const quadrant = (q: Quadrant) => [`masonry ${q}`, `masonry ${q}`, `masonry ${q}`, `torch flame ${q}`, `torch flame ${q}`, `masonry ${q}`, `bowl ${q}`, `censer flame ${q}`];
/** A wall across two quadrants stands while either does. */
const wall = (span: string) => [`masonry ${span}`];
/** Three stones on each arm, in the chasm between the two quadrants it divides. */
const STONES = ["NE+NW", "NE+SE", "SE+SW", "NW+SW"].flatMap((span) => [`stone ${span}`, `stone ${span}`, `stone ${span}`]);

describe("the arena after each fall", () => {
  it.each([
    ["guard: the open room draws every quadrant's parapet, torches and censer", afterFalls([]), [
      ...quadrant("NE"), ...quadrant("SE"), ...quadrant("SW"), ...quadrant("NW"),
      ...wall("NE+SE"), ...wall("SE+SW"), ...wall("NW+SW"), ...wall("NE+NW"), ...STONES,
    ]],
    ["guard: the first fall drops the south-east quadrant's pieces and keeps its border walls", afterFalls(["SE"]), [
      ...quadrant("NE"), ...quadrant("SW"), ...quadrant("NW"),
      ...wall("NE+SE"), ...wall("SE+SW"), ...wall("NW+SW"), ...wall("NE+NW"), ...STONES,
    ]],
    ["guard: the second fall drops the north-east quadrant and the wall it shared with the south-east", afterFalls(["SE", "NE"]), [
      ...quadrant("SW"), ...quadrant("NW"),
      ...wall("SE+SW"), ...wall("NW+SW"), ...wall("NE+NW"), ...STONES,
    ]],
    ["guard: phase 4's third fall leaves the north-west quadrant, its two border walls and every stone", phase4Opening().floor, [
      ...quadrant("NW"),
      ...wall("NW+SW"), ...wall("NE+NW"), ...STONES,
    ]],
  ])("%s", (_name, state, expected) => {
    expect(drawnPieces(state)).toEqual([...expected].sort());
  });
});
