import type { Unit } from "osrs-sdk";
import type { TileMark } from "./effects";
import type { Fight, PhaseScript } from "./Fight";
import { CHAT } from "./Fight";
import type { VoidLocKind } from "./data";
import { P3, SEQ, SPOT, VOID_LOC } from "./data";
import { LocField } from "./locs";
import type { LocView } from "./locs";
import type { ATile, Arm, Body, Quadrant } from "./geometry";
import {
  ARMS,
  ARM_DIR,
  CORNERS,
  QUADRANTS,
  QUADRANT_SIGN,
  armBetween,
  armsOf,
  at,
  bodyCentre,
  clockwise,
  covers,
  distanceToBody,
  inRoom,
  quadrantOf,
  quadrantTiles,
  reach,
  same,
  sign,
  stonesOf,
  turnInto,
} from "./geometry";
import type { AddKind, Style } from "./units";
import { VoidAdd } from "./units";
import { handOverOf } from "./handOver";

type Special = "spin" | "insolence" | "untether";
type Patch = { tile: ATile; until: number; placed: number; kind: VoidLocKind };
type Telegraph = { tiles: ATile[]; landsAt: number; colour: number };
type Crossing = { arm: Arm; from: Quadrant; to: Quadrant; bank: ATile; hops: ATile[]; hopping: boolean };

const RIFT_ORDER: readonly AddKind[] = ["rift-buff", "rift-basic", "rift-heal"];
/** The shadow slash's telegraph colour, drawn red. */
const SLASH_MARK = 0x2a0a3a;
const GOD_NAME = { bandos: "Bandosian", saradomin: "Saradomin", armadyl: "Armadylean", zaros: "Zarosian" } as const;
const GOD_GLOW = { bandos: SPOT.glowBandos, saradomin: SPOT.glowSaradomin, armadyl: SPOT.glowArmadyl, zaros: SPOT.glowZaros } as const;

/** Tiles of the "+" and the middle 5x5 that phase 3 turns into chasm. */
export function chasmTiles(): ATile[] {
  const tiles: ATile[] = [];
  for (let x = -12; x <= 12; x++) {
    for (let z = -12; z <= 12; z++) {
      const t = at(x, z);
      if (!inRoom(t)) continue;
      if (Math.abs(x) <= 1 || Math.abs(z) <= 1 || (Math.abs(x) <= 2 && Math.abs(z) <= 2)) tiles.push(t);
    }
  }
  return tiles;
}

/** The bank tile beside a stone, on the given quadrant's side of the arm. */
function bankBeside(stone: ATile, arm: Arm, q: Quadrant): ATile {
  const { sx, sz } = QUADRANT_SIGN[q];
  return arm === "N" || arm === "S" ? at(2 * sx, stone.z) : at(stone.x, 2 * sz);
}

export class Phase3 implements PhaseScript {
  readonly label = "Phase 3";
  private segment = 0;
  private quadrant: Quadrant = "SE";
  private segmentStart = 0;
  private levitating = false;
  private stationary = false;
  /** In a quadrant (not still jumping to his first corner), so it can fall. */
  private landed = false;
  /** Between "Obliteration..." and his landing in the next quadrant. */
  private collapsing = false;
  /** The chain: sets of swings since the last special, swings (or panics) in this set. */
  private sets = 0;
  private swings = 0;
  /** Specials through the whole phase (the spin every other one), and in this quadrant: spins and the others. */
  private specials = 0;
  private quadrantSpins = 0;
  private quadrantOthers = 0;
  private patches: Patch[] = [];
  private telegraphs: Telegraph[] = [];
  private zone: Body | null = null;
  private zoneGlow = 0;
  private vine: VoidAdd | null = null;
  private rifts: VoidAdd[] = [];
  private riftKind: AddKind | null = null;
  private crossing: Crossing | null = null;
  private lastFlyingMessage = -10;
  private floorFraction: number = P3.hpFloors[0];
  private finished = false;
  /** Bumped to cancel the rest of a segment's scheduled attacks. */
  private rotation = 0;

  constructor(private readonly fight: Fight) {}

  private get boss() {
    const boss = this.fight.boss;
    if (!boss) throw new Error("phase 3 has no boss");
    return boss;
  }

  begin(): void {
    const { fight } = this;
    const direct = fight.options.startPhase === 3;
    const hp = direct ? fight.poolMax : this.fight.boss?.currentStats.hitpoint ?? fight.poolMax;
    const boss = fight.swapBoss("p3", at(-1, -1), hp, fight.poolMax);
    boss.attackable = false;
    boss.faceTile(at(0, 10));
    fight.barColour = "#00d900";
    if (direct) fight.message("Challenge started: Ocellus.", CHAT.game);
    this.breakArena();
    fight.region.addEntity(new LocField(fight.region, () => this.patchViews()));
    fight.after(P3.jumpToCornerAfter, () => this.startSegment(fight.quadrantOfPlayer() ?? "SE"));
  }

  private breakArena(): void {
    const { fight } = this;
    const chasm = chasmTiles();
    fight.removeFloor(chasm);
    const stones = ARMS.flatMap((arm) => stonesOf(arm));
    fight.setStones(stones);
    for (const arm of ARMS) {
      const { dx, dz } = ARM_DIR[arm];
      [3, 6, 9, 12].forEach((n, i) => fight.spot(at(dx * n, dz * n), SPOT.collapsingExplosion[i], { delay: i * 15, maxTicks: 5 }));
    }
    const here = fight.playerTile;
    if (!fight.isWalkable(here)) {
      const q = quadrantOf(here) ?? sideQuadrant(here);
      const { sx, sz } = QUADRANT_SIGN[q];
      fight.player.hop(at(Math.abs(here.x) < 3 ? 3 * sx : here.x, Math.abs(here.z) < 3 ? 3 * sz : here.z));
    }
  }

  // ---- segments ---------------------------------------------------------------------------------------------------

  /** He lands in a corner and starts the quadrant's chain of moves; his specials carry on from the last quadrant. */
  private startSegment(q: Quadrant): void {
    const { fight } = this;
    if (this.fight.destroyed.has(q)) q = QUADRANTS.find((other) => !fight.destroyed.has(other)) ?? q;
    this.rotation++;
    this.quadrant = q;
    this.segmentStart = fight.tick;
    this.floorFraction = P3.hpFloors[this.segment];
    this.landed = true;
    this.levitating = false;
    this.stationary = false;
    this.collapsing = false;
    this.zone = null;
    this.sets = 0;
    this.swings = 0;
    this.quadrantSpins = 0;
    this.quadrantOthers = 0;
    const boss = this.boss;
    boss.teleport(CORNERS[q]);
    boss.attackable = true;
    boss.pose = null;
    fight.setOverhead(null);
    boss.face(fight.player);
    const plan = this.segment === 0 ? P3.first : P3.later;
    for (const t of plan.bombs) {
      this.at(t - P3.bombOverheadBefore, () => this.bombOverhead());
      this.at(t - P3.bombDropAfter, () => this.bombs());
    }
    for (const t of plan.rifts) this.at(t, () => this.spawnRift());
    if (this.segment > 0 && this.riftKind === null) this.riftKind = fight.rng.pick(RIFT_ORDER);
    else if (this.segment > 1 && this.riftKind !== null) this.riftKind = RIFT_ORDER[(RIFT_ORDER.indexOf(this.riftKind) + 1) % RIFT_ORDER.length];
    this.next(P3.firstMove, () => this.swing());
  }

  /** Schedule relative to the segment's start; dropped if the rotation is cut short by the quadrant falling. */
  private at(offset: number, run: () => void): void {
    const delay = this.segmentStart + offset - this.fight.tick;
    const rotation = this.rotation;
    this.fight.after(Math.max(1, delay), () => {
      if (rotation === this.rotation) run();
    });
  }

  /** His next move in the chain, `ticks` from now. If his HP is at the floor by then, the quadrant falls instead. */
  private next(ticks: number, move: () => void): void {
    const rotation = this.rotation;
    this.fight.after(ticks, () => {
      if (rotation !== this.rotation || this.collapseDue()) return;
      move();
    });
  }

  /**
   * After two sets of swings, his next special. The spin comes every other one through the whole phase; in between,
   * Untether and Insolence take turns within the quadrant, Untether first in the first quadrant, Insolence later. [K]
   */
  private special(): void {
    const special: Special = this.specials % 2 === 0 ? "spin" : this.nextOther();
    this.specials++;
    switch (special) {
      case "spin":
        return this.spin();
      case "insolence":
        return this.insolence();
      case "untether":
        return this.startUntether();
      default: {
        const unhandled: never = special;
        return unhandled;
      }
    }
  }

  private nextOther(): "untether" | "insolence" {
    const first = (this.segment === 0 ? P3.first : P3.later).firstOther;
    const other = this.quadrantOthers % 2 === 0 ? first : first === "untether" ? "insolence" : "untether";
    this.quadrantOthers++;
    return other;
  }

  private body(): Body {
    return { sw: this.boss.tile, size: 3 };
  }

  private inMelee(): boolean {
    const here = this.fight.playerTile;
    const body = this.body();
    if (distanceToBody(body, here) !== 1) return false;
    // Not diagonally off a corner.
    const insideX = here.x >= body.sw.x && here.x <= body.sw.x + 2;
    const insideZ = here.z >= body.sw.z && here.z <= body.sw.z + 2;
    return insideX || insideZ;
  }

  /**
   * One of a set's two swings: melee at everyone near him, landing on its animation (solo, that's you). With nobody
   * in his reach, "Your panic... is futile..." takes the swing's place and the chain runs 3 ticks late. [K] [W]
   */
  private swing(): void {
    const { fight } = this;
    const boss = this.boss;
    let gap: number = P3.swingGap;
    if (this.inMelee()) {
      boss.playAnimation(SEQ.p3MeleeBasic);
      boss.face(fight.player);
      fight.hit({ style: "melee", amount: (prayer) => fight.rng.roll(prayer === "melee" ? P3.basicHitProtected : P3.basicHitUnprotected) });
    } else {
      this.panic();
      gap = P3.afterPanic;
    }
    this.swings++;
    if (this.swings < 2) {
      this.next(gap, () => this.swing());
      return;
    }
    // The slash's band shows a tick before his animation: the last tick you can click out of it.
    const rotation = this.rotation;
    fight.after(gap - 1, () => {
      if (rotation !== this.rotation) return;
      this.telegraphs.push({ tiles: this.slashLine(), landsAt: fight.tick + 1 + P3.slashLands, colour: SLASH_MARK });
    });
    this.next(gap, () => this.slash());
  }

  /** The shadow slash ends a set, landing the tick after its animation; his next move comes 4 ticks after it. [K] */
  private slash(): void {
    const { fight } = this;
    const boss = this.boss;
    const pending = this.telegraphs.find((t) => t.colour === SLASH_MARK && t.landsAt === fight.tick + P3.slashLands);
    const band = pending?.tiles ?? this.slashLine();
    boss.playAnimation(SEQ.p3MeleeSlash);
    boss.face(fight.player);
    fight.after(P3.slashLands, () => {
      band.forEach((tile, i) => fight.spot(tile, SPOT.shadowSlash, { delay: Math.floor(i / 3) * 2, maxTicks: 3 }));
      if (band.some((t) => same(t, fight.playerTile))) fight.hit({ amount: () => fight.rng.roll(P3.slashDamage) });
    });
    this.swings = 0;
    this.sets++;
    if (this.sets < P3.setsPerSpecial) {
      this.next(P3.afterSlash, () => this.swing());
      return;
    }
    this.sets = 0;
    this.next(P3.afterSlash, () => this.special());
  }

  /**
   * The shadow slash: 3 wide from the ring touching his body to the platform's edge, toward his tank (solo: you),
   * snapped to the nearest of 8 directions from his middle tile. Straight, the 3 tiles in line with his body; diagonal,
   * the tiles with dx·ux >= 1, dz·uz >= 1 and |dx·ux - dz·uz| <= 1 outside his 3x3. [K] 111 bands in six fights
   */
  private slashLine(): ATile[] {
    const mid = bodyCentreTile(this.body());
    const here = this.fight.playerTile;
    const octant = same(here, mid) ? 2 : Math.round(Math.atan2(here.z - mid.z, here.x - mid.x) / (Math.PI / 4));
    const ux = Math.round(Math.cos((octant * Math.PI) / 4));
    const uz = Math.round(Math.sin((octant * Math.PI) / 4));
    const inBand = (dx: number, dz: number): boolean => {
      if (ux === 0) return Math.abs(dx) <= 1 && dz * uz >= 2;
      if (uz === 0) return Math.abs(dz) <= 1 && dx * ux >= 2;
      return dx * ux >= 1 && dz * uz >= 1 && Math.abs(dx * ux - dz * uz) <= 1 && !(Math.abs(dx) <= 1 && Math.abs(dz) <= 1);
    };
    return this.byDistance(this.platform().filter((t) => inBand(t.x - mid.x, t.z - mid.z)));
  }

  /** Insolence: floor tiles in a band `width` wide at any angle, from just outside his body toward you, to the edge. */
  private bandTowardsPlayer(width: number): ATile[] {
    const centre = bodyCentre(this.body());
    const here = this.fight.playerTile;
    let ux = here.x - centre.x;
    let uz = here.z - centre.z;
    const length = Math.hypot(ux, uz);
    if (length === 0) [ux, uz] = [0, 1];
    else [ux, uz] = [ux / length, uz / length];
    return this.byDistance(
      this.platform().filter((t) => {
        const rx = t.x - centre.x;
        const rz = t.z - centre.z;
        return rx * ux + rz * uz >= 1.5 && Math.abs(rx * -uz + rz * ux) <= width / 2;
      }),
    );
  }

  /** His quadrant's floor: bands run to its edge. */
  private platform(): ATile[] {
    return quadrantTiles(this.quadrant).filter((t) => this.fight.isFloor(t));
  }

  private byDistance(tiles: ATile[]): ATile[] {
    const centre = bodyCentre(this.body());
    return tiles.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
  }

  /**
   * The charged blade: one saw per quadrant he has destroyed, plus one. Saw i cuts at P+5+3i, on the tick his loop
   * animation (the last saw's: the end animation) plays [K]. An overhead up on the tick before is severed and locked
   * for P3.severTicks; Protect from Melee up as it cuts blocks it. So prayer off on P+4+3i, on for the cut, off again
   * before the next. [K] [V] duo 18:52-18:56 and 21:33-21:36, Love's melee flick guide [W]
   */
  private spin(): void {
    const { fight } = this;
    const boss = this.boss;
    this.stationary = true;
    boss.playAnimation(SEQ.p3PrayerIn);
    boss.addSpotAnim({ id: SPOT.meleePrayerIn, channel: "spin" });
    // A quadrant that falls mid-spin cuts the rest of it short.
    const rotation = this.rotation;
    const still = () => rotation === this.rotation;
    fight.after(this.segment === 0 ? P3.debrisIntoSpin.first : P3.debrisIntoSpin.later, () => {
      if (still()) this.debris();
    });
    fight.after(P3.spinOpens, () => {
      if (still() && reach(fight.playerTile, boss.tile) <= 8) fight.hit({ style: "melee", amount: (prayer) => (prayer === "melee" ? 0 : fight.rng.roll(P3.spinOpeningDamage)) });
    });
    const loops = this.fight.destroyed.size;
    for (let i = 0; i <= loops; i++) {
      const last = i === loops;
      const cut = P3.sawFirstCut + P3.sawEvery * i;
      fight.after(cut - P3.sawShowsBefore, () => {
        if (still()) boss.addSpotAnim({ id: last ? SPOT.meleePrayerOut : SPOT.meleePrayer, channel: "spin" });
      });
      fight.after(cut - 1, () => {
        if (!still() || fight.player.protection === null) return;
        fight.player.prayerController.disableProtectionPrayersForTicks(P3.severTicks);
        fight.message("Ocellus disrupts your concentration, severing your prayer!", CHAT.red);
        fight.message("You've been injured and can't use protection prayers!", CHAT.red);
      });
      fight.after(cut, () => {
        if (!still()) return;
        boss.playAnimation(last ? SEQ.p3PrayerOut : SEQ.p3PrayerLoop);
        if (last) this.stationary = false;
        if (reach(fight.playerTile, this.boss.tile) > 8) return;
        fight.hit({ style: "melee", amount: (prayer) => (prayer === "melee" ? 0 : fight.rng.roll(P3.spinDamage)) });
      });
    }
    const lastCut = P3.sawFirstCut + P3.sawEvery * loops;
    // The quadrant's 1st and 3rd spins bring the vine with his next move. [K]
    this.quadrantSpins++;
    const vine = P3.vineAfterSpins.some((n) => n === this.quadrantSpins);
    this.next(lastCut + P3.afterSpin, () => {
      if (vine) this.spawnVine();
      this.swing();
    });
  }

  /** "Your panic... is futile...": a magic shot at everyone, landing 2 ticks on, that leaves a void patch. [R] [K] */
  private panic(): void {
    const { fight } = this;
    const boss = this.boss;
    fight.say("Your panic... is futile...", 3);
    boss.playAnimation(SEQ.p3ProjectileAll);
    boss.addSpotAnim({ id: SPOT.magicOnBoss, channel: "magic" });
    fight.hit({
      from: boss,
      style: "magic",
      delay: P3.panicLands,
      amount: fight.prayable("magic", P3.volleyDamage),
      visuals: { spotAnim: { id: SPOT.magicProjectile }, startCycleOffset: 45, endCycleOffset: 60, verticalOffset: 1 },
      onLand: () => {
        fight.player.addSpotAnim({ id: SPOT.magicImpact, channel: "impact" });
        this.addPatch(fight.playerTile, fight.rng.roll(P3.patchLasts), "aoe");
      },
    });
  }

  /**
   * Void bombs: one over you (in a team, over everyone but the tank) and one on the same tile turned into each other
   * standing quadrant. Each shows (4299) two ticks before it drops and leaves a void that stays until its quadrant
   * falls, so where you stand now decides where the last quadrant's voids sit in phase 4: the edge, not the middle.
   * [R] [M] [K]
   */
  private bombOverhead(): void {
    const { player } = this.fight;
    player.addSpotAnim({ id: SPOT.bombSpawn, channel: "bomb" });
    this.fight.after(1, () => player.addSpotAnim({ id: SPOT.bombIdle, channel: "bomb" }));
  }

  private bombs(): void {
    const { fight } = this;
    const here = fight.playerTile;
    const from = quadrantOf(here) ?? sideQuadrant(here);
    for (const q of QUADRANTS) {
      if (fight.destroyed.has(q)) continue;
      const tile = turnInto(here, from, q);
      if (!fight.isWalkable(tile) || covers(this.body(), tile)) continue;
      fight.spot(tile, SPOT.bombIdle, { height: 2, loopTicks: 1, maxTicks: P3.bombDropAfter });
      this.telegraphs.push({ tiles: [tile], landsAt: fight.tick + P3.bombDropAfter, colour: 0x8a2be2 });
      fight.after(P3.bombDropAfter, () => {
        fight.spot(tile, SPOT.bombDrop, { maxTicks: 3 });
        fight.spot(tile, SPOT.bombImpact, { maxTicks: 3 });
        if (same(fight.playerTile, tile)) fight.hit({ amount: () => fight.rng.roll(P3.bombDamage) });
        this.addPatch(tile, Infinity, "bomb");
      });
    }
  }

  /** Rubble over you during the spin: it falls slowly, so one step clears it, and leaves a void patch. [R] [M] */
  private debris(): void {
    if (this.levitating) return;
    const { fight } = this;
    const tile = fight.playerTile;
    fight.spot(tile, SPOT.fallingDebris, { maxTicks: P3.debrisFalls + 1 });
    this.telegraphs.push({ tiles: [tile], landsAt: fight.tick + P3.debrisFalls, colour: 0x8a6a3a });
    fight.after(P3.debrisFalls, () => {
      if (same(fight.playerTile, tile)) fight.hit({ amount: () => fight.rng.roll(P3.debrisDamage) });
      this.addPatch(tile, fight.rng.roll(P3.patchLasts), "aoe");
    });
  }

  /** A patch replaces a shorter-lived one on its tile; a bomb's void outlasts anything dropped on it later. */
  private addPatch(tile: ATile, lasts: number, kind: VoidLocKind): void {
    if (!this.fight.isFloor(tile)) return;
    const until = this.fight.tick + lasts;
    if (this.patches.some((p) => same(p.tile, tile) && p.until >= until)) return;
    this.patches = this.patches.filter((p) => !same(p.tile, tile));
    this.patches.push({ tile, until, placed: this.fight.tick, kind });
  }

  /** The patches as the game draws them, each kind its own loc. */
  private patchViews(): LocView[] {
    if (this.finished) return [];
    return this.patches.map((p) => ({ key: `${p.kind}:${p.placed}:${p.tile.x},${p.tile.z}`, tile: p.tile, models: VOID_LOC[p.kind].models }));
  }

  /** "The void... will take you...", and 3 ticks later a vine roots you where you stand then. [K] */
  private spawnVine(): void {
    const { fight } = this;
    fight.say(fight.rng.chance(0.5) ? "The void... will take you..." : "Await... the void...", 4);
    const rotation = this.rotation;
    fight.after(P3.vineRootsAfter, () => {
      if (rotation === this.rotation && !this.levitating) this.rootInVine();
    });
  }

  /** The vine holds you until it dies (step keeps you rooted). [K] */
  private rootInVine(): void {
    const { fight } = this;
    this.releaseVine();
    const tile = fight.playerTile;
    const vine = new VoidAdd(fight.region, tile, "vine", () => this.vineBroken());
    vine.currentStats.hitpoint = P3.vineHp;
    vine.attackable = fight.options.soloVine;
    fight.region.addMob(vine);
    this.vine = vine;
    fight.player.freeze(2);
    fight.player.addSpotAnim({ id: SPOT.entangleStart, channel: "vine" });
    fight.after(1, () => fight.player.addSpotAnim({ id: SPOT.entangleIdle, channel: "vine" }));
    fight.message("You've been rooted in place!", CHAT.red);
    // Solo, the vine sits on your own tile behind his body, where a click finds him first: your attack goes to it, as a
    // teammate's would in a team. Clicking him switches back.
    if (vine.attackable) fight.player.setAggro(vine);
    // Without "attack your own vine", a teammate cuts it.
    else {
      fight.after(P3.vineCutByTeammate, () => {
        if (this.vine === vine) this.vineBroken();
      });
    }
  }

  private vineBroken(): void {
    this.fight.message("You break free of the vine.", CHAT.green);
    this.releaseVine();
  }

  private releaseVine(): void {
    const vine = this.vine;
    if (!vine) return;
    this.vine = null;
    vine.remove();
    this.fight.player.frozen = 0;
    this.fight.player.addSpotAnim({ id: SPOT.entangleEnd, channel: "vine" });
  }

  /** "Insolence...": three superior slashes, then his swings again 20 ticks after the shout. [K] */
  private insolence(): void {
    const { fight } = this;
    fight.say("Insolence...", 3);
    const rotation = this.rotation;
    for (let i = 0; i < P3.insolenceSlashes; i++) {
      fight.after(P3.insolenceFirst + i * P3.insolenceEvery, () => {
        if (rotation === this.rotation) this.superiorSlash();
      });
    }
    this.next(P3.afterInsolence, () => this.swing());
  }

  /**
   * A band at one raider each (solo: you), at any angle, landing 3 ticks after his animation. He interacts with nobody
   * through Insolence, only turning to the band. [K]
   */
  private superiorSlash(): void {
    const { fight } = this;
    const boss = this.boss;
    const band = this.bandTowardsPlayer(P3.waveWidth);
    boss.playAnimation(SEQ.p3SuperiorSlash);
    boss.face(null);
    boss.faceTile(fight.playerTile);
    this.telegraphs.push({ tiles: band, landsAt: fight.tick + P3.insolenceLands, colour: 0x5a0a0a });
    fight.after(P3.insolenceLands, () => {
      const middle = band.filter((t, i) => i % 3 === 0);
      middle.forEach((t, i) => fight.spot(t, SPOT.superiorSlash, { delay: i, maxTicks: 3 }));
      if (band.some((t) => same(t, fight.playerTile))) fight.hit({ amount: () => fight.rng.roll(P3.insolenceDamage) });
      const sorted = [...band].sort((a, b) => reach(a, this.boss.tile) - reach(b, this.boss.tile));
      [0.2, 0.5, 0.85].forEach((f) => {
        const t = sorted[Math.floor(f * (sorted.length - 1))];
        if (t) this.addPatch(t, P3.insolenceDebrisLasts, "insolence");
      });
    });
  }

  private spawnRift(): void {
    const { fight } = this;
    const kind = this.riftKind ?? "rift-basic";
    const tiles = quadrantTiles(this.quadrant).filter((t) => fight.isWalkable(t) && distanceToBody(this.body(), t) >= 2);
    if (tiles.length === 0) return;
    const tile = fight.rng.pick(tiles);
    const rift = new VoidAdd(fight.region, tile, kind, (add) => this.riftKilled(add));
    fight.region.addMob(rift);
    this.rifts.push(rift);
    // Left alive, it detonates 30 ticks on and hits you. [K]
    fight.after(P3.riftDetonatesAfter, () => {
      if (rift.killed || !this.rifts.includes(rift)) return;
      this.rifts = this.rifts.filter((r) => r !== rift);
      rift.remove();
      fight.spot(tile, SPOT.voidChainExplosion, { maxTicks: 3 });
      fight.hit({ amount: () => fight.rng.roll(P3.riftDetonationDamage) });
    });
    // A healing one heals him every 4 ticks until then.
    if (kind !== "rift-heal") return;
    const heal = () => {
      if (rift.killed || !this.rifts.includes(rift)) return;
      fight.shoot(rift, bodyCentreTile(this.body()), 1, { spotAnim: { id: SPOT.healingFlare }, startCycleOffset: 0, endCycleOffset: 30, verticalOffset: 0.5 });
      const blocked = lineBetween(tile, bodyCentreTile(this.body())).some((t) => same(t, fight.playerTile));
      if (!blocked) fight.healBoss(fight.rng.pick(P3.healRiftHeal));
      fight.after(P3.healRiftEvery, heal);
    };
    fight.after(P3.healRiftEvery, heal);
  }

  private riftKilled(add: VoidAdd): void {
    const { fight } = this;
    this.rifts = this.rifts.filter((r) => r !== add);
    if (add.kind === "rift-heal") return;
    const name = add.kind === "rift-buff" ? "void augmenter" : "void rift";
    fight.message(`Destroying the ${name} empowers you!`, CHAT.purple);
    fight.player.addSpotAnim({ id: add.kind === "rift-buff" ? SPOT.glowZaros : SPOT.glowArmadyl, channel: "empower" });
    if (add.kind === "rift-buff") {
      // Attack and Strength to 116, Magic and Ranged to 112 from 99s. [W] Void Augmenter
      const { stats, currentStats } = fight.player;
      currentStats.attack = Math.max(currentStats.attack, stats.attack + P3.augmenterBoost.melee);
      currentStats.strength = Math.max(currentStats.strength, stats.strength + P3.augmenterBoost.melee);
      currentStats.range = Math.max(currentStats.range, stats.range + P3.augmenterBoost.rangedMagic);
      currentStats.magic = Math.max(currentStats.magic, stats.magic + P3.augmenterBoost.rangedMagic);
    } else {
      // "It empowers you, resetting your tick cool down." [W] Void Rift
      fight.player.attackDelay = 0;
    }
  }

  // ---- Untether and the quadrant's end ------------------------------------------------------------------------------

  private startUntether(): void {
    const { fight } = this;
    const boss = this.boss;
    const q = this.quadrant;
    this.levitating = true;
    this.stationary = true;
    if (this.vine) this.releaseVine();
    fight.say("Untether...", 3);
    boss.teleport(CORNERS[q]);
    boss.face(null);
    boss.faceTile(at(0, 0));
    boss.playAnimation(SEQ.p3UnleashIn);
    fight.setOverhead("protect-melee");
    // His 3x3: be under it for the slam, then one tile out for the aftershock.
    this.zone = this.body();
    const u = P3.untether;
    fight.after(2, () => (boss.pose = SEQ.p3UnleashLoop));
    u.pools.forEach((t, wave) => fight.after(t, () => this.untetherPools(wave > 0)));
    for (const t of u.magic) fight.after(t - u.magicFlight, () => this.untetherShot());
    fight.after(u.unleashVfx, () => boss.addSpotAnim({ id: SPOT.unleashOnBoss, channel: "unleash" }));
    fight.after(u.erupt, () => {
      this.zoneGlow = 1;
      const rotation = { NE: 2, NW: 1, SW: 0, SE: 3 }[q];
      fight.spot(bodyCentreTile(this.body()), SPOT.unleashArena[rotation], { maxTicks: 6 });
    });
    // Brightest on the tick to click out: you leave his 3x3 on the slam's tick, after it has judged you.
    fight.after(u.slam - 1, () => (this.zoneGlow = 2));
    // Each is judged on where you stood at the end of the tick before. [K]
    fight.after(u.slam, () => {
      boss.pose = null;
      boss.playAnimation(SEQ.p3UnleashOut);
      this.zoneGlow = 0;
      this.zone = null;
      if (!covers(this.body(), fight.playerTile)) fight.hit({ amount: () => fight.rng.roll(u.slamDamage) });
    });
    fight.after(u.aftershock, () => {
      if (covers(this.body(), fight.playerTile)) fight.hit({ amount: () => fight.rng.roll(u.aftershockDamage) });
    });
    fight.after(u.obliteration, () => this.obliterateWhenDue(q));
  }

  /** His HP shown as a whole percentage is down to this quadrant's 75 / 50 / 25: under 76% and so on. [V] duo HUD */
  private atThreshold(): boolean {
    const shown = Math.floor((100 * this.boss.currentStats.hitpoint) / this.fight.poolMax);
    return shown <= Math.round(this.floorFraction * 100);
  }

  /**
   * His HP is down to the quadrant's floor: the quadrant falls on the next tick, whatever he is doing ([K] 23:03: in
   * place of a set's slash). Attacks already under way still land. During Untether it waits for U+31.
   */
  private collapseDue(): boolean {
    if (!this.landed || this.finished || this.collapsing || this.levitating || !this.atThreshold()) return false;
    this.obliterate(this.quadrant);
    return true;
  }

  /**
   * After Untether the quadrant falls if his HP is already down to its threshold (both of [R]'s fights, and kills 1
   * and 2 in [K]). Otherwise it stands: he comes down in his corner and swings again at U+37. [K]
   */
  private obliterateWhenDue(q: Quadrant): void {
    if (this.atThreshold()) {
      this.obliterate(q);
      return;
    }
    const { fight } = this;
    this.levitating = false;
    this.stationary = false;
    this.sets = 0;
    this.swings = 0;
    this.boss.pose = null;
    fight.setOverhead(null);
    this.boss.face(fight.player);
    const u = P3.untether;
    this.next(u.swingsAgain - u.obliteration, () => this.swing());
  }

  /** The magic's splash, not a hazard: from the second wave one lands under you as the shot hits. */
  private untetherPools(underYou: boolean): void {
    const { fight } = this;
    const here = fight.playerTile;
    const tiles = quadrantTiles(this.quadrant).filter((t) => fight.isWalkable(t) && !same(t, here) && !(this.zone && covers(this.zone, t)));
    const extras = fight.rng.shuffle(tiles).slice(0, fight.rng.roll(P3.untether.poolsPerWave) - (underYou ? 1 : 0));
    for (const tile of underYou ? [here, ...extras] : extras) fight.spot(tile, SPOT.p2Pool, { maxTicks: 4 });
  }

  /** Magic from the air with each pool wave after the first, so Untether is prayed with Protect from Magic. [M] [R] [K] */
  private untetherShot(): void {
    const { fight } = this;
    fight.hit({
      from: this.boss,
      style: "magic",
      delay: P3.untether.magicFlight,
      amount: fight.prayable("magic", P3.untether.magicDamage),
      visuals: { spotAnim: { id: SPOT.magicProjectile }, startCycleOffset: 45, endCycleOffset: 60, verticalOffset: 1 },
      onLand: () => fight.player.addSpotAnim({ id: SPOT.magicImpact, channel: "impact" }),
    });
  }

  private obliterate(q: Quadrant): void {
    const { fight } = this;
    const boss = this.boss;
    const u = P3.untether;
    this.rotation++;
    this.collapsing = true;
    this.stationary = true;
    // A slash he no longer swings; one already swung still lands.
    this.telegraphs = this.telegraphs.filter((t) => t.colour !== SLASH_MARK || t.landsAt <= fight.tick);
    // You can't cross the stones rooted.
    this.releaseVine();
    fight.say(fight.rng.chance(0.5) ? "Obliteration..." : "Run... It matters not...", 4);
    boss.playAnimation(SEQ.p3QuadrantDestroyIn);
    boss.addSpotAnim({ id: SPOT.collapseIn, channel: "collapse" });
    fight.setCrumbling([q]);
    fight.message("The quadrant begins to collapse! Jump across the stones!", CHAT.red);
    fight.after(2, () => {
      boss.pose = SEQ.p3QuadrantDestroyLoop;
      boss.addSpotAnim({ id: SPOT.collapseLoop, channel: "collapse" });
    });
    const tiles = quadrantTiles(q);
    for (let t = 2; t < u.gone - u.obliteration; t += 2) {
      fight.after(t, () => {
        for (let i = 0; i < 4; i++) fight.spot(fight.rng.pick(tiles), fight.rng.pick(SPOT.collapsingExplosion), { maxTicks: 5 });
      });
    }
    fight.after(u.escapeLine - u.obliteration, () => {
      fight.say(fight.rng.pick(["You can't... escape... the end...", "This end... comes...", "Everything... ends..."]), 3);
      boss.playAnimation(SEQ.p3UnleashOut90);
      boss.addSpotAnim({ id: SPOT.collapseOut1, channel: "collapse" });
    });
    fight.after(u.gone - u.obliteration, () => {
      const here = fight.playerTile;
      const onIt = quadrantOf(here) === q && !this.crossing?.hopping;
      fight.removeFloor(tiles);
      fight.destroyed.add(q);
      fight.setCrumbling([]);
      this.patches = this.patches.filter((p) => quadrantOf(p.tile) !== q);
      // Rifts left alive go with their quadrant.
      this.rifts.forEach((r) => r.remove());
      this.rifts = [];
      boss.pose = null;
      boss.hidden = true;
      boss.attackable = false;
      if (onIt) {
        fight.message("The void consumes you.", CHAT.red);
        fight.hit({ amount: () => 255 });
      }
      this.segment++;
      if (this.segment < P3.hpFloors.length) {
        this.floorFraction = P3.hpFloors[this.segment];
        return;
      }
      // This tick is the phase 4 drill's tick 0, and its lead-in keeps him hidden 4 more ticks.
      this.finished = true;
      fight.lingeringVoids = this.patches.filter((p) => p.until === Infinity).map(({ tile, placed }) => ({ tile, placed }));
      fight.options.onHandOver(handOverOf(fight.player, boss));
    });
    fight.after(u.nextSegment - u.obliteration, () => {
      if (this.finished) return;
      this.levitating = false;
      boss.hidden = false;
      const here = quadrantOf(fight.playerTile);
      this.startSegment(here && !fight.destroyed.has(here) ? here : this.nearestStanding(q));
    });
  }

  private nearestStanding(from: Quadrant): Quadrant {
    for (const step of [-1, 1, 2]) {
      const q = clockwise(from, step);
      if (!this.fight.destroyed.has(q)) return q;
    }
    return from;
  }

  // ---- per tick ---------------------------------------------------------------------------------------------------

  step(): void {
    const { fight } = this;
    this.telegraphs = this.telegraphs.filter((t) => t.landsAt >= fight.tick);
    this.patches = this.patches.filter((p) => p.until > fight.tick);
    const here = fight.playerTile;
    const patch = this.patches.find((p) => same(p.tile, here));
    if (patch && (fight.tick - patch.placed) % 2 === 0) fight.hit({ amount: () => fight.rng.roll(P3.patchDamage) });
    this.stepCrossing();
    // The vine holds you for as long as it lives.
    if (this.vine) fight.player.freeze(2);
    if (this.collapseDue()) return;
    if (!this.levitating && !this.stationary) this.chase();
  }

  /** He walks after his tank, inside his own quadrant. */
  private chase(): void {
    const boss = this.boss;
    if (boss.hidden || this.inMelee()) return;
    const here = this.fight.playerTile;
    if (quadrantOf(here) !== this.quadrant) return;
    const sw = boss.tile;
    const centre = bodyCentre(this.body());
    const dx = sign(Math.round(here.x - centre.x));
    const dz = sign(Math.round(here.z - centre.z));
    const options = [at(sw.x + dx, sw.z + dz), at(sw.x + dx, sw.z), at(sw.x, sw.z + dz)];
    for (const next of options) {
      if (next.x === sw.x && next.z === sw.z) continue;
      const body: Body = { sw: next, size: 3 };
      if (covers(body, here)) continue;
      let fits = true;
      for (let x = 0; x < 3 && fits; x++) for (let z = 0; z < 3 && fits; z++) {
        const t = at(next.x + x, next.z + z);
        if (!this.fight.isWalkable(t) || quadrantOf(t) !== this.quadrant) fits = false;
      }
      if (fits) {
        boss.stepTo(next);
        return;
      }
    }
  }

  // ---- stepping stones and censers -------------------------------------------------------------------------------

  interceptWalk(to: ATile): boolean {
    const { fight } = this;
    if (this.crossing?.hopping) return true;
    for (const [q, censer] of fight.censers) {
      if (reach(to, censer.tile) <= 1) {
        this.useCenser(q);
        return true;
      }
    }
    const from = quadrantOf(fight.playerTile);
    if (from === null) return false;
    const stoneArm = ARMS.find((arm) => stonesOf(arm).some((s) => same(s, to)));
    let target: Quadrant | null = null;
    let arm: Arm | null = null;
    if (stoneArm) {
      arm = stoneArm;
      const [a, b] = quadrantsOfArm(stoneArm);
      target = from === a ? b : from === b ? a : null;
    } else {
      const dest = quadrantOf(to);
      if (dest && dest !== from) {
        arm = armBetween(from, dest);
        target = arm ? dest : null;
        if (!arm) {
          fight.message("You can't jump that far; cross one chasm at a time.", CHAT.game);
          return true;
        }
      }
    }
    if (!arm || !target) {
      this.crossing = null;
      return false;
    }
    if (fight.destroyed.has(target)) {
      fight.message("There is nothing left over there.", CHAT.game);
      return true;
    }
    const stones = stonesOf(arm);
    const bank = bankBeside(stones[0], arm, from);
    const landing = bankBeside(stones[2], arm, target);
    this.crossing = { arm, from, to: target, bank, hops: [...stones, landing], hopping: false };
    if (same(fight.playerTile, bank)) this.crossing.hopping = true;
    else fight.player.walkDirect(bank);
    return true;
  }

  private stepCrossing(): void {
    const crossing = this.crossing;
    if (!crossing) return;
    const { fight } = this;
    if (!crossing.hopping) {
      if (same(fight.playerTile, crossing.bank)) crossing.hopping = true;
      else if (!fight.player.destinationLocation) this.crossing = null;
      return;
    }
    const next = crossing.hops.shift();
    if (!next) {
      this.crossing = null;
      return;
    }
    fight.player.hop(next);
    fight.player.freeze(1);
    if (crossing.hops.length === 0) this.crossing = null;
  }

  private useCenser(q: Quadrant): void {
    const { fight } = this;
    const censer = fight.censers.get(q);
    if (!censer) return;
    if (censer.lit) {
      fight.message("The censer has already been lit.", CHAT.game);
      return;
    }
    if (quadrantOf(fight.playerTile) !== q) {
      fight.message("You need to be in this quadrant to light its censer.", CHAT.game);
      return;
    }
    fight.lightCenser(q);
    fight.player.addSpotAnim({ id: GOD_GLOW[censer.god], channel: "censer" });
    fight.message(`You light the ${GOD_NAME[censer.god]} censer.`, CHAT.purple);
    switch (censer.god) {
      case "bandos":
      case "armadyl":
        this.boss.grantMaxDamageRollsOnNextIncomingAttack();
        fight.message("Your next hit will be a maximum hit.", CHAT.purple);
        return;
      case "zaros":
        fight.player.currentStats.specialAttack = Math.min(100, fight.player.currentStats.specialAttack + 50);
        return;
      case "saradomin":
        fight.player.currentStats.hitpoint += 50;
        fight.player.currentStats.prayer = Math.min(fight.player.stats.prayer ?? 99, (fight.player.currentStats.prayer ?? 0) + 50);
        return;
      default: {
        const unhandled: never = censer.god;
        return unhandled;
      }
    }
  }

  tileActions(tile: ATile): readonly Readonly<{ label: string; target: string; run: () => void }>[] {
    const actions: { label: string; target: string; run: () => void }[] = [];
    for (const [q, censer] of this.fight.censers) {
      if (reach(tile, censer.tile) <= 1) actions.push({ label: "Interact", target: `${GOD_NAME[censer.god]} censer`, run: () => this.useCenser(q) });
    }
    if (ARMS.some((arm) => stonesOf(arm).some((s) => same(s, tile)))) {
      actions.push({ label: "Jump", target: "Stepping stone", run: () => this.interceptWalk(tile) });
    }
    return actions;
  }

  // ---- PhaseScript ------------------------------------------------------------------------------------------------

  hpFloor(): number {
    return Math.ceil(this.fight.poolMax * this.floorFraction);
  }

  allowsDeath(): boolean {
    return false;
  }

  acceptsAttack(style: Style): boolean {
    const boss = this.fight.boss;
    if (!boss) return false;
    return !(style === "melee" && boss.overhead === "protect-melee");
  }

  playerAttacking(target: Unit, style: Style): boolean {
    if (target !== this.fight.boss || style !== "melee" || !this.levitating) return true;
    if (this.fight.tick - this.lastFlyingMessage >= 3) {
      this.fight.message("It's flying too high to hit using melee.", CHAT.game);
      this.lastFlyingMessage = this.fight.tick;
    }
    return false;
  }

  meter(): number | null {
    return null;
  }

  /** A threshold reached is picked up on the next tick he is free (step, collapseDue). */
  onBossHit(): void {}

  marks(): readonly TileMark[] {
    const marks: TileMark[] = [];
    for (const t of this.telegraphs) for (const tile of t.tiles) marks.push({ tile, colour: t.colour === SLASH_MARK ? 0xb01030 : t.colour, opacity: 0.35, inset: 0.06 });
    if (this.zone) {
      for (let x = 0; x < this.zone.size; x++) {
        for (let z = 0; z < this.zone.size; z++) {
          const tile = at(this.zone.sw.x + x, this.zone.sw.z + z);
          if (this.fight.isFloor(tile)) marks.push({ tile, colour: 0x9f48bd, opacity: this.zoneGlow === 2 ? 0.55 : this.zoneGlow === 1 ? 0.4 : 0.25, inset: 0.03 });
        }
      }
    }
    if (this.crossing) {
      marks.push({ tile: this.crossing.bank, colour: 0x2bff73, opacity: 0.35, inset: 0.1 });
      for (const hop of this.crossing.hops) marks.push({ tile: hop, colour: 0x2bff73, opacity: 0.2, inset: 0.2 });
    }
    return marks;
  }

  get done(): boolean {
    return this.finished;
  }
}

function sideQuadrant(t: ATile): Quadrant {
  if (t.x >= 0) return t.z >= 0 ? "NE" : "SE";
  return t.z >= 0 ? "NW" : "SW";
}

function quadrantsOfArm(arm: Arm): readonly [Quadrant, Quadrant] {
  const found = QUADRANTS.filter((q) => armsOf(q).includes(arm));
  return [found[0], found[1]];
}

function bodyCentreTile(body: Body): ATile {
  const c = bodyCentre(body);
  return at(Math.round(c.x), Math.round(c.z));
}

function lineBetween(a: ATile, b: ATile): ATile[] {
  const tiles: ATile[] = [];
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
  for (let i = 1; i < steps; i++) tiles.push(at(Math.round(a.x + ((b.x - a.x) * i) / steps), Math.round(a.z + ((b.z - a.z) * i) / steps)));
  return tiles;
}

