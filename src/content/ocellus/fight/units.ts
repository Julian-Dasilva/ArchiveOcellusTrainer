import { CacheRenderModel, CacheRenderReferences, EmptyModel, ImageLoader, Mob, Player, Random, RangedWeapon } from "osrs-sdk";
import type { IncomingAttackRoll, IncomingAttackRollModifiers, Location, Model, Projectile, Region, Unit, UnitBonuses, UnitStats } from "osrs-sdk";
import type { BossOverhead } from "../full/data/looks";
import { LOWEST_DEFENCE_FRACTION, NPC, PROTECT_MELEE_ICON, SEQ, SPOT } from "../full/data/looks";
import { P1 } from "../full/data/p1";
import { P2 } from "../full/data/p2";
import { P3 } from "../full/data/p3";
import type { ATile } from "./geometry";
import { fromSdk, toSdk } from "./geometry";
import type { SpriteFrame } from "../js/OcellusTimings";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { PHASE_RANGED_DEFENCE, ammunitionAgainst } from "./blowpipe";
import { spriteFile } from "../../../servedAssets";
import { tile } from "../../../sim/brands";
import { EncounterPlayer } from "../../../sim/sdk/EncounterPlayer";
import type { EncounterPlayerHooks } from "../../../sim/sdk/EncounterPlayer";

export type Style = "melee" | "ranged" | "magic";
export type Form = "hooded" | "p1" | "blade" | "p3";

/** What a boss form asks of the fight that owns it. */
export interface BossHooks {
  /** Whether the SDK may run its own death (only the last kill). */
  allowsDeath(): boolean;
  /** Called after each tick's incoming hits, for HP floors and kill checks. */
  afterHits(boss: BossForm): void;
  /** A player hit is arriving; false makes it deal nothing (his deflects). */
  acceptsAttack(boss: BossForm, style: Style): boolean;
  /** Scales accepted player hits (phase 4 halves them while the explosions run). */
  incomingDamageFactor(): number;
}

export function styleOf(attackStyle: string): Style | null {
  switch (attackStyle) {
    case "stab":
    case "slash":
    case "crush":
      return "melee";
    case "range":
      return "ranged";
    case "magic":
      return "magic";
    default:
      return null;
  }
}

const FORM: Readonly<Record<Form, Readonly<{ npc: number; name: string; level: number; idle: number; walk: number | null }>>> = {
  // The intro NPC is on screen for one tick before he becomes phase 1; his phase 1 body stands in for it, which saves
  // shipping a second 13 MB copy of the same hooded model.
  hooded: { npc: NPC.p1, name: "Hooded Figure", level: 0, idle: SEQ.p1Idle, walk: SEQ.p1Walk },
  p1: { npc: NPC.p1, name: "Ocellus", level: P1.combatLevel, idle: SEQ.p1Idle, walk: SEQ.p1Walk },
  blade: { npc: NPC.p2, name: "The Blade", level: P3.combatLevel, idle: SEQ.p2Idle, walk: null },
  p3: { npc: NPC.p3, name: "Ocellus", level: P3.combatLevel, idle: SEQ.p3Idle, walk: SEQ.p3Walk },
};

/** Placeholder stats for the SDK's constructor-time read; each unit sets its real ones right after. */
function seedStats(unit: Mob): void {
  if (unit.stats !== undefined) return;
  unit.stats = { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: 1 };
  unit.currentStats = { ...unit.stats };
}

/** Current stats whose Defence can't be drained below `lowest` (special attacks set it directly). */
function withDefenceFloor(stats: UnitStats, lowest: number): UnitStats {
  let defence = Math.max(lowest, stats.defence);
  return {
    ...stats,
    get defence() {
      return defence;
    },
    set defence(value: number) {
      defence = Math.max(lowest, value);
    },
  };
}

const { overheadIcons, overheadIconBelowHpBar } = OCELLUS_P4.presentation;
const OVERHEAD_SPRITE: Readonly<Record<BossOverhead, SpriteFrame>> = {
  "protect-melee": PROTECT_MELEE_ICON,
  "deflect-melee": overheadIcons["deflect-melee"].value,
  "deflect-range": overheadIcons["deflect-range"].value,
  "soul-split": overheadIcons["soul-split"].value,
};
const overheadImages = new Map<BossOverhead, HTMLImageElement>();

/** The cache head icon, once it has loaded: a failed or pending load draws nothing rather than throwing. */
function overheadIcon(kind: BossOverhead): HTMLImageElement | null {
  let image = overheadImages.get(kind);
  if (!image) {
    image = ImageLoader.createImage(`osrs-assets/${spriteFile(OVERHEAD_SPRITE[kind])}`);
    overheadImages.set(kind, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** One of Ocellus's bodies. The fight script moves and animates it; it never acts on its own. */
export class BossForm extends Mob {
  overhead: BossOverhead | null = null;
  hidden = false;
  attackable = true;
  pose: number | null = null;
  private stepsThisTick = 0;
  private shape: Form;

  constructor(region: Region, sw: ATile, form: Form, private readonly hooks: BossHooks, maxHp: number) {
    super(region, toSdk(sw));
    this.shape = form;
    this.stats = { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: maxHp };
    this.currentStats = { ...this.stats };
    this.applyForm();
  }

  get form(): Form {
    return this.shape;
  }

  /** The hood comes off onto phase 1. Hitpoints stay; defence and the name follow the new form. */
  become(next: Form): void {
    this.shape = next;
    this.applyForm();
  }

  private applyForm(): void {
    switch (this.form) {
      case "hooded":
        this.stats = { ...this.stats, defence: 1 };
        break;
      case "p1":
        this.stats = { ...this.stats, attack: 1, strength: 1, defence: P1.defence, range: 250, magic: 350 };
        break;
      case "blade":
        this.stats = { ...this.stats, defence: P2.bladeDefence, magic: 220 };
        break;
      case "p3":
        this.stats = { ...this.stats, attack: 325, strength: 250, defence: P3.defence, range: 300, magic: 300 };
        break;
      default: {
        const unhandled: never = this.form;
        return unhandled;
      }
    }
    // The hotfix's floor is Ocellus's own; The Blade can be drained to 0. [W] Out Today news
    const lowest = this.form === "p1" || this.form === "p3" ? Math.ceil(this.stats.defence * LOWEST_DEFENCE_FRACTION) : 0;
    this.currentStats = withDefenceFloor({ ...this.stats, hitpoint: this.currentStats.hitpoint }, lowest);
  }

  override setStats(): void {
    // The SDK calls this from Unit's constructor (before our fields exist) and again from Region.reset; the fight
    // owns these stats, so only fill a placeholder the first time.
    seedStats(this);
  }

  override mobName(): string {
    return FORM[this.form].name;
  }

  override get combatLevel(): number {
    return FORM[this.form].level;
  }

  override get size(): number {
    return 3;
  }

  get tile(): ATile {
    return fromSdk(this.location);
  }

  override get bonuses(): UnitBonuses {
    const defence = this.form === "p1" ? P1.defenceBonuses : this.form === "blade" ? P2.bladeDefenceBonuses : P3.defenceBonuses;
    const form = this.form;
    const ammunition = ammunitionAgainst(this.region.players[0]?.equipment.weapon?.cacheItemId);
    const range = form === "p1" ? PHASE_RANGED_DEFENCE.p1[ammunition] : form === "blade" ? PHASE_RANGED_DEFENCE.blade[ammunition] : defence.range;
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { ...defence, range },
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
    };
  }

  override create3dModel(): Model {
    const spotAnims = this.form === "blade" ? [{ id: SPOT.swordIdle, channel: "blade" }] : undefined;
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(FORM[this.form].npc, spotAnims));
  }

  override visible(): boolean {
    return !this.hidden && super.visible();
  }

  override canBeAttacked(): boolean {
    return this.attackable && !this.hidden && this.form !== "hooded";
  }

  override get idlePoseId(): number {
    return this.pose ?? FORM[this.form].idle;
  }

  override get walkingPoseId(): number | null {
    return FORM[this.form].walk;
  }

  override movementStep(): void {
    if (this.stepsThisTick === 0 && this.visualPath.length === 0) this.visualMovementActive = false;
    this.stepsThisTick = 0;
  }

  override attackIfPossible(): void {}

  /** One walking step (the script decides where). */
  stepTo(sw: ATile): void {
    const next = toSdk(sw);
    this.lastRotation = this.angleTo(next);
    this.location = { x: next.x, y: next.y };
    this.visualPath.push({ x: next.x, y: next.y, run: false });
    this.visualMovementActive = true;
    this.stepsThisTick++;
    this.region.refreshUnitChunk(this);
  }

  teleport(sw: ATile): void {
    this.setLocation(toSdk(sw));
  }

  face(target: Unit | null): void {
    this.setAggro(target);
  }

  faceTile(tile: ATile): void {
    this.setAggro(null);
    const target = toSdk(tile);
    const rotation = this.angleTo(target);
    this.lastRotation = rotation;
  }

  private angleTo(target: Location): number {
    const fromX = this.location.x + this.size / 2;
    const fromY = this.location.y - this.size / 2;
    const toX = target.x + 0.5;
    const toY = target.y - 0.5;
    return -Math.atan2(toY - fromY, toX - fromX) - Math.PI / 2;
  }

  override detectDeath(): void {
    if (this.hooks.allowsDeath()) super.detectDeath();
  }

  override postAttacksEvent(): void {
    super.postAttacksEvent();
    this.hooks.afterHits(this);
  }

  override drawOverheadPrayers(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    const icon = this.overhead && overheadIcon(this.overhead);
    if (icon) context.drawImage(icon, -scale / 2, overheadIconBelowHpBar.value, scale, scale);
  }

  override addProjectile(projectile: Projectile): void {
    const style = styleOf(projectile.attackStyle);
    if (projectile.from !== this && style !== null) {
      if (!this.hooks.acceptsAttack(this, style)) projectile.damage = 0;
      else if (projectile.damage > 0) projectile.damage = Math.floor(projectile.damage * this.hooks.incomingDamageFactor());
    }
    super.addProjectile(projectile);
  }
}

export type AddKind = "vine" | "rift-basic" | "rift-heal" | "rift-buff";

/** [W] Void Vine, Void Rift, Void Siphon and Void Augmenter infoboxes (2026-10-22): stab/slash/crush defence. */
const ADD: Readonly<Record<AddKind, Readonly<{ npc: number; name: string; level: number; meleeDefence: number }>>> = {
  vine: { npc: NPC.vine, name: "Void Vine", level: 0, meleeDefence: 0 },
  "rift-basic": { npc: NPC.riftBasic, name: "Void Rift", level: 138, meleeDefence: 0 },
  "rift-heal": { npc: NPC.riftHeal, name: "Void Siphon", level: 138, meleeDefence: 50 },
  "rift-buff": { npc: NPC.riftBuff, name: "Void Augmenter", level: 138, meleeDefence: 0 },
};

/** Phase 3 and 4's small targets: the Void Vine and the three kinds of rift. 44 HP each. */
export class VoidAdd extends Mob {
  killed = false;
  /** Solo players may attack their own vine only when the sidebar allows it (in a team only teammates can). */
  attackable = true;
  /** Phase 4's rifts: standard ranged attacks always max hit them. */
  rangedAlwaysMaxHits = false;

  constructor(region: Region, tile: ATile, readonly kind: AddKind, private readonly onKilled: (add: VoidAdd) => void) {
    super(region, toSdk(tile));
    this.stats = { attack: 1, strength: 1, defence: kind === "vine" ? 1 : 175, range: 1, magic: 300, hitpoint: P3.riftHp };
    this.currentStats = { ...this.stats };
  }

  override setStats(): void {
    seedStats(this);
  }

  override mobName(): string {
    return ADD[this.kind].name;
  }

  override get combatLevel(): number {
    return ADD[this.kind].level;
  }

  override get size(): number {
    return 1;
  }

  get tile(): ATile {
    return fromSdk(this.location);
  }

  override get bonuses(): UnitBonuses {
    const melee = ADD[this.kind].meleeDefence;
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { stab: melee, slash: melee, crush: melee, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
    };
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(ADD[this.kind].npc));
  }

  override movementStep(): void {}

  override attackIfPossible(): void {}

  override canBeAttacked(): boolean {
    return this.attackable && !this.killed;
  }

  /**
   * Phase 4's void crystals: every standard ranged attack hits for its max, so they die in one shot. Specials and other
   * styles roll as usual. [W] Ocellus; [K]: all 4 hits on phase 4 rifts were their full 44, against 34 of 89 in phase 3.
   */
  override incomingAttackRollModifiers(attack: IncomingAttackRoll): IncomingAttackRollModifiers {
    const special = attack.attacker instanceof Player && attack.attacker.useSpecialAttack;
    if (this.rangedAlwaysMaxHits && attack.weapon instanceof RangedWeapon && !special) return { guaranteedHit: true, maxDamage: true };
    return super.incomingAttackRollModifiers(attack);
  }

  override dead(): void {
    if (!this.killed) {
      this.killed = true;
      this.onKilled(this);
    }
    super.dead();
  }

  remove(): void {
    this.killed = true;
    this.dying = 0;
  }
}

/** An invisible launcher: phase 2's portals fire from pairs of these, as the game's tfa_invisible_npc_2x2 do. */
export class Emitter extends Mob {
  constructor(region: Region, tile: ATile) {
    super(region, toSdk(tile));
    this.stats = { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: 1 };
    this.currentStats = { ...this.stats };
  }

  override setStats(): void {
    seedStats(this);
  }

  override mobName(): string {
    return "";
  }

  override get size(): number {
    return 1;
  }

  override visible(): boolean {
    return false;
  }

  override canBeAttacked(): boolean {
    return false;
  }

  override get consumesSpace(): boolean {
    return false;
  }

  override create3dModel(): Model {
    return EmptyModel.forRenderable(this);
  }

  override movementStep(): void {}

  override attackIfPossible(): void {}

  override detectDeath(): void {}
}

/** The full fight's player. Arena tiles stay in the fight's frame. The engine player keeps room tiles. */
export class FightPlayer extends EncounterPlayer {
  constructor(region: Region, at: ATile, hooks: () => EncounterPlayerHooks) {
    super(region, toSdk(at), hooks);
  }

  arenaTile(): ATile {
    return fromSdk(this.location);
  }

  /** A walk ordered by the fight itself, past the walk interception. */
  walkTo(at: ATile): void {
    const s = toSdk(at);
    this.walkDirect(tile(s.x, s.y));
  }

  /** A forced hop (stepping stones, the safe portal): land on the tile, drop any walk. A room tile still lands as the engine asked. */
  override hop(at: ATile): void;
  override hop(to: Readonly<{ x: number; y: number }>): void;
  override hop(to: ATile | Readonly<{ x: number; y: number }>): void {
    if ("z" in to) {
      const s = toSdk(to);
      super.hop({ x: s.x, y: s.y });
      return;
    }
    super.hop(to);
  }
}

export { Random };
