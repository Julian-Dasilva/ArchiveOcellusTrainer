import { Collision, MagicWeapon, MeleeWeapon, Player } from "osrs-sdk";
import type { MovePace, Unit } from "osrs-sdk";
import type { Style } from "../combat";
import { tile } from "../brands";
import type { Tile } from "../brands";
import type { AttackTarget, Rules, Walk } from "../encounter";
import { protectionOf } from "./EncounterBinding";

export type PlayerInput =
  | Readonly<{ kind: "walk-ordered"; destination: Tile; pace: MovePace }>
  | Readonly<{ kind: "prayer-published"; prayer: Style | null }>;

export type PlayerHost = Readonly<{
  input(observed: PlayerInput): void;
  playerHitsSettled(): void;
  playerMovement(resolve: () => void): void;
  combat(step: () => void): void;
}>;

export interface EncounterPlayerHooks {
  /** Null while the mounted phase has no binding. */
  host(): PlayerHost | null;
  rules(): Rules<AttackTarget>;
  hop(to: Readonly<{ x: number; y: number }>): void;
  canMelee(target: Unit): boolean;
}

function lastTile(tiles: readonly [Tile, ...Tile[]]): Tile {
  let last = tiles[0];
  for (const at of tiles) last = at;
  return last;
}

function wieldedStyle(weapon: Player["equipment"]["weapon"]): Style {
  if (weapon === undefined || weapon instanceof MeleeWeapon) return "melee";
  if (weapon instanceof MagicWeapon) return "magic";
  return "ranged";
}

export class EncounterPlayer extends Player {
  constructor(region: ConstructorParameters<typeof Player>[0], location: ConstructorParameters<typeof Player>[1], private readonly hooks: () => EncounterPlayerHooks) {
    super(region, location);
  }

  tile(): Tile {
    return tile(this.location.x, this.location.y);
  }

  protection(): Style | null {
    return protectionOf(this);
  }

  observe(): Readonly<{ tile: Tile; hp: number; prayer: Style | null }> {
    return { tile: this.tile(), hp: this.currentStats.hitpoint, prayer: this.protection() };
  }

  weaponStyle(): Style {
    return wieldedStyle(this.equipment.weapon);
  }

  hop(to: Readonly<{ x: number; y: number }>): void {
    this.setLocation({ x: to.x, y: to.y });
    this.destinationLocation = undefined;
  }

  /** A walk the phase orders itself, past `rules.walk`. */
  walkDirect(to: Tile): void {
    super.moveTo(to.x, to.y);
  }

  override moveTo(x: number, y: number, pace: MovePace = "run-setting"): void {
    const decision = this.hooks().rules().walk(tile(x, y));
    this.applyWalk(decision, x, y, pace);
    this.hooks().host()?.input({ kind: "walk-ordered", destination: tile(x, y), pace });
  }

  /** The SDK redirects a blocked tile only when it is ordered, and a walk stops dead when its tile becomes blocked later. */
  override determineDestination(): void {
    super.determineDestination();
    const to = this.destinationLocation;
    if (to && Collision.collideableEntitiesAtPoint(this.region, to.x, to.y, 1).length > 0) super.moveTo(to.x, to.y, this.pace);
  }

  override pretick(): void {
    const before = protectionOf(this);
    super.pretick();
    const after = protectionOf(this);
    if (after !== before) this.hooks().host()?.input({ kind: "prayer-published", prayer: after });
  }

  override postAttacksEvent(): void {
    super.postAttacksEvent();
    this.hooks().host()?.playerHitsSettled();
  }

  override movementStep(): void {
    const host = this.hooks().host();
    if (host) host.playerMovement(() => super.movementStep());
    else super.movementStep();
  }

  override attack(): boolean {
    const target = this.aggro;
    const swingsMelee = !this.manualSpellCastSelection && this.equipment.weapon?.isMeleeAttack === true;
    if (target && swingsMelee && !this.hooks().canMelee(target)) return false;
    if (target && !this.hooks().rules().canAttack(target, this.weaponStyle())) return false;
    return super.attack();
  }

  override attackStep(): void {
    const host = this.hooks().host();
    if (host) host.combat(() => super.attackStep());
    else super.attackStep();
  }

  override setHasLOS(): void {
    const target = this.aggro;
    if (!target) {
      this.hasLOS = false;
      return;
    }
    const sight = this.hooks().rules().lineOfSight(target);
    switch (sight) {
      case "granted":
        this.hasLOS = true;
        return;
      case "sdk":
        super.setHasLOS();
        return;
      default: {
        const unhandled: never = sight;
        return unhandled;
      }
    }
  }

  private applyWalk(decision: Walk, x: number, y: number, pace: MovePace): void {
    switch (decision.kind) {
      case "sdk":
        super.moveTo(x, y, pace);
        return;
      case "hop":
        this.hooks().hop(lastTile(decision.tiles));
        return;
      case "handled":
        this.interruptCombat();
        return;
      default: {
        const unhandled: never = decision;
        return unhandled;
      }
    }
  }
}
