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

export function toRoom(frame: Frame, at: Tile): RoomTile {
  const turnedTile = turned(frame, at.x, at.y);
  const placed = tile(turnedTile.x + frame.origin.x, turnedTile.y + frame.origin.y);
  if (!isRoomTile(placed)) throw new RangeError(`local ${at.x}, ${at.y} has no room tile`);
  return placed;
}

export function toLocal(frame: Frame, at: Readonly<{ x: number; y: number }>): Tile {
  const back = turned({ ...frame, turns: unturnd(frame.turns) }, at.x - frame.origin.x, at.y - frame.origin.y);
  return tile(back.x, back.y);
}
