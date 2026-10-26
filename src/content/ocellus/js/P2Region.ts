import { InvisibleMovementBlocker, Region, TileMarker } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { Loadout, P2Config } from "./OcellusTimings";
import { OCELLUS_P2, OCELLUS_P4, defaultLoadout } from "./OcellusTimings";
import { dress, loadoutSnapshot } from "./OcellusLoadout";
import { OcellusPlayer } from "./OcellusPlayer";
import type { Tile } from "../../../sim/brands";
import type { Arm, Gaps, P2Event, P2HitSource, P2Log, P2Row, P2Snapshot, PortalIndex, Volley, Wedge } from "./P2Types";
import type { PortalView } from "./entities/P2Views";
import { FloorEffect, PortalCross } from "./entities/P2Views";
import { OcellusP2 } from "./mobs/OcellusP2";
import { PortalEmitter } from "./mobs/PortalEmitter";
import { ARMS, PORTAL_INDICES, ROOM, WALLS, WEDGES, armsOf, diagonal, portalTiles, reachTick, waveLine } from "./p2/arena";
import { ARENA_SIZE, FLOOR, RIM } from "./p3/arena";

const LETHAL_HIT: Readonly<Record<P2HitSource, string>> = {
  volley: "a portal volley",
  "pool-burst": "a pool",
};

const { bossPoses, spotAnims, shouts, skipTiles, volley } = OCELLUS_P2;
const OPEN_FLOOR = ["#4a4339", "#3f392f"] as const;
const CLOSED_FLOOR = ["#2c2822", "#25221d"] as const;

type Portal = Readonly<{ arm: Arm; index: PortalIndex; tiles: readonly [Tile, Tile]; emitter: PortalEmitter }>;
type Lit = Readonly<{ kind: "none" }> | Readonly<{ kind: "lit"; wedge: Wedge; gaps: Gaps | "none" }>;
type SafePortal = Readonly<{ kind: "none" }> | Readonly<{ kind: "spawning" | "idle" | "closing"; effect: FloorEffect }>;

type Views = {
  portals: readonly Portal[];
  raised: boolean;
  lit: Lit;
  pools: readonly FloorEffect[];
  safePortal: SafePortal;
  repair: FloorEffect;
  drop: FloorEffect;
  burst: FloorEffect;
  skipMarkers: readonly TileMarker[];
  readonly chat: string[];
};

type Mounted = Readonly<{ kind: "unmounted" }> | Readonly<{ kind: "mounted"; boss: OcellusP2; player: OcellusPlayer; views: Views }>;

function litPortals(views: Views): readonly Portal[] {
  const { lit } = views;
  if (lit.kind === "none") return [];
  const [first, second] = armsOf(lit.wedge);
  return views.portals.filter((portal) => {
    const side = portal.arm === first ? 0 : portal.arm === second ? 1 : null;
    return side !== null && (lit.gaps === "none" || lit.gaps[side] !== portal.index);
  });
}

function portalLooks(views: Views): readonly PortalView[] {
  if (!views.raised) return [];
  const lit = new Set(litPortals(views));
  return views.portals.map((portal): PortalView => ({ arm: portal.arm, tiles: portal.tiles, look: lit.has(portal) ? "lit" : "inactive" }));
}

/** The portal views for the current lighting, rebuilt only when the portals rise or the lighting changes, not per frame. */
function cachedPortalLooks(views: Views): () => readonly PortalView[] {
  let built: Readonly<{ raised: boolean; lit: Lit; looks: readonly PortalView[] }> | null = null;
  return () => {
    if (built === null || built.raised !== views.raised || built.lit !== views.lit) {
      built = { raised: views.raised, lit: views.lit, looks: portalLooks(views) };
    }
    return built.looks;
  };
}

export class P2Region extends Region {
  private mounted: Mounted = { kind: "unmounted" };
  invincible = false;

  constructor(private readonly config: P2Config, private readonly loadout: Loadout = defaultLoadout(config.choices.setup.option.value)) {
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
    FLOOR.tiles().forEach((at) => paint(at, ROOM.contains(at) ? (checker(at) ? OPEN_FLOOR[0] : OPEN_FLOOR[1]) : checker(at) ? CLOSED_FLOOR[0] : CLOSED_FLOOR[1]));
    RIM.tiles().forEach((at) => paint(at, OCELLUS_P4.geometry.walkway.value.top));
  }

  initialiseRegion(): { player: Player } {
    const player: OcellusPlayer = new OcellusPlayer(this, { ...OCELLUS_P2.arena.playerSpawn.value }, () => boss.binding, () => false);
    const boss: OcellusP2 = new OcellusP2(this, this.config, player, () => this.invincible, {
      raiseWalls: () => {
        for (const wall of WALLS.tiles()) this.addEntity(new InvisibleMovementBlocker(this, { ...wall }));
        views.raised = true;
      },
      relocate: (to) => {
        player.setLocation({ x: to.x, y: to.y });
        player.destinationLocation = undefined;
        player.pathTargetLocation = undefined;
      },
    });
    dress(player, this.loadout);
    const middle = OCELLUS_P2.arena.middle.value;
    const views: Views = {
      portals: ARMS.flatMap((arm) => PORTAL_INDICES.map((index): Portal => {
        const tiles = portalTiles(arm, index);
        return { arm, index, tiles, emitter: new PortalEmitter(this, tiles[0]) };
      })),
      raised: false,
      lit: { kind: "none" },
      pools: [],
      safePortal: { kind: "none" },
      repair: new FloorEffect(this, middle),
      drop: new FloorEffect(this, middle),
      burst: new FloorEffect(this, middle),
      skipMarkers: [],
      chat: [],
    };
    for (const edge of ROOM.surround().tiles()) this.addEntity(new InvisibleMovementBlocker(this, { ...edge }));
    [new PortalCross(this, cachedPortalLooks(views)), views.repair, views.drop, views.burst].forEach((view) => this.addEntity(view));
    views.portals.forEach((portal) => this.addMob(portal.emitter));
    this.addPlayer(player);
    this.addMob(boss);
    this.setBoss(boss);
    this.mounted = { kind: "mounted", boss, player, views };
    this.showSkipTiles(this.config.choices.markers.option.value === "skip-tiles");
    return { player };
  }

  /** Unit constructors and Region.reset write SDK default stats, so phase 2's are applied after both. */
  override reset(startWorld = true): { player: Player } {
    const result = super.reset(false);
    if (this.mounted.kind === "mounted") this.mounted.boss.enterP2();
    if (startWorld) this.world.startTicking();
    return result;
  }

  override beforeNpcTurns(): void {
    if (this.mounted.kind === "mounted") this.mounted.boss.binding.openTick();
  }

  override postTick(): void {
    if (this.mounted.kind === "unmounted") return;
    const row = this.mounted.boss.binding.finishTick();
    if (row === null) return;
    this.present(row);
  }

  /** The portal skip's wait and run tiles in all four wedges, switched from Settings during the run. */
  showSkipTiles(on: boolean): void {
    if (this.mounted.kind === "unmounted") return;
    const { views } = this.mounted;
    views.skipMarkers.forEach((marker) => this.removeEntity(marker));
    const { wait, run, colour } = skipTiles.value;
    views.skipMarkers = on ? WEDGES.flatMap((wedge) => [wait, run].map((out) => new TileMarker(this, { ...diagonal(wedge, out) }, colour, 1, false))) : [];
    views.skipMarkers.forEach((marker) => this.addEntity(marker));
  }

  skipTilesShown(): boolean {
    return this.mounted.kind === "mounted" && this.mounted.views.skipMarkers.length > 0;
  }

  private present(row: P2Row): void {
    if (this.mounted.kind === "unmounted") return;
    const { boss, views } = this.mounted;
    const portal = views.safePortal;
    if (portal.kind === "spawning" && row.beats.some((beat) => beat.kind === "safe-portal-takes")) {
      portal.effect.play(spotAnims.safePortalIdle.value, true);
      views.safePortal = { kind: "idle", effect: portal.effect };
    }
    row.events.forEach((event) => this.presentEvent(event, boss, views));
  }

  private fire(views: Views, kind: Volley): void {
    const lit = views.lit;
    if (lit.kind === "none") return;
    const speed = volley.cyclesPerTile.value[kind];
    for (const portal of litPortals(views)) {
      const line = waveLine(portal.arm, portal.tiles[0], lit.wedge);
      const far = line[line.length - 1];
      if (far !== undefined) portal.emitter.fire(far, line.length, speed, reachTick(line.length, speed) + 1);
    }
    views.lit = { kind: "none" };
  }

  private clearPools(views: Views): void {
    views.pools.forEach((pool) => this.removeEntity(pool));
    views.pools = [];
  }

  private presentEvent(event: P2Event, boss: OcellusP2, views: Views): void {
    switch (event.kind) {
      case "stage-entered":
        if (event.stage === "arrive") {
          boss.playAnimation(bossPoses.transform.value);
          boss.addSpotAnim({ id: spotAnims.transform.value, channel: "transform" });
        }
        return;
      case "blade-woke":
        boss.setOverheadText(shouts.bladeWakes.value.text);
        boss.overheadTextTimer = shouts.bladeWakes.value.lasts;
        return;
      case "portals-lit":
        views.lit = { kind: "lit", wedge: event.wedge, gaps: event.gaps };
        return;
      case "portals-fired":
        this.fire(views, event.volley);
        return;
      case "pools-formed":
        this.clearPools(views);
        views.pools = event.tiles.map((at) => new FloorEffect(this, at));
        views.pools.forEach((pool) => {
          pool.play(spotAnims.pool.value, false);
          this.addEntity(pool);
        });
        return;
      case "safe-portal-opened": {
        if (views.safePortal.kind !== "none") this.removeEntity(views.safePortal.effect);
        const effect = new FloorEffect(this, event.tile);
        effect.play(spotAnims.safePortalSpawn.value, false);
        this.addEntity(effect);
        views.safePortal = { kind: "spawning", effect };
        return;
      }
      case "round-ended":
        this.clearPools(views);
        if (views.safePortal.kind !== "none") {
          views.safePortal.effect.play(spotAnims.safePortalDespawn.value, false);
          views.safePortal = { kind: "closing", effect: views.safePortal.effect };
        }
        return;
      case "blade-discharged":
        boss.addSpotAnim({ id: spotAnims.discharge.value, channel: "discharge" });
        return;
      case "sword-repaired":
        views.repair.play(spotAnims.swordRepair.value, false);
        return;
      case "enough":
        boss.setOverheadText(shouts.enough.value.text);
        boss.overheadTextTimer = shouts.enough.value.lasts;
        boss.playAnimation(bossPoses.enough.value);
        boss.addSpotAnim({ id: spotAnims.swordRootFire.value, channel: "sword-root" });
        boss.addSpotAnim({ id: spotAnims.armDrop.value, channel: "arm" });
        boss.addSpotAnim({ id: spotAnims.armGlow.value, channel: "arm-glow" });
        views.drop.play(spotAnims.swordDrop.value, false);
        return;
      case "sword-fell":
        views.burst.play(spotAnims.swordDropBurst.value, false);
        return;
      case "death-prevented":
        views.chat.push(`Invincible: ${LETHAL_HIT[event.source]} would have killed you on tick ${event.at}.`);
        return;
      case "portals-rose":
      case "round-started":
      case "escaped":
      case "blade-released":
      case "player-hit":
      case "run-ended":
        return;
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  snapshot(): P2Snapshot | null {
    if (this.mounted.kind === "unmounted") return null;
    const { boss, player } = this.mounted;
    return {
      run: boss.runState(),
      boss: {
        npcId: OCELLUS_P2.ocellusNpcId.value,
        hp: boss.currentStats.hitpoint,
        maxHp: boss.stats.hitpoint,
        visible: boss.visible(),
        defence: boss.currentStats.defence,
        attackable: boss.canBeAttacked(),
        stored: boss.storedDamage(),
      },
      player: loadoutSnapshot(player),
    };
  }

  chat(): readonly string[] {
    return this.mounted.kind === "mounted" ? [...this.mounted.views.chat] : [];
  }

  fightLog(): P2Log {
    const rows = this.mounted.kind === "mounted" ? [...this.mounted.boss.binding.rows] : [];
    return { header: { phase: "p2", seed: this.config.seed, choices: this.config.choices }, rows };
  }
}
