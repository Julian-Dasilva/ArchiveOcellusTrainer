import type { ATile } from "../fight/geometry";
import { sideOf } from "../fight/geometry";
import { P2 } from "../full/data/p2";
import { patternTiles } from "../full/p2/pattern";
import { startP2 } from "./p2run";

type Run = ReturnType<typeof startP2>;

function tileKey(tile: ATile): string {
  return `${tile.x},${tile.z}`;
}

/** Each round's gap volleys in order: the quadrant they fire into, and every tile they cross. */
function roundsOf(f: Run): { quadrant: string; hit: Set<string> }[][] {
  const starts = [...P2.rounds, P2.enough];
  const volleys = f.ofKind("volley").flatMap(([tick, event]) => (event.kind === "volley" && !event.crossfire ? [{ tick, lines: event.lines }] : []));
  return P2.rounds.map((start, i) =>
    volleys
      .filter(({ tick }) => tick >= start && tick < starts[i + 1])
      .map(({ lines }) => {
        const first = lines[0]?.[0];
        if (first === undefined) throw new Error("a volley with no lines");
        return { quadrant: sideOf(first), hit: new Set(lines.flatMap((line) => line.map(tileKey))) };
      }),
  );
}

describe("phase 2's gaps follow the recorded sequences", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  test("every round runs one sequence, each wave's numbered pattern tile is never hit, and rounds go orange, red, green", () => {
    const firsts = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const f = startP2({ seed });
      close = f.close;
      f.tickTo(P2.enough);
      const tiles = patternTiles();
      const runs = roundsOf(f).map((volleys) =>
        P2.gapOrder.filter((sequence) =>
          volleys.every(({ quadrant, hit }, wave) => {
            const marked = tiles.filter((t) => t.sequence === sequence && t.waves.includes(wave + 1) && sideOf(t.tile) === quadrant);
            return marked.length === 1 && marked.every((t) => !hit.has(tileKey(t.tile)));
          }),
        ),
      );
      expect(runs.map((r) => r.length)).toEqual([1, 1, 1]);
      const [first] = runs[0];
      if (first === undefined) throw new Error("no sequence matched the first round");
      firsts.add(first);
      const start = P2.gapOrder.indexOf(first);
      expect(runs.map(([sequence]) => sequence)).toEqual([0, 1, 2].map((i) => P2.gapOrder[(start + i) % P2.gapOrder.length]));
      f.close();
      close = null;
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  test("the pattern tiles number six waves of three sequences in each of the four quadrants", () => {
    const tiles = patternTiles();
    for (const sequence of P2.gapOrder) {
      const waves = tiles.filter((t) => t.sequence === sequence).flatMap((t) => t.waves);
      expect(waves.sort()).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
    }
    expect(new Set(tiles.map((t) => tileKey(t.tile))).size).toBe(tiles.length);
  });
});
