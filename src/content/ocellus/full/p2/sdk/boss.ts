import type { Region, Unit } from "osrs-sdk";
import type { ATile } from "../../../fight/geometry";
import type { BossHooks } from "../../../fight/units";
import { BossForm } from "../../../fight/units";

/** His phase 2 body. His turn is the binding's NPC turn. He does not move. */
export class P2Boss extends BossForm {
  constructor(region: Region, sw: ATile, hooks: BossHooks, maxHp: number, private readonly turn: (actor: Unit, resolve: () => void) => void) {
    super(region, sw, "blade", hooks, maxHp);
  }

  override queueStep(): void {
    this.turn(this, () => super.queueStep());
  }
}
