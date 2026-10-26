import { InvisibleMovementBlocker, Region } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { P3Config } from "./OcellusTimings";
import { OCELLUS_P3, OCELLUS_P4 } from "./OcellusTimings";
import { dress, loadoutSnapshot } from "./OcellusLoadout";
import { OcellusPlayer } from "./OcellusPlayer";
import type { Tile } from "../../../sim/brands";
import type { HitReceipt } from "../../../sim/combat";
import type { FlickMiss, P3Event, P3Hit, P3HitSource, P3Log, P3Snapshot, P3Stage, Spin } from "./P3Types";
import { OcellusP3 } from "./mobs/OcellusP3";
import { ARENA_SIZE, FLOOR, QUADRANT_1_FLOOR, RIM, UNTETHER_CENTRE } from "./p3/arena";
import { FloorGraphic, RubbleView, SmiteBlades } from "./entities/P3Views";

const LETHAL_HIT: Readonly<Record<P3HitSource, string>> = {
  swing: "a swing",
  "void-shot": "a void shot",
  "smite-blow": "the smite's opening blow",
  spin: "a smite spin",
  rubble: "the rubble",
  "untether-magic": "Untether's magic",
  "purple-tile": "a purple tile",
  eruption: "the eruption",
  slam: "the slam",
};

type FlickReference = Readonly<{ happened: string; happens: string }>;

const FLICK_REFERENCE: Readonly<Record<Spin["nth"], FlickReference>> = {
  1: { happened: "the smite started", happens: "the blades start" },
  2: { happened: "spin 1 landed", happens: "spin 1 lands" },
  3: { happened: "spin 2 landed", happens: "spin 2 lands" },
};

const MISSED_FLICK: Readonly<Record<FlickMiss, (reference: FlickReference) => string>> = {
  held: ({ happens }) => `Protect from Melee stayed on. Turn it off after ${happens}, then back on for the spin.`,
  late: () => "Protect from Melee was not back on in time for the spin.",
  early: ({ happened }) => `Protect from Melee was already off when ${happened}.`,
};

const { bossPoses, untether } = OCELLUS_P3;
const OPEN_FLOOR = ["#4a4339", "#3f392f"] as const;
const CLOSED_FLOOR = ["#2c2822", "#25221d"] as const;

type Mounted =
  | Readonly<{ kind: "unmounted" }>
  | Readonly<{ kind: "mounted"; boss: OcellusP3; player: OcellusPlayer; chat: string[]; blades: SmiteBlades; rubble: Set<RubbleView>; untether: Set<FloorGraphic> }>;
type Shown = Extract<Mounted, { kind: "mounted" }>;

function presentHit(hit: P3Hit, receipt: HitReceipt, { boss, blades, chat }: Shown): void {
  switch (hit.kind) {
    case "swing":
      boss.playAnimation(bossPoses.swing.value);
      return;
    case "void-shot":
      boss.playAnimation(bossPoses.voidShot.value);
      return;
    case "smite-blow":
      boss.playAnimation(bossPoses.smite.value);
      return;
    case "spin":
      blades.land(hit.spin);
      if (hit.verdict.kind === "struck") chat.push(`Spin ${hit.spin.nth} of ${hit.spin.of} hit you for ${receipt.applied}. ${MISSED_FLICK[hit.verdict.why](FLICK_REFERENCE[hit.spin.nth])}`);
      return;
    case "rubble":
      return;
    case "untether-magic":
      if (receipt.applied > 0) chat.push(`Untether's magic hit you for ${receipt.applied}. Protect from Magic blocks all of it.`);
      return;
    case "purple-tile":
      chat.push(`A purple tile erupted under you for ${receipt.applied}. Step off it before it erupts.`);
      return;
    case "eruption":
      chat.push(`The void erupted for ${receipt.applied}. Stand under him when it erupts.`);
      return;
    case "slam":
      chat.push(`His slam hit you for ${receipt.applied}. Step out from under him on the tick the void erupts.`);
      return;
    default: {
      const unhandled: never = hit;
      return unhandled;
    }
  }
}

function opensSmite(stage: P3Stage): boolean {
  switch (stage) {
    case "smite-1":
    case "smite-2":
    case "smite-3":
      return true;
    case "arrive":
    case "autos":
    case "untether":
    case "untether-ends":
    case "destroy":
      return false;
    default: {
      const unhandled: never = stage;
      return unhandled;
    }
  }
}

export class P3Region extends Region {
  private mounted: Mounted = { kind: "unmounted" };
  invincible = false;

  constructor(private readonly config: P3Config) {
    super();
  }

  override getName(): string {
    return "Ocellus";
  }

  override get width(): number {
    return ARENA_SIZE.width;
  }

  override get height(): number {
    return ARENA_SIZE.height;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    const paint = (at: Tile, colour: string) => {
      context.fillStyle = colour;
      context.fillRect(at.x * scale, at.y * scale, scale, scale);
    };
    const checker = (at: Tile) => (at.x + at.y) % 2 === 0;
    FLOOR.tiles().forEach((at) => paint(at, QUADRANT_1_FLOOR.contains(at) ? (checker(at) ? OPEN_FLOOR[0] : OPEN_FLOOR[1]) : checker(at) ? CLOSED_FLOOR[0] : CLOSED_FLOOR[1]));
    RIM.tiles().forEach((at) => paint(at, OCELLUS_P4.geometry.walkway.value.top));
  }

  initialiseRegion(): { player: Player } {
    const player: OcellusPlayer = new OcellusPlayer(this, { ...OCELLUS_P3.arena.playerSpawn.value }, () => boss.binding, (target) => target instanceof OcellusP3 && target.outOfMeleeReach());
    const boss: OcellusP3 = new OcellusP3(this, this.config, player, () => this.invincible);
    dress(player, this.config.choices.setup.option.value);
    for (const edge of QUADRANT_1_FLOOR.surround().tiles()) this.addEntity(new InvisibleMovementBlocker(this, { ...edge }));
    this.addPlayer(player);
    this.addMob(boss);
    this.setBoss(boss);
    const blades = new SmiteBlades(this, boss);
    this.addEntity(blades);
    this.mounted = { kind: "mounted", boss, player, chat: [], blades, rubble: new Set(), untether: new Set() };
    return { player };
  }

  /** Unit constructors and Region.reset's setStats pass write SDK default stats, so P3 entry is applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    if (this.mounted.kind === "mounted") this.mounted.boss.enterP3();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    if (this.mounted.kind === "mounted") this.mounted.boss.binding.openTick();
  }

  override postTick(): void {
    if (this.mounted.kind === "unmounted") return;
    const shown = this.mounted;
    const row = shown.boss.binding.finishTick();
    if (row === null) return;
    row.events.forEach((event) => this.present(event, shown));
    for (const rubble of shown.rubble) {
      rubble.show(row.tick);
      if (rubble.done) shown.rubble.delete(rubble);
    }
  }

  private present(event: P3Event, shown: Shown): void {
    switch (event.kind) {
      case "player-hit":
        presentHit(event.hit, event.receipt, shown);
        return;
      case "stage-entered":
        if (opensSmite(event.stage)) shown.blades.open();
        if (event.stage === "untether-ends") this.clearUntether(shown);
        return;
      case "wave-cast":
        shown.boss.playAnimation(bossPoses.wave.value);
        return;
      case "rubble-aimed": {
        const rubble = new RubbleView(this, event.tile, event.landsAt, event.until);
        this.addEntity(rubble);
        shown.rubble.add(rubble);
        return;
      }
      case "untether-started":
        shown.boss.setOverheadText(untether.shout.value);
        shown.boss.overheadTextTimer = untether.shoutLasts.value;
        shown.boss.playAnimation(bossPoses.untetherRise.value);
        return;
      case "purple-tiles-shown":
        event.tiles.forEach((at) => this.showUntether(shown, new FloorGraphic(this, at, untether.look.purpleTile.value, 0)));
        return;
      case "border-shown": {
        const { spotAnim, turned } = untether.look.border.value;
        this.showUntether(shown, new FloorGraphic(this, UNTETHER_CENTRE, spotAnim, turned));
        return;
      }
      case "void-erupted":
        shown.boss.playAnimation(bossPoses.untetherUnleash.value);
        return;
      case "death-prevented":
        shown.chat.push(`Invincible: ${LETHAL_HIT[event.source]} would have killed you on tick ${event.at}.`);
        return;
      case "hazard-avoided":
      case "run-ended":
        return;
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  private showUntether(shown: Shown, graphic: FloorGraphic): void {
    this.addEntity(graphic);
    shown.untether.add(graphic);
  }

  private clearUntether(shown: Shown): void {
    shown.untether.forEach((graphic) => graphic.clear());
    shown.untether.clear();
  }

  snapshot(): P3Snapshot | null {
    if (this.mounted.kind === "unmounted") return null;
    const { boss, player } = this.mounted;
    return {
      run: boss.runState(),
      boss: { npcId: OCELLUS_P4.boss.npcId.value, hp: boss.currentStats.hitpoint, maxHp: boss.stats.hitpoint, visible: boss.visible(), defence: boss.currentStats.defence },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.mounted.kind === "mounted" ? [...this.mounted.chat] : [];
  }

  fightLog(): P3Log {
    const rows = this.mounted.kind === "mounted" ? [...this.mounted.boss.binding.rows] : [];
    return { header: { phase: "p3", seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
