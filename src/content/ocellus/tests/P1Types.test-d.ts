import type { P1Overhead, P1Phase, P1WalkStage } from "../js/P1Types";

type StagesWithOverhead<Phase> = Phase extends Readonly<{ stage: infer Stage; overhead: infer Overhead }> ? (P1Overhead extends Overhead ? Stage : never) : never;
type OverheadOffAWalk = Exclude<StagesWithOverhead<P1Phase>, P1WalkStage>;
const onlyAWalkRaisesProtectFromMelee: [OverheadOffAWalk] extends [never] ? true : OverheadOffAWalk = true;

type BossIn<Phase, Stage> = Phase extends Readonly<{ stage: infer In; boss: infer Boss }> ? (Stage extends In ? Boss : never) : never;
type UndamageableCorner = Exclude<BossIn<P1Phase, "corner">, "present-damageable">;
const aCornerBossIsAlwaysDamageable: [UndamageableCorner] extends [never] ? true : UndamageableCorner = true;
