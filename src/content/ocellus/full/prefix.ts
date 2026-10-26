import { CacheRenderModel, CacheRenderReferences, CardinalDirection } from "osrs-sdk";
import type { Entity, Player, Unit } from "osrs-sdk";
import { ArenaFloor } from "../fight/arena";
import { NPC } from "../fight/data";
import { TileMarks, VoidFloor } from "../fight/effects";
import type { FightOptions, StartPhase } from "../fight/Fight";
import { Fight, START_PHASES } from "../fight/Fight";
import type { ATile } from "../fight/geometry";
import { GRID, at, fromSdk, toSdk } from "../fight/geometry";
import { Phase1 } from "../fight/phase1";
import { Phase2 } from "../fight/phase2";
import { Phase3 } from "../fight/phase3";
import { FightPlayer, VoidAdd } from "../fight/units";
import { warmStartPhase } from "../fight/warmup";
import { seed, tile } from "../../../sim/brands";
import type { Style } from "../../../sim/combat";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import type { Mounted, PhaseHost, Room } from "../../../sim/sdk/director";
import type { Rules } from "../../../sim/sdk/rules";

/** The body he spawns in for each start phase (phase 1's hooded intro wears the phase 1 model). */
export const START_NPC: Readonly<Record<StartPhase, number>> = { 1: NPC.p1, 2: NPC.p2, 3: NPC.p3 };

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3) };

export function makePhase(n: StartPhase, fight: Fight) {
  switch (n) {
    case 1:
      return new Phase1(fight);
    case 2:
      return new Phase2(fight);
    case 3:
      return new Phase3(fight);
    default: {
      const unhandled: never = n;
      return unhandled;
    }
  }
}

export type PrefixEntry = Readonly<{ kind: "fresh"; start: StartPhase }>;

function isStart(value: unknown): value is StartPhase {
  for (const phase of START_PHASES) if (value === phase) return true;
  return false;
}

function prefixEntry(entry: unknown): PrefixEntry {
  if (typeof entry !== "object" || entry === null || !("kind" in entry) || entry.kind !== "fresh" || !("start" in entry) || !isStart(entry.start)) {
    throw new Error("prefix entry must be a fresh start phase");
  }
  return { kind: "fresh", start: entry.start };
}

function roomFor(start: StartPhase): Room {
  const spawn = toSdk(SPAWN[start]);
  return {
    size: { width: GRID, height: GRID },
    spawn: tile(spawn.x, spawn.y),
    drawFloor(context, scale) {
      context.fillStyle = "#07060b";
      context.fillRect(0, 0, GRID * scale, GRID * scale);
    },
  };
}

/**
 * The vine roots you on its own tile, and the SDK will not let you attack what you stand under.
 * Solo, with the vine attackable, you cut it from there.
 */
function vineGrant(target: Unit, player: FightPlayer): "sdk" | "granted" {
  if (!(target instanceof VoidAdd) || target.kind !== "vine" || !target.attackable) return "sdk";
  if (target.location.x !== player.location.x || target.location.y !== player.location.y) return "sdk";
  return "granted";
}

function rulesOf(fight: Fight, player: FightPlayer): Rules {
  return {
    judge: (_style, _launchedAt, _landsAt) => ({ outcome: "passed" }),
    hpFloor: () => fight.phase?.hpFloor() ?? 0,
    walk: (to) => (fight.interceptWalk(fromSdk(to)) ? { kind: "handled" } : { kind: "sdk" }),
    canAttack: (target, style: Style) => fight.playerAttacking(target, style),
    lineOfSight: (target) => vineGrant(target, player),
  };
}

function mountPrefix(host: PhaseHost, entry: unknown): Mounted {
  const region = host.region;
  const player = host.player;
  if (!(region instanceof FightRegion) || !(player instanceof FightPlayer)) throw new Error("the hosted prefix runs on the full fight region and player");
  const start = prefixEntry(entry).start;
  const fight = new Fight(region, { ...region.currentOptions(), startPhase: start }, player, makePhase);
  region.attach(fight);
  const added: Entity[] = [];
  const track = (entity: Entity) => {
    region.addEntity(entity);
    added.push(entity);
  };
  track(new ArenaFloor(region, () => fight.floorState()));
  track(new VoidFloor(region, () => fight.voidTiles()));
  track(new TileMarks(region, () => fight.marks()));
  return {
    rules: rulesOf(fight, player),
    ready() {},
    // beforeNpcTurns is after entity ticks and before NPC timers, the same gap the fight clock used.
    openTick() {
      if (!fight.started) fight.start();
      else fight.step();
    },
    finishTick() {},
    leave() {
      for (const entity of added) region.removeEntity(entity);
      added.splice(0, added.length);
    },
  };
}

/** His phases 1 to 3, hosted as the prefix phase on the engine's region and player. */
export function fullFightStaged(options: FightOptions, dress: (player: Player) => void): FightRegion {
  return new FightRegion(options, dress);
}

export class FightRegion extends EncounterRegion {
  fight: Fight | null = null;
  private options: FightOptions;
  private readonly listeners = new Set<() => void>();

  constructor(options: FightOptions, dress: (player: Player) => void) {
    const entry: PrefixEntry = { kind: "fresh", start: options.startPhase };
    super(roomFor(options.startPhase), { prefix: { enter: mountPrefix } }, "prefix", entry, seed(options.seed), dress);
    this.options = options;
  }

  currentOptions(): FightOptions {
    return this.options;
  }

  override getName(): string {
    return "Ocellus";
  }

  /** You walk in from the south, facing him. */
  override get initialFacing(): CardinalDirection {
    return CardinalDirection.NORTH;
  }

  protected override createPlayer(at: { x: number; y: number }): FightPlayer {
    return new FightPlayer(this, fromSdk(at), this.director.playerHooks);
  }

  attach(fight: Fight): void {
    this.fight = fight;
    this.listeners.forEach((listener) => listener());
  }

  setOptions(options: FightOptions): void {
    this.options = options;
  }

  /** The sidebar's practice toggle: it takes effect now, in the running fight, and in every restart. */
  setPractice(on: boolean): void {
    this.options = { ...this.options, invincible: on };
    if (this.fight) this.fight.practice = on;
  }

  /** The sidebar's phase 2 skip tiles, the same way. */
  setSkipMarkers(on: boolean): void {
    this.options = { ...this.options, skipMarkers: on };
    this.fight?.setSkipMarkers(on);
  }

  /**
   * He only spawns when the fight starts, after the loading splash, so load his first body with the arena: otherwise
   * the splash clears onto an empty room and he downloads in front of the player. The start phase's floor effects
   * build here too, rather than stalling its first attacks.
   */
  override async preload(): Promise<void> {
    const anchor = this.entities[0];
    const boss = anchor ? CacheRenderModel.forRenderable(anchor, CacheRenderReferences.npc(START_NPC[this.options.startPhase])).preload() : Promise.resolve();
    const spots = anchor ? warmStartPhase(anchor, this.options.startPhase) : Promise.resolve();
    await Promise.all([super.preload(), boss, spots]);
  }

  override onGameOver(): void {
    this.fight?.lose("death");
    this.world.stopTicking();
  }

  onFightChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
