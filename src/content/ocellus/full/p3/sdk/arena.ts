import { InvisibleMovementBlocker } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import type { ClientCycles } from "../../../../../sim/brands";
import type { Style } from "../../../../../sim/combat";
import type { FloorState } from "../../../fight/arena";
import { fullRoom } from "../../../fight/arena";
import type { ATile, Quadrant } from "../../../fight/geometry";
import { CENSERS, GRID, QUADRANTS, TileSet, at, fromSdk, key, toSdk } from "../../../fight/geometry";
import type { FightPlayer } from "../../../fight/units";
import { VoidAdd } from "../../../fight/units";
import { SEQ } from "../../data/looks";
import { V } from "../data";
import type { AddKind } from "../types";
import type { Add, Censer, Fighter, P3World } from "../world";

class SpawnedAdd implements Add {
  constructor(readonly unit: VoidAdd) {}

  get kind(): AddKind {
    return this.unit.kind;
  }

  get tile(): ATile {
    return this.unit.tile;
  }

  get alive(): boolean {
    return !this.unit.killed;
  }

  remove(): void {
    this.unit.remove();
  }
}

/** The SDK's player as phase 3 moves and buffs them. A forced move glides through the SDK's own path interpolation. */
class PlayerPort implements Fighter {
  constructor(private readonly player: FightPlayer) {}

  get walking(): boolean {
    return this.player.destinationLocation !== undefined;
  }

  get frozen(): number {
    return this.player.frozen;
  }

  get protection(): Style | null {
    return this.player.protection();
  }

  get stats() {
    const { currentStats, stats } = this.player;
    return { hp: currentStats.hitpoint, maxHp: stats.hitpoint, prayer: currentStats.prayer ?? 0, maxPrayer: stats.prayer ?? 99, special: currentStats.specialAttack };
  }

  /** Moves the player now and lets the SDK draw the move, one tile or two at a time, in place of a cut. */
  hop(to: ATile): void {
    const player = this.player;
    const from = fromSdk(player.location);
    const target = toSdk(to);
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
    player.location = { x: target.x, y: target.y };
    player.destinationLocation = undefined;
    for (let i = 1; i <= steps; i++) {
      const step = toSdk(at(Math.round(from.x + ((to.x - from.x) * i) / steps), Math.round(from.z + ((to.z - from.z) * i) / steps)));
      player.visualPath.push({ x: step.x, y: step.y, run: true });
    }
    player.region.refreshUnitChunk(player);
  }

  walkTo(to: ATile): void {
    this.player.walkTo(to);
  }

  jump(to: ATile, over: ClientCycles): void {
    this.player.exactMove(to, over);
    void this.player.playAnimation(SEQ.humanYamaShortJump);
  }

  freeze(ticks: number): void {
    this.player.freeze(ticks);
  }

  unfreeze(): void {
    this.player.frozen = 0;
  }

  sever(ticks: number): void {
    this.player.prayerController.disableProtectionPrayersForTicks(ticks);
  }

  target(add: Add | null): void {
    this.player.setAggro(add instanceof SpawnedAdd ? add.unit : null);
  }

  boost(melee: number, rangedMagic: number): void {
    const { stats, currentStats } = this.player;
    currentStats.attack = Math.max(currentStats.attack, stats.attack + melee);
    currentStats.strength = Math.max(currentStats.strength, stats.strength + melee);
    currentStats.range = Math.max(currentStats.range, stats.range + rangedMagic);
    currentStats.magic = Math.max(currentStats.magic, stats.magic + rangedMagic);
  }

  resetAttackDelay(): void {
    this.player.attackDelay = 0;
  }

  setHp(hp: number): void {
    this.player.currentStats.hitpoint = hp;
  }

  setPrayer(prayer: number): void {
    this.player.currentStats.prayer = prayer;
  }

  setSpecial(special: number): void {
    this.player.currentStats.specialAttack = special;
  }
}

export type ArenaSettings = Readonly<{ practice: () => boolean; soloVine: () => boolean; maxNextHit: () => void }>;

/** The arena as phase 3 changes it: its floor, stones, censers and fallen quadrants, the SDK blockers off the floor, and the adds. */
export class Arena implements P3World {
  readonly fighter: Fighter;
  readonly destroyed = new Set<Quadrant>();
  readonly censers = new Map<Quadrant, Censer>();
  private floor = new TileSet(fullRoom());
  private stones: readonly ATile[] = [];
  private crumbling: readonly Quadrant[] = [];
  private version = 0;
  private readonly blockers = new Map<string, InvisibleMovementBlocker>();
  private readonly adds: SpawnedAdd[] = [];

  constructor(private readonly region: Region, player: FightPlayer, private readonly settings: ArenaSettings) {
    this.fighter = new PlayerPort(player);
    for (const q of QUADRANTS) this.censers.set(q, { tile: CENSERS[q].tile, god: CENSERS[q].god, lit: false });
    this.syncBlockers();
  }

  get practice(): boolean {
    return this.settings.practice();
  }

  get soloVine(): boolean {
    return this.settings.soloVine();
  }

  isFloor(t: ATile): boolean {
    return this.floor.has(t);
  }

  isWalkable(t: ATile): boolean {
    return this.floor.has(t);
  }

  removeFloor(tiles: readonly ATile[]): void {
    for (const t of tiles) this.floor.delete(t);
    this.version++;
    this.syncBlockers();
  }

  setStones(tiles: readonly ATile[]): void {
    this.stones = tiles;
    this.version++;
  }

  setCrumbling(quadrants: readonly Quadrant[]): void {
    this.crumbling = quadrants;
    this.version++;
  }

  destroy(quadrant: Quadrant): void {
    this.destroyed.add(quadrant);
    this.version++;
  }

  lightCenser(quadrant: Quadrant): void {
    const censer = this.censers.get(quadrant);
    if (censer) this.censers.set(quadrant, { ...censer, lit: true });
    this.version++;
  }

  spawn(kind: AddKind, tile: ATile, killed: (add: Add) => void): Add {
    const unit = new VoidAdd(this.region, tile, kind, () => killed(add));
    const add = new SpawnedAdd(unit);
    if (kind === "vine") {
      unit.currentStats.hitpoint = V.vineHp.value;
      unit.attackable = this.settings.soloVine();
    }
    this.region.addMob(unit);
    this.adds.push(add);
    return add;
  }

  maxNextHit(): void {
    this.settings.maxNextHit();
  }

  /** A living add on the tile: a heal flare flies from the rift there. */
  unitAt(t: ATile): VoidAdd | null {
    return this.adds.find((add) => add.alive && add.tile.x === t.x && add.tile.z === t.z)?.unit ?? null;
  }

  floorState(): FloorState {
    return { key: `p3:${this.version}`, floor: this.floor.tiles(), stones: this.stones, censers: [...this.censers.values()], crumbling: this.crumbling, destroyed: [...this.destroyed] };
  }

  /** Every add this phase spawned and every blocker it placed leaves with it. */
  dispose(): void {
    this.adds.forEach((add) => add.remove());
    this.adds.forEach((add) => this.region.removeMob(add.unit));
    this.adds.splice(0, this.adds.length);
    const blockers = new Set<unknown>(this.blockers.values());
    this.region.entities = this.region.entities.filter((entity) => !blockers.has(entity));
    this.blockers.clear();
  }

  private syncBlockers(): void {
    const wanted = new Set<string>();
    for (let sx = 0; sx < GRID; sx++) {
      for (let sy = 0; sy < GRID; sy++) {
        const a = fromSdk({ x: sx, y: sy });
        if (!this.isWalkable(a)) wanted.add(key(a));
      }
    }
    const gone = new Set<unknown>();
    for (const [k, blocker] of this.blockers) {
      if (wanted.has(k)) continue;
      gone.add(blocker);
      this.blockers.delete(k);
    }
    if (gone.size > 0) this.region.entities = this.region.entities.filter((entity) => !gone.has(entity));
    for (const k of wanted) {
      if (this.blockers.has(k)) continue;
      const [x, z] = k.split(",").map(Number);
      const blocker = new InvisibleMovementBlocker(this.region, toSdk(at(x, z)));
      this.blockers.set(k, blocker);
      this.region.addEntity(blocker);
    }
  }
}
