import { Projectile } from "osrs-sdk";
import type { Region, Unit } from "osrs-sdk";
import type { ATile } from "../../../fight/geometry";
import type { BossHooks } from "../../../fight/units";
import { BossForm } from "../../../fight/units";

/** A heal splat queued during the open. setDelay 1 lands before that tick ends. */
class Heal extends Projectile {
  constructor(from: Unit, to: Unit, private readonly amount: number) {
    super(null, 0, from, to, "typeless", { setDelay: 1, visuals: { hidden: true } });
  }

  override beforeHit(): void {
    super.beforeHit();
    this.damage = -this.amount;
  }
}

/** Puts a heal splat on `to`. The hitpoints move when it lands. */
export function queueHeal(from: Unit, to: Unit, amount: number): void {
  if (amount <= 0) return;
  to.addProjectile(new Heal(from, to, amount));
}

/**
 * His phase 1 body. He starts hooded and hidden: the fight shows him on its first tick, and the hood
 * comes off a tick later. His turn is the binding's NPC turn.
 */
export class P1Boss extends BossForm {
  constructor(region: Region, sw: ATile, hooks: BossHooks, maxHp: number, private readonly turn: (actor: Unit, resolve: () => void) => void) {
    super(region, sw, "hooded", hooks, maxHp);
    this.hidden = true;
    this.attackable = false;
  }

  override queueStep(): void {
    this.turn(this, () => super.queueStep());
  }

  heal(amount: number): void {
    queueHeal(this, this, amount);
  }
}
