import type { Seed, Tick, Tile, WorldTick } from "./brands";
import type { IncomingStyle, Style } from "./combat";
import type { Frame, RoomTile } from "./frame";

/** What each phase of one boss is entered with. The only list of a boss's phases; everything else derives from it. */
export type Entries = Readonly<Record<string, unknown>>;
export type PhaseOf<E extends Entries> = keyof E & string;
/** A phase to enter and the only value it can be entered with. */
export type Enter<E extends Entries> = { [P in PhaseOf<E>]: Readonly<{ phase: P; entry: E[P] }> }[PhaseOf<E>];

type EntryOf<D> = D extends { enter(host: unknown, entry: infer Entry): unknown } ? Entry : never;

/** Entries taken from the phase map itself. Inferring them from `Enter` widens a concrete map to every string phase. */
export type EnterFrom<Ph> = { [P in keyof Ph & string]: Readonly<{ phase: P; entry: EntryOf<Ph[P]> }> }[keyof Ph & string];

/** The boss side of a player's hit, judged as it lands. */
export type Verdict =
  | Readonly<{ outcome: "passed" }>
  | Readonly<{ outcome: "invulnerable" }>
  | Readonly<{ outcome: "blocked"; style: Style; reflectPercent: number }>
  | Readonly<{ outcome: "reduced"; percentLess: number }>;

/** A walk the SDK paths, one the phase replaces with a hop, or one the phase has already moved the player for. */
export type Walk = Readonly<{ kind: "sdk" }> | Readonly<{ kind: "hop"; tiles: readonly [Tile, ...Tile[]] }> | Readonly<{ kind: "handled" }>;

/** What a phase can see of an attack's target without the SDK. A unit satisfies it. */
export type AttackTarget = Readonly<{ location: Readonly<{ x: number; y: number }> }>;

export type Rules<Target extends AttackTarget = AttackTarget> = Readonly<{
  judge(style: IncomingStyle, launchedAt: Tick, landsAt: Tick): Verdict;
  /** Boss HP cannot fall below this on the tick. */
  hpFloor(at: Tick): number;
  walk(to: Tile): Walk;
  canAttack(target: Target, style: Style): boolean;
  /** `granted` lets the player hit a target the SDK sees no line to. */
  lineOfSight(target: Target): "sdk" | "granted";
}>;

export interface RoomControl {
  readonly size: Readonly<{ width: number; height: number }>;
  walkable(tiles: readonly RoomTile[]): void;
}

export interface Host<E extends Entries> {
  readonly seed: Seed;
  readonly room: RoomControl;
  /** Leaves this phase and enters `to` after the current tick's row closes. A second request in one tick throws. */
  next(to: Enter<E>): void;
}

/** A running phase as the director sees it. Its events and hit causes stay inside the phase. */
export type Mounted<Row> = Readonly<{
  frame: Frame;
  rules: Rules;
  /** Once the SDK has built every unit: a reset writes default stats after construction, so entry stats go here. */
  ready(): void;
  /** The region's `beforeNpcTurns`: open the row and run due timers. */
  openTick(): void;
  /** The region's `postTick`: close the row and present it. */
  finishTick(): void;
  rows(): readonly Row[];
  /** Remove this phase's mobs, entities and timers. The player stays. */
  leave(): void;
}>;

export type PhaseDef<E extends Entries, P extends PhaseOf<E>, Row, H extends Host<E> = Host<E>> = Readonly<{
  name: P;
  enter(host: H, entry: E[P]): Mounted<Row>;
}>;

/** Every phase the entries name. A missing phase, or one entered with another phase's entry, does not compile. */
export type Phases<E extends Entries, H extends Host<E> = Host<E>> = { readonly [P in PhaseOf<E>]: PhaseDef<E, P, unknown, H> };
export type RowOf<D> = D extends Readonly<{ enter(...args: never[]): Mounted<infer Row> }> ? Row : never;
export type Section<E extends Entries, Ph extends Phases<E>> = {
  [P in PhaseOf<E>]: Readonly<{ phase: P; enteredAt: Tick; enteredAtWorld: WorldTick; rows: readonly RowOf<Ph[P]>[] }>;
}[PhaseOf<E>];

/** A room is the region's floor plane and scenery. */
export type Room<Target = RoomMount> = Readonly<{
  size: Readonly<{ width: number; height: number }>;
  drawFloor(context: OffscreenCanvasRenderingContext2D, scale: number): void;
  mount(region: Target): MountedRoom;
  spawn: RoomTile;
}>;

/** A room in the region. It fences the floor a phase declares walkable, and takes the fence down with its scenery. */
export type MountedRoom = Readonly<{ dispose(): void; walkable(tiles: readonly RoomTile[]): void }>;

/** The SDK region a room mounts into. Core code names no SDK type. */
export type RoomMount = Readonly<{ addEntity(entity: unknown): void }>;

export type Setup<E extends Entries, Ph extends Phases<E>, Target = RoomMount> = Readonly<{
  room: Room<Target>;
  phases: Ph;
  start: Enter<E>;
  seed: Seed;
}>;

/** One run of one boss in one region. The page builds it; the region's turn hooks drive it. */
export interface Run<E extends Entries, Ph extends Phases<E>> {
  readonly current: PhaseOf<E>;
  sections(): readonly Section<E, Ph>[];
  rows<P extends PhaseOf<E>>(phase: P): readonly RowOf<Ph[P]>[];
}
