import { InvisibleMovementBlocker, Projectile, Sound, SoundCache, TileMarker, cacheSound } from "osrs-sdk";
import type { Entity, Location3, ProjectileVisuals, Region, Unit } from "osrs-sdk";
import type { CenserLook, FloorState } from "./arena";
import type { BossOverhead, Range } from "./data";
import { P1, P2, SOUND, scaledHp } from "./data";
import type { SpotOptions, TileMark } from "./effects";
import { GroundSpot } from "./effects";
import type { HandOver } from "./handOver";
import type { ATile, Quadrant } from "./geometry";
import { CENSERS, GRID, QUADRANTS, QUADRANT_SIGN, TileSet, at, fromSdk, inRoom, key, quadrantOf, toSdk } from "./geometry";
import { Rng } from "./rng";
import type { BossHooks, Form, PlayerHooks, Style } from "./units";
import { BossForm, FightPlayer } from "./units";

/** Phase 3's third fall hands the fight to our phase 4 drill, so his phase 4 is not a start phase. */
export const START_PHASES = [1, 2, 3] as const;
export type StartPhase = (typeof START_PHASES)[number];

export type FightOptions = Readonly<{
  seed: number;
  party: number;
  startPhase: StartPhase;
  hazardTiles: boolean;
  videoMarkers: boolean;
  /** Mark J R V's phase 2 skip tiles. */
  skipMarkers: boolean;
  soloVine: boolean;
  invincible: boolean;
  onHandOver: (state: HandOver) => void;
}>;

export type ChatLine = Readonly<{ text: string; colour: string; tick: number }>;

export type Outcome = Readonly<{ kind: "running" }> | Readonly<{ kind: "won"; ticks: number }> | Readonly<{ kind: "lost"; ticks: number; cause: string }>;

/** A phase of the fight. Each one owns its script and hands over to the next. */
export interface PhaseScript {
  readonly label: string;
  begin(): void;
  step(): void;
  marks(): readonly TileMark[];
  /** Boss HP may not drop below this while the phase runs (phase 3's quadrant floors, phase 1's end). */
  hpFloor(): number;
  allowsDeath(): boolean;
  acceptsAttack(style: Style): boolean;
  playerAttacking(target: Unit, style: Style): boolean;
  interceptWalk(to: ATile): boolean;
  /** The phase's own HUD numbers (phase 1's meter). */
  meter(): number | null;
  onBossHit(): void;
  incomingDamageFactor?(): number;
  /** Extra right-click options on a tile (stepping stones, censers). */
  tileActions?(tile: ATile): readonly Readonly<{ label: string; target: string; run: () => void }>[];
}

type Scheduled = Readonly<{ at: number; generation: number; run: () => void }>;
const ALWAYS = -1;

export const CHAT = {
  game: "#000000",
  red: "#ef1020",
  purple: "#7f00ff",
  boss: "#a32ac9",
  green: "#0b6e0b",
  blue: "#0000ff",
} as const;

class FightHit extends Projectile {
  constructor(from: Unit, to: Unit, attackStyle: string, delay: number, private readonly resolve: () => number, visuals: ProjectileVisuals = { hidden: true }) {
    super(null, 0, from, to, attackStyle, { setDelay: delay, visuals });
  }

  override beforeHit(): void {
    super.beforeHit();
    const amount = this.resolve();
    const target = this.to;
    if ("currentStats" in target && amount > 0) this.damage = Math.min(amount, target.currentStats.hitpoint);
    else this.damage = amount;
  }
}

/** A purely visual shot to a tile (phase 2's portals). */
class Shot extends Projectile {
  constructor(from: Unit, to: Location3, delay: number, visuals: ProjectileVisuals) {
    super(null, 0, from, to, "magic", { setDelay: delay, visuals });
  }
}

export type HitSpec = Readonly<{
  /** Damage, rolled when the hit lands. Negative heals. */
  amount: (prayer: Style | null) => number;
  /** Ticks from now until it lands; 0 lands this tick (hits queued before the player's step land the same tick). */
  delay?: number;
  from?: Unit;
  style?: Style | null;
  visuals?: ProjectileVisuals;
  onLand?: (applied: number) => void;
}>;

export class Fight implements BossHooks, PlayerHooks {
  readonly rng: Rng;
  tick = 0;
  started = false;
  outcome: Outcome = { kind: "running" };
  readonly chat: ChatLine[] = [];
  boss: BossForm | null = null;
  player: FightPlayer;
  phase: PhaseScript | null = null;
  barColour = "#00b4b4";
  poolMax: number;
  private scheduled: Scheduled[] = [];
  private generation = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private floorTiles = new TileSet();
  private blockedExtra = new TileSet();
  private stoneTiles: ATile[] = [];
  private crumbling: Quadrant[] = [];
  private floorKey = 0;
  private blockers = new Map<string, InvisibleMovementBlocker>();
  readonly censers = new Map<Quadrant, CenserLook>();
  destroyed = new Set<Quadrant>();
  /** Phase 3's void bombs on the last quadrant: they stay through phase 4. */
  lingeringVoids: readonly Readonly<{ tile: ATile; placed: number }>[] = [];
  /** Practice mode (hits never kill, prayer never runs out), from the options but switchable from the sidebar. */
  practice: boolean;
  private prayerLeft = 1;
  private readonly makePhase: (n: StartPhase, fight: Fight) => PhaseScript;
  private markerEntities: Entity[] = [];
  private skipEntities: Entity[] = [];
  private skipTiles: boolean;
  private showHazardTiles: boolean;
  private voidLayers = new Map<string, readonly ATile[]>();
  private voidVersion = 0;
  private voidCache: Readonly<{ key: string; tiles: readonly ATile[] }> = { key: "0", tiles: [] };

  constructor(readonly region: Region, readonly options: FightOptions, player: FightPlayer, makePhase: (n: StartPhase, fight: Fight) => PhaseScript) {
    this.rng = new Rng(options.seed);
    this.player = player;
    this.poolMax = scaledHp(P2.hp, options.party);
    this.practice = options.invincible;
    this.skipTiles = options.skipMarkers;
    this.showHazardTiles = options.hazardTiles;
    this.makePhase = makePhase;
    player.hooks = this;
    for (const q of QUADRANTS) this.censers.set(q, { tile: CENSERS[q].tile, god: CENSERS[q].god, lit: false });
    this.setFloor(roomFloor());
  }

  // ---- lifecycle ------------------------------------------------------------------------------------------------

  start(): void {
    this.started = true;
    this.enterPhase(this.options.startPhase);
    if (this.options.videoMarkers) this.showVideoMarkers();
  }

  enterPhase(n: StartPhase): void {
    this.generation++;
    this.phase = this.makePhase(n, this);
    this.phase.begin();
    this.refreshSkipMarkers();
    this.changed();
  }

  /** Called at the start of every game tick, before NPCs act, by the fight clock. */
  step(): void {
    if (!this.started || this.outcome.kind !== "running") return;
    this.tick++;
    const due = this.scheduled.filter((s) => s.at <= this.tick);
    this.scheduled = this.scheduled.filter((s) => s.at > this.tick);
    for (const s of due) if (s.generation === this.generation || s.generation === ALWAYS) s.run();
    this.phase?.step();
    const stats = this.player.currentStats;
    // Practice refills a living player. Hitpoints already at 0 are a death, and a refill would clear it before the SDK's death check.
    if (this.practice && stats.hitpoint > 0 && stats.hitpoint < 30) stats.hitpoint = this.player.stats.hitpoint;
    // Practice keeps prayer up too; otherwise say why the prayers just went out, as the game does.
    const prayer = stats.prayer ?? 0;
    if (this.practice && prayer < 10) stats.prayer = this.player.stats.prayer ?? 99;
    if (prayer <= 0 && this.prayerLeft > 0 && !this.practice) this.message("You have run out of Prayer points. Drink a super restore.", CHAT.game);
    this.prayerLeft = stats.prayer ?? 0;
    this.changed();
  }

  /** Run fn `ticks` from now, cancelled if the phase changes first. */
  after(ticks: number, run: () => void): void {
    this.scheduled.push({ at: this.tick + Math.max(1, ticks), generation: this.generation, run });
  }

  /** Same, but survives phase changes (transformations that straddle a phase boundary). */
  afterAlways(ticks: number, run: () => void): void {
    this.scheduled.push({ at: this.tick + Math.max(1, ticks), generation: ALWAYS, run });
  }

  win(): void {
    if (this.outcome.kind !== "running") return;
    this.outcome = { kind: "won", ticks: this.tick };
    this.message(`Challenge complete: Ocellus. Duration: ${formatTicks(this.tick)}`, CHAT.game);
    this.changed();
  }

  lose(cause: string): void {
    if (this.outcome.kind !== "running") return;
    this.outcome = { kind: "lost", ticks: this.tick, cause };
    this.message("Oh dear, you are dead!", CHAT.game);
    this.changed();
  }

  // ---- hooks the SDK units call ---------------------------------------------------------------------------------

  allowsDeath(): boolean {
    return this.phase?.allowsDeath() ?? false;
  }

  afterHits(boss: BossForm): void {
    const floor = this.phase?.hpFloor() ?? 0;
    if (boss.currentStats.hitpoint < floor) boss.currentStats.hitpoint = floor;
    this.phase?.onBossHit();
  }

  acceptsAttack(_boss: BossForm, style: Style): boolean {
    return this.phase?.acceptsAttack(style) ?? true;
  }

  incomingDamageFactor(): number {
    return this.phase?.incomingDamageFactor?.() ?? 1;
  }

  playerAttacking(target: Unit, style: Style): boolean {
    return this.phase?.playerAttacking(target, style) ?? true;
  }

  interceptWalk(to: ATile): boolean {
    return this.phase?.interceptWalk(to) ?? false;
  }

  // ---- services the phases use ----------------------------------------------------------------------------------

  get playerTile(): ATile {
    return this.player.tile;
  }

  hit(spec: HitSpec): void {
    const from = spec.from ?? this.boss ?? this.player;
    const attackStyle = spec.style === "ranged" ? "range" : spec.style === "magic" ? "magic" : spec.style === "melee" ? "slash" : "typeless";
    const projectile = new FightHit(from, this.player, attackStyle, (spec.delay ?? 0) + 1, () => {
      const hp = this.player.currentStats.hitpoint;
      if (hp <= 0) return 0;
      let amount = spec.amount(this.player.protection);
      // Practice mode: the hit still shows, but never kills.
      if (this.practice && amount >= hp) amount = hp - 1;
      spec.onLand?.(amount);
      return amount;
    }, spec.visuals ?? { hidden: true });
    this.player.addProjectile(projectile);
  }

  /** Roll damage the player can pray against: blocked fully by the matching protection. */
  prayable(style: Style, damage: Range): (prayer: Style | null) => number {
    return (prayer) => (prayer === style ? 0 : this.rng.roll(damage));
  }

  /** Heal with a heal splat; an overheal (phase 4's orb) can pass max HP, which the SDK's splat cannot. */
  healPlayer(amount: number, overheal = false): void {
    if (amount <= 0 || this.player.currentStats.hitpoint <= 0) return;
    if (overheal) {
      this.player.currentStats.hitpoint += amount;
      return;
    }
    this.hit({ amount: () => -amount });
  }

  healBoss(amount: number): void {
    const boss = this.boss;
    if (!boss || amount <= 0) return;
    const projectile = new FightHit(boss, boss, "typeless", 1, () => -amount);
    boss.addProjectile(projectile);
  }

  /** A cosmetic shot to a tile. */
  shoot(from: Unit, to: ATile, delay: number, visuals: ProjectileVisuals): void {
    const target = toSdk(to);
    this.region.addProjectile(new Shot(from, { x: target.x + 0.5, y: target.y - 0.5, z: 0.4 }, delay, visuals));
  }

  spot(tile: ATile, id: number, options: SpotOptions = {}): GroundSpot {
    const spot = new GroundSpot(this.region, tile, id, options);
    this.region.addEntity(spot);
    return spot;
  }

  sound(id: number, at: ATile | null = null, delayMs = 0, volume = 0.6): void {
    const location = toSdk(at ?? this.playerTile);
    SoundCache.play(new Sound(cacheSound(id), volume, delayMs, { location, range: 31, retain: 31 }));
  }

  say(text: string, ticks = 4): void {
    const boss = this.boss;
    if (!boss) return;
    boss.setOverheadText(text);
    boss.overheadTextTimer = ticks;
  }

  message(text: string, colour: string = CHAT.game): void {
    this.chat.push({ text, colour, tick: this.tick });
    if (this.chat.length > 120) this.chat.splice(0, this.chat.length - 120);
    this.changed();
  }

  setOverhead(overhead: BossOverhead | null): void {
    if (this.boss) this.boss.overhead = overhead;
  }

  /** Swap Ocellus's body, keeping his facing and, for the shared pool, his HP. */
  swapBoss(form: Form, sw: ATile, hp: number, maxHp: number): BossForm {
    const old = this.boss;
    const boss = new BossForm(this.region, sw, form, this, maxHp);
    boss.currentStats.hitpoint = hp;
    if (old) {
      boss.lastRotation = old.lastRotation;
      this.region.removeMob(old);
    }
    this.region.addMob(boss);
    this.region.setBoss(boss);
    this.boss = boss;
    if (this.player.aggro === old) this.player.setAggro(null);
    return boss;
  }

  // ---- floor and collision --------------------------------------------------------------------------------------

  isFloor(a: ATile): boolean {
    return this.floorTiles.has(a);
  }

  isWalkable(a: ATile): boolean {
    return this.floorTiles.has(a) && !this.blockedExtra.has(a);
  }

  setFloor(tiles: Iterable<ATile>): void {
    this.floorTiles = new TileSet(tiles);
    this.floorKey++;
    this.syncBlockers();
  }

  removeFloor(tiles: Iterable<ATile>): void {
    for (const t of tiles) this.floorTiles.delete(t);
    this.floorKey++;
    this.syncBlockers();
  }

  /** Floor you cannot walk on (phase 2's portal walls, the middle 5x5). */
  setBlocked(tiles: Iterable<ATile>): void {
    this.blockedExtra = new TileSet(tiles);
    this.syncBlockers();
  }

  setStones(stones: ATile[]): void {
    this.stoneTiles = stones;
    this.floorKey++;
  }

  get stones(): readonly ATile[] {
    return this.stoneTiles;
  }

  setCrumbling(quadrants: Quadrant[]): void {
    this.crumbling = quadrants;
    this.floorKey++;
  }

  lightCenser(q: Quadrant): void {
    const censer = this.censers.get(q);
    if (censer) this.censers.set(q, { ...censer, lit: true });
    this.floorKey++;
  }

  /** Starry void floor, from any number of named sources (phase 4's voids, phase 3's patches). */
  setVoidLayer(name: string, tiles: readonly ATile[] | null): void {
    if (tiles === null || tiles.length === 0) {
      if (!this.voidLayers.delete(name)) return;
    } else {
      this.voidLayers.set(name, tiles);
    }
    this.voidVersion++;
    const all = new TileSet();
    for (const layer of this.voidLayers.values()) for (const t of layer) if (this.floorTiles.has(t)) all.add(t);
    this.voidCache = { key: `${this.voidVersion}`, tiles: all.tiles() };
  }

  voidTiles(): Readonly<{ key: string; tiles: readonly ATile[] }> {
    return this.voidCache;
  }

  floorState(): FloorState {
    return {
      key: `${this.floorKey}`,
      floor: this.floorTiles.tiles(),
      stones: this.stoneTiles,
      censers: [...this.censers.values()],
      crumbling: this.crumbling,
      destroyed: [...this.destroyed],
    };
  }

  private syncBlockers(): void {
    const wanted = new Set<string>();
    for (let sx = 0; sx < GRID; sx++) {
      for (let sy = 0; sy < GRID; sy++) {
        const a = fromSdk({ x: sx, y: sy });
        if (!this.isWalkable(a)) wanted.add(key(a));
      }
    }
    for (const [k, blocker] of this.blockers) {
      if (!wanted.has(k)) {
        this.region.removeEntity(blocker);
        this.blockers.delete(k);
      }
    }
    for (const k of wanted) {
      if (this.blockers.has(k)) continue;
      const [x, z] = k.split(",").map(Number);
      const blocker = new InvisibleMovementBlocker(this.region, toSdk(at(x, z)));
      this.blockers.set(k, blocker);
      this.region.addEntity(blocker);
    }
  }

  // ---- presentation -----------------------------------------------------------------------------------------------

  marks(): readonly TileMark[] {
    if (!this.showHazardTiles || !this.phase) return [];
    return this.phase.marks();
  }

  meter(): number | null {
    return this.phase?.meter() ?? null;
  }

  label(): string {
    return this.phase?.label ?? "";
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshotVersion = (): number => this.version;

  changed(): void {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  get skipMarkers(): boolean {
    return this.skipTiles;
  }

  get hazardTiles(): boolean {
    return this.showHazardTiles;
  }

  setHazardTiles(on: boolean): void {
    this.showHazardTiles = on;
  }

  /** The sidebar's phase 2 skip tiles: switchable mid-fight, shown while phase 2 runs. */
  setSkipMarkers(on: boolean): void {
    this.skipTiles = on;
    this.refreshSkipMarkers();
  }

  /** J R V's skip in each quadrant: stand P2.skipStandOut out diagonally, run to P2.skipRunOut a tick before a volley. */
  private refreshSkipMarkers(): void {
    const show = this.skipTiles && this.phase?.label === "Phase 2";
    if (show === this.skipEntities.length > 0) return;
    this.skipEntities.forEach((marker) => this.region.removeEntity(marker));
    this.skipEntities = [];
    if (!show) return;
    for (const { sx, sz } of Object.values(QUADRANT_SIGN)) {
      for (const out of [P2.skipStandOut, P2.skipRunOut]) {
        const marker = new TileMarker(this.region, toSdk(at(out * sx, out * sz)), P2.skipMarkerColour, 1, false);
        this.skipEntities.push(marker);
        this.region.addEntity(marker);
      }
    }
  }

  /** The reference video's tile markers (ShadowStalkerTM), converted from region 16472 local tiles to arena offsets. */
  private showVideoMarkers(): void {
    const squares: [number, number][] = [[-2, -2], [1, -2], [-2, 1], [1, 1], [-6, -6], [5, -6], [-6, 5], [5, 5]];
    for (const [x, z] of squares) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const marker = new TileMarker(this.region, toSdk(at(x + dx, z + dz)), "#FFF100", 1, false);
        this.markerEntities.push(marker);
        this.region.addEntity(marker);
      }
    }
  }

  scaledP1Hp(): number {
    return scaledHp(P1.hp, this.options.party);
  }

  quadrantOfPlayer(): Quadrant | null {
    return quadrantOf(this.playerTile);
  }

  playCrackSound(): void {
    this.sound(this.rng.pick(SOUND.crackClosed), this.boss?.tile ?? null);
  }
}

export function roomFloor(): ATile[] {
  const tiles: ATile[] = [];
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) if (inRoom(at(x, z))) tiles.push(at(x, z));
  return tiles;
}

export function formatTicks(ticks: number): string {
  const seconds = ticks * 0.6;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
