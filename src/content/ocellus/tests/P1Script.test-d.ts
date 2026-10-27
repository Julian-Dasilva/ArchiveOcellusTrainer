import type { TickSpan } from "../../../sim/brands";
import type { Ctx, Replays } from "../../../sim/script";
import type { Sourced } from "../../../sim/sourced";
import type { FightLog } from "../js/OcellusTimings";
import type { P1_REPLAYS } from "../full/p1/replays";
import type { P1Cause, P1Types } from "../full/p1/types";

type P1Only = Readonly<{ p1: Readonly<{ kind: "fresh" }> }>;
type Wait = Parameters<Ctx<P1Only, P1Types>["after"]>[0];
type Damage = Parameters<Ctx<P1Only, P1Types>["hit"]>[1];
type HitCause = Parameters<Ctx<P1Only, P1Types>["hit"]>[0];

const aBareSpanIsNotAWait: [TickSpan] extends [Wait] ? false : true = true;
const aSourcedSpanIsAWait: [Sourced<TickSpan>] extends [Wait] ? true : false = true;
const bareDamageIsNotSourced: [Readonly<{ min: number; max: number }>] extends [Damage] ? false : true = true;
const anUnknownCauseIsRejected: [Readonly<{ kind: "slma" }>] extends [HitCause] ? false : true = true;
const everyCauseIsAHitCause: [P1Cause] extends [HitCause] ? true : false = true;
const aMissingReplayRowIsRejected: [Omit<typeof P1_REPLAYS, "volley">] extends [Replays<P1Types, FightLog>] ? false : true = true;

void aBareSpanIsNotAWait;
void aSourcedSpanIsAWait;
void bareDamageIsNotSourced;
void anUnknownCauseIsRejected;
void everyCauseIsAHitCause;
void aMissingReplayRowIsRejected;
