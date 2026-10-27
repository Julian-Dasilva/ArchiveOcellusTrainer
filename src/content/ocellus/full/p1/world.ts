import type { ATile } from "../../fight/geometry";

/** A forced move. The arena glides it; the script only names the tile. */
export interface Fighter {
  hop(to: ATile): void;
}

/** What phase 1 needs of the room. The SDK stays on the other side of this. */
export interface P1World {
  readonly fighter: Fighter;
  isFloor(at: ATile): boolean;
  /** The hooded figure becomes the boss the bar names, on the tick the fight starts. */
  claim(): void;
  /** The hood comes off. Same body, phase 1's defence. */
  reveal(): void;
  revealed(): boolean;
  /** Walking chooses its own facing. A tile he was told to face would hold him. */
  releaseFace(): void;
}
