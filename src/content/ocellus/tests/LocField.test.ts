import { crc32 } from "node:zlib";
import * as THREE from "three";
import { CacheRender, TestRegion } from "osrs-sdk";
import { at } from "../fight/geometry";
import { LocField } from "../fight/locs";

const MODEL = 1;
const BIND = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const IDLE = [0, 0, 0, 0.25, 0, 0, 0, 0.25, 0];

/** A hand-made one-triangle loc whose baked idle (pose 0) shrinks it, in the SDK's binary payload format. */
function payload(): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(
    JSON.stringify({
      version: 2,
      positions: BIND,
      indices: [0, 1, 2],
      alphas: [0, 0, 0],
      poseMap: { 0: 7 },
      animations: { 7: { frames: [IDLE], lengths: [30] } },
    }),
  );
  const bytes = new Uint8Array(8 + json.length);
  bytes.set(new TextEncoder().encode("OSRB"));
  new DataView(bytes.buffer).setUint32(4, json.length, true);
  bytes.set(json, 8);
  return bytes;
}

function bundleFiles(): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
  const loc = payload();
  const manifest = {
    schemaVersion: 3,
    bundleVersion: "loc-field-test",
    cache: { revision: 241, source: "test", contentHash: "test" },
    assets: { loc: { file: "loc.bin", crc32: crc32(loc).toString(16).padStart(8, "0") } },
    references: { [`model:${MODEL}`]: ["loc"] },
  };
  return new Map([
    ["http://localhost/osrs-assets/manifest.json", new TextEncoder().encode(JSON.stringify(manifest))],
    ["http://localhost/osrs-assets/loc.bin", loc],
  ]);
}

/** The SDK bundles its own three.js, so its meshes fail `instanceof` against this copy's classes. */
const isMesh = (node: THREE.Object3D): node is THREE.Mesh => "isMesh" in node;

function drawnPositions(scene: THREE.Scene): number[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((node) => {
    if (isMesh(node)) meshes.push(node);
  });
  return meshes.flatMap((mesh) => Array.from(mesh.geometry.getAttribute("position").array));
}

const isInstanced = (mesh: THREE.Mesh): mesh is THREE.InstancedMesh => "isInstancedMesh" in mesh;

/** The world-space corners of each drawn triangle: one per plain mesh, one per instance of an instanced mesh. */
function worldTriangles(scene: THREE.Scene): THREE.Vector3[][] {
  scene.updateMatrixWorld(true);
  const triangles: THREE.Vector3[][] = [];
  const corners = (mesh: THREE.Mesh, matrix: THREE.Matrix4) => {
    const position = mesh.geometry.getAttribute("position");
    triangles.push([0, 1, 2].map((i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix)));
  };
  scene.traverse((node) => {
    if (!isMesh(node)) return;
    if (!isInstanced(node)) return corners(node, node.matrixWorld);
    for (let i = 0; i < node.count; i++) {
      const instance = new THREE.Matrix4();
      node.getMatrixAt(i, instance);
      corners(node, instance.premultiply(node.matrixWorld));
    }
  });
  return triangles;
}

describe("LocField", () => {
  // The bundle is static files the browser fetches; jsdom has no server, so the test serves them.
  beforeEach(() => {
    const files = bundleFiles();
    vi.stubGlobal("fetch", async (url: string) => {
      const body = files.get(url);
      return body ? new Response(body) : new Response(null, { status: 404 });
    });
    CacheRender.configure("http://localhost/osrs-assets/manifest.json");
  });

  afterEach(() => {
    CacheRender.configure(null);
    vi.unstubAllGlobals();
  });

  it("draws each loc in its baked idle pose, not its bind mesh", async () => {
    const region = new TestRegion(20, 20);
    const field = new LocField(region, () => [{ tile: at(0, 0), models: [MODEL] }]);
    const model = field.get3dModel();
    if (!model) throw new Error("the loc field made no model");
    const scene = new THREE.Scene();
    const frame = () => model.draw(scene, 0, 0, { x: 0, y: 0, z: 0 }, 0, 0, true, []);

    frame();
    await vi.waitFor(() => expect(drawnPositions(scene)).toEqual(BIND));
    model.clientTick?.();
    frame();

    expect(drawnPositions(scene)).toEqual(IDLE);
  });

  it("draws the posed loc on every tile it covers", async () => {
    const region = new TestRegion(20, 20);
    const field = new LocField(region, () => [at(0, 0), at(2, 0), at(0, 3)].map((tile) => ({ tile, models: [MODEL] })));
    const model = field.get3dModel();
    if (!model) throw new Error("the loc field made no model");
    const scene = new THREE.Scene();
    const frame = () => model.draw(scene, 0, 0, { x: 0, y: 0, z: 0 }, 0, 0, true, []);

    frame();
    await vi.waitFor(() => expect(drawnPositions(scene).length).toBeGreaterThan(0));
    model.clientTick?.();
    frame();

    const [first, ...others] = worldTriangles(scene);
    if (!first) throw new Error("the loc field drew nothing");
    const round = (v: THREE.Vector3) => v.toArray().map((n) => Math.round(n * 1000) / 1000 + 0);
    // A tile east is +1 on world x; a tile north is -1 on world z.
    expect(others.map((triangle) => triangle.map((v, k) => round(v.clone().sub(first[k]))))).toEqual([
      [[2, 0, 0], [2, 0, 0], [2, 0, 0]],
      [[0, 0, -3], [0, 0, -3], [0, 0, -3]],
    ]);
  });
});
