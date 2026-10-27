import { Projectile, Sound, SoundCache, cacheSound } from "osrs-sdk";
import type { Entity, ProjectileVisuals, Region, Unit } from "osrs-sdk";
import type { SpotOptions, TileMark } from "../../../fight/effects";
import { GroundSpot, TileMarks } from "../../../fight/effects";
import type { ATile } from "../../../fight/geometry";
import { toSdk } from "../../../fight/geometry";
import { SPOT } from "../../data/looks";
import { CHAT } from "../../options";
import type { ChatLine } from "../../options";
import type { Element, Growth, P1Look, P1Row } from "../types";

/** His volley graphic: 30 cycles out, 95 within four tiles and 125 beyond, lifted 0.6. */
const VOLLEY = { start: 30, nearEnd: 95, farEnd: 125, lift: 0.6 } as const;
/** His strike: each extra shot starts and ends six cycles later, lifted 0.8. */
const STRIKE = { start: 2, end: 30, step: 6, lift: 0.8 } as const;
/** Crack pieces wait this many client cycles, then one more per tile back toward him. */
const CRACK_DELAY = 60;
/** A closing crack and a floor explosion play for this many ticks. */
const END_TICKS = 4;
const CRACK = { colour: 0x6a0d0d, soon: 0.45, waiting: 0.28, inset: 0.06 } as const;
const BLAST = { colour: 0xff7a1a, opacity: 0.22, inset: 0.04 } as const;

class Shot extends Projectile {
  constructor(from: Unit, to: Unit, delay: number, visuals: ProjectileVisuals) {
    super(null, 0, from, to, "magic", { setDelay: delay, visuals });
  }
}

type Actors = Readonly<{ boss: Unit; player: Unit }>;
type OpenLine = { key: string; tiles: readonly ATile[]; closesAt: number; spots: GroundSpot[] };

function lineKey(tiles: readonly ATile[]): string {
  return tiles.map((tile) => `${tile.x},${tile.z}`).join(";");
}

function graphic(ids: readonly number[], index: number): number {
  const id = ids[index];
  if (id === undefined) throw new Error(`phase 1 has no crack graphic ${index}`);
  return id;
}

/** Crack pieces are named by the way the line grows, toward him. */
function crackPieces(growth: Growth): Readonly<{ start: number; piece: number; end: number }> {
  const { dx, dz } = growth;
  if (dx !== 0 && dz !== 0) {
    const index = dx > 0 ? (dz > 0 ? 0 : 1) : dz < 0 ? 2 : 3;
    return {
      start: graphic(SPOT.crackDiagonalStart, index),
      piece: graphic(SPOT.crackDiagonal, index),
      end: graphic(SPOT.crackDiagonalEnd, index),
    };
  }
  const index = dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3;
  return {
    start: graphic(SPOT.crackStraightStart, index),
    piece: graphic(SPOT.crackStraight, index),
    end: graphic(SPOT.crackStraightEnd, index),
  };
}

/**
 * Phase 1's looks, drawn from each closed row. Hazard tiles read the sidebar live, so a toggle
 * shows on the next frame.
 */
export class P1Views {
  private lines: OpenLine[] = [];
  private blast: readonly ATile[] = [];
  private at = 0;
  private readonly owned: Entity[] = [];

  constructor(
    private readonly region: Region,
    private readonly actors: Actors,
    private readonly hazardTiles: () => boolean,
    private readonly say: (line: ChatLine) => void,
  ) {
    this.own(new TileMarks(region, () => this.marks()));
  }

  present(row: P1Row): void {
    this.at = row.tick;
    for (const event of row.events) if (event.kind === "shown") this.show(event.look, row.tick);
  }

  /** Danger tiles for the open cracks and the blast rings. Empty while the sidebar has them off. */
  marks(): readonly TileMark[] {
    if (!this.hazardTiles()) return [];
    const marks: TileMark[] = [];
    for (const line of this.lines) {
      const left = line.closesAt - this.at;
      const opacity = left <= 1 ? CRACK.soon : CRACK.waiting;
      for (const tile of line.tiles) marks.push({ tile, colour: CRACK.colour, opacity, inset: CRACK.inset });
    }
    for (const tile of this.blast) marks.push({ tile, colour: BLAST.colour, opacity: BLAST.opacity, inset: BLAST.inset });
    return marks;
  }

  dispose(): void {
    this.stopAll();
    const owned = new Set<unknown>(this.owned);
    this.region.entities = this.region.entities.filter((entity) => !owned.has(entity) && !(entity instanceof GroundSpot));
    this.owned.splice(0, this.owned.length);
    this.lines = [];
    this.blast = [];
  }

  private show(look: P1Look, now: number): void {
    switch (look.kind) {
      case "chat":
        this.say({ text: look.text, colour: CHAT.game, tick: now });
        return;
      case "projectile":
        this.shoot(look.element, look.near, look.flight);
        return;
      case "player-spot":
        this.actors.player.addSpotAnim({ id: look.id, channel: "p1-impact" });
        return;
      case "cracks":
        this.openCracks(look.tiles, look.growth, now + look.closesAfter);
        return;
      case "cracks-end":
        this.closeCracks(look.tiles, look.growth);
        return;
      case "floor-spots":
        for (const spot of look.spots) this.spot(spot.tile, spot.id, { delay: spot.delay, maxTicks: END_TICKS });
        return;
      case "strike":
        this.strike(look.shots, look.flight);
        return;
      case "sound":
        SoundCache.play(new Sound(cacheSound(look.id), 0.6, 0, { location: toSdk(look.at), range: 31, retain: 31 }));
        return;
      case "clear-cracks":
        this.stopAll();
        return;
      case "blast-mark":
        this.blast = look.tiles;
        return;
      case "blast-clear":
        this.blast = [];
        return;
      default: {
        const unhandled: never = look;
        return unhandled;
      }
    }
  }

  private shoot(element: Element, near: boolean, flight: number): void {
    const visuals: ProjectileVisuals = {
      spotAnim: { id: element === "fire" ? SPOT.fireProjectile : SPOT.waterProjectile },
      startCycleOffset: VOLLEY.start,
      endCycleOffset: near ? VOLLEY.nearEnd : VOLLEY.farEnd,
      verticalOffset: VOLLEY.lift,
    };
    this.region.addProjectile(new Shot(this.actors.boss, this.actors.player, flight, visuals));
  }

  private strike(shots: number, flight: number): void {
    for (let i = 0; i < shots; i++) {
      const visuals: ProjectileVisuals = {
        spotAnim: { id: SPOT.strikeProjectile },
        startCycleOffset: STRIKE.start + i * STRIKE.step,
        endCycleOffset: STRIKE.end + i * STRIKE.step,
        verticalOffset: STRIKE.lift,
      };
      this.region.addProjectile(new Shot(this.actors.boss, this.actors.player, flight, visuals));
    }
  }

  private openCracks(tiles: readonly ATile[], growth: Growth, closesAt: number): void {
    const pieces = crackPieces(growth);
    const lasts = closesAt - this.at;
    const spots = tiles.map((tile, i) => this.spot(tile, i === tiles.length - 1 ? pieces.start : pieces.piece, { delay: CRACK_DELAY + (tiles.length - 1 - i), loopTicks: lasts, maxTicks: lasts + 1 }));
    this.lines.push({ key: lineKey(tiles), tiles, closesAt, spots });
  }

  private closeCracks(tiles: readonly ATile[], growth: Growth): void {
    const key = lineKey(tiles);
    const line = this.lines.find((open) => open.key === key);
    if (line) for (const spot of line.spots) spot.stop();
    this.lines = this.lines.filter((open) => open.key !== key);
    const pieces = crackPieces(growth);
    tiles.forEach((tile, i) => this.spot(tile, pieces.end, { delay: tiles.length - 1 - i, maxTicks: END_TICKS }));
  }

  private stopAll(): void {
    for (const line of this.lines) for (const spot of line.spots) spot.stop();
    this.lines = [];
    this.blast = [];
  }

  private spot(tile: ATile, id: number, options: SpotOptions): GroundSpot {
    const spot = new GroundSpot(this.region, tile, id, options);
    this.region.addEntity(spot);
    return spot;
  }

  private own(entity: Entity): void {
    this.region.addEntity(entity);
    this.owned.push(entity);
  }
}
