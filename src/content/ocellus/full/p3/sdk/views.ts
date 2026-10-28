import { Projectile } from "osrs-sdk";
import type { Entity, Location3, ProjectileVisuals, Region, Unit } from "osrs-sdk";
import type { Tick } from "../../../../../sim/brands";
import type { SpotOptions, TileMark } from "../../../fight/effects";
import { GroundSpot, TileMarks } from "../../../fight/effects";
import type { ATile, Body, Quadrant } from "../../../fight/geometry";
import { ARMS, ARM_DIR, at, quadrantOf } from "../../../fight/geometry";
import type { LocView } from "../../../fight/locs";
import { LocField } from "../../../fight/locs";
import { SPOT, VOID_LOC } from "../../data/looks";
import type { DangerRole, P3Look, P3Row, PatchEnd, Tone } from "../types";

/** The bomb models sit at floor level; this lifts them over the head. */
const RAISED = 2;
const MAGIC_SHOT: Omit<ProjectileVisuals, "spotAnim"> = { startCycleOffset: 45, endCycleOffset: 60, verticalOffset: 1 };
const FLARE_SHOT: Omit<ProjectileVisuals, "spotAnim"> = { startCycleOffset: 0, endCycleOffset: 30, verticalOffset: 0.5 };
export const TONE: Readonly<Record<Tone, string>> = { game: "#000000", red: "#ef1020", purple: "#7f00ff", green: "#0b6e0b" };
const DANGER: Readonly<Record<DangerRole, number>> = { slash: 0xb01030, bomb: 0x8a2be2, debris: 0x8a6a3a, "superior-slash": 0x5a0a0a };
/** Face 12702 is the curved shard. Julian's photo shows it purple, not the model's olive. */
const SHARD_PURPLE: Record<string, number> = { "12702": 0x4a1868 };
const UNLEASH_TURN: Readonly<Record<Quadrant, number>> = { NE: 2, NW: 1, SW: 0, SE: 3 };
/** The arena breaks outward along each arm, one burst every 15 client cycles. */
const ARM_BURSTS = [3, 6, 9, 12] as const;

export type ChatLine = Readonly<{ text: string; colour: string; tick: number }>;

type Telegraph = Readonly<{ role: DangerRole; tiles: readonly ATile[]; until: Tick }>;
type Zone = Readonly<{ body: Body; erupts: Tick; slams: Tick }>;
type Patch = Readonly<{ key: string; tile: ATile; end: PatchEnd; loc: keyof typeof VOID_LOC }>;

class Shot extends Projectile {
  constructor(from: Unit, to: Unit | Location3, delay: number, visuals: ProjectileVisuals) {
    super(null, 0, from, to, "magic", { setDelay: delay, visuals });
  }
}

export type Actors = Readonly<{ boss: () => Unit; player: Unit; addAt: (tile: ATile) => Unit | null }>;

/**
 * Phase 3's looks, drawn from each closed row as P4's present() does: an effect that warns plays on the tick its row
 * logs it, and every floor entity it makes retires itself on its own tick limit.
 */
export class P3Views {
  private telegraphs: readonly Telegraph[] = [];
  private zone: Zone | null = null;
  private crossing: Readonly<{ bank: ATile; hops: readonly ATile[] }> | null = null;
  private patches: readonly Patch[] = [];
  private shownAt = 0;
  private readonly owned: Entity[] = [];

  constructor(
    private readonly region: Region,
    private readonly actors: Actors,
    private readonly hazardTiles: () => boolean,
    private readonly say: (line: ChatLine) => void,
  ) {
    this.own(new TileMarks(region, () => this.marks()));
    this.own(new LocField(region, () => this.patchViews()));
  }

  present(row: P3Row): void {
    this.shownAt = row.tick;
    for (const event of row.events) if (event.kind === "shown") this.show(event.look, row.tick);
    this.telegraphs = this.telegraphs.filter((t) => t.until >= row.tick);
    this.patches = this.patches.filter((p) => p.end.kind === "quadrant" || p.end.tick > row.tick);
  }

  marks(): readonly TileMark[] {
    if (!this.hazardTiles()) return [];
    const marks: TileMark[] = [];
    for (const t of this.telegraphs) for (const tile of t.tiles) marks.push({ tile, colour: DANGER[t.role], opacity: 0.35, inset: 0.06 });
    const zone = this.zone;
    if (zone) {
      const glow = this.shownAt >= zone.slams - 1 ? 0.55 : this.shownAt >= zone.erupts ? 0.4 : 0.25;
      for (let x = 0; x < zone.body.size; x++) for (let z = 0; z < zone.body.size; z++) marks.push({ tile: at(zone.body.sw.x + x, zone.body.sw.z + z), colour: 0x9f48bd, opacity: glow, inset: 0.03 });
    }
    if (this.crossing) {
      marks.push({ tile: this.crossing.bank, colour: 0x2bff73, opacity: 0.35, inset: 0.1 });
      for (const hop of this.crossing.hops) marks.push({ tile: hop, colour: 0x2bff73, opacity: 0.2, inset: 0.2 });
    }
    return marks;
  }

  /** Every entity the views made, and the floor effects still playing, leave with the phase. */
  dispose(): void {
    const owned = new Set<unknown>(this.owned);
    this.region.entities = this.region.entities.filter((entity) => !owned.has(entity) && !(entity instanceof GroundSpot));
    this.owned.splice(0, this.owned.length);
  }

  private show(look: P3Look, now: Tick): void {
    switch (look.kind) {
      case "chat":
        this.say({ text: look.text, colour: TONE[look.tone], tick: now });
        return;
      case "player-spot":
        this.actors.player.addSpotAnim({ id: look.id, channel: look.channel, ...(look.raised ? { height: RAISED } : {}) });
        return;
      case "projectile": {
        const from = look.from === "boss" ? this.actors.boss() : this.actors.addAt(look.from);
        if (from === null) return;
        const to = look.to === "player" ? this.actors.player : this.actors.boss();
        this.region.addProjectile(new Shot(from, to, look.flight, { spotAnim: { id: look.id }, ...(look.to === "player" ? MAGIC_SHOT : FLARE_SHOT) }));
        return;
      }
      case "arena-broke":
        for (const arm of ARMS) {
          const { dx, dz } = ARM_DIR[arm];
          ARM_BURSTS.forEach((n, i) => this.spot(at(dx * n, dz * n), SPOT.collapsingExplosion[i], { delay: i * 15, maxTicks: 5 }));
        }
        return;
      case "bomb-shown":
        this.spot(look.tile, SPOT.bombIdle, { height: RAISED, loopTicks: 1, maxTicks: look.drops - now });
        return;
      case "bomb-dropped":
        this.spot(look.tile, SPOT.bombDrop, { maxTicks: 3 });
        this.spot(look.tile, SPOT.bombImpact, { maxTicks: 3 });
        return;
      case "debris-shown":
        this.spot(look.tile, SPOT.fallingDebris, { maxTicks: look.falls - now + 1 });
        return;
      case "band-landed":
        if (look.role === "slash") look.tiles.forEach((tile, i) => this.spot(tile, SPOT.shadowSlash, { delay: Math.floor(i / 3) * 2, maxTicks: 3, rotation: ((tile.x * 5 + tile.z * 3) & 7) * 256, level: true, recolor: SHARD_PURPLE }));
        else look.tiles.forEach((tile, i) => this.spot(tile, SPOT.superiorSlash, { delay: Math.floor(i / 3), maxTicks: 3, rotation: ((tile.x * 5 + tile.z * 3) & 7) * 256, level: true, recolor: SHARD_PURPLE }));
        return;
      case "pools":
        look.tiles.forEach((tile) => this.spot(tile, SPOT.p2Pool, { maxTicks: 4 }));
        return;
      case "collapse-burst":
        look.bursts.forEach(({ tile, id }) => this.spot(tile, id, { maxTicks: 5 }));
        return;
      case "untether-flare":
        this.spot(look.tile, SPOT.unleashArena[UNLEASH_TURN[look.quadrant]], { maxTicks: 6 });
        return;
      case "rift-detonated":
        this.spot(look.tile, SPOT.voidChainExplosion, { maxTicks: 3 });
        return;
      case "danger":
        this.telegraphs = [...this.telegraphs, { role: look.role, tiles: look.tiles, until: look.until }];
        return;
      case "danger-withdrawn":
        this.telegraphs = this.telegraphs.filter((t) => t.role !== look.role || t.until <= look.after);
        return;
      case "zone":
        this.zone = { body: look.body, erupts: look.erupts, slams: look.slams };
        return;
      case "zone-cleared":
        this.zone = null;
        return;
      case "crossing":
        this.crossing = { bank: look.bank, hops: look.hops };
        return;
      case "crossing-cleared":
        this.crossing = null;
        return;
      case "patch":
        this.patches = [...this.patches.filter((p) => p.tile.x !== look.tile.x || p.tile.z !== look.tile.z), { key: `${look.loc}:${look.placed}:${look.tile.x},${look.tile.z}`, tile: look.tile, end: look.end, loc: look.loc }];
        return;
      case "patches-cleared":
        this.patches = look.quadrant === "all" ? [] : this.patches.filter((p) => quadrantOf(p.tile) !== look.quadrant);
        return;
      default: {
        const unhandled: never = look;
        return unhandled;
      }
    }
  }

  private patchViews(): readonly LocView[] {
    return this.patches.map((p) => ({ key: p.key, tile: p.tile, models: VOID_LOC[p.loc].models }));
  }

  private spot(tile: ATile, id: number, options: SpotOptions): void {
    this.region.addEntity(new GroundSpot(this.region, tile, id, options));
  }

  private own(entity: Entity): void {
    this.region.addEntity(entity);
    this.owned.push(entity);
  }
}
