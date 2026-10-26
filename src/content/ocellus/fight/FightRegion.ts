import { CacheRenderModel, CacheRenderReferences, CardinalDirection, CollisionType, Entity, LineOfSightMask, Region } from "osrs-sdk";
import type { Model, Player } from "osrs-sdk";
import { EmptyModel } from "osrs-sdk";
import { ArenaFloor } from "./arena";
import { NPC } from "./data";
import { warmStartPhase } from "./warmup";
import { TileMarks, VoidFloor } from "./effects";
import type { FightOptions, PhaseScript, StartPhase } from "./Fight";
import { Fight } from "./Fight";
import type { ATile } from "./geometry";
import { GRID, at } from "./geometry";
import { Phase1 } from "./phase1";
import { Phase2 } from "./phase2";
import { Phase3 } from "./phase3";
import { FightPlayer } from "./units";

/** Steps the fight at the very start of each game tick, before NPCs act, as the server's scripts do. */
class FightClock extends Entity {
  constructor(region: Region, private readonly fight: Fight) {
    super(region, { x: 0, y: 0 });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get size(): number {
    return 1;
  }

  override tick(): void {
    if (this.region.world.getReadyTimer > 0) return;
    if (!this.fight.started) this.fight.start();
    else this.fight.step();
  }

  override draw(): void {}

  protected override create3dModel(): Model {
    return EmptyModel.forRenderable(this);
  }
}

/** The body he spawns in for each start phase (phase 1's hooded intro wears the phase 1 model). */
export const START_NPC: Readonly<Record<StartPhase, number>> = { 1: NPC.p1, 2: NPC.p2, 3: NPC.p3 };

const SPAWN: Readonly<Record<StartPhase, ATile>> = { 1: at(0, -9), 2: at(5, -3), 3: at(5, -3) };

export function makePhase(n: StartPhase, fight: Fight): PhaseScript {
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

export class FightRegion extends Region {
  fight: Fight | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private options: FightOptions, private readonly dressPlayer: (player: Player) => void) {
    super();
  }

  override getName(): string {
    return "Ocellus";
  }

  /** You walk in from the south, facing him. */
  override get initialFacing(): CardinalDirection {
    return CardinalDirection.NORTH;
  }

  override get width(): number {
    return GRID;
  }

  override get height(): number {
    return GRID;
  }

  override drawDefaultFloor(): boolean {
    return false;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    context.fillStyle = "#07060b";
    context.fillRect(0, 0, GRID * scale, GRID * scale);
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

  initialiseRegion(): { player: Player } {
    const player = new FightPlayer(this, SPAWN[this.options.startPhase]);
    this.dressPlayer(player);
    const fight = new Fight(this, this.options, player, makePhase);
    this.fight = fight;
    this.addEntity(new ArenaFloor(this, () => fight.floorState()));
    this.addEntity(new VoidFloor(this, () => fight.voidTiles()));
    this.addEntity(new TileMarks(this, () => fight.marks()));
    this.addEntity(new FightClock(this, fight));
    this.addPlayer(player);
    this.listeners.forEach((listener) => listener());
    return { player };
  }

  /**
   * He only spawns when the fight starts, after the loading splash, so load his first body with the arena: otherwise
   * the splash clears onto an empty room and he downloads in front of the player. The start phase's floor effects
   * build here too, rather than stalling its first attacks.
   */
  override async preload(): Promise<void> {
    const anchor = this.entities[0];
    const boss = anchor
      ? CacheRenderModel.forRenderable(anchor, CacheRenderReferences.npc(START_NPC[this.options.startPhase])).preload()
      : Promise.resolve();
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
