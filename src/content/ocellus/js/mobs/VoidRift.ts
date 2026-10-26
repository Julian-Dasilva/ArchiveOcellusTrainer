import { CacheRenderModel, CacheRenderReferences, MeleeWeapon, Mob, RangedWeapon } from "osrs-sdk";
import type { IncomingAttackRoll, IncomingAttackRollModifiers, Model, Region, UnitBonuses } from "osrs-sdk";
import type { StandardRiftRoll } from "../OcellusTimings";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { TickSpan, Tile } from "../../../../sim/brands";
import { span } from "../../../../sim/brands";

const RIFT = OCELLUS_P4.rifts;
export type RiftRules = Readonly<{ chargeAfterSpawn: TickSpan; standardRangedAndMeleeRoll: StandardRiftRoll }>;
/** Unit.drawHPBar draws the HP bar 5 px tall. */
const HP_BAR_HEIGHT = 5;

export class VoidRift extends Mob {
  private detonated = false;
  private charged: TickSpan = span(0);

  constructor(region: Region, at: Tile, private readonly rules: RiftRules) {
    super(region, { x: at.x, y: at.y });
    this.playAnimation(RIFT.poses.spawn.value);
  }

  charge(charged: TickSpan): void {
    this.charged = charged;
  }

  /** Unit's constructor calls setStats before subclass fields exist, so the stats come from module data. */
  override setStats(): void {
    this.stats = { ...RIFT.stats.value };
    this.currentStats = { ...RIFT.stats.value };
  }

  override mobName(): string {
    return RIFT.name.value;
  }

  override get combatLevel(): number {
    return RIFT.combatLevel.value;
  }

  override get size(): number {
    return RIFT.size.value;
  }

  override get bonuses(): UnitBonuses {
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: RIFT.defenceBonuses.value,
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
    };
  }

  override get idlePoseId(): number {
    return RIFT.poses.idle.value;
  }

  override get walkingPoseId(): number {
    return RIFT.poses.idle.value;
  }

  override get deathAnimationId(): number | null {
    return this.detonated ? null : RIFT.poses.despawn.value;
  }

  override drawHPBar(context: OffscreenCanvasRenderingContext2D, scale: number, verticalOffset = -(this.size / 2) * scale): void {
    super.drawHPBar(context, scale, verticalOffset);
    const { background, fill } = RIFT.timerBar.value;
    const width = this.healthBarWidth;
    const top = verticalOffset + HP_BAR_HEIGHT;
    context.fillStyle = background;
    context.fillRect(-width / 2, top, width, HP_BAR_HEIGHT);
    context.fillStyle = fill;
    context.fillRect(-width / 2, top, (this.charged / this.rules.chargeAfterSpawn) * width, HP_BAR_HEIGHT);
  }

  override incomingAttackRollModifiers(attack: IncomingAttackRoll): IncomingAttackRollModifiers {
    const roll = this.rules.standardRangedAndMeleeRoll;
    const rangedOrMelee = attack.weapon instanceof RangedWeapon || attack.weapon instanceof MeleeWeapon;
    return roll !== "as-any-target" && rangedOrMelee && attack.bonuses.isSpecialAttack !== true ? { ...roll } : super.incomingAttackRollModifiers(attack);
  }

  override movementStep(): void {}

  override attackIfPossible(): void {}

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(RIFT.npcId.value));
  }

  /** Unit.dead() starts a death sequence a tick after the death, so the detonation plays here on the burst tick and dead() plays none. */
  detonate(): void {
    this.detonated = true;
    this.dead();
    this.playAnimation(RIFT.poses.detonate.value);
  }
}
