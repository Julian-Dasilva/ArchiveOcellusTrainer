import type { Tile } from "./brands";
import type { Director } from "./director";
import type { Enter, EnterFrom, PhaseDef, Phases, Walk } from "./encounter";
import type { RoomTile } from "./frame";
import type { Scope } from "./timers";

type Sparring = Readonly<{
  waiting: Readonly<{ kind: "practice" }>;
  duel: Readonly<{ kind: "after-wait"; stamina: number }>;
}>;

declare const waiting: PhaseDef<Sparring, "waiting", Readonly<{ ready: boolean }>>;
declare const duel: PhaseDef<Sparring, "duel", Readonly<{ hp: number }>>;
const phases = { waiting, duel } satisfies Phases<Sparring>;

declare const director: Director<Sparring, typeof phases>;
const waitingRows: readonly Readonly<{ ready: boolean }>[] = director.rows("waiting");
const duelRows: readonly Readonly<{ hp: number }>[] = director.rows("duel");

type DuelEntryOnWaiting = Readonly<{ phase: "waiting"; entry: Sparring["duel"] }>;
const waitingRejectsADuelEntry: [DuelEntryOnWaiting] extends [Enter<Sparring>] ? false : true = true;

type MissingPhase = Readonly<{ phase: "missing"; entry: Sparring["waiting"] }>;
type DuelEntryOnTheWrongPhase = Readonly<{ phase: "duel"; entry: Sparring["waiting"] }>;
const mapRejectsAMissingPhase: [MissingPhase] extends [EnterFrom<typeof phases>] ? false : true = true;
const mapRejectsTheWrongEntry: [DuelEntryOnTheWrongPhase] extends [EnterFrom<typeof phases>] ? false : true = true;

const segmentScope: Scope = "segment";
const handledWalk: Walk = { kind: "handled" };

type PhaseTileIsRoom = [Tile] extends [RoomTile] ? true : false;
const aPhaseTileIsNotARoomTile: PhaseTileIsRoom extends false ? true : false = true;

void waitingRows;
void duelRows;
void waitingRejectsADuelEntry;
void mapRejectsAMissingPhase;
void mapRejectsTheWrongEntry;
void segmentScope;
void handledWalk;
void aPhaseTileIsNotARoomTile;
