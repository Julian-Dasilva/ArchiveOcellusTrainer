import type { Tick, TickSpan } from "../../../../sim/brands";
import type { Entries } from "../../../../sim/encounter";
import type { Ctx, ScriptRow } from "../../../../sim/script";
import type { ATile, Body, Quadrant } from "../../fight/geometry";
import type { BossOverhead, VoidLocKind } from "../data/looks";

export type RiftKind = "rift-basic" | "rift-heal" | "rift-buff";
export type AddKind = "vine" | RiftKind;
export type Special = "spin" | "insolence" | "untether";
export type God = "bandos" | "saradomin" | "armadyl" | "zaros";

/** Every way phase 3 hurts or heals, one kind per row in its replay table. */
export type P3Cause =
  | Readonly<{ kind: "swing" }>
  | Readonly<{ kind: "panic" }>
  | Readonly<{ kind: "slash" }>
  | Readonly<{ kind: "spin-opening" }>
  | Readonly<{ kind: "saw" }>
  | Readonly<{ kind: "bomb" }>
  | Readonly<{ kind: "debris" }>
  | Readonly<{ kind: "superior-slash" }>
  | Readonly<{ kind: "rift-detonation" }>
  | Readonly<{ kind: "rift-heal" }>
  | Readonly<{ kind: "void-patch" }>
  | Readonly<{ kind: "untether-magic" }>
  | Readonly<{ kind: "slam" }>
  | Readonly<{ kind: "aftershock" }>;

export type P3Event =
  | Readonly<{ kind: "segment-started"; at: Tick; segment: number; quadrant: Quadrant }>
  | Readonly<{ kind: "special-started"; at: Tick; special: Special }>
  | Readonly<{ kind: "prayer-severed"; at: Tick }>
  | Readonly<{ kind: "vine-rooted"; at: Tick; tile: ATile }>
  | Readonly<{ kind: "vine-released"; at: Tick; how: "broken" | "cut-by-teammate" | "lifted" }>
  | Readonly<{ kind: "rift-spawned"; at: Tick; rift: RiftKind; tile: ATile }>
  | Readonly<{ kind: "rift-killed"; at: Tick; rift: RiftKind }>
  | Readonly<{ kind: "collapse-started"; at: Tick; quadrant: Quadrant }>
  | Readonly<{ kind: "quadrant-fell"; at: Tick; quadrant: Quadrant; standing: readonly Quadrant[] }>
  | Readonly<{ kind: "player-consumed"; at: Tick; quadrant: Quadrant }>
  | Readonly<{ kind: "crossing-started"; at: Tick; from: Quadrant; to: Quadrant }>
  | Readonly<{ kind: "censer-lit"; at: Tick; quadrant: Quadrant; god: God }>;

export type Tone = "game" | "red" | "purple" | "green";
export type DangerRole = "slash" | "bomb" | "debris" | "superior-slash";
export type PatchEnd = Readonly<{ kind: "at"; tick: Tick }> | Readonly<{ kind: "quadrant" }>;

/** What the presenter draws. Each is logged in the row, so replaying the rows redraws the fight. */
export type P3Look =
  | Readonly<{ kind: "chat"; text: string; tone: Tone }>
  | Readonly<{ kind: "player-spot"; id: number; channel: string; raised: boolean }>
  | Readonly<{ kind: "projectile"; id: number; to: "player" | "boss"; from: "boss" | ATile; flight: TickSpan }>
  | Readonly<{ kind: "arena-broke" }>
  | Readonly<{ kind: "bomb-shown"; tile: ATile; drops: Tick }>
  | Readonly<{ kind: "bomb-dropped"; tile: ATile }>
  | Readonly<{ kind: "debris-shown"; tile: ATile; falls: Tick }>
  | Readonly<{ kind: "band-landed"; role: "slash" | "superior-slash"; tiles: readonly ATile[] }>
  | Readonly<{ kind: "pools"; tiles: readonly ATile[] }>
  | Readonly<{ kind: "collapse-burst"; bursts: readonly Readonly<{ tile: ATile; id: number }>[] }>
  | Readonly<{ kind: "untether-flare"; quadrant: Quadrant; tile: ATile }>
  | Readonly<{ kind: "rift-detonated"; tile: ATile }>
  | Readonly<{ kind: "danger"; role: DangerRole; tiles: readonly ATile[]; until: Tick }>
  | Readonly<{ kind: "danger-withdrawn"; role: DangerRole; after: Tick }>
  | Readonly<{ kind: "zone"; body: Body; erupts: Tick; slams: Tick }>
  | Readonly<{ kind: "zone-cleared" }>
  | Readonly<{ kind: "crossing"; bank: ATile; hops: readonly ATile[] }>
  | Readonly<{ kind: "crossing-cleared" }>
  | Readonly<{ kind: "patch"; tile: ATile; placed: Tick; end: PatchEnd; loc: VoidLocKind }>
  | Readonly<{ kind: "patches-cleared"; quadrant: Quadrant | "all" }>;

export type P3Roll = "shout" | "rift-kind" | "rift-tile" | "patch-lasts" | "pool-count" | "pool-tiles" | "burst-tile" | "burst-look" | "heal-amount";

export type P3Types = Readonly<{
  tile: ATile;
  cause: P3Cause;
  event: P3Event;
  look: P3Look;
  roll: P3Roll;
  overhead: BossOverhead;
  input: unknown;
}>;

export type P3Row = ScriptRow<P3Types>;
export type P3Ctx<E extends Entries> = Ctx<E, P3Types>;

/** Phase 3 entered at the fight's start or from phase 2 with the shared pool as it stands. */
export type P3Entry = Readonly<{ kind: "fresh" }> | Readonly<{ kind: "carried"; boss: Readonly<{ hp: number }> }>;

/** The third fall, read as the quadrant goes: the one left standing, the boss as he is, and the bomb voids on it. */
export type Fall = Readonly<{
  tick: Tick;
  standing: Quadrant;
  boss: Readonly<{ hp: number; defence: number }>;
  voids: readonly Readonly<{ tile: ATile; placed: number }>[];
}>;

/** One stage at a time, in place of his five booleans. `airborne` is his levitating: melee cannot reach him. */
export type P3Stage =
  | Readonly<{ kind: "arriving" }>
  | Readonly<{ kind: "chain" }>
  | Readonly<{ kind: "spin" }>
  | Readonly<{ kind: "untether"; quadrant: Quadrant; zone: Body }>
  | Readonly<{ kind: "collapsing"; quadrant: Quadrant; airborne: boolean }>
  | Readonly<{ kind: "between" }>
  | Readonly<{ kind: "over" }>;
