import { CacheRenderModel, CacheRenderReferences, CardinalDirection } from "osrs-sdk";
import { Unit } from "osrs-sdk";
import type { Entity, Player, Region } from "osrs-sdk";
import type { FloorState } from "../fight/arena";
import { ArenaFloor, fullRoom } from "../fight/arena";
import { NPC, VOID_LOC } from "../fight/data";
import { TileMarks, VoidFloor } from "../fight/effects";
import type { FightOptions, StartPhase } from "../fight/Fight";
import { Fight } from "../fight/Fight";
import type { ATile } from "../fight/geometry";
import { GRID, at, fromSdk, toSdk } from "../fight/geometry";
import type { LocView } from "../fight/locs";
import { LocField } from "../fight/locs";
import { Phase1 } from "../fight/phase1";
import { Phase2 } from "../fight/phase2";
import { Phase3 } from "../fight/phase3";
import { FightPlayer, VoidAdd } from "../fight/units";
import { warmStartPhase } from "../fight/warmup";
import type { DrillConfig } from "../js/OcellusTimings";
import { fullFightConfig } from "../js/OcellusTimings";
import type { P4Entry, P4Watch } from "../js/p4/phase";
import { p4Phase } from "../js/p4/phase";
import { seed, tile } from "../../../sim/brands";
import type { AttackTarget, Mounted, Room, Rules } from "../../../sim/encounter";
import { identity, toRoom } from "../../../sim/frame";
import type { EncounterPlayerHooks } from "../../../sim/sdk/EncounterPlayer";
import type { EncounterHost } from "../../../sim/sdk/EncounterRegion";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import { fence } from "../../../sim/sdk/fence";
import { carriedEntry } from "./fall";

/** The body he spawns in for each start phase (phase 1's hooded intro wears the phase 1 model). */
export const START_NPC: Readonly<Record<StartPhase, number>> = { 1: NPC.p1, 2: NPC.p2, 3: NPC.p3 };

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3) };

export type PrefixEntry = Readonly<{ kind: "fresh"; start: StartPhase }>;
type FullEntries = Readonly<{ prefix: PrefixEntry; p4: P4Entry }>;
type FullHost = EncounterHost<FullEntries>;
type FullPhases = Readonly<{ prefix: Readonly<{ name: "prefix"; enter: typeof mountPrefix }>; p4: ReturnType<typeof p4Phase<FullEntries>> }>;

/** The region builds his fight's fall into our P4, so the page does not choose what follows phase 3. */
export type FullFightOptions = Omit<FightOptions, "onFall">;

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

const OPEN_ROOM: FloorState = { key: "open", floor: fullRoom(), stones: [], censers: [], crumbling: [], destroyed: [] };

/** The arena outlives phase 3: his fight lays its floor while it runs, and the floor and voids stay as the third fall left them. */
class Arena {
  fight: Fight | null = null;
  voids: readonly LocView[] = [];

  floor(): FloorState {
    return this.fight?.floorState() ?? OPEN_ROOM;
  }
}

function arenaRoom(start: StartPhase, arena: Arena): Room<Region> {
  const size = { width: GRID, height: GRID };
  const spawn = toSdk(SPAWN[start]);
  return {
    size,
    spawn: toRoom(identity(size), tile(spawn.x, spawn.y)),
    drawFloor(context, scale) {
      context.fillStyle = "#07060b";
      context.fillRect(0, 0, GRID * scale, GRID * scale);
    },
    mount(region) {
      const scenery: Entity[] = [new ArenaFloor(region, () => arena.floor()), new LocField(region, () => arena.voids)];
      scenery.forEach((entity) => region.addEntity(entity));
      return {
        dispose: () => scenery.forEach((entity) => region.removeEntity(entity)),
        walkable: (tiles) => scenery.push(...fence(region, tiles)),
      };
    },
  };
}

/**
 * The vine roots you on its own tile, and the SDK will not let you attack what you stand under.
 * Solo, with the vine attackable, you cut it from there.
 */
function vineGrant(target: AttackTarget, player: FightPlayer): "sdk" | "granted" {
  if (!(target instanceof VoidAdd) || target.kind !== "vine" || !target.attackable) return "sdk";
  if (target.location.x !== player.location.x || target.location.y !== player.location.y) return "sdk";
  return "granted";
}

function rulesOf(fight: Fight, player: FightPlayer): Rules {
  return {
    judge: () => ({ outcome: "passed" }),
    hpFloor: () => fight.phase?.hpFloor() ?? 0,
    walk: (to) => (fight.interceptWalk(fromSdk(to)) ? { kind: "handled" } : { kind: "sdk" }),
    canAttack: (target, style) => target instanceof Unit && fight.playerAttacking(target, style),
    lineOfSight: (target) => vineGrant(target, player),
  };
}

function mountPrefix(host: FullHost, entry: PrefixEntry): Mounted<never> {
  const region = host.region;
  const player = host.player;
  if (!(region instanceof FightRegion) || !(player instanceof FightPlayer)) throw new Error("the hosted prefix runs on the full fight region and player");
  // Everything his fight adds is the prefix's, and leaves with it; the room and the player were here first.
  const before = new Set<unknown>([...region.entities, ...region.mobs, ...region.newMobs]);
  const fight = new Fight(
    region,
    {
      ...region.currentOptions(),
      startPhase: entry.start,
      onFall: (fall) => {
        region.fell(fall.voids.map(({ tile: on, placed }) => ({ key: `bomb:${placed}:${on.x},${on.z}`, tile: on, models: VOID_LOC.bomb.models })));
        host.next({ phase: "p4", entry: carriedEntry(fall, region.p4Config) });
      },
    },
    player,
    makePhase,
  );
  region.attach(fight);
  region.addEntity(new VoidFloor(region, () => fight.voidTiles()));
  region.addEntity(new TileMarks(region, () => fight.marks()));
  const size = { width: GRID, height: GRID };
  return {
    frame: identity(size),
    rules: rulesOf(fight, player),
    // Region.reset writes default stats after construction, so the worn set is applied once that is done.
    ready() {
      region.wear(player);
    },
    // beforeNpcTurns is after entity ticks and before NPC timers, the same gap the fight clock used.
    openTick() {
      if (!fight.started) fight.start();
      else fight.step();
    },
    finishTick() {},
    rows: () => [],
    leave() {
      const added = (unit: unknown) => !before.has(unit);
      // Region.removeEntity hands the entity to lodash's remove as a matcher, so a bare blocker at (0, 0) would take the arena with it.
      region.entities = region.entities.filter((entity) => !added(entity));
      [...region.mobs, ...region.newMobs].filter(added).forEach((mob) => region.removeMob(mob));
      if (player.aggro && added(player.aggro)) player.setAggro(null);
    },
  };
}

/** His phases 1 to 3, hosted as the prefix phase on the engine's region and player, then our P4 in the same world. */
export function fullFightStaged(options: FullFightOptions, dress: (player: Player) => void): FightRegion {
  return new FightRegion(options, dress);
}

export class FightRegion extends EncounterRegion<FullEntries, FullPhases> {
  readonly p4: P4Watch;
  readonly p4Config: DrillConfig;
  private options: FullFightOptions;
  private readonly arena: Arena;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();

  constructor(options: FullFightOptions, private readonly dress: (player: Player) => void) {
    const arena = new Arena();
    const watch: P4Watch = { invincible: options.invincible, mounted: null };
    const entry: PrefixEntry = { kind: "fresh", start: options.startPhase };
    super({
      room: arenaRoom(options.startPhase, arena),
      phases: { prefix: { name: "prefix", enter: mountPrefix }, p4: p4Phase<FullEntries>(watch) },
      start: { phase: "prefix", entry },
      seed: seed(options.seed),
    });
    this.options = options;
    this.arena = arena;
    this.p4 = watch;
    this.p4Config = fullFightConfig(seed(options.seed));
  }

  /** His fight: the running one through phase 3, and the one that fell into P4 after. */
  get fight(): Fight | null {
    return this.arena.fight;
  }

  currentOptions(): FullFightOptions {
    return this.options;
  }

  wear(player: Player): void {
    this.dress(player);
  }

  override getName(): string {
    return "Ocellus";
  }

  /** You walk in from the south, facing him. */
  override get initialFacing(): CardinalDirection {
    return CardinalDirection.NORTH;
  }

  override drawDefaultFloor(): boolean {
    return false;
  }

  protected override createPlayer(at: Readonly<{ x: number; y: number }>, hooks: () => EncounterPlayerHooks): FightPlayer {
    return new FightPlayer(this, fromSdk(at), hooks);
  }

  attach(fight: Fight): void {
    this.arena.fight = fight;
    this.arena.voids = [];
    this.listeners.forEach((listener) => listener());
  }

  fell(voids: readonly LocView[]): void {
    this.arena.voids = voids;
    this.listeners.forEach((listener) => listener());
  }

  setOptions(options: FullFightOptions): void {
    this.options = options;
  }

  /** The sidebar's practice toggle: it takes effect now, in the running fight, and in every restart. */
  setPractice(on: boolean): void {
    this.options = { ...this.options, invincible: on };
    this.p4.invincible = on;
    if (this.fight) this.fight.practice = on;
  }

  /** The sidebar's phase 2 skip tiles, the same way. */
  setSkipMarkers(on: boolean): void {
    this.options = { ...this.options, skipMarkers: on };
    this.fight?.setSkipMarkers(on);
  }

  /** Danger-tile highlights, on for this fight and for the fight a restart builds. */
  setHazardTiles(on: boolean): void {
    this.options = { ...this.options, hazardTiles: on };
    this.fight?.setHazardTiles(on);
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

  /** P4 ends its own run on a death; his fight ends phases 1 to 3. */
  override onGameOver(): void {
    if (this.current === "prefix") this.fight?.lose("death");
    this.world.stopTicking();
  }

  onFightChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override postTick(): void {
    super.postTick();
    this.tickListeners.forEach((listener) => listener());
  }

  /** Called after every world tick's phase work, for a page that follows P4, which has no change events of its own. */
  onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  ticks(): number {
    const running = this.world;
    return running ? running.globalTickCounter : 0;
  }
}
