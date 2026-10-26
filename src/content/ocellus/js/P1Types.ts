import type { Seed, Tick, TickSpan, Tile, WorldTick } from "../../../sim/brands";
import type { HitReceipt, IncomingStyle } from "../../../sim/combat";
import type { Side } from "../../../sim/tiles";
import type { P1Choices } from "./OcellusTimings";
import type { HealReceipt, InputObservation, LoadoutSnapshot, PlayerObservation } from "./P4Types";

export type Corner = "north-east" | "south-east" | "south-west" | "north-west";
export type CornerTurn = "anticlockwise" | "clockwise" | "across";
export type Element = "fire" | "water";
/** A corner crack comes from the boss's face toward the middle along x, along y, or from his inner corner. */
export type Tendril = "x" | "y" | "corner";
export type Step = -1 | 0 | 1;
export type Direction = Readonly<{ dx: Step; dy: Step }>;

export type P1BossState = "present-invulnerable" | "hidden" | "present-damageable";
export type P1Overhead = "protect-melee";

export type P1WalkStage = "walk-from-start" | "walk-from-corner" | "walk-from-middle";
export type P1Stage = "arrive" | P1WalkStage | "corner" | "middle";
export type P1Phase =
  | Readonly<{ stage: "arrive"; boss: Exclude<P1BossState, "hidden">; overhead: null }>
  | Readonly<{ stage: P1WalkStage; boss: "present-damageable"; overhead: P1Overhead | null }>
  | Readonly<{ stage: "corner"; boss: "present-damageable"; overhead: null }>
  | Readonly<{ stage: "middle"; boss: P1BossState; overhead: null }>
  | Readonly<{ stage: "transform"; boss: Exclude<P1BossState, "present-damageable">; overhead: null }>;

export type P1Beat =
  | Readonly<{ kind: "boss-shouts"; text: string; lasts: TickSpan }>
  | Readonly<{ kind: "volley"; last: boolean }>
  | Readonly<{ kind: "walk-ends" }>
  | Readonly<{ kind: "charge" }>
  | Readonly<{ kind: "corner-crack"; nth: number }>
  | Readonly<{ kind: "glow" }>
  | Readonly<{ kind: "explode" }>
  | Readonly<{ kind: "blast" }>
  | Readonly<{ kind: "teleport-out" }>
  | Readonly<{ kind: "teleport-in" }>
  | Readonly<{ kind: "beat"; side: Side }>
  | Readonly<{ kind: "strike-told" }>
  | Readonly<{ kind: "strike-cast" }>
  | Readonly<{ kind: "transform" }>
  | Readonly<{ kind: "phase-ends" }>;

export type CrackId = `crack-${number}-${number}`;
export function crackId(openedAt: Tick, nth: number): CrackId {
  return `crack-${openedAt}-${nth}`;
}

/** `tiles` run from the boss outward; the crack grows back along them toward him. */
export type Crack = Readonly<{ id: CrackId; tiles: readonly [Tile, ...Tile[]]; growth: Direction; openedAt: Tick; closesAt: Tick }>;

/** A crack closes blocked by the player on it, charges him when nobody is, or fades when he reaches 0 HP first. */
export type CrackOutcome = "blocked" | "charged" | "faded";

export type P1Hit =
  | Readonly<{ kind: "volley"; at: Tick; element: Element; launchedAt: Tick }>
  | Readonly<{ kind: "blast"; at: Tick }>
  | Readonly<{ kind: "crack-blocked"; at: Tick; crack: CrackId }>
  | Readonly<{ kind: "strike"; at: Tick; shot: number }>;
export type P1HitSource = P1Hit["kind"];

export type P1End = Readonly<{ kind: "phase-cleared" }> | Readonly<{ kind: "death" }>;
export type HitJudgement = "passed" | "invulnerable" | "blocked";

export type P1Event =
  | Readonly<{ kind: "stage-entered"; at: Tick; stage: P1Phase["stage"] }>
  | Readonly<{ kind: "overhead-switched"; at: Tick; overhead: P1Overhead | null }>
  | Readonly<{ kind: "boss-state-changed"; at: Tick; state: P1BossState }>
  | Readonly<{ kind: "boss-shouted"; at: Tick; text: string; lasts: TickSpan }>
  | Readonly<{ kind: "volley-cast"; at: Tick; element: Element; last: boolean; landsAt: Tick; toward: Tile }>
  | Readonly<{ kind: "walk-ended"; at: Tick }>
  | Readonly<{ kind: "boss-charged"; at: Tick; facing: Tile }>
  | Readonly<{ kind: "boss-glowed"; at: Tick }>
  | Readonly<{ kind: "crack-opened"; at: Tick; crack: Crack }>
  | Readonly<{ kind: "crack-closed"; at: Tick; crack: Crack; outcome: CrackOutcome }>
  | Readonly<{ kind: "meter-changed"; at: Tick; meter: number }>
  | Readonly<{ kind: "boss-healed"; at: Tick; receipt: HealReceipt }>
  | Readonly<{ kind: "boss-exploded"; at: Tick }>
  | Readonly<{ kind: "blast-landed"; at: Tick; tiles: readonly Tile[] }>
  | Readonly<{ kind: "teleported-out"; at: Tick; from: Tile }>
  | Readonly<{ kind: "teleported-in"; at: Tick; to: Tile }>
  | Readonly<{ kind: "strike-cast"; at: Tick; shots: number; landsAt: Tick }>
  | Readonly<{ kind: "transformed"; at: Tick }>
  | Readonly<{ kind: "player-hit-judged"; at: Tick; style: IncomingStyle; outcome: HitJudgement; requested: number }>
  | Readonly<{ kind: "player-hit"; at: Tick; hit: P1Hit; receipt: HitReceipt }>
  | Readonly<{ kind: "block-refunded"; at: Tick; receipt: HealReceipt }>
  | Readonly<{ kind: "death-prevented"; at: Tick; source: P1HitSource }>
  | Readonly<{ kind: "run-ended"; at: Tick; reason: P1End }>;

export type P1Row = Readonly<{
  tick: Tick;
  worldTick: WorldTick;
  phase: P1Phase;
  beats: readonly P1Beat[];
  bossAt: Tile;
  meter: number;
  playerAtBossStep: PlayerObservation;
  playerAtPostTick: PlayerObservation;
  bossHp: Readonly<{ atBossStep: number; atPostTick: number }>;
  combatDraws: number;
  inputs: readonly InputObservation[];
  events: readonly P1Event[];
}>;

export type P1RunState =
  | Readonly<{ kind: "waiting" }>
  | Readonly<{ kind: "running"; tick: Tick; phase: P1Phase }>
  | Readonly<{ kind: "ended"; at: Tick; reason: P1End }>;

export type P1Snapshot = Readonly<{
  run: P1RunState;
  boss: Readonly<{ npcId: number; hp: number; maxHp: number; visible: boolean; defence: number; meter: number }>;
  player: LoadoutSnapshot;
}>;

export type P1Log = Readonly<{ header: Readonly<{ phase: "p1"; seed: Seed; choices: P1Choices }>; rows: readonly P1Row[] }>;
