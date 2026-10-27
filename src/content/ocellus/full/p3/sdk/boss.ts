import { Projectile } from "osrs-sdk";
import type { Location, Location3, Region, Unit } from "osrs-sdk";
import type { ATile } from "../../../fight/geometry";
import { toSdk } from "../../../fight/geometry";
import type { BossHooks } from "../../../fight/units";
import { BossForm } from "../../../fight/units";

/** How high his leap peaks, in tiles, between the corner he leaves and the one he lands on. */
const LEAP_HEIGHT = 1.5;

type Leap = Readonly<{ from: Location; startTick: number; over: number }>;

class Heal extends Projectile {
  constructor(boss: Unit, private readonly amount: number) {
    super(null, 0, boss, boss, "typeless", { setDelay: 1, visuals: { hidden: true } });
  }

  override beforeHit(): void {
    super.beforeHit();
    this.damage = -this.amount;
  }
}

/**
 * His phase 3 body on the engine. His turn is the binding's NPC turn, and a corner jump moves him at once for the
 * fight while he is drawn leaping there over the jump's ticks, in place of his port's teleport. The leap aims at where
 * the SDK draws him each frame, so a step he takes on landing carries on from the leap without a jump.
 */
export class P3Boss extends BossForm {
  private leap: Leap | null = null;

  constructor(region: Region, sw: ATile, hooks: BossHooks, maxHp: number, private readonly turn: (actor: Unit, resolve: () => void) => void) {
    super(region, sw, "p3", hooks, maxHp);
  }

  override queueStep(): void {
    this.turn(this, () => super.queueStep());
  }

  jump(sw: ATile, over: number): void {
    const from = { ...this.location };
    const to = toSdk(sw);
    this.lastRotation = -Math.atan2(from.y - to.y, to.x - from.x) - Math.PI / 2;
    this.setLocation(to);
    this.leap = { from, startTick: this.region.world?.globalTickCounter ?? 0, over };
  }

  heal(amount: number): void {
    this.addProjectile(new Heal(this, amount));
  }

  override getPerceivedLocation(tickPercent: number): Location3 {
    const drawn = super.getPerceivedLocation(tickPercent);
    const leap = this.leap;
    if (leap === null) return drawn;
    const ticks = (this.region.world?.globalTickCounter ?? leap.startTick) - leap.startTick;
    const progress = Math.min(1, Math.max(0, (ticks + tickPercent) / leap.over));
    if (progress >= 1) {
      this.leap = null;
      return drawn;
    }
    return {
      x: leap.from.x + (drawn.x - leap.from.x) * progress,
      y: leap.from.y + (drawn.y - leap.from.y) * progress,
      z: drawn.z + 4 * LEAP_HEIGHT * progress * (1 - progress),
    };
  }
}
