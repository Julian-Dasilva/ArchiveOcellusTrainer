import { CacheRender, CacheRenderModel, CacheRenderReferences, CardinalDirection, TileMarker } from "osrs-sdk";
import type { Entity, Player, Region } from "osrs-sdk";
import type { FloorState } from "../fight/arena";
import { ArenaFloor, fullRoom } from "../fight/arena";
import { NPC, VOID_LOC, scaledHp } from "./data/looks";
import { P1 } from "./data/p1";
import { P2 } from "./data/p2";
import type { ATile } from "../fight/geometry";
import { GRID, at, fromSdk, toSdk } from "../fight/geometry";
import type { LocView } from "../fight/locs";
import { LocField } from "../fight/locs";
import { FightPlayer } from "../fight/units";
import { releasePhase1Actors, warmPhase1Actors, warmStartPhase } from "../fight/warmup";
import type { DrillConfig } from "../js/OcellusTimings";
import { OCELLUS_P4, fullFightConfig } from "../js/OcellusTimings";
import type { P4Entry, P4Watch } from "../js/p4/phase";
import { p4Phase } from "../js/p4/phase";
import { seed, tile } from "../../../sim/brands";
import type { Room } from "../../../sim/encounter";
import { identity, toRoom } from "../../../sim/frame";
import type { EncounterPlayerHooks } from "../../../sim/sdk/EncounterPlayer";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import { fence, seal } from "../../../sim/sdk/fence";
import { carriedEntry, drainedFall, phase4Opening } from "./fall";
import type { ChatLine, FullFightOptions, StartPhase } from "./options";
import type { P1Entry } from "./p1/types";
import type { P1Watch } from "./p1/sdk/phase";
import { p1Phase } from "./p1/sdk/phase";
import type { P2Watch } from "./p2/sdk/phase";
import { p2Phase } from "./p2/sdk/phase";
import type { P2Entry } from "./p2/types";
import type { P3Watch } from "./p3/sdk/phase";
import { p3Phase } from "./p3/sdk/phase";
import type { Fall, P3Entry } from "./p3/types";

const PHASE_4 = phase4Opening();

/** The body he spawns in for each start phase. Phase 1's hooded intro wears the phase 1 model. */
export const START_NPC: Readonly<Record<StartPhase, number>> = {
  1: NPC.p1,
  2: NPC.p2,
  3: NPC.p3,
  4: OCELLUS_P4.boss.npcId.value,
};

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3), 4: PHASE_4.spawn };

export type { FullFightOptions } from "./options";

type FullEntries = Readonly<{ p1: P1Entry; p2: P2Entry; p3: P3Entry; p4: P4Entry }>;
type FullPhases = Readonly<{
  p1: ReturnType<typeof p1Phase<FullEntries>>;
  p2: ReturnType<typeof p2Phase<FullEntries>>;
  p3: ReturnType<typeof p3Phase<FullEntries>>;
  p4: ReturnType<typeof p4Phase<FullEntries>>;
}>;

const OPEN_ROOM: FloorState = { key: "open", floor: fullRoom(), stones: [], censers: [], crumbling: [], destroyed: [] };

/**
 * What the run's phases share and outlive them: the floor and voids as the last phase left them,
 * the chat, and the fight clock's reading on each later phase's tick 0.
 */
class Run {
  floor: () => FloorState = () => OPEN_ROOM;
  voids: readonly LocView[] = [];
  readonly chat: ChatLine[] = [];
  p2From = 0;
  p3From = 0;
  p4From = 0;
  notify: () => void = () => undefined;

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
    mount(region: Region) {
      const scenery: Entity[] = [new ArenaFloor(region, () => run.floor()), new LocField(region, () => run.voids)];
      scenery.forEach((entity) => region.addEntity(entity));
      return {
        dispose: () => scenery.forEach((entity) => region.removeEntity(entity)),
        walkable: (tiles) => scenery.push(...fence(region, tiles), ...seal(region, tiles)),
      };
    },
  };
}

/** Phase 3's lingering voids, carried into phase 4. */
function voidsOf(fall: Fall): readonly LocView[] {
  return fall.voids.map(({ tile: on }) => ({ tile: on, models: VOID_LOC.bomb.models }));
}

function phasesOf(run: Run, p1: P1Watch, p2: P2Watch, p3: P3Watch, p4: P4Watch, p4Config: DrillConfig): FullPhases {
  return {
    p1: p1Phase<FullEntries>({
      settings: { practice: () => run.options.invincible, hazardTiles: () => run.options.hazardTiles, defenceDrained: () => run.options.defenceDrained },
      watch: p1,
      say: (line) => run.chat.push(line),
      hp: scaledHp(P1.hp, run.options.party),
      intoP2: (from) => {
        run.p2From = from;
        return { phase: "p2", entry: { kind: "followed" } };
      },
      changed: () => run.notify(),
    }),
    p2: p2Phase<FullEntries>({
      settings: { practice: () => run.options.invincible, hazardTiles: () => run.options.hazardTiles, skipMarkers: () => run.options.skipMarkers, defenceDrained: () => run.options.defenceDrained },
      watch: p2,
      say: (line) => run.chat.push(line),
      intoP3: (hp) => {
        run.p3From = run.p2From + P2.p3At;
        return { phase: "p3", entry: { kind: "carried", boss: { hp } } };
      },
    }),
    p3: p3Phase<FullEntries>({
      settings: { practice: () => run.options.invincible, soloVine: () => run.options.soloVine, hazardTiles: () => run.options.hazardTiles, defenceDrained: () => run.options.defenceDrained },
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

/** Which phase a fresh run opens on. Phase 4 opens on the third fall. */
function opened(start: StartPhase, config: DrillConfig, defenceDrained: boolean): { phase: "p1"; entry: P1Entry } | { phase: "p2"; entry: P2Entry } | { phase: "p3"; entry: P3Entry } | { phase: "p4"; entry: P4Entry } {
  switch (start) {
    case 1:
      return { phase: "p1", entry: { kind: "fresh" } };
    case 2:
      return { phase: "p2", entry: { kind: "opening" } };
    case 3:
      return { phase: "p3", entry: { kind: "fresh" } };
    case 4:
      return { phase: "p4", entry: carriedEntry(defenceDrained ? drainedFall(PHASE_4.fall) : PHASE_4.fall, config) };
    default: {
      const unhandled: never = start;
      return unhandled;
    }
  }
}

/** The reference video's tile markers, converted from region local tiles to arena offsets. */
const VIDEO_SQUARES: readonly (readonly [number, number])[] = [
  [-2, -2],
  [1, -2],
  [-2, 1],
  [1, 1],
  [-6, -6],
  [5, -6],
  [-6, 5],
  [5, 5],
];

export class FightRegion extends EncounterRegion<FullEntries, FullPhases> {
  readonly p1: P1Watch;
  readonly p2: P2Watch;
  readonly p3: P3Watch;
  readonly p4: P4Watch;
  readonly p4Config: DrillConfig;
  private readonly run: Run;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();
  private shownPhase: keyof FullEntries | null = null;

  constructor(options: FullFightOptions, private readonly dress: (player: Player) => void) {
    const run = new Run(options);
    const p1: P1Watch = { mounted: null };
    const p2: P2Watch = { mounted: null };
    const p3: P3Watch = { mounted: null };
    const p4: P4Watch = { invincible: options.invincible, mounted: null };
    const start = options.startPhase;
    const fightSeed = seed(options.seed);
    const config = fullFightConfig(fightSeed);
    if (start === 4) {
      run.floor = () => PHASE_4.floor;
      run.voids = voidsOf(PHASE_4.fall);
    }
    super({
      room: arenaRoom(start, run),
      phases: phasesOf(run, p1, p2, p3, p4, config),
      start: opened(start, config, options.defenceDrained),
      seed: fightSeed,
    });
    this.run = run;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
    this.p4 = p4;
    this.p4Config = config;
    run.notify = () => this.listeners.forEach((listener) => listener());
    if (options.videoMarkers) this.showVideoMarkers();
  }

  currentOptions(): FullFightOptions {
    return this.run.options;
  }

  /** The floor as the running phase lays it, and as the last one left it. */
  floorState(): FloorState {
    return this.run.floor();
  }

  chat(): readonly ChatLine[] {
    return this.run.chat;
  }

  /** The fight clock on a later phase's tick 0. Phase 1 starts at 0. */
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

  /** Region.reset writes default stats after construction, so the worn set goes on once that is done. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    this.dress(result.player);
    this.warmHeldGraphics();
    if (startWorld) {
      this.preloadHeldGraphics();
      this.world.startTicking();
    }
    this.listeners.forEach((listener) => listener());
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

  protected override createPlayer(atTile: Readonly<{ x: number; y: number }>, hooks: () => EncounterPlayerHooks): FightPlayer {
    return new FightPlayer(this, fromSdk(atTile), hooks);
  }

  /** The sidebar's practice toggle: it takes effect now, in the running fight, and in every restart. */
  setPractice(on: boolean): void {
    this.run.options = { ...this.run.options, invincible: on };
    this.p4.invincible = on;
  }

  /** The sidebar's phase 2 skip tiles, the same way. */
  setSkipMarkers(on: boolean): void {
    this.run.options = { ...this.run.options, skipMarkers: on };
    this.p2.mounted?.views.syncSkip();
  }

  /** Danger-tile highlights, on for this fight and for the fight a restart builds. */
  setHazardTiles(on: boolean): void {
    this.run.options = { ...this.run.options, hazardTiles: on };
  }

  /**
   * He only spawns when the fight starts, after the loading splash, so load his first body with the arena: otherwise
   * the splash clears onto an empty room and he downloads in front of the player. The start phase's graphics build
   * here too, rather than stalling its first attacks, and before the arena's own preload places any of them.
   */
  override async preload(): Promise<void> {
    const anchor = this.entities[0];
    const start = this.run.options.startPhase;
    this.warmHeldGraphics();
    const boss = anchor ? CacheRenderModel.forRenderable(anchor, CacheRenderReferences.npc(START_NPC[start])).preload() : Promise.resolve();
    if (anchor) await warmStartPhase(anchor, start);
    await Promise.all([super.preload(), boss]);
    this.releaseHeldGraphics();
  }

  private phase1Hosts() {
    const phase1 = this.run.options.startPhase === 1 ? this.p1.mounted : null;
    const player = this.players[0];
    if (!phase1 || !player || !CacheRender.isConfigured()) return null;
    return { boss: phase1.boss, player };
  }

  private warmHeldGraphics(): void {
    const hosts = this.phase1Hosts();
    if (hosts) warmPhase1Actors(hosts);
  }

  private releaseHeldGraphics(): void {
    const hosts = this.phase1Hosts();
    if (hosts) releasePhase1Actors(hosts);
  }

  private preloadHeldGraphics(): void {
    const hosts = this.phase1Hosts();
    if (!hosts) return;
    void Promise.all([hosts.boss.preload(), hosts.player.preload()]).finally(() => releasePhase1Actors(hosts));
  }

  /** A death in phase 1 ends the run here. Phases 2 and 3 end their own, and P4 ends its own. */
  override onGameOver(): void {
    if (this.current === "p1") this.p1.mounted?.script.lose();
    this.world.stopTicking();
  }

  onFightChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override postTick(): void {
    if (this.current === "p1" && this.players.some((player) => player.dying === 0)) this.p1.mounted?.script.lose();
    if (this.current === "p2" && this.players.some((player) => player.dying === 0)) this.p2.mounted?.script.lose();
    if (this.current === "p3" && this.players.some((player) => player.dying === 0)) this.p3.mounted?.script.lose();
    super.postTick();
    if (this.current !== this.shownPhase) {
      this.shownPhase = this.current;
      this.listeners.forEach((listener) => listener());
    }
    this.tickListeners.forEach((listener) => listener());
  }

  /** Called after every world tick's phase work, for a page that follows the fight clock. */
  onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  ticks(): number {
    const running = this.world;
    return running ? running.globalTickCounter : 0;
  }

  private showVideoMarkers(): void {
    for (const [x, z] of VIDEO_SQUARES) {
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        this.addEntity(new TileMarker(this, toSdk(at(x + dx, z + dz)), "#FFF100", 1, false));
      }
    }
  }
}

/** Phases 1, 2 and 3, then phase 4, in one region. */
export function fullFightStaged(options: FullFightOptions, dress: (player: Player) => void): FightRegion {
  return new FightRegion(options, dress);
}
