import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import { tile } from "../../../../sim/brands";
import { TileSet } from "../../../../sim/tiles";

const GLYPHS = ["1", "2", "3", "4", "+", "b", "B", "."] as const;
const { grid } = OCELLUS_P3.arena;
const { x, y }: Readonly<{ x: number; y: number }> = OCELLUS_P3.untether.anchor.value;
const size = OCELLUS_P4.boss.size.value;

export const ARENA_SIZE = { width: Math.max(...grid.value.map((row) => row.length)), height: grid.value.length };
export const FLOOR = TileSet.grid(grid.value, GLYPHS, "1", "2", "3", "4", "+");
export const RIM = TileSet.grid(grid.value, GLYPHS, "b", "B");
export const QUADRANT_1_FLOOR = TileSet.grid(grid.value, GLYPHS, "1");
export const UNTETHER_FOOTPRINT = TileSet.area(tile(x, y - size + 1), tile(x + size - 1, y));
export const UNTETHER_CENTRE = tile(x + Math.floor(size / 2), y - Math.floor(size / 2));
