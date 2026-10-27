import type { TickSpan } from "../../../sim/brands";
import type { Ctx, Replays } from "../../../sim/script";
import type { Sourced } from "../../../sim/sourced";
import type { FightLog } from "../js/OcellusTimings";
import type { P2_REPLAYS } from "../full/p2/replays";
import type { P2Cause, P2Types } from "../full/p2/types";

type P2Only = Readonly<{ p2: Readonly<{ kind: "opening" }> }>;
type Wait = Parameters<Ctx<P2Only, P2Types>["after"]>[0];
type Damage = Parameters<Ctx<P2Only, P2Types>["hit"]>[1];
type HitCause = Parameters<Ctx<P2Only, P2Types>["hit"]>[0];

const aBareSpanIsNotAWait: [TickSpan] extends [Wait] ? false : true = true;
const aSourcedSpanIsAWait: [Sourced<TickSpan>] extends [Wait] ? true : false = true;
const bareDamageIsNotSourced: [Readonly<{ min: number; max: number }>] extends [Damage] ? false : true = true;
const anUnknownCauseIsRejected: [Readonly<{ kind: "slma" }>] extends [HitCause] ? false : true = true;
const everyCauseIsAHitCause: [P2Cause] extends [HitCause] ? true : false = true;
const aMissingReplayRowIsRejected: [Omit<typeof P2_REPLAYS, "line">] extends [Replays<P2Types, FightLog>] ? false : true = true;

void aBareSpanIsNotAWait;
void aSourcedSpanIsAWait;
void bareDamageIsNotSourced;
void anUnknownCauseIsRejected;
void everyCauseIsAHitCause;
void aMissingReplayRowIsRejected;
