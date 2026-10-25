import { CacheRenderModel, CacheRenderReferences, Mob } from "osrs-sdk";
import type { Model, Projectile, Region, UnitBonuses } from "osrs-sdk";
import type { P2Config } from "../OcellusTimings";
import { OCELLUS_P2, OCELLUS_P4 } from "../OcellusTimings";
import type { OcellusPlayer } from "../OcellusPlayer";
import type { Tick, Tile } from "../../../../sim/brands";
import { tick } from "../../../../sim/brands";
import type { FrameOf, Heal, Hooks, IncomingHit, Landed, Logged } from "../../../../sim/sdk/EncounterBinding";
import { EncounterBinding } from "../../../../sim/sdk/EncounterBinding";
import type { P2End, P2Event, P2Hit, P2Row, P2RunState } from "../P2Types";
import type { InputObservation, PlayerObservation } from "../P4Types";
import type { P2Fight, TurnStep } from "../p2/fight";
import { startFight, turn } from "../p2/fight";
import { withDefenceFloor } from "../bossStats";
import { drawHealSplats } from "../entities/P4Views";
import { TonalzticsOfRalos } from "../gear/OcellusGear";

type BossStep = Readonly<{ player: PlayerObservation; bossHp: number; bladeHits: number }>;
type P2Run = Readonly<{ input: InputObservation; event: P2Event; cause: P2Hit; snapshot: BossStep; row: P2Row; end: P2End }>;

/** What the region does at the SDK boundary for the fight model: wall the arms off and move the player. */
export type P2Boundary = Readonly<{ raiseWalls(): void; relocate(to: Tile): void }>;

const { blade, bossPoses, ocellusNpcId } = OCELLUS_P2;
const { ammunition } = OCELLUS_P4.gear;
/** The SDK keeps a delay-1 hitsplat drawn for the tick it lands and the next. */
const SPLAT_TICKS = 1;

/**
 * Ocellus in phase 2, drawn as NPC 16675 with the sword, and the target players attack as The Blade, NPC 16676 on the same 3x3.
 * The Blade stores what it takes instead of losing health, so his bar holds his own health and drops only when it releases.
 */
export class OcellusP2 extends Mob {
  readonly binding: EncounterBinding<P2Run>;
  private fight: P2Fight;
  private releaseSplats: readonly Readonly<{ amount: number; lastShown: Tick }>[] = [];

  private readonly hooks: Hooks<P2Run> = {
    "tick-opened": ({ time }) => {
      this.releaseSplats = this.releaseSplats.filter((splat) => splat.lastShown >= time.encounter);
    },
    "before-npc-hits": ({ incoming }) => ({ snapshot: { player: this.target.observe(), bossHp: this.fight.bossHp, bladeHits: landedDamage(incoming) }, outputs: [] }),
    "npc-turn": ({ time, snapshot }) => this.turn(time.encounter, snapshot),
    "hit-applied": ({ hit: { cause, receipt } }) => [{ kind: "player-hit", at: cause.at, hit: cause, receipt }],
    "player-hits-settled": ({ time, landed, player }) => this.settlePlayerHits(time.encounter, landed, player.maxHp),
    "player-moved": () => undefined,
    "tick-ended": (frame) => this.closeRow(frame),
  };

  constructor(region: Region, private readonly config: P2Config, private readonly target: OcellusPlayer, private readonly invincible: () => boolean, private readonly boundary: P2Boundary) {
    super(region, OCELLUS_P2.arena.bossAnchor.value);
    this.fight = startFight(config.bossEntryHp ?? config.choices.bossMaxHp.option.value);
    this.binding = new EncounterBinding(config.seed, tick(0), target, this.hooks);
  }

  /** Unit constructors and Region.reset write SDK default stats, so phase 2's are applied after both. */
  enterP2(): void {
    this.stats = { ...blade.stats.value, hitpoint: this.config.choices.bossMaxHp.option.value };
    const lowestDefence = Math.ceil((this.stats.defence * blade.lowestDefencePercent.value) / 100);
    this.currentStats = withDefenceFloor({ ...this.stats, hitpoint: this.fight.bossHp }, lowestDefence);
  }

  override mobName(): string {
    return blade.name.value;
  }

  override get combatLevel(): number {
    return blade.combatLevel.value;
  }

  override get size(): number {
    return OCELLUS_P4.boss.size.value;
  }

  /** The Blade's ranged defence depends on the ammunition, and the SDK holds one value, so it is read for the weapon attacking now. */
  override get bonuses(): UnitBonuses {
    const ranged = this.target.equipment.weapon instanceof TonalzticsOfRalos ? ammunition.value.tonalzticsOfRalos : ammunition.value.twistedBow;
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { ...blade.defenceBonuses.value, range: blade.rangedDefence.value[ranged] },
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
    };
  }

  override canBeAttacked(): boolean {
    return this.fight.blade === "awake";
  }

  storedDamage(): number {
    return this.fight.stored;
  }

  override get idlePoseId(): number {
    return bossPoses.idle.value;
  }

  override get walkingPoseId(): number {
    return bossPoses.idle.value;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(ocellusNpcId.value));
  }

  override addProjectile(projectile: Projectile): void {
    super.addProjectile(projectile);
    this.binding.received(projectile);
  }

  override queueStep(): void {
    this.binding.npcTurn(this, () => super.queueStep());
  }

  override movementStep(): void {}

  override attackIfPossible(): void {}

  override drawHitsplats(context: OffscreenCanvasRenderingContext2D, scale: number, verticalOffset = 0): void {
    super.drawHitsplats(context, scale, verticalOffset);
    drawHealSplats(context, this.damageHitsplatImage, this.releaseSplats.map((splat) => splat.amount), verticalOffset);
  }

  runState(): P2RunState {
    const run = this.binding.view();
    switch (run.kind) {
      case "waiting":
        return { kind: "waiting" };
      case "running":
        return { kind: "running", tick: run.at, phase: this.fight.schedule.at(run.at).phase };
      case "ended":
        return { kind: "ended", at: run.at, reason: run.reason };
      default: {
        const unhandled: never = run;
        return unhandled;
      }
    }
  }

  private turn(at: Tick, snapshot: BossStep): Pick<TurnStep, "outputs" | "ending"> {
    const step = turn(this.config.seed, this.fight, { at, player: snapshot.player, bladeHits: snapshot.bladeHits });
    this.fight = step.fight;
    // The hits that just landed went into The Blade's store, so his health is the fight's, lowered only by a release.
    this.currentStats.hitpoint = step.fight.bossHp;
    step.outputs.forEach((output) => {
      if (output.kind === "event") this.applyAtBoundary(output.event, at);
    });
    return { outputs: step.outputs, ending: step.ending };
  }

  private applyAtBoundary(event: P2Event, at: Tick): void {
    switch (event.kind) {
      case "portals-rose":
        this.boundary.raiseWalls();
        return;
      case "escaped":
        this.boundary.relocate(event.to);
        return;
      case "blade-released":
        if (event.released > 0) this.releaseSplats = [...this.releaseSplats, { amount: event.released, lastShown: tick(at + SPLAT_TICKS) }];
        return;
      case "stage-entered":
      case "blade-woke":
      case "round-started":
      case "portals-lit":
      case "portals-fired":
      case "pools-formed":
      case "safe-portal-opened":
      case "blade-discharged":
      case "round-ended":
      case "sword-repaired":
      case "enough":
      case "sword-fell":
      case "player-hit":
      case "death-prevented":
      case "run-ended":
        return;
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  private settlePlayerHits(at: Tick, landed: readonly Landed<P2Hit>[], maxHp: number): readonly (Logged<P2Event> | Heal)[] {
    const lethal = this.invincible() ? landed.find(({ receipt }) => receipt.beforeHp > 0 && receipt.afterHp === 0) : undefined;
    if (!lethal) return [];
    return [{ kind: "heal", amount: maxHp, limit: "max-hp" }, { kind: "event", event: { kind: "death-prevented", at, source: lethal.cause.kind } }];
  }

  private closeRow({ time, inputs, snapshot, events, combatDraws, ending }: FrameOf<P2Run, "tick-ended">): Readonly<{ row: P2Row; ending: P2End | null }> {
    const playerAtPostTick = this.target.observe();
    const died = ending === null && playerAtPostTick.hp <= 0;
    const death: P2End = { kind: "death" };
    const { phase, beats } = this.fight.schedule.at(time.encounter);
    const row: P2Row = {
      tick: time.encounter,
      worldTick: time.world,
      phase,
      beats,
      playerAtBossStep: snapshot.player,
      playerAtPostTick,
      bossHp: { atBossStep: snapshot.bossHp, atPostTick: this.currentStats.hitpoint },
      stored: this.fight.stored,
      combatDraws,
      inputs,
      events: died ? [...events, { kind: "run-ended", at: time.encounter, reason: death }] : events,
    };
    return { row, ending: ending ?? (died ? death : null) };
  }
}

function landedDamage(incoming: readonly IncomingHit[]): number {
  return incoming.reduce((sum, hit) => sum + hit.requested, 0);
}
