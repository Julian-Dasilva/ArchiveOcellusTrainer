import type { TickSpan } from "../../../sim/brands";
import type { Ctx, Replays } from "../../../sim/script";
import type { Sourced } from "../../../sim/sourced";
import type { FightLog } from "../js/OcellusTimings";
import type { P3_REPLAYS } from "../full/p3/replays";
import type { P3Cause, P3Types } from "../full/p3/types";

type P3Only = Readonly<{ p3: Readonly<{ kind: "fresh" }> }>;
type Wait = Parameters<Ctx<P3Only, P3Types>["after"]>[0];
type Damage = Parameters<Ctx<P3Only, P3Types>["hit"]>[1];
type HitCause = Parameters<Ctx<P3Only, P3Types>["hit"]>[0];

const aBareSpanIsNotAWait: [TickSpan] extends [Wait] ? false : true = true;
const aSourcedSpanIsAWait: [Sourced<TickSpan>] extends [Wait] ? true : false = true;
const bareDamageIsNotSourced: [Readonly<{ min: number; max: number }>] extends [Damage] ? false : true = true;
const anUnknownCauseIsRejected: [Readonly<{ kind: "slma" }>] extends [HitCause] ? false : true = true;
const everyCauseIsAHitCause: [P3Cause] extends [HitCause] ? true : false = true;
const aMissingReplayRowIsRejected: [Omit<typeof P3_REPLAYS, "slam">] extends [Replays<P3Types, FightLog>] ? false : true = true;

void aBareSpanIsNotAWait;
void aSourcedSpanIsAWait;
void bareDamageIsNotSourced;
void anUnknownCauseIsRejected;
void everyCauseIsAHitCause;
void aMissingReplayRowIsRejected;
