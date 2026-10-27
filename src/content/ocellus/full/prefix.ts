import { CacheRenderModel, CacheRenderReferences, CardinalDirection } from "osrs-sdk";
import { Unit } from "osrs-sdk";
import type { Entity, Player, Region } from "osrs-sdk";
import type { FloorState } from "../fight/arena";
import { ArenaFloor, fullRoom } from "../fight/arena";
import { NPC, VOID_LOC } from "./data/looks";
import { P2 } from "./data/p2";
import { TileMarks, VoidFloor } from "../fight/effects";
import type { ChatLine, FightOptions, PhaseScript, StartPhase } from "../fight/Fight";
import { Fight } from "../fight/Fight";
import type { ATile } from "../fight/geometry";
import { GRID, at, fromSdk, toSdk } from "../fight/geometry";
import type { LocView } from "../fight/locs";
import { LocField } from "../fight/locs";
import { Phase1 } from "../fight/phase1";
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
import type { P2Watch } from "./p2/sdk/phase";
import { p2Phase } from "./p2/sdk/phase";
import type { P2Entry } from "./p2/types";
import type { P3Watch } from "./p3/sdk/phase";
import { p3Phase } from "./p3/sdk/phase";
import type { Fall, P3Entry } from "./p3/types";

/** The body he spawns in for each start phase (phase 1's hooded intro wears the phase 1 model). */
export const START_NPC: Readonly<Record<StartPhase, number>> = { 1: NPC.p1, 2: NPC.p2, 3: NPC.p3 };

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3) };

/** His phase 1. Phase 2 starts on the engine, as phase 3 does. */
export type PrefixEntry = Readonly<{ kind: "fresh"; start: 1 }>;
type FullEntries = Readonly<{ prefix: PrefixEntry; p2: P2Entry; p3: P3Entry; p4: P4Entry }>;
type FullHost = EncounterHost<FullEntries>;
type FullPhases = Readonly<{
  prefix: Readonly<{ name: "prefix"; enter: typeof mountPrefix }>;
  p2: ReturnType<typeof p2Phase<FullEntries>>;
  p3: ReturnType<typeof p3Phase<FullEntries>>;
  p4: ReturnType<typeof p4Phase<FullEntries>>;
}>;

export type FullFightOptions = FightOptions;

const OPEN_ROOM: FloorState = { key: "open", floor: fullRoom(), stones: [], censers: [], crumbling: [], destroyed: [] };

/**
 * What the run's phases share and outlive them: his fight, the floor and voids as the last phase left them,
 * chat from the phases that follow his, and the fight clock's reading on each later phase's tick 0.
 */
class Run {
  fight: Fight | null = null;
  floor: () => FloorState = () => this.fight?.floorState() ?? OPEN_ROOM;
  voids: readonly LocView[] = [];
  readonly chat: ChatLine[] = [];
  p2From = 0;
  p3From = 0;
  p4From = 0;

  constructor(public options: FullFightOptions) {}
}

function arenaRoom(start: StartPhase, run: Run): Room<Region> {
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
      const scenery: Entity[] = [new ArenaFloor(region, () => run.floor()), new LocField(region, () => run.voids)];
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

/**
 * Phase 1 schedules the blade with afterAlways, the last of them enterPhase(2). The director enters a phase on the
 * tick after it is asked, so the prefix leaves on the tick before that call and phase 2's tick 0 is the call's tick.
 */
class HostedFight extends Fight {
  handoffAt: number | null = null;

  override afterAlways(ticks: number, run: () => void): void {
    super.afterAlways(ticks, run);
    if (this.phase?.label !== "Phase 1" || this.boss?.currentStats.hitpoint !== 0) return;
    const at = this.tick + Math.max(1, ticks);
    if (this.handoffAt === null || at > this.handoffAt) this.handoffAt = at;
  }
}

function mountPrefix(host: FullHost, entry: PrefixEntry): Mounted<never> {
  const region = host.region;
  const player = host.player;
  if (!(region instanceof FightRegion) || !(player instanceof FightPlayer)) throw new Error("the hosted prefix runs on the full fight region and player");
  // Everything his fight adds is the prefix's, and leaves with it; the room and the player were here first.
  const before = new Set<unknown>([...region.entities, ...region.mobs, ...region.newMobs]);
  const makePhase = (n: StartPhase, fight: Fight): PhaseScript => {
    switch (n) {
      case 1:
        return new Phase1(fight);
      case 2:
        throw new Error("phase 2 runs on the engine: the prefix hands it over before his phase 1 enters it");
      case 3:
        throw new Error("phase 3 runs on the engine: phase 2 hands it over before his phase 2 enters it");
      default: {
        const unhandled: never = n;
        return unhandled;
      }
    }
  };
  const fight = new HostedFight(region, { ...region.currentOptions(), startPhase: entry.start }, player, makePhase);
  region.attach(fight);
  region.addEntity(new VoidFloor(region, () => fight.voidTiles()));
  region.addEntity(new TileMarks(region, () => fight.marks()));
  const size = { width: GRID, height: GRID };
  return {
    frame: identity(size),
    rules: rulesOf(fight, player),
    ready() {},
    // beforeNpcTurns is after entity ticks and before NPC timers, the same gap the fight clock used.
    openTick() {
      if (!fight.started) fight.start();
      else fight.step();
    },
    finishTick() {
      if (fight.handoffAt === null || fight.tick !== fight.handoffAt - 1 || fight.outcome.kind !== "running") return;
      region.handsTo("p2", fight.tick + 1);
      host.next({ phase: "p2", entry: { kind: "followed" } });
    },
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

/** His phases 1 and 2, hosted as the prefix phase on the engine's region and player, then phase 3 and P4 in the same world. */
export function fullFightStaged(options: FullFightOptions, dress: (player: Player) => void): FightRegion {
  return new FightRegion(options, dress);
}

/** Phase 3's lingering voids, keyed as its views keyed them, so phase 4 keeps the same models. */
function voidsOf(fall: Fall): readonly LocView[] {
  return fall.voids.map(({ tile: on, placed }) => ({ key: `bomb:${placed}:${on.x},${on.z}`, tile: on, models: VOID_LOC.bomb.models }));
}

function phasesOf(run: Run, p2: P2Watch, p3: P3Watch, p4: P4Watch, p4Config: DrillConfig): FullPhases {
  return {
    prefix: { name: "prefix", enter: mountPrefix },
    p2: p2Phase<FullEntries>({
      settings: { practice: () => run.options.invincible, hazardTiles: () => run.options.hazardTiles, skipMarkers: () => run.options.skipMarkers },
      watch: p2,
      say: (line) => run.chat.push(line),
      intoP3: (hp) => {
        run.p3From = run.p2From + P2.p3At;
        return { phase: "p3", entry: { kind: "carried", boss: { hp } } };
      },
    }),
    p3: p3Phase<FullEntries>({
      settings: { practice: () => run.options.invincible, soloVine: () => run.options.soloVine, hazardTiles: () => run.options.hazardTiles },
      watch: p3,
      showFloor: (state) => {
        run.floor = state;
        return () => {
          const last = state();
          run.floor = () => last;
        };
      },
      fallInto: (fall) => {
        run.voids = voidsOf(fall);
        run.p4From = run.p3From + fall.tick;
        return { phase: "p4", entry: carriedEntry(fall, p4Config) };
      },
      say: (line) => run.chat.push(line),
    }),
    p4: p4Phase<FullEntries>(p4),
  };
}

/** Which phase a fresh run opens on. Phase 2 and phase 3 skip his prefix. */
function opened(start: StartPhase): { phase: "prefix"; entry: PrefixEntry } | { phase: "p2"; entry: P2Entry } | { phase: "p3"; entry: P3Entry } {
  switch (start) {
    case 1:
      return { phase: "prefix", entry: { kind: "fresh", start: 1 } };
    case 2:
      return { phase: "p2", entry: { kind: "opening" } };
    case 3:
      return { phase: "p3", entry: { kind: "fresh" } };
    default: {
      const unhandled: never = start;
      return unhandled;
    }
  }
}

export class FightRegion extends EncounterRegion<FullEntries, FullPhases> {
  readonly p2: P2Watch;
  readonly p3: P3Watch;
  readonly p4: P4Watch;
  private readonly run: Run;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();
  private shownPhase: keyof FullEntries | null = null;

  constructor(options: FullFightOptions, private readonly dress: (player: Player) => void) {
    const run = new Run(options);
    const p2: P2Watch = { mounted: null };
    const p3: P3Watch = { mounted: null };
    const p4: P4Watch = { invincible: options.invincible, mounted: null };
    const start = options.startPhase;
    super({
      room: arenaRoom(start, run),
      phases: phasesOf(run, p2, p3, p4, fullFightConfig(seed(options.seed))),
      start: opened(start),
      seed: seed(options.seed),
    });
    this.run = run;
    this.p2 = p2;
    this.p3 = p3;
    this.p4 = p4;
  }

  /** His fight through phase 1, and as it stood once it handed over; null when the run starts at phase 2 or 3. */
  get fight(): Fight | null {
    return this.run.fight;
  }

  currentOptions(): FullFightOptions {
    return this.run.options;
  }

  /** The floor as the running phase lays it, and as the last one left it. */
  floorState(): FloorState {
    return this.run.floor();
  }

  /** His fight's lines, then the lines of the phases that follow it. */
  chat(): readonly ChatLine[] {
    return [...(this.run.fight?.chat ?? []), ...this.run.chat];
  }

  /** The fight clock on a later phase's tick 0. */
  startOf(phase: "p2" | "p3" | "p4"): number {
    switch (phase) {
      case "p2":
        return this.run.p2From;
      case "p3":
        return this.run.p3From;
      case "p4":
        return this.run.p4From;
      default: {
        const unhandled: never = phase;
        return unhandled;
      }
    }
  }

  /** Region.reset writes default stats after construction, so the worn set goes on once that is done, whichever phase starts the run. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    this.dress(result.player);
    if (startWorld) this.world.startTicking();
    return result;
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
    this.run.fight = fight;
    this.run.voids = [];
    this.listeners.forEach((listener) => listener());
  }

  /** The prefix hands phase 2 over, or phase 2 hands phase 3 over. `from` is that phase's tick 0 on the fight clock. */
  handsTo(phase: "p2" | "p3", from: number): void {
    if (phase === "p2") this.run.p2From = from;
    else this.run.p3From = from;
  }

  /** The sidebar's practice toggle: it takes effect now, in the running fight, and in every restart. */
  setPractice(on: boolean): void {
    this.run.options = { ...this.run.options, invincible: on };
    this.p4.invincible = on;
    if (this.fight) this.fight.practice = on;
  }

  /** The sidebar's phase 2 skip tiles, the same way. */
  setSkipMarkers(on: boolean): void {
    this.run.options = { ...this.run.options, skipMarkers: on };
    this.fight?.setSkipMarkers(on);
    this.p2.mounted?.views.syncSkip();
  }

  /** Danger-tile highlights, on for this fight and for the fight a restart builds. */
  setHazardTiles(on: boolean): void {
    this.run.options = { ...this.run.options, hazardTiles: on };
    this.fight?.setHazardTiles(on);
  }

  /**
   * He only spawns when the fight starts, after the loading splash, so load his first body with the arena: otherwise
   * the splash clears onto an empty room and he downloads in front of the player. The start phase's floor effects
   * build here too, rather than stalling its first attacks.
   */
  override async preload(): Promise<void> {
    const anchor = this.entities[0];
    const start = this.run.options.startPhase;
    const boss = anchor ? CacheRenderModel.forRenderable(anchor, CacheRenderReferences.npc(START_NPC[start])).preload() : Promise.resolve();
    const spots = anchor ? warmStartPhase(anchor, start) : Promise.resolve();
    await Promise.all([super.preload(), boss, spots]);
  }

  /** His fight ends phase 1 on a death. Phases 2 and 3 end their own runs here, and P4 ends its own. */
  override onGameOver(): void {
    if (this.current === "prefix") this.fight?.lose("death");
    this.world.stopTicking();
  }

  onFightChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override postTick(): void {
    // The SDK takes a dead player off the map just after this hook and calls onGameOver once this tick's row is closed.
    if (this.current === "p2" && this.players.some((player) => player.dying === 0)) this.p2.mounted?.script.lose();
    if (this.current === "p3" && this.players.some((player) => player.dying === 0)) this.p3.mounted?.script.lose();
    super.postTick();
    if (this.current !== this.shownPhase) {
      this.shownPhase = this.current;
      this.listeners.forEach((listener) => listener());
    }
    this.tickListeners.forEach((listener) => listener());
  }

  /** Called after every world tick's phase work, for a page that follows phases 3 and 4, which have no change events of their own. */
  onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  ticks(): number {
    const running = this.world;
    return running ? running.globalTickCounter : 0;
  }
}
