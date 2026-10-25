import { CacheRenderModel, CacheRenderReferences, Mob } from "osrs-sdk";
import type { Model, Projectile, Region, UnitBonuses } from "osrs-sdk";
import { spriteFile } from "../../../../assets";
import type { P1Config } from "../OcellusTimings";
import { OCELLUS_P1, OCELLUS_P4 } from "../OcellusTimings";
import type { OcellusPlayer } from "../OcellusPlayer";
import { withDefenceFloor } from "../bossStats";
import type { Tick, Tile } from "../../../../sim/brands";
import { after, span, tick } from "../../../../sim/brands";
import type { FrameOf, Heal, HitRequest, Hooks, IncomingHit, Judgement, Landed, Logged } from "../../../../sim/sdk/EncounterBinding";
import { EncounterBinding } from "../../../../sim/sdk/EncounterBinding";
import type { HitJudgement, P1End, P1Event, P1Hit, P1Phase, P1Row, P1RunState } from "../P1Types";
import type { InputObservation, PlayerObservation } from "../P4Types";
import { drawHealSplats } from "../entities/P4Views";
import { TonalzticsOfRalos } from "../gear/OcellusGear";
import type { P1Fight, TurnOutput } from "../p1/fight";
import { landed, momentAt, startFight, turn } from "../p1/fight";

type BossStep = Readonly<{ player: PlayerObservation; bossHp: number }>;
type P1Run = Readonly<{ input: InputObservation; event: P1Event; cause: P1Hit; snapshot: BossStep; row: P1Row; end: P1End }>;

const { boss, crackBlock, presentation } = OCELLUS_P1;
const { ammunition } = OCELLUS_P4.gear;
/** The SDK keeps a delay-1 hitsplat drawn for the tick it lands and the next. */
const HEAL_SPLAT_TICKS = span(1);
const HP_BAR_HEIGHT = 5;

let protectMeleeIcon: HTMLImageElement | null = null;

function judgement(phaseAtLanding: P1Phase, phaseAtLaunch: P1Phase, hit: IncomingHit): HitJudgement {
  if (phaseAtLanding.boss !== "present-damageable") return "invulnerable";
  return hit.style === "melee" && phaseAtLaunch.overhead === "protect-melee" ? "blocked" : "passed";
}

export class OcellusP1 extends Mob {
  readonly binding: EncounterBinding<P1Run>;
  private fight: P1Fight;
  private refund = 0;
  private walkedThisTick = false;
  private healSplats: readonly Readonly<{ amount: number; lastShown: Tick }>[] = [];

  private readonly hooks: Hooks<P1Run> = {
    "tick-opened": ({ time }) => {
      this.healSplats = this.healSplats.filter((splat) => splat.lastShown >= time.encounter);
    },
    "before-npc-hits": ({ time, incoming }) => ({
      snapshot: { player: this.target.observe(), bossHp: this.currentStats.hitpoint },
      outputs: incoming.flatMap((hit) => this.judge(hit, time.encounter)),
    }),
    "npc-turn": ({ time }) => this.turn(time.encounter),
    "hit-applied": ({ hit }) => {
      this.fight = landed(this.fight, hit);
      return [{ kind: "player-hit", at: hit.cause.at, hit: hit.cause, receipt: hit.receipt }];
    },
    "player-hits-settled": ({ time, landed: hits, player }) => this.settlePlayerHits(time.encounter, hits, player),
    "player-moved": () => undefined,
    "tick-ended": (frame) => this.closeRow(frame),
  };

  constructor(region: Region, private readonly config: P1Config, private readonly target: OcellusPlayer, private readonly invincible: () => boolean) {
    super(region, { ...OCELLUS_P1.room.start.value });
    this.setAggro(target);
    this.fight = startFight(config.seed);
    this.binding = new EncounterBinding(config.seed, tick(0), target, this.hooks);
  }

  enterP1(): void {
    const maxHp = boss.maxHp.value;
    this.stats = { ...boss.stats.value, hitpoint: maxHp };
    const lowestDefence = Math.ceil((this.stats.defence * boss.lowestDefencePercent.value) / 100);
    this.currentStats = withDefenceFloor({ ...this.stats, hitpoint: this.config.bossEntryHp ?? maxHp }, lowestDefence);
  }

  override mobName(): string {
    return "Ocellus";
  }

  override get combatLevel(): number {
    return boss.combatLevel.value;
  }

  override get size(): number {
    return boss.size.value;
  }

  /** The SDK holds one ranged defence, so it is read for the ammunition of the weapon the player attacks with. */
  override get bonuses(): UnitBonuses {
    const weapon = this.target.equipment.weapon instanceof TonalzticsOfRalos ? "tonalzticsOfRalos" : "twistedBow";
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { ...boss.defenceBonuses.value, range: boss.rangedDefence.value[ammunition.value[weapon]] },
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
    };
  }

  override get idlePoseId(): number {
    return presentation.bossPoses.idle.value;
  }

  override get walkingPoseId(): number {
    return presentation.bossPoses.walk.value;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(boss.npcId.value));
  }

  override visible(): boolean {
    return super.visible() && this.phase().boss !== "hidden";
  }

  override canBeAttacked(): boolean {
    return this.phase().boss === "present-damageable";
  }

  /** His end at 0 HP is the fight's, so the SDK never runs his death. */
  override detectDeath(): void {}

  override attackIfPossible(): void {}

  override movementStep(): void {
    if (!this.walkedThisTick && this.visualPath.length === 0) this.visualMovementActive = false;
    this.walkedThisTick = false;
  }

  override addProjectile(projectile: Projectile): void {
    super.addProjectile(projectile);
    this.binding.received(projectile);
  }

  override queueStep(): void {
    this.binding.npcTurn(this, () => super.queueStep());
  }

  override drawHPBar(context: OffscreenCanvasRenderingContext2D, scale: number, verticalOffset = -(this.size / 2) * scale): void {
    super.drawHPBar(context, scale, verticalOffset);
    const { fill, background, height } = presentation.chargeBar.value;
    const width = this.healthBarWidth;
    context.fillStyle = background;
    context.fillRect(-width / 2, verticalOffset + HP_BAR_HEIGHT, width, height);
    context.fillStyle = fill;
    context.fillRect(-width / 2, verticalOffset + HP_BAR_HEIGHT, (width * this.fight.meter) / crackBlock.unblocked.value.meterMax, height);
  }

  override drawOverheadPrayers(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    if (this.phase().overhead !== "protect-melee") return;
    if (protectMeleeIcon === null) {
      protectMeleeIcon = new Image();
      protectMeleeIcon.src = `osrs-assets/${spriteFile(presentation.overheadIcon.value)}`;
    }
    const below = OCELLUS_P4.presentation.overheadIconBelowHpBar.value + presentation.chargeBar.value.height;
    if (protectMeleeIcon.complete && protectMeleeIcon.naturalWidth > 0) context.drawImage(protectMeleeIcon, -scale / 2, below, scale, scale);
  }

  override drawHitsplats(context: OffscreenCanvasRenderingContext2D, scale: number, verticalOffset = 0): void {
    super.drawHitsplats(context, scale, verticalOffset);
    drawHealSplats(context, this.healHitsplatImage, this.healSplats.map((splat) => splat.amount), verticalOffset);
  }

  meter(): number {
    return this.fight.meter;
  }

  runState(): P1RunState {
    const run = this.binding.view();
    switch (run.kind) {
      case "waiting":
        return { kind: "waiting" };
      case "running":
        return { kind: "running", tick: run.at, phase: momentAt(this.fight, run.at).phase };
      case "ended":
        return { kind: "ended", at: run.at, reason: run.reason };
      default: {
        const unhandled: never = run;
        return unhandled;
      }
    }
  }

  private phase(): P1Phase {
    return this.fight.phase ?? momentAt(this.fight, this.binding.view().at).phase;
  }

  private judge(hit: IncomingHit, at: Tick): readonly (Judgement | Logged<P1Event>)[] {
    const outcome = judgement(momentAt(this.fight, at).phase, momentAt(this.fight, hit.launchedAt).phase, hit);
    return [
      { kind: "judge-incoming", hit, damage: outcome === "passed" ? hit.requested : 0 },
      { kind: "event", event: { kind: "player-hit-judged", at, style: hit.style, outcome, requested: hit.requested } },
    ];
  }

  private turn(at: Tick): Readonly<{ outputs: readonly (Logged<P1Event> | HitRequest<P1Hit>)[]; ending: P1End | null }> {
    const step = turn(this.config.seed, this.fight, { at, player: this.target.observe(), boss: { hp: this.currentStats.hitpoint, maxHp: this.stats.hitpoint } });
    this.fight = step.fight;
    this.stand(step.fight.bossAt);
    return { outputs: step.outputs.flatMap((output) => this.apply(output, at)), ending: step.ending };
  }

  private apply(output: TurnOutput, at: Tick): readonly (Logged<P1Event> | HitRequest<P1Hit>)[] {
    switch (output.kind) {
      case "event":
      case "hit":
        return [output];
      case "boss-heal": {
        const beforeHp = this.currentStats.hitpoint;
        const afterHp = Math.min(this.stats.hitpoint, beforeHp + output.amount);
        this.currentStats.hitpoint = afterHp;
        if (afterHp > beforeHp) this.healSplats = [...this.healSplats, { amount: afterHp - beforeHp, lastShown: after(at, HEAL_SPLAT_TICKS) }];
        return [{ kind: "event", event: { kind: "boss-healed", at, receipt: { requested: output.amount, applied: afterHp - beforeHp, beforeHp, afterHp } } }];
      }
      case "refund":
        this.refund += output.amount;
        return [];
      default: {
        const unhandled: never = output;
        return unhandled;
      }
    }
  }

  /** A step to the next tile is walked; anything farther is a teleport. */
  private stand(anchor: Tile): void {
    const { x, y } = this.location;
    if (anchor.x === x && anchor.y === y) return;
    if (Math.max(Math.abs(anchor.x - x), Math.abs(anchor.y - y)) > 1) {
      this.setLocation({ x: anchor.x, y: anchor.y });
      return;
    }
    this.location = { x: anchor.x, y: anchor.y };
    this.visualPath.push({ x: anchor.x, y: anchor.y, run: false });
    this.visualMovementActive = true;
    this.walkedThisTick = true;
    this.region.refreshUnitChunk(this);
  }

  private settlePlayerHits(at: Tick, hits: readonly Landed<P1Hit>[], player: Readonly<{ hp: number; maxHp: number }>): readonly (Logged<P1Event> | Heal)[] {
    const refunded = this.refund;
    this.refund = 0;
    const afterRefund = Math.min(player.maxHp, player.hp + refunded);
    const refund: readonly (Logged<P1Event> | Heal)[] =
      refunded === 0
        ? []
        : [
            { kind: "heal", amount: refunded, limit: "max-hp" },
            { kind: "event", event: { kind: "block-refunded", at, receipt: { requested: refunded, applied: afterRefund - player.hp, beforeHp: player.hp, afterHp: afterRefund } } },
          ];
    const lethal = this.invincible() ? hits.find(({ receipt }) => receipt.beforeHp > 0 && receipt.afterHp === 0) : undefined;
    if (!lethal) return refund;
    return [...refund, { kind: "heal", amount: player.maxHp, limit: "max-hp" }, { kind: "event", event: { kind: "death-prevented", at, source: lethal.cause.kind } }];
  }

  private closeRow({ time, inputs, snapshot, events, combatDraws, ending }: FrameOf<P1Run, "tick-ended">): Readonly<{ row: P1Row; ending: P1End | null }> {
    const playerAtPostTick = this.target.observe();
    const died = ending === null && playerAtPostTick.hp <= 0;
    const death: P1End = { kind: "death" };
    const { phase, beats } = momentAt(this.fight, time.encounter);
    const row: P1Row = {
      tick: time.encounter,
      worldTick: time.world,
      phase,
      beats,
      bossAt: this.fight.bossAt,
      meter: this.fight.meter,
      playerAtBossStep: snapshot.player,
      playerAtPostTick,
      bossHp: { atBossStep: snapshot.bossHp, atPostTick: this.currentStats.hitpoint },
      combatDraws,
      inputs,
      events: died ? [...events, { kind: "run-ended", at: time.encounter, reason: death }] : events,
    };
    return { row, ending: ending ?? (died ? death : null) };
  }
}
