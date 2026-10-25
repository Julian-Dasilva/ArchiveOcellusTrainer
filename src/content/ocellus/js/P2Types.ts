import type { Seed, Tick, Tile, WorldTick } from "../../../sim/brands";
import type { HitReceipt } from "../../../sim/combat";
import type { P2Choices } from "./OcellusTimings";
import type { InputObservation, LoadoutSnapshot, PlayerObservation } from "./P4Types";

/** The four parts of the room the portal walls split it into, named clockwise from the north-east as the rounds advance. */
export type Wedge = "north-east" | "south-east" | "south-west" | "north-west";
export type Arm = "north" | "east" | "south" | "west";
/** Each arm carries six 2-tile portals, 0 nearest the middle. */
export type PortalIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type Round = 1 | 2 | 3;
/** The unlit portal on each of the round's two arms, in the order `armsOf` gives the arms. */
export type Gaps = readonly [PortalIndex, PortalIndex];
export type Volley = "lit" | "all";

export type P2Stage = "arrive" | "round" | "last-round" | "transition";
export type P2Phase =
  | Readonly<{ stage: "arrive" }>
  | Readonly<{ stage: "round"; round: 1 | 2 }>
  | Readonly<{ stage: "last-round"; round: 3 }>
  | Readonly<{ stage: "transition" }>;

export type P2Beat =
  | Readonly<{ kind: "portals-rise" }>
  | Readonly<{ kind: "blade-wakes" }>
  | Readonly<{ kind: "round-starts" }>
  | Readonly<{ kind: "portals-light" }>
  | Readonly<{ kind: "portals-fire"; volley: Volley }>
  | Readonly<{ kind: "pools-form" }>
  | Readonly<{ kind: "pools-burst" }>
  | Readonly<{ kind: "all-portals-light" }>
  | Readonly<{ kind: "safe-portal-opens" }>
  | Readonly<{ kind: "safe-portal-takes" }>
  | Readonly<{ kind: "blade-discharges" }>
  | Readonly<{ kind: "blade-releases" }>
  | Readonly<{ kind: "round-ends" }>
  | Readonly<{ kind: "sword-repairs" }>
  | Readonly<{ kind: "enough" }>
  | Readonly<{ kind: "sword-falls" }>
  | Readonly<{ kind: "phase-ends" }>;

export type P2Hit = Readonly<{ kind: "volley"; at: Tick; volley: Volley; tile: Tile }> | Readonly<{ kind: "pool-burst"; at: Tick; tile: Tile }>;
export type P2HitSource = P2Hit["kind"];

export type P2End = Readonly<{ kind: "phase-cleared"; bossHp: number }> | Readonly<{ kind: "death" }>;

export type P2Event =
  | Readonly<{ kind: "stage-entered"; at: Tick; stage: P2Stage }>
  | Readonly<{ kind: "portals-rose"; at: Tick }>
  | Readonly<{ kind: "blade-woke"; at: Tick }>
  | Readonly<{ kind: "round-started"; at: Tick; round: Round; wedge: Wedge }>
  | Readonly<{ kind: "portals-lit"; at: Tick; wedge: Wedge; gaps: Gaps | "none" }>
  | Readonly<{ kind: "portals-fired"; at: Tick; wedge: Wedge; volley: Volley; waves: number }>
  | Readonly<{ kind: "pools-formed"; at: Tick; tiles: readonly Tile[] }>
  | Readonly<{ kind: "safe-portal-opened"; at: Tick; tile: Tile }>
  | Readonly<{ kind: "escaped"; at: Tick; from: Tile; to: Tile; wedge: Wedge }>
  | Readonly<{ kind: "blade-discharged"; at: Tick }>
  | Readonly<{ kind: "blade-released"; at: Tick; stored: number; released: number; bossHp: number }>
  | Readonly<{ kind: "round-ended"; at: Tick; round: Round }>
  | Readonly<{ kind: "sword-repaired"; at: Tick }>
  | Readonly<{ kind: "enough"; at: Tick }>
  | Readonly<{ kind: "sword-fell"; at: Tick }>
  | Readonly<{ kind: "player-hit"; at: Tick; hit: P2Hit; receipt: HitReceipt }>
  | Readonly<{ kind: "death-prevented"; at: Tick; source: P2HitSource }>
  | Readonly<{ kind: "run-ended"; at: Tick; reason: P2End }>;

export type P2Row = Readonly<{
  tick: Tick;
  worldTick: WorldTick;
  phase: P2Phase;
  beats: readonly P2Beat[];
  playerAtBossStep: PlayerObservation;
  playerAtPostTick: PlayerObservation;
  bossHp: Readonly<{ atBossStep: number; atPostTick: number }>;
  /** Damage The Blade has stored and not yet released, after this tick. */
  stored: number;
  combatDraws: number;
  inputs: readonly InputObservation[];
  events: readonly P2Event[];
}>;

export type P2RunState =
  | Readonly<{ kind: "waiting" }>
  | Readonly<{ kind: "running"; tick: Tick; phase: P2Phase }>
  | Readonly<{ kind: "ended"; at: Tick; reason: P2End }>;

export type P2Snapshot = Readonly<{
  run: P2RunState;
  boss: Readonly<{ npcId: number; hp: number; maxHp: number; visible: boolean; defence: number; attackable: boolean; stored: number }>;
  player: LoadoutSnapshot;
}>;

export type P2Log = Readonly<{ header: Readonly<{ phase: "p2"; seed: Seed; choices: P2Choices }>; rows: readonly P2Row[] }>;
