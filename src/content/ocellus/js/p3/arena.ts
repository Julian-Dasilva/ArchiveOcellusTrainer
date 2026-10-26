import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import { tile } from "../../../../sim/brands";
import { TileSet } from "../../../../sim/tiles";

const GLYPHS = ["1", "2", "3", "4", "+", "b", "B", "."] as const;
const { grid, stones } = OCELLUS_P3.arena;
const MIDDLE = OCELLUS_P3.arena.middle.value;
const BOSS_SIZE = OCELLUS_P4.boss.size.value;

export type Wedge = 1 | 2 | 3 | 4;
export const WEDGES: readonly Wedge[] = [1, 2, 3, 4];

export const ARENA_SIZE = { width: Math.max(...grid.value.map((row) => row.length)), height: grid.value.length };
export const WEDGE_FLOOR: Readonly<Record<Wedge, TileSet>> = {
  1: TileSet.grid(grid.value, GLYPHS, "1"),
  2: TileSet.grid(grid.value, GLYPHS, "2"),
  3: TileSet.grid(grid.value, GLYPHS, "3"),
  4: TileSet.grid(grid.value, GLYPHS, "4"),
};
export const FLOOR = TileSet.grid(grid.value, GLYPHS, "1", "2", "3", "4", "+");
export const STANDING = TileSet.grid(grid.value, GLYPHS, "1", "2", "3", "4");
export const CHASM = TileSet.grid(grid.value, GLYPHS, "+");
export const RIM = TileSet.grid(grid.value, GLYPHS, "b", "B");
export const BRAZIERS = TileSet.grid(grid.value, GLYPHS, "B");
export { MIDDLE };
export const QUADRANT_1_FLOOR = WEDGE_FLOOR[1];

export function wedgeOf(at: Tile): Wedge | null {
  return WEDGES.find((wedge) => WEDGE_FLOOR[wedge].contains(at)) ?? null;
}

const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

type Bank = Readonly<{ wedge: Wedge; near: Tile; far: Tile }>;
type Arm = Readonly<{ stones: readonly [Tile, ...Tile[]]; sides: readonly [Bank, Bank] }>;

function arm(dx: number, dy: number): Arm {
  const [first, ...rest] = [...stones.value].sort((a, b) => a - b).map((n) => tile(MIDDLE.x + dx * n, MIDDLE.y + dy * n));
  const last = rest.length > 0 ? rest[rest.length - 1] : first;
  const across = (stone: Tile, side: 1 | -1) => tile(stone.x + dy * 2 * side, stone.y + dx * 2 * side);
  const bank = (side: 1 | -1): Bank => {
    const [near, far] = [across(first, side), across(last, side)];
    const wedge = wedgeOf(near);
    if (wedge === null || wedgeOf(far) !== wedge) throw new RangeError(`the stones from ${first.x},${first.y} have no single wedge beside them on side ${side}`);
    return { wedge, near, far };
  };
  return { stones: [first, ...rest], sides: [bank(1), bank(-1)] };
}

const ARMS: readonly Arm[] = [arm(0, -1), arm(1, 0), arm(0, 1), arm(-1, 0)];
export const STONES: readonly Tile[] = ARMS.flatMap(({ stones: onArm }) => onArm);

export type Crossing = Readonly<{ bank: Tile; hops: readonly [Tile, ...Tile[]] }>;

export function crossingRoute(from: Tile, to: Tile): Crossing | null {
  const here = wedgeOf(from);
  for (const { stones: onArm, sides: [a, b] } of ARMS) {
    const sides = a.wedge === here ? ([a, b] as const) : b.wedge === here ? ([b, a] as const) : null;
    if (sides === null) continue;
    const [near, far] = sides;
    if (onArm.some((stone) => sameTile(stone, to)) || wedgeOf(to) === far.wedge) return { bank: near.near, hops: [...onArm, far.far] };
  }
  return null;
}

/** The boss's 3x3 from its south-west tile; y runs south, so it covers anchor.y - 2 to anchor.y. */
export function footprint(anchor: Tile): TileSet {
  const { x, y }: Readonly<{ x: number; y: number }> = anchor;
  return TileSet.area(tile(x, y - BOSS_SIZE + 1), tile(x + BOSS_SIZE - 1, y));
}

/** Tiles from his 3x3 to `at`, counting diagonal steps as one; 0 under him. */
export function distanceFromBody(anchor: Tile, at: Tile): number {
  const across = Math.max(anchor.x - at.x, 0, at.x - (anchor.x + BOSS_SIZE - 1));
  const along = Math.max(anchor.y - BOSS_SIZE + 1 - at.y, 0, at.y - anchor.y);
  return Math.max(across, along);
}

function middle(anchor: Tile): Tile {
  const half = Math.floor(BOSS_SIZE / 2);
  return tile(anchor.x + half, anchor.y - half);
}

const byDistanceFrom = (from: Tile) => (a: Tile, b: Tile) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y);

/**
 * The shadow slash: `width` wide toward `target`, snapped to the nearest of the 8 directions from his middle tile, from the ring
 * touching his body to the wedge's edge. Straight, the tiles in line with his body; diagonal, the tiles out from his corner.
 * A target on his middle tile draws it north.
 */
export function shadowSlashBand(anchor: Tile, target: Tile, width: number): readonly Tile[] {
  const mid = middle(anchor);
  const body = footprint(anchor);
  const half = (width - 1) / 2;
  const reachOut = Math.floor(BOSS_SIZE / 2) + 1;
  const [tx, ty] = [target.x - mid.x, target.y - mid.y];
  const octant = tx === 0 && ty === 0 ? -2 : Math.round(Math.atan2(ty, tx) / (Math.PI / 4));
  const ux = Math.round(Math.cos((octant * Math.PI) / 4));
  const uy = Math.round(Math.sin((octant * Math.PI) / 4));
  const inBand = (at: Tile): boolean => {
    const [dx, dy] = [at.x - mid.x, at.y - mid.y];
    if (ux === 0) return Math.abs(dx) <= half && dy * uy >= reachOut;
    if (uy === 0) return Math.abs(dy) <= half && dx * ux >= reachOut;
    return dx * ux >= 1 && dy * uy >= 1 && Math.abs(dx * ux - dy * uy) <= half && !body.contains(at);
  };
  return QUADRANT_1_FLOOR.tiles().filter(inBand).sort(byDistanceFrom(mid));
}

/** A superior slash: `width` wide toward `target` at any angle, from just outside his body to the wedge's edge. */
export function superiorSlashBand(anchor: Tile, target: Tile, width: number): readonly Tile[] {
  const mid = middle(anchor);
  const [dx, dy] = [target.x - mid.x, target.y - mid.y];
  const length = Math.hypot(dx, dy);
  const [ux, uy] = length === 0 ? [0, -1] : [dx / length, dy / length];
  const clear = BOSS_SIZE / 2;
  const inBand = ({ x, y }: Tile): boolean => {
    const [rx, ry] = [x - mid.x, y - mid.y];
    return rx * ux + ry * uy >= clear && Math.abs(ry * ux - rx * uy) <= width / 2;
  };
  return QUADRANT_1_FLOOR.tiles().filter(inBand).sort(byDistanceFrom(mid));
}
