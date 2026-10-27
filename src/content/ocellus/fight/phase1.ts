import type { Unit } from "osrs-sdk";
import type { TileMark } from "./effects";
import type { Fight, PhaseScript } from "./Fight";
import { CHAT } from "./Fight";
import { SEQ, SPOT } from "../full/data/looks";
import { P1 } from "../full/data/p1";
import type { ATile, Body, Quadrant } from "./geometry";
import { CORNERS, MIDDLE, QUADRANTS, at, bodyCentre, clockwise, distanceToBody, inRoom, reach, ringAround, sign } from "./geometry";
import type { Style } from "./units";

type Element = "fire" | "water";
type Side = "east" | "south" | "west" | "north";
const SIDES: readonly Side[] = ["east", "south", "west", "north"];

type Line = {
  tiles: ATile[];
  closesAt: number;
  spots: { stop(): void }[];
  growth: Readonly<{ dx: number; dz: number }>;
  closed: boolean;
};

type Walk = { to: Quadrant; startedAt: number; arrivedAt: number | null; volleys: boolean };

const HOODED_SW = at(-1, -4);

/** Crack pieces are named by the way the line grows (toward him): straight N/E/S/W, diagonal NE/SE/SW/NW. */
function crackPieces(growth: Readonly<{ dx: number; dz: number }>): Readonly<{ start: number; piece: number; end: number }> {
  const { dx, dz } = growth;
  if (dx !== 0 && dz !== 0) {
    const index = dx > 0 ? (dz > 0 ? 0 : 1) : dz < 0 ? 2 : 3;
    return { start: SPOT.crackDiagonalStart[index], piece: SPOT.crackDiagonal[index], end: SPOT.crackDiagonalEnd[index] };
  }
  const index = dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3;
  return { start: SPOT.crackStraightStart[index], piece: SPOT.crackStraight[index], end: SPOT.crackStraightEnd[index] };
}

export class Phase1 implements PhaseScript {
  readonly label = "Phase 1";
  private meterValue = 0;
  private element: Element;
  private thresholds: number[] = [...P1.thresholds];
  private walk: Walk | null = null;
  private corner: Quadrant | null = null;
  private nextCorner: Quadrant | null = null;
  private lines: Line[] = [];
  private blastFrom: Body | null = null;
  private busy = false;
  private ending = false;
  private epoch = 0;
  private readonly maxHp: number;

  constructor(private readonly fight: Fight) {
    this.element = fight.rng.chance(0.5) ? "fire" : "water";
    this.maxHp = fight.scaledP1Hp();
  }

  begin(): void {
    const { fight } = this;
    fight.barColour = "#00b4b4";
    fight.player.hop(at(0, -9));
    const hooded = fight.swapBoss("hooded", HOODED_SW, this.maxHp, this.maxHp);
    hooded.attackable = false;
    hooded.faceTile(at(0, 2));
    fight.say("Now... ascension...", 4);
    fight.message("Challenge started: Ocellus.", CHAT.game);
    this.later(1, () => {
      const boss = fight.swapBoss("p1", HOODED_SW, this.maxHp, this.maxHp);
      boss.faceTile(at(0, 2));
    });
    this.later(P1.startWalkAfter, () => this.startWalk(fight.rng.pick(QUADRANTS)));
  }

  /** Phase-local scheduling, dropped when the phase ends early (his HP reaching 0). */
  private later(ticks: number, run: () => void): void {
    const epoch = this.epoch;
    this.fight.after(ticks, () => {
      if (epoch === this.epoch) run();
    });
  }

  private get boss() {
    const boss = this.fight.boss;
    if (!boss) throw new Error("phase 1 has no boss");
    return boss;
  }

  private body(): Body {
    return { sw: this.boss.tile, size: 3 };
  }

  step(): void {
    if (this.ending) return;
    const walk = this.walk;
    if (!walk) return;
    const target = CORNERS[walk.to];
    const here = this.boss.tile;
    if (here.x !== target.x || here.z !== target.z) {
      this.boss.stepTo(at(here.x + sign(target.x - here.x), here.z + sign(target.z - here.z)));
      const now = this.boss.tile;
      if (now.x === target.x && now.z === target.z) walk.arrivedAt = this.fight.tick;
    }
    if (walk.volleys && (this.fight.tick - walk.startedAt) % P1.volleyEvery === 0) this.volleyTick(walk);
  }

  /** Called from a scheduled callback, so the first step (and the first volley) is this same tick. */
  private startWalk(to: Quadrant): void {
    this.corner = null;
    this.walk = { to, startedAt: this.fight.tick, arrivedAt: null, volleys: true };
    this.boss.face(null);
  }

  private volleyTick(walk: Walk): void {
    if (this.crossedThreshold()) {
      this.walk = null;
      this.startMiddle(walk.to);
      return;
    }
    const v = this.fight.tick;
    const remaining = reach(this.boss.tile, CORNERS[walk.to]);
    if (walk.arrivedAt !== null && walk.arrivedAt < v) {
      // Already stood at the corner: the end of the volley animation alone, and the charge a tick later.
      walk.volleys = false;
      this.boss.playAnimation(SEQ.p1VolleyEnd);
      this.fight.setOverhead(null);
      this.arrive(walk.to, v + 1);
      return;
    }
    const first = v === walk.startedAt;
    if (first) this.fight.setOverhead("protect-melee");
    const arriving = remaining <= 1;
    this.volley(arriving ? SEQ.p1VolleyEnd : SEQ.p1VolleyStart);
    if (arriving) {
      walk.volleys = false;
      this.arrive(walk.to, v + 6);
    }
  }

  private volley(seq: number): void {
    const { fight } = this;
    if (fight.rng.chance(P1.elementSwitchChance)) this.element = this.element === "fire" ? "water" : "fire";
    const element = this.element;
    const style: Style = element === "fire" ? "ranged" : "magic";
    const boss = this.boss;
    boss.playAnimation(seq);
    boss.addSpotAnim({ id: element === "fire" ? SPOT.fireOnBoss : SPOT.waterOnBoss, channel: "volley" });
    const distance = distanceToBody(this.body(), fight.playerTile);
    const near = distance <= P1.volleyLand.nearWithin;
    const delay = near ? P1.volleyLand.near : P1.volleyLand.far;
    fight.hit({
      from: boss,
      style,
      delay,
      amount: (prayer) => (prayer === style ? 0 : fight.rng.roll(P1.volleyDamage)),
      visuals: {
        spotAnim: { id: element === "fire" ? SPOT.fireProjectile : SPOT.waterProjectile },
        startCycleOffset: 30,
        endCycleOffset: near ? 95 : 125,
        verticalOffset: 0.6,
      },
      onLand: () => fight.player.addSpotAnim({ id: element === "fire" ? SPOT.fireImpact : SPOT.waterImpact, channel: "p1-impact" }),
    });
  }

  private crossedThreshold(): boolean {
    const next = this.thresholds[0];
    if (next === undefined) return false;
    return this.boss.currentStats.hitpoint <= Math.floor(this.maxHp * next);
  }

  // ---- a corner ---------------------------------------------------------------------------------------------------

  private arrive(q: Quadrant, chargeAt: number): void {
    this.corner = q;
    const delay = chargeAt - this.fight.tick;
    this.boss.faceTile(MIDDLE_TILE);
    this.later(Math.max(1, delay - 1), () => {
      this.fight.setOverhead(null);
      this.boss.faceTile(MIDDLE_TILE);
    });
    this.later(delay, () => this.charge(q));
  }

  private charge(q: Quadrant): void {
    const { fight } = this;
    const boss = this.boss;
    this.walk = null;
    this.busy = true;
    boss.playAnimation(SEQ.p1Charge);
    const order = this.tendrilOrder(q);
    // Line n comes from the same tendril as line n - 3; the first starts on the charge tick itself.
    this.cornerLine(q, order[0]);
    for (let i = 1; i < P1.lineCount; i++) {
      this.later(i * P1.linesEvery, () => this.cornerLine(q, order[i % 3]));
    }
    for (let t = P1.chargeVfxFrom; t < P1.explodeAt; t += 2) this.later(t, () => boss.addSpotAnim({ id: SPOT.p1Charge, channel: "charge" }));
    this.later(P1.shoutAt, () => {
      fight.say(fight.rng.pick(P1.shouts), 3);
      this.blastFrom = this.body();
    });
    this.later(P1.explodeAt, () => this.explode());
    this.later(P1.blastAt, () => {
      this.blast();
      this.busy = false;
      if (this.crossedThreshold()) {
        this.startMiddle(this.pickNextCorner(q));
        return;
      }
      const next = this.pickNextCorner(q);
      this.later(P1.walkOnAt - P1.blastAt, () => this.startWalk(next));
    });
  }

  private tendrilOrder(q: Quadrant): ("x" | "z" | "corner")[] {
    const first: "x" | "z" = q === "NE" || q === "SW" ? "z" : "x";
    const other: "x" | "z" = first === "x" ? "z" : "x";
    return this.fight.rng.chance(0.5) ? [first, "corner", other] : [first, other, "corner"];
  }

  private pickNextCorner(from: Quadrant): Quadrant {
    const { anticlockwise, clockwise: cw, across } = P1.routeWeights;
    const next = this.fight.rng.weighted<Quadrant>([
      [clockwise(from, -1), anticlockwise],
      [clockwise(from, 1), cw],
      [clockwise(from, 2), across],
    ]);
    this.nextCorner = next;
    return next;
  }

  private cornerLine(q: Quadrant, tendril: "x" | "z" | "corner"): void {
    const sw = this.boss.tile;
    const centre = bodyCentre({ sw, size: 3 });
    const ix = sign(-centre.x) || 1;
    const iz = sign(-centre.z) || 1;
    const innerX = ix < 0 ? sw.x : sw.x + 2;
    const innerZ = iz < 0 ? sw.z : sw.z + 2;
    const rng = this.fight.rng;
    let start: ATile;
    let dir: { dx: number; dz: number };
    if (tendril === "corner") {
      const roll = rng.next();
      if (roll < 20 / 42) {
        start = at(innerX + ix, innerZ + iz);
        dir = { dx: ix, dz: iz };
      } else if (roll < 31 / 42) {
        start = at(innerX + ix, innerZ);
        dir = { dx: ix, dz: 0 };
      } else {
        start = at(innerX, innerZ + iz);
        dir = { dx: 0, dz: iz };
      }
    } else {
      const straight = rng.chance(62 / 107);
      if (tendril === "x") {
        start = straight ? at(innerX + ix, sw.z + 1) : at(innerX + ix, innerZ);
        dir = straight ? { dx: ix, dz: 0 } : { dx: ix, dz: iz };
      } else {
        start = straight ? at(sw.x + 1, innerZ + iz) : at(innerX, innerZ + iz);
        dir = straight ? { dx: 0, dz: iz } : { dx: ix, dz: iz };
      }
    }
    this.addLine(start, dir, P1.cornerLineLength, P1.lineClosesAfter);
  }

  private addLine(start: ATile, dir: Readonly<{ dx: number; dz: number }>, length: number, closesAfter: number): void {
    const tiles: ATile[] = [];
    for (let k = 0; k < length; k++) {
      const t = at(start.x + dir.dx * k, start.z + dir.dz * k);
      if (!inRoom(t) || !this.fight.isFloor(t)) break;
      tiles.push(t);
    }
    if (tiles.length === 0) return;
    const growth = { dx: -dir.dx, dz: -dir.dz };
    const pieces = crackPieces(growth);
    const n = tiles.length;
    const spots = tiles.map((tile, i) =>
      this.fight.spot(tile, i === n - 1 ? pieces.start : pieces.piece, { delay: 60 + (n - 1 - i), loopTicks: closesAfter, maxTicks: closesAfter + 1 }),
    );
    const line: Line = { tiles, closesAt: this.fight.tick + closesAfter, spots, growth, closed: false };
    this.lines.push(line);
    this.later(closesAfter, () => this.closeLine(line));
  }

  private closeLine(line: Line): void {
    if (line.closed) return;
    line.closed = true;
    this.lines = this.lines.filter((l) => l !== line);
    const { fight } = this;
    const pieces = crackPieces(line.growth);
    line.spots.forEach((spot) => spot.stop());
    line.tiles.forEach((tile, i) => fight.spot(tile, pieces.end, { delay: line.tiles.length - 1 - i, maxTicks: 4 }));
    const blocked = line.tiles.some((t) => t.x === fight.playerTile.x && t.z === fight.playerTile.z);
    if (blocked) {
      fight.healPlayer(fight.rng.roll(P1.blockHeal));
      return;
    }
    this.meterValue = Math.min(P1.meterMax, this.meterValue + P1.meterPerLine);
    fight.healBoss(P1.healPerLine);
    fight.playCrackSound();
  }

  private explode(): void {
    const boss = this.boss;
    boss.playAnimation(SEQ.p1Explode);
    boss.addSpotAnim({ id: SPOT.p1ExplodeOnBoss, channel: "explode" });
    this.blastFrom = this.body();
  }

  /** The two rings of floor explosions; whoever stood within 2 of his 3x3 when he exploded is hit. */
  private blast(): void {
    const { fight } = this;
    const body = this.blastFrom ?? this.body();
    this.blastFrom = null;
    [1, 2].forEach((ring, index) => {
      for (const tile of ringAround(body, ring)) {
        if (!fight.isFloor(tile)) continue;
        fight.spot(tile, fight.rng.pick(SPOT.p1ExplodeFloor), { delay: index * 2, maxTicks: 4 });
      }
    });
    if (distanceToBody(body, fight.playerTile) <= P1.blastRadius) fight.hit({ amount: () => fight.rng.roll(P1.blastDamage) });
  }

  // ---- the middle -------------------------------------------------------------------------------------------------

  private startMiddle(nextCorner: Quadrant): void {
    const { fight } = this;
    this.thresholds.shift();
    this.walk = null;
    this.busy = true;
    this.nextCorner = nextCorner;
    const boss = this.boss;
    fight.setOverhead(null);
    boss.attackable = false;
    boss.playAnimation(SEQ.p1TeleportOut);
    boss.addSpotAnim({ id: SPOT.p1TeleportOut, channel: "teleport" });
    this.later(1, () => (boss.hidden = true));
    this.later(P1.teleportInAfter, () => {
      boss.teleport(MIDDLE);
      boss.hidden = false;
      boss.attackable = true;
      boss.playAnimation(SEQ.p1TeleportIn);
      boss.addSpotAnim({ id: SPOT.p1TeleportIn, channel: "teleport" });
    });
    let side = fight.rng.pick(SIDES);
    for (let beat = 0; beat < P1.beats; beat++) {
      const s = side;
      this.later(P1.firstBeatAfter + beat * P1.beatEvery, () => this.beat(s));
      side = SIDES[(SIDES.indexOf(side) + 1) % 4];
    }
    const lastExplode = P1.firstBeatAfter + (P1.beats - 1) * P1.beatEvery + P1.beatExplodeAfter;
    const shout = lastExplode + P1.strikeShoutAfterLastExplode;
    this.later(shout, () => this.strike(nextCorner));
  }

  private beat(side: Side): void {
    const boss = this.boss;
    const sw = boss.tile;
    boss.playAnimation(SEQ.p1Charge);
    const look: Readonly<Record<Side, ATile>> = { east: at(sw.x + 11, sw.z + 1), south: at(sw.x + 1, sw.z - 10), west: at(sw.x - 10, sw.z + 1), north: at(sw.x + 1, sw.z + 11) };
    boss.faceTile(look[side]);
    // Two six-long diagonals from one face, a quarter turn apart, both on the beat tick. The first in turn order
    // (the crack pieces' 0/90/180/270) closes 4 ticks on, the other 6. [R] [K]
    const ends: Readonly<Record<Side, readonly [[number, number, number, number], [number, number, number, number]]>> = {
      east: [[3, 2, 1, 1], [3, 0, 1, -1]],
      south: [[2, -1, 1, -1], [0, -1, -1, -1]],
      west: [[-1, 0, -1, -1], [-1, 2, -1, 1]],
      north: [[0, 3, -1, 1], [2, 3, 1, 1]],
    };
    const [first, second] = ends[side];
    this.addLine(at(sw.x + first[0], sw.z + first[1]), { dx: first[2], dz: first[3] }, P1.beatLineLength, P1.beatLineCloses[0]);
    this.addLine(at(sw.x + second[0], sw.z + second[1]), { dx: second[2], dz: second[3] }, P1.beatLineLength, P1.beatLineCloses[1]);
    this.later(4, () => boss.addSpotAnim({ id: SPOT.p1Charge, channel: "charge" }));
    this.later(P1.beatExplodeAfter, () => {
      boss.addSpotAnim({ id: SPOT.p1Charge, channel: "charge" });
      this.explode();
    });
    this.later(P1.beatExplodeAfter + 1, () => this.blast());
  }

  private strike(nextCorner: Quadrant): void {
    const { fight } = this;
    const boss = this.boss;
    const shots = 1 + Math.floor(this.meterValue / P1.meterPerExtraShot);
    fight.say(shots > 1 ? "Embrace... annihilation..." : "Death... awaits...", 4);
    this.meterValue = 0;
    fight.setOverhead("protect-melee");
    this.later(1, () => fight.healPlayer(fight.rng.roll(P1.strikeHeal)));
    this.later(2, () => {
      boss.playAnimation(SEQ.p1Expend);
      boss.face(fight.player);
      for (let i = 0; i < shots; i++) {
        fight.hit({
          from: boss,
          style: "magic",
          delay: 1,
          amount: () => fight.rng.roll(P1.strikeDamage),
          visuals: { spotAnim: { id: SPOT.strikeProjectile }, startCycleOffset: 2 + i * 6, endCycleOffset: 30 + i * 6, verticalOffset: 0.8 },
        });
      }
    });
    this.later(P1.walkOnAfterShout, () => {
      this.busy = false;
      if (this.crossedThreshold()) {
        this.startMiddle(nextCorner);
        return;
      }
      this.startWalk(nextCorner);
    });
  }

  // ---- the end ----------------------------------------------------------------------------------------------------

  onBossHit(): void {
    if (this.ending || this.boss.form !== "p1" || this.boss.currentStats.hitpoint > 0) return;
    this.ending = true;
    this.epoch++;
    const { fight } = this;
    const boss = this.boss;
    this.walk = null;
    this.lines.forEach((line) => line.spots.forEach((spot) => spot.stop()));
    this.lines = [];
    this.blastFrom = null;
    boss.attackable = false;
    fight.setOverhead(null);
    fight.say("You... will disappear...", 4);
    const atMiddle = boss.tile.x === MIDDLE.x && boss.tile.z === MIDDLE.z;
    let landed = 0;
    if (!atMiddle) {
      boss.playAnimation(SEQ.p1TeleportOut);
      boss.addSpotAnim({ id: SPOT.p1TeleportOut, channel: "teleport" });
      fight.afterAlways(1, () => (boss.hidden = true));
      fight.afterAlways(4, () => boss.teleport(MIDDLE));
      fight.afterAlways(5, () => {
        boss.hidden = false;
        boss.playAnimation(SEQ.p1TeleportIn);
        boss.addSpotAnim({ id: SPOT.p1TeleportIn, channel: "teleport" });
        boss.faceTile(at(0, 10));
      });
      landed = 5;
    }
    fight.afterAlways(landed + P1.transformAfterLanding, () => {
      boss.playAnimation(SEQ.p1Transformation);
      boss.addSpotAnim({ id: SPOT.p1ToP2, channel: "transform" });
    });
    fight.afterAlways(landed + P1.p2After, () => fight.enterPhase(2));
  }

  hpFloor(): number {
    return 0;
  }

  allowsDeath(): boolean {
    return false;
  }

  acceptsAttack(style: Style): boolean {
    const boss = this.fight.boss;
    if (!boss || this.ending) return false;
    return !(style === "melee" && boss.overhead === "protect-melee");
  }

  playerAttacking(_target: Unit, _style: Style): boolean {
    return true;
  }

  interceptWalk(_to: ATile): boolean {
    return false;
  }

  meter(): number | null {
    return this.meterValue;
  }

  marks(): readonly TileMark[] {
    const marks: TileMark[] = [];
    for (const line of this.lines) {
      const left = line.closesAt - this.fight.tick;
      for (const tile of line.tiles) marks.push({ tile, colour: 0x6a0d0d, opacity: left <= 1 ? 0.45 : 0.28, inset: 0.06 });
    }
    if (this.blastFrom) {
      for (const ring of [1, 2]) for (const tile of ringAround(this.blastFrom, ring)) marks.push({ tile, colour: 0xff7a1a, opacity: 0.22, inset: 0.04 });
    }
    return marks;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get pendingCorner(): Quadrant | null {
    return this.nextCorner ?? this.corner;
  }
}

const MIDDLE_TILE = at(0, 0);
