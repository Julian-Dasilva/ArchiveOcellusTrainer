import type { BossStance, P3Phase, P3Stage } from "../js/P3Types";

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type PhasePairs = { [S in P3Stage]: { [B in BossStance]: Readonly<{ stage: S; boss: B }> extends P3Phase ? `${S} ${B}` : never }[BossStance] }[P3Stage];
type RecordedPairs =
  | "arrive chasing"
  | "swing chasing"
  | "panic chasing"
  | "shadow-slash chasing"
  | "spin standing"
  | "spin chasing"
  | "untether levitating"
  | "untether-ends chasing"
  | "insolence chasing"
  | "destroy standing";
const eachStagePairsOnlyWithItsStances: Same<PhasePairs, RecordedPairs> extends true ? true : PhasePairs = true;
