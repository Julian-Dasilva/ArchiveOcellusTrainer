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
    const field = new LocField(region, () => [{ key: "aoe", tile: at(0, 0), models: [MODEL] }]);
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
});
