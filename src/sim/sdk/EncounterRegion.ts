import { Region } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import { worldTick } from "../brands";
import type { Entries, Phases, Setup } from "../encounter";
import { Director } from "../director";
import type { EncounterPlayerHooks } from "./EncounterPlayer";
import { EncounterPlayer } from "./EncounterPlayer";

export class EncounterRegion<E extends Entries, Ph extends Phases<E>> extends Region {
  private readonly director: Director<E, Ph>;
  private player: EncounterPlayer | null = null;
  private scenery: Readonly<{ dispose(): void }> | null = null;

  constructor(private readonly setup: Setup<E, Ph>) {
    super();
    this.director = new Director(setup, () => this.worldTickNow());
  }

  override getName(): string {
    return "Encounter";
  }

  override get width(): number {
    return this.setup.room.size.width;
  }

  override get height(): number {
    return this.setup.room.size.height;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    this.setup.room.drawFloor(context, scale);
  }

  override initialiseRegion(): { player: Player } {
    this.scenery?.dispose();
    const spawn = this.setup.room.spawn;
    const player = new EncounterPlayer(this, { x: spawn.x, y: spawn.y }, () => this.playerHooks());
    this.player = player;
    this.scenery = this.setup.room.mount(this);
    this.addPlayer(player);
    return { player };
  }

  /** Unit constructors and Region.reset's setStats write SDK default stats, so phase entry is applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    this.director.ready();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    this.director.beforeNpcTurns();
  }

  override postTick(): void {
    this.director.postTick();
  }

  /** The director reads this from its constructor, before the caller assigns `world`. */
  private worldTickNow() {
    const running = this.world;
    return worldTick(running ? running.globalTickCounter : 0);
  }

  private playerHooks(): EncounterPlayerHooks {
    return {
      host: () => null,
      rules: () => this.director.rules(),
      hop: (to) => {
        const player = this.player;
        if (player === null) throw new Error("a hop was asked for before the player was built");
        player.hop(to);
      },
      canMelee: () => true,
    };
  }
}
