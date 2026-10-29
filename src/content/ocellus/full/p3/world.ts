import type { ClientCycles } from "../../../../sim/brands";
import type { Style } from "../../../../sim/combat";
import type { ATile, Quadrant } from "../../fight/geometry";
import type { AddKind, God } from "./types";

export type Censer = Readonly<{ tile: ATile; god: God; lit: boolean }>;

/** A vine or rift the arena spawned. `alive` turns false once it dies or is removed. */
export interface Add {
  readonly kind: AddKind;
  readonly tile: ATile;
  readonly alive: boolean;
  remove(): void;
  /** Left alive: it plays its detonate animation and goes. */
  detonate(): void;
}

export interface Fighter {
  readonly walking: boolean;
  readonly frozen: number;
  readonly protection: Style | null;
  readonly stats: Readonly<{ hp: number; maxHp: number; prayer: number; maxPrayer: number; special: number }>;
  hop(to: ATile): void;
  walkTo(to: ATile): void;
  /** A stepping-stone jump: on `to` this tick, drawn moving there over `over` in the short-jump animation. */
  jump(to: ATile, over: ClientCycles): void;
  freeze(ticks: number): void;
  unfreeze(): void;
  sever(ticks: number): void;
  target(add: Add | null): void;
  /** Raises current levels to at least base plus these, as the Void Augmenter does. */
  boost(melee: number, rangedMagic: number): void;
  resetAttackDelay(): void;
  setHp(hp: number): void;
  setPrayer(prayer: number): void;
  setSpecial(special: number): void;
}

/** The arena and the player as phase 3's closures act on them. The SDK side implements it. */
export interface P3World {
  readonly fighter: Fighter;
  readonly destroyed: ReadonlySet<Quadrant>;
  readonly censers: ReadonlyMap<Quadrant, Censer>;
  /** The sidebar's practice toggle and "attack your own vine", read live. */
  readonly practice: boolean;
  readonly soloVine: boolean;
  isFloor(at: ATile): boolean;
  isWalkable(at: ATile): boolean;
  removeFloor(tiles: readonly ATile[]): void;
  setStones(tiles: readonly ATile[]): void;
  setCrumbling(quadrants: readonly Quadrant[]): void;
  destroy(quadrant: Quadrant): void;
  lightCenser(quadrant: Quadrant): void;
  spawn(kind: AddKind, at: ATile, killed: (add: Add) => void): Add;
  /** The Bandosian and Armadylean censers: the player's next hit on him is a max hit. */
  maxNextHit(): void;
}
