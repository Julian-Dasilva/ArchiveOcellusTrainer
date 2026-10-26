import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, Model } from "osrs-sdk";
import * as THREE from "three";
import { startDrill } from "../content/ocellus/tests/drill";
import { parseConfig } from "./gate";

const config = parseConfig(JSON.parse(readFileSync(resolve(__dirname, "perfGate.json"), "utf8")));
const { window, resources } = config.workload;
const FRAMES_PER_TICK = 10;

type Allocations = Readonly<{ geometries: number; materials: number; textures: number; objects: number; canvases: number }>;

let canvases = 0;
const createElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
  if (tag.toLowerCase() === "canvas") canvases++;
  return createElement(tag, options);
});

// THREE numbers every geometry, material, texture and object from module counters, so a fresh one's id counts all made before it.
function counters(): Allocations {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  const texture = new THREE.Texture();
  const counts = { geometries: geometry.id, materials: material.id, textures: texture.id, objects: new THREE.Object3D().id, canvases };
  geometry.dispose();
  material.dispose();
  texture.dispose();
  return counts;
}

function made(before: Allocations, after: Allocations): Allocations {
  return {
    geometries: after.geometries - before.geometries - 1,
    materials: after.materials - before.materials - 1,
    textures: after.textures - before.textures - 1,
    objects: after.objects - before.objects - 1,
    canvases: after.canvases - before.canvases,
  };
}

const total = ({ geometries, materials, textures, objects, canvases: made }: Allocations): number => geometries + materials + textures + objects + made;

function passiveFight() {
  const seed = Number(new URLSearchParams(config.workload.query).get("seed"));
  const drill = startDrill({ seed });
  drill.region.invincible = new URLSearchParams(config.workload.query).get("invincible") === "on";
  return drill;
}

describe("perf budgets without a browser", () => {
  test("guard, the views already build once a tick: no view allocates in a frame after its tick's first", () => {
    const drill = passiveFight();
    const scene = new THREE.Scene();
    // The SDK's Viewport3d needs WebGL, which jsdom lacks, so this loop stands in for it: one model per live entity, destroyed when the entity goes, drawn every frame.
    const models = new Map<Entity, Model | null>();
    const offenders: string[] = [];
    for (let at = window.from; at <= resources.to; at++) {
      drill.tickTo(at);
      const live = new Set(drill.region.entities);
      for (const [entity, model] of models) {
        if (live.has(entity) && !entity.shouldDestroy()) continue;
        model?.destroy(scene);
        models.delete(entity);
      }
      for (const entity of live) if (!entity.shouldDestroy() && !models.has(entity)) models.set(entity, entity.get3dModel());
      for (let frame = 0; frame < FRAMES_PER_TICK; frame++) {
        const tickPercent = frame / FRAMES_PER_TICK;
        for (const [entity, model] of models) {
          const before = counters();
          model?.draw(scene, 600 / FRAMES_PER_TICK, tickPercent, entity.getPerceivedLocation(tickPercent), entity.getPerceivedRotation(), entity.getPerceivedPitch(tickPercent), entity.visible(tickPercent), entity.getPerceivedOffsets(tickPercent));
          const allocations = made(before, counters());
          if (frame > 0 && total(allocations) > config.headless.viewAllocationsPerFrame) offenders.push(`${entity.constructor.name} at P4 tick ${at}, frame ${frame}: ${JSON.stringify(allocations)}`);
        }
      }
    }
    drill.dispose();
    expect(offenders.slice(0, 5)).toEqual([]);
  }, 30_000);

  test("guard, the world already retires what it spawns: it holds no more mobs, entities or projectiles at the end of the resource window than at its start", () => {
    const drill = passiveFight();
    const counts = (at: number) => {
      drill.tickTo(at);
      return { mobs: drill.region.mobs.length, entities: drill.region.entities.length, projectiles: drill.region.projectiles.length };
    };
    const first = counts(resources.from);
    const last = counts(resources.to);
    drill.dispose();
    expect(last.mobs - first.mobs).toBeLessThanOrEqual(config.budgets.mobGrowth3d);
    expect(last.entities - first.entities).toBeLessThanOrEqual(config.budgets.entityGrowth3d);
    expect(last.projectiles - first.projectiles).toBeLessThanOrEqual(config.budgets.projectileGrowth3d);
  });
});
