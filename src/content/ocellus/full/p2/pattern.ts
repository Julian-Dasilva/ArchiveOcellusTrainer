import type { ATile } from "../../fight/geometry";
import { QUADRANT_SIGN, at } from "../../fight/geometry";
import type { GapSequence } from "./data";
import { V } from "./data";

/** Each pattern's colour, as players mark them. */
const PATTERN_COLOUR: Readonly<Record<GapSequence, string>> = { orange: "#FF8C1A", red: "#FF3030", green: "#2BDB4A" };

/**
 * Which tile of each wave's safe 2x2 a pattern marks, counted out from its inner corner, so the three patterns can
 * share a spot ((3,3) is in all three) without covering each other.
 */
const CORNER: Readonly<Record<GapSequence, Readonly<{ x: number; z: number }>>> = { orange: { x: 0, z: 0 }, red: { x: 1, z: 0 }, green: { x: 0, z: 1 } };

export type PatternTile = Readonly<{ tile: ATile; sequence: GapSequence; colour: string; label: string; waves: readonly number[] }>;

/**
 * The community's phase 2 tiles: in every quadrant, each wave's safe spot numbered 1..6 in its pattern's colour. The
 * north/south gap g (1 out nearest the middle) leaves rows 2g - 1 and 2g out clear, the east/west gap h columns
 * 2h - 1 and 2h; they cross on the safe 2x2. A spot a pattern visits twice carries both numbers.
 */
export function patternTiles(): PatternTile[] {
  const tiles: PatternTile[] = [];
  for (const { sx, sz } of Object.values(QUADRANT_SIGN)) {
    for (const sequence of V.gapOrder.value) {
      const spots = new Map<string, { x: number; z: number; waves: number[] }>();
      V.gapSequences[sequence].value.forEach(([northSouth, eastWest], wave) => {
        const id = `${northSouth},${eastWest}`;
        const spot = spots.get(id) ?? { x: 2 * eastWest - 1 + CORNER[sequence].x, z: 2 * northSouth - 1 + CORNER[sequence].z, waves: [] };
        spot.waves.push(wave + 1);
        spots.set(id, spot);
      });
      for (const { x, z, waves } of spots.values()) {
        tiles.push({ tile: at(x * sx, z * sz), sequence, colour: PATTERN_COLOUR[sequence], label: waves.join("/"), waves });
      }
    }
  }
  return tiles;
}
