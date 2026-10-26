import { OCELLUS_P2 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import { tile } from "../../../../sim/brands";
import { TileSet } from "../../../../sim/tiles";
import type { Arm, PortalIndex, Wedge } from "../P2Types";
import { FLOOR } from "../p3/arena";

const { middle } = OCELLUS_P2.arena;
const PORTALS_PER_ARM = OCELLUS_P2.portals.perArm.value;
/** The portals fill each arm from the middle out to this many tiles, and the room's floor ends there too. */
const ARM_LENGTH = 2 * PORTALS_PER_ARM;
const CYCLES_PER_TICK = 30;

export const PORTAL_INDICES: readonly PortalIndex[] = [0, 1, 2, 3, 4, 5];
if (PORTAL_INDICES.length !== PORTALS_PER_ARM) throw new RangeError(`the portal index type covers ${PORTAL_INDICES.length} portals an arm, not ${PORTALS_PER_ARM}`);

export const ARMS: readonly Arm[] = ["north", "east", "south", "west"];
/** Clockwise from the north-east, the order the rounds move in. */
export const WEDGES: readonly Wedge[] = ["north-east", "south-east", "south-west", "north-west"];

type Offset = Readonly<{ east: number; north: number }>;
const STEP: Readonly<Record<Arm, Offset>> = { north: { east: 0, north: 1 }, east: { east: 1, north: 0 }, south: { east: 0, north: -1 }, west: { east: -1, north: 0 } };
const SIGN: Readonly<Record<Wedge, Offset>> = {
  "north-east": { east: 1, north: 1 },
  "south-east": { east: 1, north: -1 },
  "south-west": { east: -1, north: -1 },
  "north-west": { east: -1, north: 1 },
};
/** The two arms bordering each wedge, the first anticlockwise of it. */
const ARMS_OF: Readonly<Record<Wedge, readonly [Arm, Arm]>> = {
  "north-east": ["north", "east"],
  "south-east": ["east", "south"],
  "south-west": ["south", "west"],
  "north-west": ["west", "north"],
};

const offsetOf = (at: Tile): Offset => ({ east: at.x - middle.value.x, north: middle.value.y - at.y });
const fromMiddle = ({ east, north }: Offset): Tile => tile(middle.value.x + east, middle.value.y - north);

/** The phase 3 grid's floor less the strip south of the cross that runs past the last portal. */
export const ROOM = TileSet.at(FLOOR.tiles().filter((at) => Math.abs(offsetOf(at).north) <= ARM_LENGTH && Math.abs(offsetOf(at).east) <= ARM_LENGTH));
const BLADE_SPAN = 1;
const underBlade = (at: Tile) => Math.abs(offsetOf(at).east) <= BLADE_SPAN && Math.abs(offsetOf(at).north) <= BLADE_SPAN;

export function portalTiles(arm: Arm, index: PortalIndex): readonly [Tile, Tile] {
  const { east, north } = STEP[arm];
  const near = 2 * index + 1;
  return [fromMiddle({ east: east * near, north: north * near }), fromMiddle({ east: east * (near + 1), north: north * (near + 1) })];
}

export const WALLS = TileSet.at(ARMS.flatMap((arm) => PORTAL_INDICES.flatMap((index) => portalTiles(arm, index))));

export function armsOf(wedge: Wedge): readonly [Arm, Arm] {
  return ARMS_OF[wedge];
}

export function clockwise(wedge: Wedge, steps = 1): Wedge {
  return WEDGES[(WEDGES.indexOf(wedge) + steps) % WEDGES.length];
}

/** The wedge a tile leans to, the arms' tiles included: east and north of the middle count as east and north. */
export function wedgeAt(at: Tile): Wedge {
  const { east, north } = offsetOf(at);
  if (east >= 0) return north >= 0 ? "north-east" : "south-east";
  return north >= 0 ? "north-west" : "south-west";
}

/** The same spot a quarter turn clockwise about the middle, in the next wedge. */
export function turnedClockwise(at: Tile): Tile {
  const { east, north } = offsetOf(at);
  return fromMiddle({ east: north, north: -east });
}

/** A wedge's floor and the two arm strips beside it, off the walls and The Blade's 3x3: where its pools and floor portal can form. */
export function wedgeTiles(wedge: Wedge): readonly Tile[] {
  const sign = SIGN[wedge];
  return ROOM.tiles().filter((at) => {
    const { east, north } = offsetOf(at);
    return east * sign.east >= 1 && north * sign.north >= 1 && !underBlade(at);
  });
}

/** The tiles one portal tile fires across into the wedge, nearest first: the tile d out is `line[d - 1]`. */
export function waveLine(arm: Arm, origin: Tile, wedge: Wedge): readonly Tile[] {
  const sign = SIGN[wedge];
  const across: Offset = arm === "north" || arm === "south" ? { east: sign.east, north: 0 } : { east: 0, north: sign.north };
  const start = offsetOf(origin);
  const line: Tile[] = [];
  for (let d = 1; ; d++) {
    const at = fromMiddle({ east: start.east + across.east * d, north: start.north + across.north * d });
    if (!ROOM.contains(at)) return line;
    line.push(at);
  }
}

/** The tick, counted from the volley, on which a bolt at `cyclesPerTile` is over the tile d out: it hits a player who starts that tick there. */
export function reachTick(d: number, cyclesPerTile: number): number {
  return Math.floor((cyclesPerTile * (d - 1)) / CYCLES_PER_TICK);
}

/** The portal skip's tiles in a wedge, out along its diagonal. */
export function diagonal(wedge: Wedge, out: number): Tile {
  const sign = SIGN[wedge];
  return fromMiddle({ east: sign.east * out, north: sign.north * out });
}

