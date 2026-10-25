import * as THREE from "three";
import { paintedStyleAt, paintedTiles } from "../../../../test/paintedTiles";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { startDrill } from "./drill";
import type { At } from "./drill";

const NON_LETHAL = { focus: "lifeforce-orb" } as const;

describe("Ocellus arena", () => {
  test("the player spawns two tiles north of the 5x5, the boss's 3x3 stands on x 4-6, y 4-6, and a walk runs two tiles a tick", () => {
    const drill = startDrill({ selection: NON_LETHAL });
    const boss = drill.boss();
    expect([drill.player().location, boss.location, boss.size]).toEqual([{ x: 5, y: 1 }, { x: 4, y: 6 }, 3]);

    drill.walkTo({ x: 9, y: 1 });
    drill.region.world.tickWorld();
    const afterOne = { ...drill.player().location };
    drill.region.world.tickWorld();
    expect([afterOne, drill.player().location]).toEqual([{ x: 7, y: 1 }, { x: 9, y: 1 }]);
    drill.dispose();
  });

  test("the arena paints the floor and the brazier walkway, and the player can stand on the floor and nowhere else", () => {
    const drill = startDrill({ selection: NON_LETHAL });
    const painted = paintedTiles((context, scale) => drill.region.drawWorldBackground(context, scale));
    const standsOn = (to: At) => {
      drill.restart();
      drill.walkTo(to);
      for (let moved = true; moved; ) {
        const { x, y } = drill.player().location;
        drill.region.world.tickWorld();
        moved = drill.player().location.x !== x || drill.player().location.y !== y;
      }
      return drill.player().location.x === to.x && drill.player().location.y === to.y;
    };
    const rows: string[] = [];
    for (let y = -1; y <= 13; y++) {
      let row = "";
      for (let x = -1; x <= 14; x++) {
        const [stands, drawn] = [standsOn({ x, y }), painted.has(`${x},${y}`)];
        row += stands ? (drawn ? "#" : "!") : drawn ? "w" : ".";
      }
      rows.push(row);
    }
    expect(rows).toEqual([
      "................",
      ".............ww.",
      "...##########ww.",
      "..###########ww.",
      "..###########ww.",
      "..##########ww..",
      "..#########ww...",
      "..########ww....",
      "..#######ww.....",
      "..######ww......",
      "..#####ww.......",
      "..####ww........",
      "..###ww.........",
      ".wwwww..........",
      "................",
    ]);
    drill.dispose();
  }, 10_000);

  test("a walk past the edge, or onto the tile beside it, stops on the floor tile nearest the order", () => {
    const stopsAt = (to: At) => {
      const drill = startDrill({ selection: NON_LETHAL });
      drill.walkTo(to);
      drill.region.world.tickWorld(6);
      const at = { ...drill.player().location };
      drill.dispose();
      return at;
    };
    expect([stopsAt({ x: 15, y: 1 }), stopsAt({ x: 12, y: 1 }), stopsAt({ x: 5, y: -3 })]).toEqual([
      { x: 11, y: 1 },
      { x: 11, y: 1 },
      { x: 5, y: 1 },
    ]);
  });

  test("a walk along the diagonal edge keeps to the floor instead of cutting across the blocked tiles beside it", () => {
    const drill = startDrill({ selection: NON_LETHAL });
    drill.walkTo({ x: 11, y: 1 });
    drill.region.world.tickWorld(6);
    drill.walkTo({ x: 3, y: 11 });
    const trail: At[] = [];
    for (let tick = 0; tick < 6; tick++) {
      drill.region.world.tickWorld();
      trail.push({ ...drill.player().location });
    }
    expect(trail).toEqual([{ x: 10, y: 3 }, { x: 8, y: 5 }, { x: 6, y: 7 }, { x: 4, y: 9 }, { x: 3, y: 11 }, { x: 3, y: 11 }]);
    drill.dispose();
  });

  test("the east edge runs straight on x 11 for 3 rows, then one tile in per row, (10, 4), (9, 5) and (8, 6), to the 5x5's corner", () => {
    const drill = startDrill({ selection: NON_LETHAL });
    const lastFloor = (y: number) => {
      for (let x = 13; x >= 0; x--) {
        drill.restart();
        drill.walkTo({ x, y });
        drill.region.world.tickWorld(10);
        if (drill.player().location.x === x && drill.player().location.y === y) return { x, y };
      }
      return null;
    };
    expect([1, 2, 3, 4, 5, 6, 7].map(lastFloor)).toEqual([
      { x: 11, y: 1 },
      { x: 11, y: 2 },
      { x: 11, y: 3 },
      { x: 10, y: 4 },
      { x: 9, y: 5 },
      { x: 8, y: 6 },
      { x: 7, y: 7 },
    ]);
    drill.dispose();
  });

  test("a Control-click along the back wall walks it one diagonal tile a tick, toward the jut and back", async () => {
    const drill = startDrill({ selection: NON_LETHAL });
    const walkClicked = async (to: At) => {
      await drill.click(to, { ctrlKey: true });
      const trail: At[] = [];
      for (let tick = 0; tick < 3; tick++) {
        drill.region.world.tickWorld();
        trail.push({ ...drill.player().location });
      }
      return trail;
    };
    await drill.click({ x: 10, y: 3 });
    drill.region.world.tickWorld(6);
    const start = { ...drill.player().location };
    const toward = await walkClicked({ x: 8, y: 5 });
    const back = await walkClicked({ x: 10, y: 3 });
    drill.dispose();
    expect({ start, toward, back }).toEqual({
      start: { x: 10, y: 3 },
      toward: [{ x: 9, y: 4 }, { x: 8, y: 5 }, { x: 8, y: 5 }],
      back: [{ x: 9, y: 4 }, { x: 10, y: 3 }, { x: 10, y: 3 }],
    });
  });

  test("guard: the back wall draws one straight diagonal from the end of the straight run to the jut, and the flood meets it along that diagonal from above in 3D", () => {
    const drill = startDrill({ selection: { focus: "void-floor" } });
    const { region } = drill;
    const [wall, flood] = [OCELLUS_P4.geometry.walkway.value.top, OCELLUS_P4.floor.look.value.void];
    const samples = [0.1, 0.4, 0.7];
    const raster = (styleAt: (x: number, y: number) => string | null) => {
      const rows: string[] = [];
      for (let y = 2; y < 9; y++) {
        for (const dy of samples) {
          let row = "";
          for (let x = 7; x < 13; x++) {
            for (const dx of samples) {
              const style = styleAt(x + dx, y + dy);
              row += style === null ? "." : style === wall ? "w" : style === flood ? "v" : "#";
            }
          }
          rows.push(row);
        }
      }
      return rows;
    };
    const ground = raster(paintedStyleAt((context, scale) => region.drawWorldBackground(context, scale)));
    drill.tickTo(45);
    const scene = new THREE.Scene();
    region.entities.forEach((entity) => entity.get3dModel()?.draw(scene, 0, 0, entity.getPerceivedLocation(0), 0, 0, entity.visible(0), []));
    scene.updateMatrixWorld(true);
    const wallTop = new THREE.Color(wall).getHex();
    const fromAbove = raster((x, y) => {
      const hits = new THREE.Raycaster(new THREE.Vector3(x, 10, y - 1), new THREE.Vector3(0, -1, 0)).intersectObject(scene);
      const seen = (hit: (typeof hits)[number]) => {
        const { object, face } = hit;
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return null;
        const colours = object.geometry.getAttribute("color");
        if (colours instanceof THREE.BufferAttribute && face && new THREE.Color().fromBufferAttribute(colours, face.a).getHex() === wallTop) return wall;
        return object.material.map === null ? null : flood;
      };
      const styles = hits.map(seen);
      return styles.find((style) => style === wall) ?? styles.find((style) => style === flood) ?? null;
    });
    drill.dispose();
    expect(drill.row(45).phase.stage).toBe("outer-void");
    expect(fromAbove).toEqual([
      "vvvvvvvvvvvvvvvwww",
      "vvvvvvvvvvvvvvvwww",
      "vvvvvvvvvvvvvvvwww",
      "...vvvvvvvvvvvvwww",
      "...vvvvvvvvvvvvwww",
      "...vvvvvvvvvvvvwww",
      "...vvvvvvvvvvvvwww",
      "...vvvvvvvvvvvwwww",
      "...vvvvvvvvvvwwwww",
      "...vvvvvvvvvwww...",
      "...vvvvvvvvwwww...",
      "...vvvvvvvwwwww...",
      "...vvvvvvwww......",
      "...vvvvvwwww......",
      "...vvvvwwwww......",
      "...wwwwww.........",
      "...wwwwww.........",
      "...wwwwww.........",
      "wwwwww............",
      "wwwwww............",
      "wwwwww............",
    ]);
    expect(ground).toEqual([
      "###############www",
      "###############www",
      "###############www",
      "###############www",
      "###############www",
      "###############www",
      "###############www",
      "##############wwww",
      "#############wwwww",
      "############www...",
      "###########wwww...",
      "##########wwwww...",
      "#########www......",
      "########wwww......",
      "#######wwwww......",
      "###wwwwww.........",
      "###wwwwww.........",
      "###wwwwww.........",
      "wwwwww............",
      "wwwwww............",
      "wwwwww............",
    ]);
  });

  test("guard: a walk from the diagonal toward the tiles behind the boss stops on the 5x5's corner or beside the jut, because the walkway juts in to meet the corner", () => {
    const walk = (from: At, to: At) => {
      const drill = startDrill({ selection: NON_LETHAL });
      drill.walkTo(from);
      drill.region.world.tickWorld(8);
      drill.player().moveTo(to.x, to.y, "walk");
      const trail: At[] = [];
      for (let tick = 0; tick < 5; tick++) {
        drill.region.world.tickWorld();
        trail.push({ ...drill.player().location });
      }
      drill.dispose();
      return trail;
    };
    expect([
      walk({ x: 9, y: 4 }, { x: 8, y: 8 }),
      walk({ x: 9, y: 4 }, { x: 7, y: 8 }),
      walk({ x: 8, y: 5 }, { x: 8, y: 7 }),
      walk({ x: 8, y: 6 }, { x: 8, y: 8 }),
    ]).toEqual([
      [{ x: 8, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 7 }],
      [{ x: 8, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 7 }],
      [{ x: 8, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 6 }],
      [{ x: 7, y: 6 }, { x: 7, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 7 }],
    ]);
  });

  test("guard: clicks that keep the player running between (3, 2) and (7, 2) empty the run energy on P4 tick 164, which moves one tile, and every click after it walks one tile a tick with run off", async () => {
    const drill = startDrill({ selection: { focus: "floor-holes", floorHoleDamage: "harmless" } });
    const [west, east]: readonly At[] = [{ x: 3, y: 2 }, { x: 7, y: 2 }];
    const on = (at: At) => drill.player().location.x === at.x && drill.player().location.y === at.y;
    const tilesPerTick: number[] = [];
    drill.tickTo(0);
    await drill.click(east);
    for (let t = 1; t <= 166; t++) {
      if (on(west)) await drill.click(east);
      else if (on(east)) await drill.click(west);
      drill.tickTo(t);
      const [from, to] = [drill.row(t - 1).playerAtPostTick.tile, drill.row(t).playerAtPostTick.tile];
      tilesPerTick.push(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)));
    }
    const paces = new Set(drill.rows().flatMap((row) => row.inputs.flatMap((input) => (input.kind === "walk-ordered" ? [input.pace] : []))));
    expect({ tilesPerTick, paces: [...paces], running: drill.player().running }).toEqual({
      tilesPerTick: [...Array<number>(163).fill(2), 1, 1, 1],
      paces: ["run-setting"],
      running: false,
    });
    drill.dispose();
  });
});
