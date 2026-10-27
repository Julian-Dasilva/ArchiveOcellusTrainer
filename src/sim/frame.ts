import type { Tile } from "./brands";
import { tile } from "./brands";

declare const room: unique symbol;
/** A tile in the region's grid. A phase reasons in its own tiles; the SDK adapter is what turns them into these. */
export type RoomTile = Tile & { readonly [room]: true };

export type QuarterTurns = 0 | 1 | 2 | 3;
/** Clockwise about local (0, 0), then moved to `origin`. y grows south, so one turn takes (x, y) to (-y, x). */
export type Frame = Readonly<{ turns: QuarterTurns; origin: Readonly<{ x: number; y: number }>; size: Readonly<{ width: number; height: number }> }>;

export const identity = (size: Frame["size"]): Frame => ({ turns: 0, origin: { x: 0, y: 0 }, size });

const isRoomTile = (at: Tile): at is RoomTile => Number.isInteger(at.x) && Number.isInteger(at.y);

function turned({ turns }: Frame, x: number, y: number): Readonly<{ x: number; y: number }> {
  switch (turns) {
    case 0:
      return { x, y };
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
    default: {
      const unhandled: never = turns;
      return unhandled;
    }
  }
}

function unturnd(turns: QuarterTurns): QuarterTurns {
  switch (turns) {
    case 0:
      return 0;
    case 1:
      return 3;
    case 2:
      return 2;
    case 3:
      return 1;
    default: {
      const unhandled: never = turns;
      return unhandled;
    }
  }
}

function roomTile(x: number, y: number): RoomTile {
  const placed = tile(x, y);
  if (!isRoomTile(placed)) throw new RangeError(`${x}, ${y} is not a room tile`);
  return placed;
}

export function toRoom(frame: Frame, at: Tile): RoomTile {
  const turnedTile = turned(frame, at.x, at.y);
  return roomTile(turnedTile.x + frame.origin.x, turnedTile.y + frame.origin.y);
}

export function toLocal(frame: Frame, at: Readonly<{ x: number; y: number }>): Tile {
  const back = turned({ ...frame, turns: unturnd(frame.turns) }, at.x - frame.origin.x, at.y - frame.origin.y);
  return tile(back.x, back.y);
}

/** A point where local tile (x, y) spans x to x + 1 and y to y + 1. It turns about the centre of tile (0, 0), so a tile's centre lands on its room tile's centre. */
export function toRoomPoint(frame: Frame, at: Readonly<{ x: number; y: number }>): Readonly<{ x: number; y: number }> {
  const turnedPoint = turned(frame, at.x - 0.5, at.y - 0.5);
  return { x: turnedPoint.x + 0.5 + frame.origin.x, y: turnedPoint.y + 0.5 + frame.origin.y };
}

/** The SDK anchors a unit on its south-west tile and extends it east and north, so a turned body has a new south-west tile. */
export function toRoomFootprint(frame: Frame, southWest: Tile, size: number): RoomTile {
  const corner = toRoom(frame, southWest);
  const opposite = toRoom(frame, tile(southWest.x + size - 1, southWest.y - size + 1));
  return roomTile(Math.min(corner.x, opposite.x), Math.max(corner.y, opposite.y));
}
