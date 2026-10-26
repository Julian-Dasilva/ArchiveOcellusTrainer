import { OCELLUS_P1 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import { tile } from "../../../../sim/brands";
import type { Side } from "../../../../sim/tiles";
import { TileSet } from "../../../../sim/tiles";
import type { Corner, CornerTurn, Direction, Step, Tendril } from "../P1Types";
import { ARENA_SIZE, FLOOR, RIM } from "../p3/arena";

/** Phase 1 is fought on the whole of the room phase 3 later breaks into wedges. */
export const ROOM = FLOOR;
export { ARENA_SIZE, RIM };

const { room, corner, middle, blast } = OCELLUS_P1;
const SIZE = OCELLUS_P1.boss.size.value;

export const CORNERS: readonly Corner[] = ["north-east", "south-east", "south-west", "north-west"];
export const CLOCKWISE: readonly Side[] = ["east", "south", "west", "north"];
const TURNS: Readonly<Record<CornerTurn, number>> = { clockwise: 1, across: 2, anticlockwise: 3 };

export const sign = (n: number): Step => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function cornerAfter(from: Corner, turn: CornerTurn): Corner {
  return CORNERS[(CORNERS.indexOf(from) + TURNS[turn]) % CORNERS.length];
}

export const offset = (at: Tile, dx: number, dy: number): Tile => tile(at.x + dx, at.y + dy);

export function sameTile(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y;
}

/** His 3x3, anchored on its south-west tile as the SDK anchors a unit. */
export function body(anchor: Tile): TileSet {
  return TileSet.area(offset(anchor, 0, 1 - SIZE), offset(anchor, SIZE - 1, 0));
}

export function centreOf(anchor: Tile): Readonly<{ x: number; y: number }> {
  return { x: anchor.x + (SIZE - 1) / 2, y: anchor.y - (SIZE - 1) / 2 };
}

/** Tiles between a tile and the nearest tile of his 3x3: 0 under him. */
export function distanceToBody(anchor: Tile, at: Tile): number {
  const across = Math.max(anchor.x - at.x, 0, at.x - (anchor.x + SIZE - 1));
  const along = Math.max(anchor.y - SIZE + 1 - at.y, 0, at.y - anchor.y);
  return Math.max(across, along);
}

/** One step of his walk: straight along the longer axis until both offsets are equal, then diagonally. */
export function stepToward(from: Tile, to: Tile): Tile {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return offset(from, sign(dx), 0);
  if (Math.abs(dy) > Math.abs(dx)) return offset(from, 0, sign(dy));
  return offset(from, sign(dx), sign(dy));
}

export function stepsBetween(from: Tile, to: Tile): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

export type Line = Readonly<{ from: Tile; run: Direction }>;

/** A corner crack's first tile and the way it runs, toward the middle from his face or inner corner. */
export function cornerLine(anchor: Tile, tendril: Tendril, shape: number): Line {
  const centre = centreOf(anchor);
  const middleCentre = centreOf(room.middle.value);
  const ix = sign(middleCentre.x - centre.x) || 1;
  const iy = sign(middleCentre.y - centre.y) || 1;
  const innerX = ix < 0 ? anchor.x : anchor.x + SIZE - 1;
  const innerY = iy < 0 ? anchor.y - SIZE + 1 : anchor.y;
  const { straightChance, cornerShapes } = corner.tendrils.value;
  switch (tendril) {
    case "corner":
      if (shape < cornerShapes.diagonal) return { from: tile(innerX + ix, innerY + iy), run: { dx: ix, dy: iy } };
      if (shape < cornerShapes.diagonal + cornerShapes.x) return { from: tile(innerX + ix, innerY), run: { dx: ix, dy: 0 } };
      return { from: tile(innerX, innerY + iy), run: { dx: 0, dy: iy } };
    case "x":
      return shape < straightChance ? { from: tile(innerX + ix, centre.y), run: { dx: ix, dy: 0 } } : { from: tile(innerX + ix, innerY), run: { dx: ix, dy: iy } };
    case "y":
      return shape < straightChance ? { from: tile(centre.x, innerY + iy), run: { dx: 0, dy: iy } } : { from: tile(innerX, innerY + iy), run: { dx: ix, dy: iy } };
    default: {
      const unhandled: never = tendril;
      return unhandled;
    }
  }
}

/** A middle beat's crack from the face he looks at. */
export function beatLine(anchor: Tile, side: Side, nth: 0 | 1): Line {
  const { dx, dy, run } = middle.beats.value.cracks[side][nth];
  return { from: offset(anchor, dx, dy), run };
}

/** The line's tiles out from him, up to `length`, stopping where the room ends. */
export function lineTiles({ from, run }: Line, length: number): readonly Tile[] {
  const tiles: Tile[] = [];
  for (let k = 0; k < length; k++) {
    const at = offset(from, run.dx * k, run.dy * k);
    if (!ROOM.contains(at)) break;
    tiles.push(at);
  }
  return tiles;
}

/** Every floor tile within the blast's reach of his 3x3. */
export function blastTiles(anchor: Tile): TileSet {
  const reach = blast.radius.value;
  const around = TileSet.area(offset(anchor, -reach, 1 - SIZE - reach), offset(anchor, SIZE - 1 + reach, reach));
  return TileSet.at(around.minus(body(anchor)).tiles().filter((at) => ROOM.contains(at)));
}

/** A tile 10 out from his middle toward a side, for him to face. */
export function facing(anchor: Tile, side: Side): Tile {
  const { x, y } = centreOf(anchor);
  const out: Readonly<Record<Side, Readonly<{ dx: number; dy: number }>>> = { east: { dx: 10, dy: 0 }, south: { dx: 0, dy: 10 }, west: { dx: -10, dy: 0 }, north: { dx: 0, dy: -10 } };
  return tile(x + out[side].dx, y + out[side].dy);
}

export function middleCentre(): Tile {
  const { x, y } = centreOf(room.middle.value);
  return tile(x, y);
}
