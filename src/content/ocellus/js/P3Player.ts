import type { MovePace } from "osrs-sdk";
import { OcellusPlayer } from "./OcellusPlayer";
import { VoidVine } from "./mobs/VoidVine";
import { tile } from "../../../sim/brands";
import type { Tile } from "../../../sim/brands";
import type { Crossing } from "./p3/arena";
import { crossingRoute } from "./p3/arena";

type Crossed = Readonly<{ kind: "walking" }> | Readonly<{ kind: "to-bank"; route: Crossing }> | Readonly<{ kind: "hopping"; hops: readonly Tile[] }>;

/** The vine roots the player on its own tile, and the SDK, like the game, sees nothing on the tile it stands on; solo, the player cuts their own vine from there. */
export class P3Player extends OcellusPlayer {
  private crossed: Crossed = { kind: "walking" };

  override setHasLOS(): void {
    super.setHasLOS();
    const target = this.aggro;
    if (!this.hasLOS && target instanceof VoidVine && target.location.x === this.location.x && target.location.y === this.location.y) this.hasLOS = true;
  }

  override moveTo(x: number, y: number, pace?: MovePace): void {
    if (this.crossed.kind === "hopping") return;
    const route = crossingRoute(tile(this.location.x, this.location.y), tile(x, y));
    this.crossed = route ? { kind: "to-bank", route } : { kind: "walking" };
    const to = route ? route.bank : { x, y };
    super.moveTo(to.x, to.y, pace);
  }

  override movementStep(): void {
    const crossed = this.crossed;
    if (crossed.kind === "to-bank" && this.location.x === crossed.route.bank.x && this.location.y === crossed.route.bank.y) this.crossed = { kind: "hopping", hops: crossed.route.hops };
    if (this.crossed.kind !== "hopping" || this.isFrozen()) return super.movementStep();
    const [next, ...rest] = this.crossed.hops;
    this.crossed = rest.length > 0 ? { kind: "hopping", hops: rest } : { kind: "walking" };
    this.setLocation({ x: next.x, y: next.y });
    this.destinationLocation = { x: next.x, y: next.y };
    super.movementStep();
  }
}
