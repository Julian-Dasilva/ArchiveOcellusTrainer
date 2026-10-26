import { OCELLUS_P3, OCELLUS_P4 } from "../OcellusTimings";
import type { Seed, Tick, Tile } from "../../../../sim/brands";
import { after, span, tick, tile } from "../../../../sim/brands";
import type { AttackDelayCut, HitRequest, Logged } from "../../../../sim/sdk/EncounterBinding";
import { TileSet } from "../../../../sim/tiles";
import type { P3Event, P3Hit, P3Stage, Quadrant } from "../P3Types";
import type { RiftId } from "../P4Types";
import { riftId } from "../P4Types";
import { roll, rollInt } from "../roll";
import { QUADRANT_1_FLOOR } from "./arena";

const { chargeAfterSpawn, burstDamage, firstInQuadrant1, firstInLaterQuadrants, every, count, clearOfBoss } = OCELLUS_P3.rifts;

export type RiftClock = Readonly<{ kind: "awaiting-special"; specialsLeft: number }> | Readonly<{ kind: "due"; at: Tick }>;
export type StandingRift = Readonly<{ id: RiftId; tile: Tile; spawnedAt: Tick; hp: number }>;
export type ShellEffect =
  | Readonly<{ kind: "spawn-rift"; rift: RiftId; tile: Tile }>
  | Readonly<{ kind: "detonate-rift"; rift: RiftId }>
  | Readonly<{ kind: "forget-rift"; rift: RiftId }>;

export type RiftFacts = Readonly<{ at: Tick; rifts: readonly StandingRift[]; bossAt: Tile; attackDelay: number; enteredSpecial: boolean }>;
export type RiftTurn = Readonly<{ clock: RiftClock; outputs: readonly (Logged<P3Event> | HitRequest<P3Hit> | AttackDelayCut)[]; shell: readonly ShellEffect[] }>;

type Fate = "stands" | "fallen" | "bursts";

export function startRiftClock(start: Quadrant): RiftClock {
  return start === 1 ? { kind: "awaiting-special", specialsLeft: firstInQuadrant1.value.special } : { kind: "due", at: after(tick(0), firstInLaterQuadrants.value) };
}

export function isSpecial(stage: P3Stage): boolean {
  switch (stage) {
    case "smite-1":
    case "smite-2":
    case "smite-3":
      return true;
    case "arrive":
    case "autos":
    case "destroy":
      return false;
    default: {
      const unhandled: never = stage;
      return unhandled;
    }
  }
}

function advance(clock: RiftClock, at: Tick, enteredSpecial: boolean): Readonly<{ clock: RiftClock; spawns: boolean }> {
  switch (clock.kind) {
    case "awaiting-special":
      if (!enteredSpecial) return { clock, spawns: false };
      if (clock.specialsLeft > 1) return { clock: { kind: "awaiting-special", specialsLeft: clock.specialsLeft - 1 }, spawns: false };
      return { clock: { kind: "due", at: after(at, firstInQuadrant1.value.after) }, spawns: false };
    case "due":
      return at < clock.at ? { clock, spawns: false } : { clock: { kind: "due", at: after(at, every.value) }, spawns: true };
    default: {
      const unhandled: never = clock;
      return unhandled;
    }
  }
}

function fate(rift: StandingRift, at: Tick): Fate {
  if (rift.hp <= 0) return "fallen";
  return at >= after(rift.spawnedAt, chargeAfterSpawn.value) ? "bursts" : "stands";
}

function openTiles(bossAt: Tile): readonly Tile[] {
  const size = OCELLUS_P4.boss.size.value;
  const grow = clearOfBoss.value - 1;
  const near = TileSet.area(tile(bossAt.x - grow, bossAt.y - size + 1 - grow), tile(bossAt.x + size - 1 + grow, bossAt.y + grow));
  return QUADRANT_1_FLOOR.minus(near).tiles();
}

function spawn(seed: Seed, at: Tick, bossAt: Tile): Pick<RiftTurn, "outputs" | "shell"> {
  let open = openTiles(bossAt);
  const placed = Array.from({ length: count.value }, (_, draw) => {
    const place = open[Math.floor(roll(seed, "riftTile", at, draw) * open.length)];
    open = open.filter((other) => other !== place);
    return { rift: riftId(at, draw), place };
  });
  return {
    outputs: placed.map(({ rift, place }) => ({ kind: "event", event: { kind: "rift-spawned", at, rift, tile: place } })),
    shell: placed.map(({ rift, place }) => ({ kind: "spawn-rift", rift, tile: place })),
  };
}

function settle(seed: Seed, rift: StandingRift, at: Tick, draw: number, attackDelay: number): Pick<RiftTurn, "outputs" | "shell"> {
  const outcome = fate(rift, at);
  switch (outcome) {
    case "stands":
      return { outputs: [], shell: [] };
    case "fallen":
      return {
        outputs: [{ kind: "event", event: { kind: "rift-destroyed", at, rift: rift.id, tile: rift.tile } }, { kind: "cut-attack-delay", by: span(attackDelay) }],
        shell: [{ kind: "forget-rift", rift: rift.id }],
      };
    case "bursts":
      return {
        outputs: [{ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "riftBurst", at, burstDamage.value, draw) }, cause: { kind: "rift-burst", at, rift: rift.id, tile: rift.tile } }],
        shell: [{ kind: "detonate-rift", rift: rift.id }],
      };
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
}

export function turnRifts(seed: Seed, clock: RiftClock, facts: RiftFacts): RiftTurn {
  const settled = facts.rifts.map((rift, draw) => settle(seed, rift, facts.at, draw, facts.attackDelay));
  const next = advance(clock, facts.at, facts.enteredSpecial);
  const spawned = next.spawns ? [spawn(seed, facts.at, facts.bossAt)] : [];
  const steps = [...settled, ...spawned];
  return { clock: next.clock, outputs: steps.flatMap((step) => step.outputs), shell: steps.flatMap((step) => step.shell) };
}
