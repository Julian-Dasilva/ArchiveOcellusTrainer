import type { ATile, Arm } from "../../fight/geometry";

/** One portal on the cross: its arm, its index out from the middle, and the two tiles it stands on. */
export type Portal = Readonly<{ arm: Arm; index: number; tiles: readonly [ATile, ATile] }>;

/** The player as phase 2 moves them. A hop glides; it does not cut. */
export interface Fighter {
  hop(to: ATile): void;
}

/** The arena as phase 2's closures act on it. The SDK side implements it. */
export interface P2World {
  readonly fighter: Fighter;
  isWalkable(at: ATile): boolean;
  hasFloor(at: ATile): boolean;
  /** Raises one emitter per portal and blocks the cross. */
  raise(portals: readonly Portal[]): void;
  /** A portal shot from the portal's first tile to the far end of one of its lines. */
  shoot(from: ATile, to: ATile, delayTicks: number, endCycleOffset: number): void;
  /** Drops the player off the blade, as enough does. */
  release(): void;
}
