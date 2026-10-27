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
import { Phase2 } from "../fight/phase2";
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
import type { P3Watch } from "./p3/sdk/phase";
import { p3Phase } from "./p3/sdk/phase";
import type { Fall, P3Entry } from "./p3/types";

/** The body he spawns in for each start phase (phase 1's hooded intro wears the phase 1 model). */
export const START_NPC: Readonly<Record<StartPhase, number>> = { 1: NPC.p1, 2: NPC.p2, 3: NPC.p3 };

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3) };

/** His fight runs phases 1 and 2; phase 3 starts on the engine. */
export type PrefixStart = Exclude<StartPhase, 3>;
export type PrefixEntry = Readonly<{ kind: "fresh"; start: PrefixStart }>;
type FullEntries = Readonly<{ prefix: PrefixEntry; p3: P3Entry; p4: P4Entry }>;
type FullHost = EncounterHost<FullEntries>;
type FullPhases = Readonly<{
  prefix: Readonly<{ name: "prefix"; enter: typeof mountPrefix }>;
  p3: ReturnType<typeof p3Phase<FullEntries>>;
  p4: ReturnType<typeof p4Phase<FullEntries>>;
}>;

export type FullFightOptions = FightOptions;

const OPEN_ROOM: FloorState = { key: "open", floor: fullRoom(), stones: [], censers: [], crumbling: [], destroyed: [] };

/**
 * What the run's phases share and outlive them: his fight, the floor and voids as the last phase left them, phase 3's
 * chat, and the fight clock's reading on phase 3's and phase 4's tick 0.
 */
class Run {
  fight: Fight | null = null;
  floor: () => FloorState = () => this.fight?.floorState() ?? OPEN_ROOM;
  voids: readonly LocView[] = [];
  readonly chat: ChatLine[] = [];
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

function mountPrefix(host: FullHost, entry: PrefixEntry): Mounted<never> {
  const region = host.region;
  const player = host.player;
  if (!(region instanceof FightRegion) || !(player instanceof FightPlayer)) throw new Error("the hosted prefix runs on the full fight region and player");
  // Everything his fight adds is the prefix's, and leaves with it; the room and the player were here first.
  const before = new Set<unknown>([...region.entities, ...region.mobs, ...region.newMobs]);
  // His phase 2 begins phase 3 on its tick P2.p3At, and the director enters a phase on the tick after it is asked.
  let handOverAt: number | null = null;
  const makePhase = (n: StartPhase, fight: Fight): PhaseScript => {
    switch (n) {
      case 1:
        return new Phase1(fight);
      case 2:
        handOverAt = fight.tick + P2.p3At - 1;
        return new Phase2(fight);
      case 3:
        throw new Error("phase 3 runs on the engine: the prefix hands it over before his phase 2 enters it");
      default: {
        const unhandled: never = n;
        return unhandled;
      }
    }
  };
  const fight = new Fight(region, { ...region.currentOptions(), startPhase: entry.start }, player, makePhase);
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
    // Read his HP once the tick's hits are in, as his phase 3 read it at the start of the next.
    finishTick() {
      if (fight.tick !== handOverAt || fight.outcome.kind !== "running") return;
      region.handsOver(fight.tick + 1);
      host.next({ phase: "p3", entry: { kind: "carried", boss: { hp: fight.boss?.currentStats.hitpoint ?? fight.poolMax } } });
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

function phasesOf(run: Run, p3: P3Watch, p4: P4Watch, p4Config: DrillConfig): FullPhases {
  return {
    prefix: { name: "prefix", enter: mountPrefix },
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

export class FightRegion extends EncounterRegion<FullEntries, FullPhases> {
  readonly p3: P3Watch;
  readonly p4: P4Watch;
  private readonly run: Run;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();
  private shownPhase: keyof FullEntries | null = null;

  constructor(options: FullFightOptions, private readonly dress: (player: Player) => void) {
    const run = new Run(options);
    const p3: P3Watch = { mounted: null };
    const p4: P4Watch = { invincible: options.invincible, mounted: null };
    const start = options.startPhase;
    super({
      room: arenaRoom(start, run),
      phases: phasesOf(run, p3, p4, fullFightConfig(seed(options.seed))),
      start: start === 3 ? { phase: "p3", entry: { kind: "fresh" } } : { phase: "prefix", entry: { kind: "fresh", start } },
      seed: seed(options.seed),
    });
    this.run = run;
    this.p3 = p3;
    this.p4 = p4;
  }

  /** His fight through phase 2, and as it stood once it handed over; null when the run starts at phase 3. */
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

  /** His fight's lines, then phase 3's. */
  chat(): readonly ChatLine[] {
    return [...(this.run.fight?.chat ?? []), ...this.run.chat];
  }

  /** The fight clock on phase 3's tick 0 and on phase 4's: his fight's ticks before it, phase 3's after. */
  startOf(phase: "p3" | "p4"): number {
    return phase === "p3" ? this.run.p3From : this.run.p4From;
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

  /** The prefix hands over to phase 3, whose tick 0 is his fight's tick `from`. */
  handsOver(from: number): void {
    this.run.p3From = from;
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

  /** His fight ends phases 1 and 2 on a death. Phase 3 has already ended its run in postTick, and P4 ends its own. */
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
