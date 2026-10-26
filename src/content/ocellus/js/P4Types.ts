import type { MovePace } from "osrs-sdk";
import type { Brand, Cycle, Seed, Tick, TickSpan, Tile, Unbranded, WorldTick } from "../../../sim/brands";
import type { HitReceipt, IncomingStyle, Style } from "../../../sim/combat";
import type { GearSlot, ResolvedChoices, SpecialStyle, TransitionCue } from "./OcellusTimings";
import { isCount } from "../../../sim/brands";

export type Ordinal = Brand<"Ordinal">;

const isOrdinal = (n: Unbranded): n is Unbranded & Ordinal => isCount(n);

export function ordinal(n: Unbranded): Ordinal {
  if (!isOrdinal(n)) throw new RangeError(`not a transition attack ordinal: ${n}`);
  return n;
}

export type HoveringBoss = "present-out-of-melee-reach" | "present-damageable";

export type Phase =
  | Readonly<{ stage: "lead-in"; boss: "hidden" | "present-damageable"; overhead: null }>
  | Readonly<{ stage: "inner-void"; cycle: Cycle; boss: HoveringBoss; overhead: "deflect-melee" }>
  | Readonly<{ stage: "after-inner"; cycle: Cycle; boss: "present-damageable"; overhead: "deflect-melee" | "soul-split" | null }>
  | Readonly<{ stage: "outer-void"; cycle: Cycle; boss: "present-damageable"; overhead: "deflect-range" }>
  | Readonly<{ stage: "after-outer"; cycle: Cycle; boss: "present-damageable"; overhead: "deflect-range" | "soul-split" | null }>;
export type Stage = Phase["stage"];
export type VoidKind = "inner-void" | "outer-void";
export type TransitionKind = "after-inner" | "after-outer";
export type BossState = Phase["boss"];
export type BossOverhead = NonNullable<Phase["overhead"]>;

export type Special = "vortex" | "spike-disk" | "black-disk";
export type Mechanic = "void-floor" | "floor-holes" | "lifeforce-orb" | "explosions" | "transition-attacks" | "rifts";

export type Beat =
  | Readonly<{ kind: "boss-shouts"; text: string; lasts: TickSpan }>
  | Readonly<{ kind: "boss-landing-starts" }>
  | Readonly<{ kind: "lifeforce-tell"; void: VoidKind }>
  | Readonly<{ kind: "lifeforce-hit"; void: VoidKind }>
  | Readonly<{ kind: "orb-matures"; void: VoidKind }>
  | Readonly<{ kind: "orb-expires"; void: VoidKind }>
  | Readonly<{ kind: "unclaimed-orb-heals" }>
  | Readonly<{ kind: "explosion-series-starts"; void: VoidKind }>
  | Readonly<{ kind: "explosion-mark"; void: VoidKind; pulse: number }>
  | Readonly<{ kind: "explosion-impact"; void: VoidKind; pulse: number }>
  | Readonly<{ kind: "explosions-occurring"; void: VoidKind }>
  | Readonly<{ kind: "floor-damage"; void: VoidKind }>
  | Readonly<{ kind: "special-tell"; ordinal: Ordinal; variant: Special }>
  | Readonly<{ kind: "special-hit"; ordinal: Ordinal; variant: Special }>
  | Readonly<{ kind: "special-sound"; ordinal: Ordinal; cue: TransitionCue }>
  | Readonly<{ kind: "soul-split-heal"; ordinal: Ordinal }>
  | Readonly<{ kind: "rifts-spawn"; forCycle: Cycle }>
  | Readonly<{ kind: "rift-charge-ends"; forCycle: Cycle }>;

export type RunEnd = "kill" | "death";

export type RiftId = `rift-${number}-${number}`;
export function riftId(spawnedAt: Tick, slot: number): RiftId {
  return `rift-${spawnedAt}-${slot}`;
}
/** The rifts that burst on one tick. Together they hit the player once. */
export type Burst = readonly [RiftId, ...RiftId[]];

export type HealReceipt = Readonly<{ requested: number; applied: number; beforeHp: number; afterHp: number }>;
export type HealCause = Readonly<{ kind: "unclaimed-orb" }> | Readonly<{ kind: "soul-split"; ordinal: Ordinal }>;
/** The player's SDK attack clock before and after a mechanic changes it. */
export type AttackDelayChange = Readonly<{ before: number; after: number }>;
/** `attackDelay` is the player's attack clock at the impact, before and after a dodge cuts it. */
export type ExplosionOutcome =
  | Readonly<{ kind: "hit"; receipt: HitReceipt }>
  | Readonly<{ kind: "dodged"; attackDelay: AttackDelayChange }>
  | Readonly<{ kind: "avoided" }>;
export type SpecialAttack<V extends Special = Special> = { [K in V]: Readonly<{ at: Tick; ordinal: Ordinal; variant: K; style: SpecialStyle<K> }> }[V];
export type HitJudgement = "passed" | "invulnerable" | "blocked" | "reduced";
export type PlayerHit =
  | Readonly<{ kind: "deflect-reflected"; at: Tick; style: Style }>
  | Readonly<{ kind: "floor-hit"; at: Tick; void: VoidKind; tile: Tile }>
  | Readonly<{ kind: "hole-hit"; at: Tick; tile: Tile }>
  | Readonly<{ kind: "lifeforce-drained"; at: Tick; void: VoidKind; orb: Tile }>
  | Readonly<{ kind: "explosion-resolved"; at: Tick; void: VoidKind; pulse: number; tile: Tile; underBoss: boolean }>
  | (Readonly<{ kind: "special-hit" }> & SpecialAttack)
  | Readonly<{ kind: "rift-burst"; at: Tick; rifts: Burst }>;
export type PlayerHitSource = PlayerHit["kind"];

export type FightEvent =
  | Readonly<{ kind: "stage-entered"; at: Tick; stage: Stage }>
  | Readonly<{ kind: "overhead-switched"; at: Tick; overhead: BossOverhead | null }>
  | Readonly<{ kind: "boss-state-changed"; at: Tick; state: BossState }>
  | Readonly<{ kind: "boss-shouted"; at: Tick; text: string }>
  | Readonly<{ kind: "boss-landing-started"; at: Tick }>
  | Readonly<{ kind: "player-hit-judged"; at: Tick; style: IncomingStyle; outcome: HitJudgement; requested: number }>
  | Readonly<{ kind: "deflect-reflected"; at: Tick; style: Style; receipt: HitReceipt }>
  | Readonly<{ kind: "floor-hit"; at: Tick; void: VoidKind; tile: Tile; receipt: HitReceipt }>
  | Readonly<{ kind: "hole-hit"; at: Tick; tile: Tile; receipt: HitReceipt }>
  | Readonly<{ kind: "lifeforce-told"; at: Tick; void: VoidKind }>
  | Readonly<{ kind: "lifeforce-drained"; at: Tick; void: VoidKind; receipt: HitReceipt }>
  | Readonly<{ kind: "orb-spawned"; at: Tick; void: VoidKind; tile: Tile; credit: number }>
  | Readonly<{ kind: "orb-matured"; at: Tick; void: VoidKind; tile: Tile }>
  | Readonly<{ kind: "orb-returned"; at: Tick; void: VoidKind; tile: Tile; receipt: HealReceipt }>
  | Readonly<{ kind: "orb-expired"; at: Tick; void: VoidKind; tile: Tile; credit: number }>
  | Readonly<{ kind: "boss-healed"; at: Tick; cause: HealCause; receipt: HealReceipt }>
  | Readonly<{ kind: "explosion-series-started"; at: Tick; void: VoidKind }>
  | Readonly<{ kind: "explosion-marked"; at: Tick; void: VoidKind; pulse: number; tile: Tile }>
  | Readonly<{ kind: "explosion-resolved"; at: Tick; void: VoidKind; pulse: number; tile: Tile; underBoss: boolean; outcome: ExplosionOutcome }>
  | (Readonly<{ kind: "special-told" }> & SpecialAttack)
  | (Readonly<{ kind: "special-hit"; receipt: HitReceipt }> & SpecialAttack)
  | Readonly<{ kind: "special-sounded"; at: Tick; ordinal: Ordinal; cue: TransitionCue }>
  | Readonly<{ kind: "rift-spawned"; at: Tick; rift: RiftId; tile: Tile }>
  | Readonly<{ kind: "rift-hit"; at: Tick; rift: RiftId; style: IncomingStyle; damage: number }>
  | Readonly<{ kind: "rift-destroyed"; at: Tick; rift: RiftId; tile: Tile; attackDelay: AttackDelayChange }>
  | Readonly<{ kind: "rift-burst"; at: Tick; rifts: Burst; receipt: HitReceipt }>
  | Readonly<{ kind: "death-prevented"; at: Tick; source: PlayerHitSource; clearedOrbCredit: number }>
  | Readonly<{ kind: "run-ended"; at: Tick; reason: RunEnd }>;

export type PlayerObservation = Readonly<{ tile: Tile; hp: number; prayer: Style | null }>;

export type InputObservation =
  | Readonly<{ kind: "walk-ordered"; destination: Tile; pace: MovePace }>
  | Readonly<{ kind: "prayer-published"; prayer: Style | null }>;

export type TickRow = Readonly<{
  tick: Tick;
  worldTick: WorldTick;
  phase: Phase;
  beats: readonly Beat[];
  playerAtBossStep: PlayerObservation;
  playerAtPostTick: PlayerObservation;
  bossHp: Readonly<{ atBossStep: number; atPostTick: number }>;
  combatDraws: number;
  inputs: readonly InputObservation[];
  events: readonly FightEvent[];
}>;

export type RunState =
  | Readonly<{ kind: "waiting" }>
  | Readonly<{ kind: "running"; tick: Tick; phase: Phase }>
  | Readonly<{ kind: "ended"; at: Tick; reason: RunEnd }>;

type EquipmentSlot = GearSlot | "offhand";
export type LoadoutSnapshot = Readonly<{
  equipped: Readonly<Record<EquipmentSlot, number | null>>;
  inventory: readonly (number | null)[];
  specialEnergy: number;
}>;

export type FightSnapshot = Readonly<{
  run: RunState;
  boss: Readonly<{ npcId: number; hp: number; maxHp: number; visible: boolean; defence: number }>;
  player: LoadoutSnapshot;
}>;

export type FightLog = Readonly<{ header: Readonly<{ seed: Seed; choices: ResolvedChoices }>; rows: readonly TickRow[] }>;
